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
 * WidgetParserTest and WidgetCacheTest run it: a day header before the first
 * game of each day, the games by start time, then the playoff masks.
 */
final class WidgetRows {
    private WidgetRows() {}

    enum Kind { DAY, GAME, MASK }

    static final int MAX_GAMES = 6;
    // Heights in dp, kept in step with widget_row.xml and widget_day.xml.
    static final int GAME_DP = 22;
    static final int DAY_DP = 18;
    /** A tapped page returns to the soonest game this long after the last tap. */
    static final long PAGE_HOLD_MS = 30 * 60 * 1000L;

    static final class Row {
        final Kind kind;
        final String id;
        final long startMs;
        final String chip;
        final String teams;
        final String away;
        final String home;
        final String awayLogo;
        final String homeLogo;
        final String time;
        final String channel;
        /** The game's day label ("Today", "Fri Oct 9"); the DAY row's own label. */
        final String day;

        Row(Kind kind, String id, long startMs, String chip, String away, String home, String awayLogo,
            String homeLogo, String teams, String time, String channel, String day) {
            this.kind = kind;
            this.id = id;
            this.startMs = startMs;
            this.chip = chip;
            this.away = away;
            this.home = home;
            this.awayLogo = awayLogo;
            this.homeLogo = homeLogo;
            this.teams = teams;
            this.time = time;
            this.channel = channel;
            this.day = day;
        }

        static Row day(String label) {
            return new Row(Kind.DAY, "", 0, "", "", "", "", "", label, "", "", label);
        }

        static Row mask(String league, String chip) {
            return new Row(Kind.MASK, "mask:" + league, Long.MAX_VALUE, chip, "", "", "", "",
                "Playoffs: open HideScore", "", "", "");
        }

        String[] cells() {
            return new String[] {chip, teams, away, home, time, channel, day};
        }
    }

    /** Day headers + games by start time, then one mask row per league in its playoffs. */
    static List<Row> items(JSONObject cache, TimeZone zone, long now) {
        List<Row> rows = new ArrayList<>();
        List<Row> masks = new ArrayList<>();
        JSONObject leagues = cache.optJSONObject("leagues");
        JSONArray names = leagues == null ? null : leagues.names();
        List<String> masked = new ArrayList<>();
        for (int i = 0; names != null && i < names.length(); i++) {
            String key = names.optString(i);
            JSONObject l = leagues.optJSONObject(key);
            if (l != null && l.optBoolean("post")) {
                masked.add(key);
                masks.add(Row.mask(key, chip(key, l)));
            }
        }
        List<WidgetParser.Game> games = new ArrayList<>();
        JSONArray arr = cache.optJSONArray("games");
        for (int i = 0; arr != null && i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            WidgetParser.Game g = WidgetParser.Game.fromJson(o);
            if (g.startMs > now && !masked.contains(g.league)) games.add(g);
        }
        Collections.sort(games, (a, b) -> Long.compare(a.startMs, b.startMs));
        String lastDay = null;
        for (WidgetParser.Game g : games) {
            String day = dayLabel(g.startMs, now, zone);
            if (!day.equals(lastDay)) rows.add(Row.day(day));
            lastDay = day;
            JSONObject l = leagues == null ? null : leagues.optJSONObject(g.league);
            rows.add(new Row(Kind.GAME, g.id, g.startMs, chip(g.league, l), g.away, g.home, g.awayLogo,
                g.homeLogo, g.away + " @ " + g.home, format("h:mm a", g.startMs, zone), channel(g.channel), day));
        }
        rows.addAll(masks);
        return rows;
    }

    /** A tapped page: the game (or mask) it showed and when it was tapped. */
    static final class Page {
        final String id;
        final long start;
        final long at;

        Page(String id, long start, long at) {
            this.id = id;
            this.start = start;
            this.at = at;
        }

        String encode() {
            return start + "|" + at + "|" + id;
        }

        /** The stored page, or null when unset, unreadable, or older than PAGE_HOLD_MS. */
        static Page live(String stored, long now) {
            if (stored == null) return null;
            String[] p = stored.split("\\|", 3);
            if (p.length != 3) return null;
            try {
                Page page = new Page(p[2], Long.parseLong(p[0]), Long.parseLong(p[1]));
                return now - page.at > PAGE_HOLD_MS || page.at > now ? null : page;
            } catch (NumberFormatException e) {
                return null;
            }
        }
    }

    /** What one widget shows. */
    static final class Plan {
        /** One game at a time with ‹ › arrows. */
        final boolean paged;
        /** The day label lifted next to 🙈. */
        final String headerDay;
        final List<Row> body;
        /** Paged only: the index into {@code pages} and its size. */
        final int page;
        final int pages;
        /** The game and mask rows, the pager's pages. */
        final List<Row> all;

        Plan(boolean paged, String headerDay, List<Row> body, int page, List<Row> all) {
            this.paged = paged;
            this.headerDay = headerDay;
            this.body = body;
            this.page = page;
            this.pages = all.size();
            this.all = all;
        }
    }

    /**
     * The list when at least 2 rows fit (or there is only 1 item), else the
     * pager. The first day header moves up next to 🙈 and costs no height.
     */
    static Plan plan(List<Row> items, int budgetDp, Page page) {
        List<Row> all = new ArrayList<>();
        for (Row r : items) if (r.kind != Kind.DAY) all.add(r);
        if (all.isEmpty()) return new Plan(false, "", new ArrayList<Row>(), 0, all);

        boolean lifted = items.get(0).kind == Kind.DAY;
        String head = lifted ? items.get(0).teams : "";
        List<Row> body = fit(lifted ? items.subList(1, items.size()) : items, budgetDp);
        int shown = 0;
        for (Row r : body) if (r.kind != Kind.DAY) shown++;
        if (shown >= 2 || all.size() <= 1) return new Plan(false, head, body, 0, all);

        int idx = pageIndex(all, page);
        Row r = all.get(idx);
        List<Row> one = new ArrayList<>();
        one.add(r);
        return new Plan(true, r.kind == Kind.GAME ? r.day : "", one, idx, all);
    }

    /** The stored page's row; a game that started (gone) moves on to the next one. */
    static int pageIndex(List<Row> all, Page page) {
        if (page == null) return 0;
        for (int i = 0; i < all.size(); i++) if (all.get(i).id.equals(page.id)) return i;
        for (int i = 0; i < all.size(); i++) if (all.get(i).startMs >= page.start) return i;
        return 0;
    }

    /** ‹ (-1) or › (+1), wrapping at both ends. */
    static int turn(int page, int dir, int n) {
        if (n <= 0) return 0;
        return ((page + dir) % n + n) % n;
    }

    /**
     * The rows that fit {@code budgetDp}: at most MAX_GAMES game + mask rows, a
     * day header only with a game under it, and always the first row.
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

    /** "Updated Mon 3:40 PM" once the last full refresh is over 12 h old, else "". */
    static String staleLabel(long fullOkAt, long now, TimeZone zone) {
        if (fullOkAt <= 0 || now - fullOkAt <= 12 * 60 * 60 * 1000L) return "";
        return "Updated " + format("EEE h:mm a", fullOkAt, zone);
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
