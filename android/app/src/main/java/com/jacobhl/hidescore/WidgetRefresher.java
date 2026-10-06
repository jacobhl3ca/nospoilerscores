package com.jacobhl.hidescore;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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
    static final String KEY_THEME = "theme";        // system | light | dark (WidgetTheme)
    static final String KEY_CACHE = "cache";        // see WidgetCache.merge
    static final String KEY_LAST_FETCH = "last_fetch";
    static final String KEY_FULL_OK = "full_ok";    // last refresh where every request worked
    private static final String KEY_CATALOG = "catalog";
    private static final String KEY_CATALOG_AT = "catalog_at";

    static final long NETWORK_EVERY_MS = 3 * 60 * 60 * 1000L;
    private static final long CATALOG_EVERY_MS = 24 * 60 * 60 * 1000L;
    private static final int DAYS = 7;
    private static final int TIMEOUT_MS = 5000;
    /** One limit for the catalog, the days and the logos together (goAsync allows 10 s). */
    static final long STOP_AFTER_MS = 9000;

    private static final String CATALOG_URL = "https://hidescore.com/tv/catalog.json";
    private static final String FALLBACK_BASE = "https://site.web.api.espn.com/apis/site/v2/sports";

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean networkDue(Context c) {
        long last = prefs(c).getLong(KEY_LAST_FETCH, 0);
        return System.currentTimeMillis() - last >= NETWORK_EVERY_MS;
    }

    /** Fetch and write the cache by {@code deadline}. Keeps the old cache when nothing could be fetched. */
    static void refresh(Context c, long deadline) {
        SharedPreferences p = prefs(c);
        if (!p.contains(KEY_TEAMS)) return;  // the app has not pushed favorites yet
        long now = System.currentTimeMillis();
        try {
            JSONObject catalog = catalog(p, now, deadline);
            String base = catalog == null ? FALLBACK_BASE : catalog.optString("espnBase", FALLBACK_BASE);
            Map<String, String> paths = new HashMap<>(WidgetCache.FALLBACK_PATHS);
            Map<String, String> labels = new HashMap<>();
            JSONArray leagues = catalog == null ? null : catalog.optJSONArray("leagues");
            for (int i = 0; leagues != null && i < leagues.length(); i++) {
                JSONObject l = leagues.optJSONObject(i);
                if (l == null || l.optString("path").isEmpty()) continue;
                paths.put(l.optString("key"), l.optString("path"));
                labels.put(l.optString("key"), l.optString("label"));
            }
            Map<String, Set<String>> byLeague = WidgetCache.leaguesInOrder(p.getString(KEY_TEAMS, "[]"), paths.keySet());
            if (byLeague.isEmpty()) {
                write(p, WidgetCache.empty(now), now, true);
                return;
            }

            TimeZone zone = zone(p);
            List<String> days = WidgetCache.dayKeys(now, zone, DAYS);
            final List<String[]> keys = new ArrayList<>();
            List<Callable<WidgetParser.Day>> tasks = new ArrayList<>();
            for (Map.Entry<String, Set<String>> e : byLeague.entrySet()) {
                final String league = e.getKey();
                final String path = paths.get(league);
                final Set<String> favs = e.getValue();
                final boolean soccer = path.startsWith("/soccer/");
                for (String ymd : days) {
                    final String url = WidgetCache.dayUrl(base, path, league, ymd);
                    keys.add(new String[] {league, ymd});
                    tasks.add(() -> WidgetParser.parseDay(get(url, TIMEOUT_MS), league, soccer, favs));
                }
            }

            List<Future<WidgetParser.Day>> results;
            ExecutorService pool = Executors.newFixedThreadPool(6);
            try {
                results = pool.invokeAll(tasks, Math.max(1, deadline - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
            } finally {
                pool.shutdownNow();
            }
            List<WidgetCache.Slot> slots = new ArrayList<>();
            boolean full = true;
            for (int i = 0; i < results.size(); i++) {
                WidgetParser.Day day;
                try {
                    day = results.get(i).get();
                } catch (Exception failed) {
                    day = null;  // timed out, cancelled, offline or bad JSON: keep that day's old games
                    full = false;
                }
                slots.add(new WidgetCache.Slot(keys.get(i)[0], keys.get(i)[1], day));
            }
            JSONObject old = null;
            try {
                String raw = p.getString(KEY_CACHE, null);
                if (raw != null) old = new JSONObject(raw);
            } catch (Exception ignored) {
                // unreadable: start over
            }
            JSONObject cache = WidgetCache.merge(old, slots, labels, zone, now);
            if (cache == null) return;  // offline: keep the cached list as it is
            write(p, cache, now, full);
        } catch (Exception ignored) {
            // A widget refresh must never crash the app process.
        }
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

    private static void write(SharedPreferences p, JSONObject cache, long now, boolean full) {
        SharedPreferences.Editor e = p.edit().putString(KEY_CACHE, cache.toString()).putLong(KEY_LAST_FETCH, now);
        if (full) e.putLong(KEY_FULL_OK, now);
        e.apply();
    }

    private static JSONObject catalog(SharedPreferences p, long now, long deadline) {
        String cached = p.getString(KEY_CATALOG, null);
        if (cached != null && now - p.getLong(KEY_CATALOG_AT, 0) < CATALOG_EVERY_MS) {
            try {
                return new JSONObject(cached);
            } catch (Exception ignored) {
                // refetch below
            }
        }
        try {
            // At most a third of the time limit: the days still need theirs.
            int timeout = (int) Math.max(500, Math.min(TIMEOUT_MS, (deadline - System.currentTimeMillis()) / 3));
            String body = get(CATALOG_URL, timeout);
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

    /** A non-200 answer. */
    static final class HttpStatus extends Exception {
        final int code;

        HttpStatus(int code) {
            super("HTTP " + code);
            this.code = code;
        }
    }

    private static String get(String url, int timeoutMs) throws Exception {
        return new String(getBytes(url, timeoutMs), StandardCharsets.UTF_8);
    }

    static byte[] getBytes(String url, int timeoutMs) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(timeoutMs);
        conn.setReadTimeout(timeoutMs);
        try {
            int code = conn.getResponseCode();
            if (code != 200) throw new HttpStatus(code);
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                return out.toByteArray();
            }
        } finally {
            conn.disconnect();
        }
    }
}
