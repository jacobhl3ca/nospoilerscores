package com.jacobhl.hidescore;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * The widget's spoiler rule, run on saved ESPN JSON (src/test/resources/espn,
 * fetched 2026-10-05): MLB in its postseason, an NFL Sunday, a UCL league-phase
 * night. Plus a hand-made slate with every trap in it.
 */
public class WidgetParserTest {
    // What a widget row must never contain (the plan's uiautomator check).
    private static final Pattern SPOILER = Pattern.compile("Final|FT|\\d+\\s*-\\s*\\d+|Game \\d|leads|wins|series");

    private static String fixture(String name) throws Exception {
        try (InputStream in = WidgetParserTest.class.getResourceAsStream("/espn/" + name)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Set<String> ids(String... ids) {
        return new HashSet<>(Arrays.asList(ids));
    }

    @Test
    public void postseasonLeagueShowsNoGames() throws Exception {
        // LAD (19) plays NLDS Game 3 that day; the widget must not list it.
        WidgetParser.Day day = WidgetParser.parseDay(fixture("mlb-postseason.json"), "mlb", false, ids("19", "15"));
        assertTrue(day.postseason);
        assertTrue(day.games.isEmpty());
    }

    @Test
    public void regularSeasonKeepsFavoritesOnly() throws Exception {
        WidgetParser.Day day = WidgetParser.parseDay(fixture("nfl-regular.json"), "nfl", false, ids("3"));
        assertFalse(day.postseason);
        assertEquals(1, day.games.size());
        WidgetParser.Game g = day.games.get(0);
        assertEquals("CHI", g.away);
        assertEquals("GB", g.home);
        assertEquals("FOX", g.channel);
        assertEquals(WidgetParser.parseIso("2026-10-11T17:00Z"), g.startMs);
    }

    @Test
    public void soccerLeaguePhaseKept() throws Exception {
        WidgetParser.Day day = WidgetParser.parseDay(fixture("ucl.json"), "ucl", true, ids("359"));
        assertEquals(1, day.games.size());
        assertEquals("ARS", day.games.get(0).away);
        assertEquals("MUN", day.games.get(0).home);
    }

    private static JSONObject event(String id, String status, String note, String homeAbbr, String awayAbbr) throws Exception {
        JSONObject comp = new JSONObject()
            .put("competitors", new JSONArray()
                .put(new JSONObject().put("homeAway", "home").put("score", "3")
                    .put("records", new JSONArray().put(new JSONObject().put("summary", "88-74")))
                    .put("team", new JSONObject().put("id", "1").put("abbreviation", homeAbbr)))
                .put(new JSONObject().put("homeAway", "away").put("score", "2")
                    .put("team", new JSONObject().put("id", "2").put("abbreviation", awayAbbr))))
            .put("broadcasts", new JSONArray().put(new JSONObject().put("names", new JSONArray().put("ESPN").put("ESPN+").put("ABC"))))
            .put("series", new JSONObject().put("summary", "Series tied 2-2"))
            .put("notes", note == null ? new JSONArray() : new JSONArray().put(new JSONObject().put("headline", note)));
        return new JSONObject().put("id", id).put("date", "2099-01-01T00:00Z")
            .put("season", new JSONObject().put("type", 2))
            .put("status", new JSONObject().put("type", new JSONObject().put("name", status).put("detail", "Final")))
            .put("competitions", new JSONArray().put(comp));
    }

    @Test
    public void trapsAreDropped() throws Exception {
        JSONArray events = new JSONArray()
            .put(event("ok", "STATUS_SCHEDULED", null, "AAA", "BBB"))
            .put(event("ok", "STATUS_SCHEDULED", null, "AAA", "BBB"))          // same id twice
            .put(event("final", "STATUS_FINAL", null, "AAA", "BBB"))
            .put(event("live", "STATUS_IN_PROGRESS", null, "AAA", "BBB"))
            .put(event("g5", "STATUS_SCHEDULED", "ALCS - Game 5", "AAA", "BBB"))
            .put(event("leg2", "STATUS_SCHEDULED", "2nd Leg", "AAA", "BBB"))
            .put(event("agg", "STATUS_SCHEDULED", "Aggregate 2-1", "AAA", "BBB"))
            .put(event("r16", "STATUS_SCHEDULED", "Round of 16", "AAA", "BBB"))
            .put(event("tbd", "STATUS_SCHEDULED", null, "TBD", "BBB"));
        String json = new JSONObject().put("events", events).toString();
        WidgetParser.Day day = WidgetParser.parseDay(json, "epl", true, ids("1"));
        // Dedupe by id happens across days in WidgetRefresher; here both copies parse.
        for (WidgetParser.Game g : day.games) assertEquals("ok", g.id);
        assertEquals(2, day.games.size());
        WidgetParser.Game g = day.games.get(0);
        assertEquals("ESPN · ESPN+", g.channel);
        // The cached shape carries the whitelist and nothing else.
        JSONObject cached = g.toJson();
        Set<String> keys = new HashSet<>();
        for (Iterator<String> it = cached.keys(); it.hasNext(); ) keys.add(it.next());
        assertEquals(ids("id", "league", "away", "home", "channel", "start"), keys);
    }

    @Test
    public void typeThreeEventMasksLeagueEvenWithoutLeagueBlock() throws Exception {
        JSONObject e = event("p", "STATUS_SCHEDULED", null, "AAA", "BBB");
        e.put("season", new JSONObject().put("type", 3));
        String json = new JSONObject().put("events", new JSONArray().put(e).put(event("r", "STATUS_SCHEDULED", null, "AAA", "BBB"))).toString();
        WidgetParser.Day day = WidgetParser.parseDay(json, "nhl", false, ids("1"));
        assertTrue(day.postseason);
        assertTrue(day.games.isEmpty());
    }

    @Test
    public void renderedRowsCarryNoSpoilerText() throws Exception {
        WidgetParser.Day nfl = WidgetParser.parseDay(fixture("nfl-regular.json"), "nfl", false, ids("3", "21", "9"));
        WidgetParser.Day mlb = WidgetParser.parseDay(fixture("mlb-postseason.json"), "mlb", false, ids("19"));
        JSONArray games = new JSONArray();
        for (WidgetParser.Game g : nfl.games) {
            // Push them into the future so the "already started" filter keeps them.
            games.put(new WidgetParser.Game(g.id, g.league, g.away, g.home, g.channel, Long.MAX_VALUE / 2).toJson());
        }
        JSONObject cache = new JSONObject().put("updated", 0).put("games", games)
            .put("leagues", new JSONObject()
                .put("mlb", new JSONObject().put("label", "MLB").put("post", mlb.postseason))
                .put("nfl", new JSONObject().put("label", "NFL").put("post", false)));
        List<WidgetRows.Row> rows = WidgetRows.fromCache(cache, TimeZone.getTimeZone("America/New_York"), 0);
        // Mask row, one day header (all games share a start), the games.
        assertEquals(1 + 1 + nfl.games.size(), rows.size());
        assertEquals("Playoffs: open HideScore", rows.get(0).teams);
        for (WidgetRows.Row row : rows) {
            for (String cell : row.cells()) assertFalse(cell, SPOILER.matcher(cell).find());
        }
    }

    private static JSONObject game(String id, String channel, long start) throws Exception {
        return new WidgetParser.Game(id, "nhl", "NYI", "NYR", channel, start).toJson();
    }

    @Test
    public void rowsGetDayHeadersOneChannelAndFitTheHeight() throws Exception {
        TimeZone ny = TimeZone.getTimeZone("America/New_York");
        long now = WidgetParser.parseIso("2026-10-05T16:00Z");   // Mon 12:00 PM ET
        JSONArray games = new JSONArray()
            .put(game("a", "NHL Network · ESPN+", WidgetParser.parseIso("2026-10-05T23:30Z")))  // Mon 7:30 PM
            .put(game("b", "Prime Video", WidgetParser.parseIso("2026-10-06T23:00Z")))          // Tue 7:00 PM
            .put(game("c", "ESPN+", WidgetParser.parseIso("2026-10-08T23:00Z")))                // Thu
            .put(game("old", "ESPN", WidgetParser.parseIso("2026-10-05T15:00Z")));              // started
        JSONObject cache = new JSONObject().put("games", games)
            .put("leagues", new JSONObject().put("nhl", new JSONObject().put("label", "NHL").put("post", false)));
        List<WidgetRows.Row> rows = WidgetRows.fromCache(cache, ny, now);
        assertEquals(6, rows.size());
        assertEquals("Today", rows.get(0).teams);
        assertEquals("7:30 PM", rows.get(1).time);
        assertEquals("NHL Net", rows.get(1).channel);
        assertEquals("NYI @ NYR", rows.get(1).teams);
        assertEquals("Tomorrow", rows.get(2).teams);
        assertEquals("Prime", rows.get(3).channel);
        assertEquals("Thu Oct 8", rows.get(4).teams);
        assertEquals(WidgetRows.Kind.GAME, rows.get(5).kind);

        // 62 dp: Today + 7:30 game + room for one more game, but not a header + game.
        List<WidgetRows.Row> fit = WidgetRows.fit(rows, 62);
        assertEquals(2, fit.size());
        // No room at all still shows the first game under its header.
        assertEquals(2, WidgetRows.fit(rows, 0).size());
        // Never more than 6 games however tall.
        JSONArray many = new JSONArray();
        for (int i = 0; i < 10; i++) many.put(game("g" + i, "ESPN", now + 3_600_000L * (i + 1)));
        List<WidgetRows.Row> tall = WidgetRows.fit(WidgetRows.fromCache(new JSONObject().put("games", many), ny, now), 2000);
        int shown = 0;
        for (WidgetRows.Row r : tall) if (r.kind != WidgetRows.Kind.DAY) shown++;
        assertEquals(WidgetRows.MAX_GAMES, shown);
    }
}
