package com.jacobhl.hidescore;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The widget's fetch plan and cache merge, with no Android types so
 * WidgetCacheTest runs it: which leagues, which days, which URLs, and how a
 * partly failed refresh keeps the games it could not re-fetch.
 */
final class WidgetCache {
    private WidgetCache() {}

    static final int VERSION = 2;
    static final int MAX_LEAGUES = 4;

    static final Map<String, String> FALLBACK_PATHS = new HashMap<>();
    static {
        FALLBACK_PATHS.put("mlb", "/baseball/mlb/scoreboard");
        FALLBACK_PATHS.put("nba", "/basketball/nba/scoreboard");
        FALLBACK_PATHS.put("nhl", "/hockey/nhl/scoreboard");
        FALLBACK_PATHS.put("nfl", "/football/nfl/scoreboard");
        FALLBACK_PATHS.put("epl", "/soccer/eng.1/scoreboard");
        FALLBACK_PATHS.put("mls", "/soccer/usa.1/scoreboard");
    }

    /**
     * One day of one league. groups=50 = every Division I team: college
     * basketball needs it (the default lists only a few games). College
     * football must not send it: 50 there means FCS, and the FBS games vanish.
     */
    static String dayUrl(String base, String path, String league, String ymd) {
        String groups = league.equals("ncaam") || league.equals("ncaaw") ? "&groups=50" : "";
        return base + path + "?dates=" + ymd + "&limit=300" + groups;
    }

    /** yyyyMMdd for today and the next days in the widget zone, by calendar day (DST-safe). */
    static List<String> dayKeys(long now, TimeZone zone, int days) {
        SimpleDateFormat f = new SimpleDateFormat("yyyyMMdd", Locale.US);
        f.setTimeZone(zone);
        Calendar c = Calendar.getInstance(zone, Locale.US);
        c.setTimeInMillis(now);
        c.set(Calendar.HOUR_OF_DAY, 12);  // noon: no DST jump lands on another date
        c.set(Calendar.MINUTE, 0);
        List<String> out = new ArrayList<>();
        for (int d = 0; d < days; d++) {
            out.add(f.format(c.getTime()));
            c.add(Calendar.DAY_OF_YEAR, 1);
        }
        return out;
    }

    /**
     * Favorites "mlb-1", "nfl-21" … grouped by league, favorites order, the
     * first 4 leagues the widget can fetch. {@code fetchable} null = any league.
     */
    static Map<String, Set<String>> leaguesInOrder(String teamsJson, Set<String> fetchable) {
        Map<String, Set<String>> out = new LinkedHashMap<>();
        try {
            JSONArray teams = new JSONArray(teamsJson);
            for (int i = 0; i < teams.length(); i++) {
                String id = teams.optString(i);
                int dash = id.indexOf('-');
                if (dash <= 0 || dash == id.length() - 1) continue;
                String league = id.substring(0, dash);
                if (fetchable != null && !fetchable.contains(league)) continue;
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

    /** One (league, day) request. {@code day} null = it failed (timeout, offline, bad JSON). */
    static final class Slot {
        final String league;
        final String ymd;
        final WidgetParser.Day day;

        Slot(String league, String ymd, WidgetParser.Day day) {
            this.league = league;
            this.ymd = ymd;
            this.day = day;
        }
    }

    /** A cache with no games: no favorites the widget can fetch. */
    static JSONObject empty(long now) throws JSONException {
        return new JSONObject().put("v", VERSION).put("updated", now)
            .put("games", new JSONArray()).put("leagues", new JSONObject());
    }

    /**
     * The new cache: {"v": 2, "updated": ms, "games": [Game…], "leagues": {"mlb": {"label", "post"}}}.
     * A failed slot keeps the old games of the same league and request day, and
     * never unmasks a league that was in its playoffs. Null when every slot
     * failed (keep the old cache as it is).
     */
    static JSONObject merge(JSONObject old, List<Slot> slots, Map<String, String> labels, TimeZone zone, long now)
            throws JSONException {
        boolean anyOk = false;
        for (Slot s : slots) if (s.day != null) anyOk = true;
        if (!anyOk) return null;

        JSONObject oldLeagues = old == null ? null : old.optJSONObject("leagues");
        Map<String, List<WidgetParser.Game>> oldBySlot = new HashMap<>();
        JSONArray oldGames = old == null ? null : old.optJSONArray("games");
        for (int i = 0; oldGames != null && i < oldGames.length(); i++) {
            JSONObject o = oldGames.optJSONObject(i);
            if (o == null) continue;
            WidgetParser.Game g = WidgetParser.Game.fromJson(o);
            // v1 games have no request day: the start's day in the widget zone is close enough.
            String d = g.d.isEmpty() ? WidgetRows.format("yyyyMMdd", g.startMs, zone) : g.d;
            String key = g.league + "|" + d;
            if (!oldBySlot.containsKey(key)) oldBySlot.put(key, new ArrayList<WidgetParser.Game>());
            oldBySlot.get(key).add(g.withDay(d));
        }

        Map<String, WidgetParser.Game> games = new LinkedHashMap<>();
        Map<String, Boolean> fresh = new LinkedHashMap<>();
        Map<String, Boolean> failed = new HashMap<>();
        for (Slot s : slots) {
            if (!fresh.containsKey(s.league)) fresh.put(s.league, false);
            if (s.day == null) {
                failed.put(s.league, true);
                List<WidgetParser.Game> kept = oldBySlot.get(s.league + "|" + s.ymd);
                if (kept != null) for (WidgetParser.Game g : kept) games.put(g.id, g);
                continue;
            }
            if (s.day.postseason) fresh.put(s.league, true);
            for (WidgetParser.Game g : s.day.games) games.put(g.id, g.withDay(s.ymd));  // dedupe by event id
        }

        JSONObject leagues = new JSONObject();
        for (Map.Entry<String, Boolean> e : fresh.entrySet()) {
            String league = e.getKey();
            JSONObject was = oldLeagues == null ? null : oldLeagues.optJSONObject(league);
            boolean post = e.getValue() || (failed.containsKey(league) && was != null && was.optBoolean("post"));
            String label = labels.get(league);
            leagues.put(league, new JSONObject()
                .put("label", label == null || label.isEmpty() ? league.toUpperCase(Locale.US) : label)
                .put("post", post));
        }
        JSONArray arr = new JSONArray();
        for (WidgetParser.Game g : games.values()) arr.put(g.toJson());
        return new JSONObject().put("v", VERSION).put("updated", now).put("games", arr).put("leagues", leagues);
    }

    // ESPN team art only: https://a.espncdn.com/i/teamlogos/<league>/500/…png
    private static final String ESPN_CDN = "https://a.espncdn.com";
    private static final Pattern LOGO_PATH = Pattern.compile("^/i/teamlogos/[a-z0-9_/-]+\\.png$");
    private static final String COMBINER = ESPN_CDN + "/combiner/i?img=";

    /** The logo path ("/i/teamlogos/nhl/500/scoreboard/nyr.png") from ESPN's team.logo, or "" for anything else. */
    static String logoPath(String raw) {
        if (raw == null) return "";
        String s = raw.trim();
        return s.startsWith(ESPN_CDN) ? checkPath(s.substring(ESPN_CDN.length())) : "";
    }

    /** {@code path} when it is an ESPN team-logo path, else "". */
    static String checkPath(String path) {
        if (path == null || path.contains("..") || path.contains("//")) return "";
        return LOGO_PATH.matcher(path).matches() ? path : "";
    }

    /** 64×64 PNG from ESPN's resizer; {@code dark} = the art made for a dark background. */
    static String logoUrl(String path, boolean dark) {
        String p = dark ? path.replace("/500/", "/500-dark/") : path;
        return COMBINER + p + "&w=64&h=64";
    }

    /**
     * Which logo files to delete: the oldest that no game needs, until at most
     * {@code max} remain. {@code files} = name → last-modified ms.
     */
    static List<String> pruneList(Map<String, Long> files, Set<String> keep, int max) {
        List<Map.Entry<String, Long>> old = new ArrayList<>();
        for (Map.Entry<String, Long> e : files.entrySet()) if (!keep.contains(e.getKey())) old.add(e);
        Collections.sort(old, (a, b) -> Long.compare(a.getValue(), b.getValue()));
        List<String> out = new ArrayList<>();
        int left = files.size();
        for (Map.Entry<String, Long> e : old) {
            if (left <= max) break;
            out.add(e.getKey());
            left--;
        }
        return out;
    }
}
