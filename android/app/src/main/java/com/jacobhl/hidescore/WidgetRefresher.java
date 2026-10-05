package com.jacobhl.hidescore;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Widget data: the favorites the web app pushed (HideScoreWidgetPlugin), the
 * ESPN fetch, and the cache the widget renders from. Blocking — call it off the
 * main thread (HideScoreWidgetProvider does, inside goAsync()).
 */
final class WidgetRefresher {
    private WidgetRefresher() {}

    static final String PREFS = "hidescore_widget";
    static final String KEY_TEAMS = "teams";        // JSON array of "mlb-1" ids
    static final String KEY_TZ = "tz";              // IANA zone or ""
    static final String KEY_CACHE = "cache";        // see writeCache
    static final String KEY_LAST_FETCH = "last_fetch";
    private static final String KEY_CATALOG = "catalog";
    private static final String KEY_CATALOG_AT = "catalog_at";

    static final long NETWORK_EVERY_MS = 3 * 60 * 60 * 1000L;
    private static final long CATALOG_EVERY_MS = 24 * 60 * 60 * 1000L;
    private static final int MAX_LEAGUES = 4;
    private static final int DAYS = 7;
    private static final int TIMEOUT_MS = 5000;
    private static final long STOP_AFTER_MS = 8000;

    private static final String CATALOG_URL = "https://hidescore.com/tv/catalog.json";
    private static final String FALLBACK_BASE = "https://site.web.api.espn.com/apis/site/v2/sports";
    private static final Map<String, String> FALLBACK_PATHS = new HashMap<>();
    static {
        FALLBACK_PATHS.put("mlb", "/baseball/mlb/scoreboard");
        FALLBACK_PATHS.put("nba", "/basketball/nba/scoreboard");
        FALLBACK_PATHS.put("nhl", "/hockey/nhl/scoreboard");
        FALLBACK_PATHS.put("nfl", "/football/nfl/scoreboard");
        FALLBACK_PATHS.put("epl", "/soccer/eng.1/scoreboard");
        FALLBACK_PATHS.put("mls", "/soccer/usa.1/scoreboard");
    }

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean networkDue(Context c) {
        long last = prefs(c).getLong(KEY_LAST_FETCH, 0);
        return System.currentTimeMillis() - last >= NETWORK_EVERY_MS;
    }

    /** Fetch and write the cache. Keeps the old cache when nothing could be fetched. */
    static void refresh(Context c) {
        SharedPreferences p = prefs(c);
        if (!p.contains(KEY_TEAMS)) return;  // the app has not pushed favorites yet
        Map<String, Set<String>> byLeague = leaguesInOrder(p.getString(KEY_TEAMS, "[]"));
        long now = System.currentTimeMillis();
        try {
            if (byLeague.isEmpty()) {
                writeCache(p, now, new ArrayList<WidgetParser.Game>(), new LinkedHashMap<String, Boolean>(), new HashMap<String, String>());
                return;
            }
            JSONObject catalog = catalog(p, now);
            String base = catalog == null ? FALLBACK_BASE : catalog.optString("espnBase", FALLBACK_BASE);
            Map<String, String> paths = new HashMap<>(FALLBACK_PATHS);
            Map<String, String> labels = new HashMap<>();
            JSONArray leagues = catalog == null ? null : catalog.optJSONArray("leagues");
            for (int i = 0; leagues != null && i < leagues.length(); i++) {
                JSONObject l = leagues.optJSONObject(i);
                if (l == null) continue;
                paths.put(l.optString("key"), l.optString("path"));
                labels.put(l.optString("key"), l.optString("label"));
            }

            TimeZone zone = zone(p);
            SimpleDateFormat ymd = new SimpleDateFormat("yyyyMMdd", Locale.US);
            ymd.setTimeZone(zone);
            List<Callable<Object[]>> tasks = new ArrayList<>();
            for (Map.Entry<String, Set<String>> e : byLeague.entrySet()) {
                final String league = e.getKey();
                final String path = paths.get(league);
                if (path == null || path.isEmpty()) continue;
                final Set<String> favs = e.getValue();
                final boolean soccer = path.startsWith("/soccer/");
                String groups = league.equals("ncaaf") || league.equals("ncaam") || league.equals("ncaaw") ? "&groups=50" : "";
                for (int d = 0; d < DAYS; d++) {
                    final String url = base + path + "?dates=" + ymd.format(new Date(now + d * 86_400_000L)) + "&limit=300" + groups;
                    tasks.add(() -> new Object[] {league, WidgetParser.parseDay(get(url), league, soccer, favs)});
                }
            }

            ExecutorService pool = Executors.newFixedThreadPool(6);
            List<Future<Object[]>> results;
            try {
                results = pool.invokeAll(tasks, STOP_AFTER_MS, TimeUnit.MILLISECONDS);
            } finally {
                pool.shutdownNow();
            }
            int ok = 0;
            Map<String, WidgetParser.Game> games = new LinkedHashMap<>();
            Map<String, Boolean> post = new LinkedHashMap<>();
            for (String league : byLeague.keySet()) post.put(league, false);
            for (Future<Object[]> f : results) {
                Object[] r;
                try {
                    r = f.get();
                } catch (Exception skipped) {
                    continue;  // timed out, cancelled, offline or bad JSON: that day is skipped
                }
                ok++;
                String league = (String) r[0];
                WidgetParser.Day day = (WidgetParser.Day) r[1];
                if (day.postseason) post.put(league, true);
                for (WidgetParser.Game g : day.games) games.put(g.id, g);  // dedupe by event id
            }
            if (ok == 0) return;  // offline: keep the cached list and its old "Updated" stamp
            writeCache(p, now, new ArrayList<>(games.values()), post, labels);
        } catch (Exception ignored) {
            // A widget refresh must never crash the app process.
        }
    }

    /** Favorites "mlb-1", "nfl-21" … grouped by league, favorites order, first 4 leagues. */
    static Map<String, Set<String>> leaguesInOrder(String teamsJson) {
        Map<String, Set<String>> out = new LinkedHashMap<>();
        try {
            JSONArray teams = new JSONArray(teamsJson);
            for (int i = 0; i < teams.length(); i++) {
                String id = teams.optString(i);
                int dash = id.indexOf('-');
                if (dash <= 0 || dash == id.length() - 1) continue;
                String league = id.substring(0, dash);
                if (!out.containsKey(league)) {
                    if (out.size() >= MAX_LEAGUES) continue;
                    out.put(league, new LinkedHashSet<String>());
                }
                out.get(league).add(id.substring(dash + 1));
            }
        } catch (Exception ignored) {
            // bad JSON = no favorites
        }
        return out;
    }

    static TimeZone zone(SharedPreferences p) {
        String tz = p.getString(KEY_TZ, "");
        if (tz != null && !tz.isEmpty()) {
            TimeZone z = TimeZone.getTimeZone(tz);
            // getTimeZone returns GMT for an unknown id; only accept a real match.
            if (z.getID().equals(tz)) return z;
        }
        return TimeZone.getDefault();
    }

    /**
     * Cache: {"updated": ms, "games": [Game…], "leagues": {"mlb": {"label": "MLB", "post": true}}}.
     * Games carry teams, start, channel only (WidgetParser's whitelist).
     */
    private static void writeCache(SharedPreferences p, long now, List<WidgetParser.Game> games,
                                   Map<String, Boolean> post, Map<String, String> labels) throws Exception {
        JSONArray arr = new JSONArray();
        for (WidgetParser.Game g : games) arr.put(g.toJson());
        JSONObject leagues = new JSONObject();
        for (Map.Entry<String, Boolean> e : post.entrySet()) {
            String label = labels.get(e.getKey());
            leagues.put(e.getKey(), new JSONObject()
                .put("label", label == null || label.isEmpty() ? e.getKey().toUpperCase(Locale.US) : label)
                .put("post", e.getValue()));
        }
        JSONObject cache = new JSONObject().put("updated", now).put("games", arr).put("leagues", leagues);
        p.edit().putString(KEY_CACHE, cache.toString()).putLong(KEY_LAST_FETCH, now).apply();
    }

    private static JSONObject catalog(SharedPreferences p, long now) {
        String cached = p.getString(KEY_CATALOG, null);
        if (cached != null && now - p.getLong(KEY_CATALOG_AT, 0) < CATALOG_EVERY_MS) {
            try {
                return new JSONObject(cached);
            } catch (Exception ignored) {
                // refetch below
            }
        }
        try {
            String body = get(CATALOG_URL);
            JSONObject o = new JSONObject(body);
            p.edit().putString(KEY_CATALOG, body).putLong(KEY_CATALOG_AT, now).apply();
            return o;
        } catch (Exception e) {
            try {
                return cached == null ? null : new JSONObject(cached);  // stale beats none
            } catch (Exception ignored) {
                return null;
            }
        }
    }

    private static String get(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setRequestProperty("Accept", "application/json");
        try {
            if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            conn.disconnect();
        }
    }
}
