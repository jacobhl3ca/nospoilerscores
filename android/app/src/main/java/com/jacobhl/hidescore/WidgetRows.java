package com.jacobhl.hidescore;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The widget's rows, built from the cache with no Android types so
 * WidgetParserTest runs it: playoff masks first, then a day header before the
 * first game of each day, then the games by start time.
 */
final class WidgetRows {
    private WidgetRows() {}

    enum Kind { DAY, GAME, MASK }

    static final int MAX_GAMES = 6;
    // Heights in dp, kept in step with widget_row.xml and widget_day.xml.
    static final int GAME_DP = 22;
    static final int DAY_DP = 18;

    static final class Row {
        final Kind kind;
        final String chip;
        final String teams;
        final String time;
        final String channel;

        Row(Kind kind, String chip, String teams, String time, String channel) {
            this.kind = kind;
            this.chip = chip;
            this.teams = teams;
            this.time = time;
            this.channel = channel;
        }

        static Row day(String label) {
            return new Row(Kind.DAY, "", label, "", "");
        }

        String[] cells() {
            return new String[] {chip, teams, time, channel};
        }
    }

    static List<Row> fromCache(JSONObject cache, TimeZone zone, long now) {
        List<Row> rows = new ArrayList<>();
        JSONObject leagues = cache.optJSONObject("leagues");
        JSONArray names = leagues == null ? null : leagues.names();
        List<String> masked = new ArrayList<>();
        for (int i = 0; names != null && i < names.length(); i++) {
            String key = names.optString(i);
            JSONObject l = leagues.optJSONObject(key);
            if (l != null && l.optBoolean("post")) {
                masked.add(key);
                rows.add(new Row(Kind.MASK, chip(key, l), "Playoffs: open HideScore", "", ""));
            }
        }
        List<WidgetParser.Game> games = new ArrayList<>();
        JSONArray arr = cache.optJSONArray("games");
        for (int i = 0; arr != null && i < arr.length(); i++) {
            WidgetParser.Game g = WidgetParser.Game.fromJson(arr.optJSONObject(i));
            if (g.startMs > now && !masked.contains(g.league)) games.add(g);
        }
        Collections.sort(games, (a, b) -> Long.compare(a.startMs, b.startMs));
        String lastDay = null;
        for (WidgetParser.Game g : games) {
            String day = dayLabel(g.startMs, now, zone);
            if (!day.equals(lastDay)) rows.add(Row.day(day));
            lastDay = day;
            JSONObject l = leagues == null ? null : leagues.optJSONObject(g.league);
            rows.add(new Row(Kind.GAME, chip(g.league, l), g.away + " @ " + g.home,
                format("h:mm a", g.startMs, zone), channel(g.channel)));
        }
        return rows;
    }

    /**
     * The rows that fit {@code budgetDp}: at most MAX_GAMES game + mask rows, a
     * day header only with a game under it, and always the first game.
     */
    static List<Row> fit(List<Row> rows, int budgetDp) {
        List<Row> out = new ArrayList<>();
        int used = 0, shown = 0;
        for (Row r : rows) {
            if (shown >= MAX_GAMES) break;
            int need = r.kind == Kind.DAY ? DAY_DP + GAME_DP : GAME_DP;
            if (shown > 0 && used + need > budgetDp) break;
            out.add(r);
            if (r.kind == Kind.DAY) {
                used += DAY_DP;
            } else {
                used += GAME_DP;
                shown++;
            }
        }
        return out;
    }

    /** "Today", "Tomorrow", else "Tue Oct 6", in the widget zone. */
    static String dayLabel(long ms, long now, TimeZone zone) {
        Calendar c = Calendar.getInstance(zone, Locale.US);
        c.setTimeInMillis(now);
        String today = key(c);
        c.add(Calendar.DAY_OF_YEAR, 1);
        String tomorrow = key(c);
        c.setTimeInMillis(ms);
        String day = key(c);
        if (day.equals(today)) return "Today";
        if (day.equals(tomorrow)) return "Tomorrow";
        return format("EEE MMM d", ms, zone);
    }

    private static String key(Calendar c) {
        return c.get(Calendar.YEAR) + "-" + c.get(Calendar.DAY_OF_YEAR);
    }

    /** The first network only (WidgetParser joins two with " · "), long names cut short. */
    static String channel(String raw) {
        if (raw == null) return "";
        String first = raw;
        int cut = first.indexOf(" · ");
        if (cut >= 0) first = first.substring(0, cut);
        cut = first.indexOf(',');
        if (cut >= 0) first = first.substring(0, cut);
        first = first.trim();
        switch (first) {
            case "NHL Network": return "NHL Net";
            case "Prime Video": return "Prime";
            case "NBC Sports": return "NBCS";
            default: return first;
        }
    }

    /** "MLB", "NFL"…; a long catalog label ("Premier League") falls back to the key ("EPL"). */
    private static String chip(String key, JSONObject league) {
        String label = league == null ? "" : league.optString("label");
        return label.isEmpty() || label.length() > 6 ? key.toUpperCase(Locale.US) : label;
    }

    static String format(String pattern, long ms, TimeZone zone) {
        SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US);
        f.setTimeZone(zone);
        return f.format(new Date(ms));
    }
}
