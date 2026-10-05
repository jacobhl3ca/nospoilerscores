package com.jacobhl.hidescore;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Reads one ESPN scoreboard day for the home-screen widget, spoiler-safe.
 *
 * Whitelist only: event id, start time, season type, status name, team id +
 * abbreviation, broadcast names. A notes headline is read only to DROP a game,
 * never to show it. Score, record, rank, series, recap and status.detail are
 * never read, so nothing here can carry them into the widget cache.
 *
 * Plain Java + org.json so WidgetParserTest runs it on saved ESPN JSON.
 */
final class WidgetParser {
    private WidgetParser() {}

    /** One upcoming game. Everything a widget row shows, nothing more. */
    static final class Game {
        final String id;
        final String league;
        final String away;
        final String home;
        final String channel;
        final long startMs;

        Game(String id, String league, String away, String home, String channel, long startMs) {
            this.id = id;
            this.league = league;
            this.away = away;
            this.home = home;
            this.channel = channel;
            this.startMs = startMs;
        }

        JSONObject toJson() throws JSONException {
            return new JSONObject()
                .put("id", id).put("league", league).put("away", away)
                .put("home", home).put("channel", channel).put("start", startMs);
        }

        static Game fromJson(JSONObject o) {
            return new Game(o.optString("id"), o.optString("league"), o.optString("away"),
                o.optString("home"), o.optString("channel"), o.optLong("start"));
        }
    }

    /** One fetched day of one league. */
    static final class Day {
        final List<Game> games;
        /** The league is in its postseason: the widget hides every row for it. */
        final boolean postseason;

        Day(List<Game> games, boolean postseason) {
            this.games = games;
            this.postseason = postseason;
        }
    }

    // The playoff list from parseGame in src/lib/espn.ts, plus "Game N" (a
    // series game number tells you how the series stands).
    static final Pattern PLAYOFF = Pattern.compile(
        "playoff|postseason|wild.?card|divisional|conference|championship|\\bfinals?\\b|\\brounds?\\b"
            + "|semi.?finals?|quarter.?finals?|elimination|play-in|tournament|march madness|ncaa"
            + "|sweet.?16|elite.?8|final.?four|stanley.?cup|world.?series|super.?bowl|grey.?cup"
            + "|nlds|nlcs|alds|alcs|alwc|nlwc|\\bgame \\d+",
        Pattern.CASE_INSENSITIVE);

    // Cup ties: a second leg or a later round tells you who went through.
    static final Pattern SOCCER_ROUND = Pattern.compile(
        "\\blegs?\\b|aggregate|round of|quarter|semi|\\bfinals?\\b",
        Pattern.CASE_INSENSITIVE);

    static Day parseDay(String json, String league, boolean soccer, Set<String> favoriteEspnIds)
            throws JSONException {
        JSONObject root = new JSONObject(json);
        boolean postseason = false;
        JSONArray leagues = root.optJSONArray("leagues");
        if (leagues != null && leagues.length() > 0) {
            JSONObject type = leagues.optJSONObject(0).optJSONObject("season");
            type = type == null ? null : type.optJSONObject("type");
            if (type != null && type.optInt("type") == 3) postseason = true;
        }
        List<Game> games = new ArrayList<>();
        JSONArray events = root.optJSONArray("events");
        for (int i = 0; events != null && i < events.length(); i++) {
            JSONObject event = events.optJSONObject(i);
            if (event == null) continue;
            JSONObject season = event.optJSONObject("season");
            if (season != null && season.optInt("type") == 3) {
                postseason = true;
                continue;
            }
            Game g = parseEvent(event, league, soccer, favoriteEspnIds);
            if (g != null) games.add(g);
        }
        // A postseason league shows one generic row, never its games.
        return new Day(postseason ? Collections.<Game>emptyList() : games, postseason);
    }

    private static Game parseEvent(JSONObject event, String league, boolean soccer, Set<String> favs) {
        JSONObject status = event.optJSONObject("status");
        JSONObject statusType = status == null ? null : status.optJSONObject("type");
        if (statusType == null || !"STATUS_SCHEDULED".equals(statusType.optString("name"))) return null;

        JSONArray comps = event.optJSONArray("competitions");
        JSONObject comp = comps == null ? null : comps.optJSONObject(0);
        if (comp == null) return null;

        String homeId = null, homeAbbr = null, awayId = null, awayAbbr = null;
        JSONArray competitors = comp.optJSONArray("competitors");
        for (int i = 0; competitors != null && i < competitors.length(); i++) {
            JSONObject c = competitors.optJSONObject(i);
            JSONObject team = c == null ? null : c.optJSONObject("team");
            if (team == null) continue;
            String side = c.optString("homeAway");
            if ("home".equals(side)) {
                homeId = team.optString("id");
                homeAbbr = team.optString("abbreviation");
            } else if ("away".equals(side)) {
                awayId = team.optString("id");
                awayAbbr = team.optString("abbreviation");
            }
        }
        if (isTbd(homeId, homeAbbr) || isTbd(awayId, awayAbbr)) return null;
        if (!favs.contains(homeId) && !favs.contains(awayId)) return null;

        JSONArray notes = comp.optJSONArray("notes");
        for (int i = 0; notes != null && i < notes.length(); i++) {
            JSONObject note = notes.optJSONObject(i);
            String headline = note == null ? "" : note.optString("headline");
            if (PLAYOFF.matcher(headline).find()) return null;
            if (soccer && SOCCER_ROUND.matcher(headline).find()) return null;
        }

        long start = parseIso(event.optString("date"));
        if (start <= 0) return null;

        List<String> names = new ArrayList<>();
        JSONArray broadcasts = comp.optJSONArray("broadcasts");
        for (int i = 0; broadcasts != null && i < broadcasts.length() && names.size() < 2; i++) {
            JSONObject b = broadcasts.optJSONObject(i);
            JSONArray n = b == null ? null : b.optJSONArray("names");
            for (int j = 0; n != null && j < n.length() && names.size() < 2; j++) {
                String name = n.optString(j).trim();
                if (!name.isEmpty() && !names.contains(name)) names.add(name);
            }
        }
        String channel = join(names, " · ");
        return new Game(event.optString("id"), league, awayAbbr, homeAbbr, channel, start);
    }

    private static boolean isTbd(String id, String abbr) {
        if (id == null || id.isEmpty() || abbr == null || abbr.isEmpty()) return true;
        String a = abbr.toUpperCase(Locale.US);
        return a.equals("TBD") || a.equals("TBA");
    }

    /** ESPN writes "2026-10-06T22:00Z", sometimes with seconds. 0 = unreadable. */
    static long parseIso(String s) {
        if (s == null || s.isEmpty()) return 0;
        for (String fmt : new String[] {"yyyy-MM-dd'T'HH:mm'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'"}) {
            SimpleDateFormat f = new SimpleDateFormat(fmt, Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            f.setLenient(false);
            try {
                return f.parse(s).getTime();
            } catch (ParseException ignored) {
                // try the next shape
            }
        }
        return 0;
    }

    private static String join(List<String> parts, String sep) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (sb.length() > 0) sb.append(sep);
            sb.append(p);
        }
        return sb.toString();
    }
}
