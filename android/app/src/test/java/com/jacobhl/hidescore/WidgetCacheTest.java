package com.jacobhl.hidescore;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** The widget 1.0.9 fixes: fetch plan, cache merge, pager, stale note, logos, theme. */
public class WidgetCacheTest {
    private static final TimeZone NY = TimeZone.getTimeZone("America/New_York");
    private static final String BASE = "https://site.web.api.espn.com/apis/site/v2/sports";

    private static Set<String> set(String... s) {
        return new HashSet<>(Arrays.asList(s));
    }

    @Test
    public void dayUrlSendsGroupsForCollegeBasketballOnly() {
        assertEquals(BASE + "/basketball/mens-college-basketball/scoreboard?dates=20261010&limit=300&groups=50",
            WidgetCache.dayUrl(BASE, "/basketball/mens-college-basketball/scoreboard", "ncaam", "20261010"));
        assertTrue(WidgetCache.dayUrl(BASE, "/p", "ncaaw", "20261010").endsWith("&groups=50"));
        // groups=50 in football = FCS only: Nebraska's FBS game would vanish.
        assertEquals(BASE + "/football/college-football/scoreboard?dates=20261010&limit=300",
            WidgetCache.dayUrl(BASE, "/football/college-football/scoreboard", "ncaaf", "20261010"));
        assertFalse(WidgetCache.dayUrl(BASE, "/p", "nhl", "20261010").contains("groups"));
    }

    @Test
    public void dayKeysAreCalendarDaysAcrossBothDstChanges() {
        // US fall back, Sun Nov 1 2026. From 12:30 AM that day a fixed 24 h step
        // lands on 11:30 PM the same date: Nov 1 twice.
        long fall = WidgetParser.parseIso("2026-11-01T04:30Z");
        assertEquals(Arrays.asList("20261101", "20261102", "20261103"), WidgetCache.dayKeys(fall, NY, 3));
        // US spring forward, Sun Mar 8 2026. From 11:30 PM Sat a fixed 24 h step
        // lands on 12:30 AM Mon: Mar 8 skipped.
        long spring = WidgetParser.parseIso("2026-03-08T04:30Z");
        assertEquals(Arrays.asList("20260307", "20260308", "20260309"), WidgetCache.dayKeys(spring, NY, 3));
        List<String> week = WidgetCache.dayKeys(fall, NY, 7);
        assertEquals(7, new HashSet<>(week).size());
        assertEquals("20261107", week.get(6));
    }

    @Test
    public void leagueCapCountsOnlyFetchableLeagues() {
        String teams = "[\"cfl-158\",\"ncaaf-158\",\"nhl-13\",\"ncaah-103\",\"cricketintl-1\",\"epl-359\",\"nba-1\"]";
        Map<String, Set<String>> all = WidgetCache.leaguesInOrder(teams, null);
        assertEquals(Arrays.asList("cfl", "ncaaf", "nhl", "ncaah"), new ArrayList<>(all.keySet()));
        Map<String, Set<String>> fetchable = WidgetCache.leaguesInOrder(teams, set("ncaaf", "nhl", "ncaah", "epl", "nba"));
        assertEquals(Arrays.asList("ncaaf", "nhl", "ncaah", "epl"), new ArrayList<>(fetchable.keySet()));
        assertEquals(set("158"), fetchable.get("ncaaf"));
        assertTrue(WidgetCache.leaguesInOrder("not json", null).isEmpty());
    }

    private static WidgetParser.Game game(String id, String league, long start) {
        return new WidgetParser.Game(id, league, "AAA", "BBB", "ESPN", start,
            "/i/teamlogos/nhl/500/aaa.png", "/i/teamlogos/nhl/500/bbb.png", "");
    }

    private static WidgetParser.Day day(boolean post, WidgetParser.Game... games) {
        return new WidgetParser.Day(Arrays.asList(games), post);
    }

    private static Set<String> ids(JSONObject cache) throws Exception {
        Set<String> out = new HashSet<>();
        JSONArray g = cache.getJSONArray("games");
        for (int i = 0; i < g.length(); i++) out.add(g.getJSONObject(i).getString("id"));
        return out;
    }

    private static final Map<String, String> LABELS = new HashMap<>();
    static {
        LABELS.put("nhl", "NHL");
        LABELS.put("mlb", "MLB");
    }

    @Test
    public void mergeKeepsWhatAFailedSlotCouldNotRefetch() throws Exception {
        long now = 1_000_000L;
        List<WidgetCache.Slot> first = Arrays.asList(
            new WidgetCache.Slot("nhl", "20261008", day(false, game("a", "nhl", 5_000_000L))),
            new WidgetCache.Slot("nhl", "20261009", day(false, game("b", "nhl", 6_000_000L))),
            new WidgetCache.Slot("mlb", "20261008", day(true)));
        JSONObject c1 = WidgetCache.merge(null, first, LABELS, NY, now);
        assertEquals(WidgetCache.VERSION, c1.getInt("v"));
        assertEquals(set("a", "b"), ids(c1));
        assertEquals("20261008", c1.getJSONArray("games").getJSONObject(0).getString("d"));
        assertTrue(c1.getJSONObject("leagues").getJSONObject("mlb").getBoolean("post"));

        // Oct 9 fails, MLB fails: "b" stays, MLB stays masked, Oct 8 is replaced.
        List<WidgetCache.Slot> second = Arrays.asList(
            new WidgetCache.Slot("nhl", "20261008", day(false, game("a2", "nhl", 5_500_000L))),
            new WidgetCache.Slot("nhl", "20261009", null),
            new WidgetCache.Slot("mlb", "20261008", null));
        JSONObject c2 = WidgetCache.merge(c1, second, LABELS, NY, 2_000_000L);
        assertEquals(set("a2", "b"), ids(c2));
        assertTrue(c2.getJSONObject("leagues").getJSONObject("mlb").getBoolean("post"));
        assertEquals(2_000_000L, c2.getLong("updated"));

        // MLB answers with no playoffs: unmasked.
        List<WidgetCache.Slot> third = Arrays.asList(new WidgetCache.Slot("mlb", "20261008", day(false)));
        JSONObject c3 = WidgetCache.merge(c2, third, LABELS, NY, now);
        assertFalse(c3.getJSONObject("leagues").getJSONObject("mlb").getBoolean("post"));
        // NHL is no longer a favorite league: its games are dropped.
        assertTrue(ids(c3).isEmpty());
        assertFalse(c3.getJSONObject("leagues").has("nhl"));
    }

    @Test
    public void mergeWithEverySlotFailedKeepsTheOldCache() throws Exception {
        List<WidgetCache.Slot> slots = Arrays.asList(new WidgetCache.Slot("nhl", "20261008", null));
        assertNull(WidgetCache.merge(null, slots, LABELS, NY, 1));
        assertNull(WidgetCache.merge(new JSONObject().put("games", new JSONArray()), slots, LABELS, NY, 1));
    }

    @Test
    public void mergeReadsAVersionOneCache() throws Exception {
        long start = WidgetParser.parseIso("2026-10-09T23:00Z");  // Fri 7 PM ET
        JSONObject v1 = new JSONObject().put("updated", 1)
            .put("games", new JSONArray().put(new JSONObject().put("id", "old").put("league", "nhl")
                .put("away", "NYI").put("home", "NYR").put("channel", "ESPN").put("start", start)))
            .put("leagues", new JSONObject().put("nhl", new JSONObject().put("label", "NHL").put("post", false)));
        List<WidgetCache.Slot> slots = Arrays.asList(
            new WidgetCache.Slot("nhl", "20261008", day(false)),
            new WidgetCache.Slot("nhl", "20261009", null));
        JSONObject c = WidgetCache.merge(v1, slots, LABELS, NY, 2);
        assertEquals(set("old"), ids(c));
        JSONObject g = c.getJSONArray("games").getJSONObject(0);
        assertEquals("20261009", g.getString("d"));
        assertEquals("", g.getString("awayLogo"));
        // And v1 renders as before.
        assertEquals(2, WidgetRows.items(v1, NY, 0).size());
    }

    // ---- rows, pager

    private static JSONObject cache(boolean mlbPost, long... starts) throws Exception {
        JSONArray games = new JSONArray();
        for (int i = 0; i < starts.length; i++) games.put(game("g" + i, "nhl", starts[i]).toJson());
        return new JSONObject().put("games", games).put("leagues", new JSONObject()
            .put("nhl", new JSONObject().put("label", "NHL").put("post", false))
            .put("mlb", new JSONObject().put("label", "MLB").put("post", mlbPost)));
    }

    private static final long NOW = WidgetParser.parseIso("2026-10-05T16:00Z");  // Mon 12 PM ET
    private static final long MON_730 = WidgetParser.parseIso("2026-10-05T23:30Z");
    private static final long MON_9 = WidgetParser.parseIso("2026-10-06T01:00Z");
    private static final long TUE_7 = WidgetParser.parseIso("2026-10-06T23:00Z");
    private static final long THU_7 = WidgetParser.parseIso("2026-10-08T23:00Z");

    @Test
    public void listLiftsTheFirstDayAndPutsMasksLast() throws Exception {
        List<WidgetRows.Row> items = WidgetRows.items(cache(true, MON_730, TUE_7, THU_7), NY, NOW);
        assertEquals(WidgetRows.Kind.MASK, items.get(items.size() - 1).kind);
        assertEquals("MLB", items.get(items.size() - 1).chip);
        WidgetRows.Plan plan = WidgetRows.plan(items, 300, null);
        assertFalse(plan.paged);
        assertEquals("Today", plan.headerDay);
        assertEquals(WidgetRows.Kind.GAME, plan.body.get(0).kind);  // no "Today" row in the body
        assertEquals("AAA", plan.body.get(0).away);
        assertEquals("/i/teamlogos/nhl/500/aaa.png", plan.body.get(0).awayLogo);
        assertEquals(WidgetRows.Kind.MASK, plan.body.get(plan.body.size() - 1).kind);
        assertEquals(4, plan.pages);
    }

    @Test
    public void oneRowWidgetPagesGamesFirstMasksLast() throws Exception {
        List<WidgetRows.Row> items = WidgetRows.items(cache(true, MON_730, TUE_7), NY, NOW);
        // 4×1: one 22 dp row fits. Before 1.0.9 the MLB mask took it.
        WidgetRows.Plan p0 = WidgetRows.plan(items, 30, null);
        assertTrue(p0.paged);
        assertEquals(3, p0.pages);
        assertEquals(0, p0.page);
        assertEquals(WidgetRows.Kind.GAME, p0.body.get(0).kind);
        assertEquals("Today", p0.headerDay);
        assertEquals(1, p0.body.size());

        // › goes to Tuesday's game; its day goes in the header.
        int next = WidgetRows.turn(p0.page, 1, p0.pages);
        WidgetRows.Row r1 = p0.all.get(next);
        WidgetRows.Plan p1 = WidgetRows.plan(items, 30, new WidgetRows.Page(r1.id, r1.startMs, NOW));
        assertEquals(1, p1.page);
        assertEquals("Tomorrow", p1.headerDay);
        // The mask is the last page, with no day.
        WidgetRows.Plan p2 = WidgetRows.plan(items, 30, new WidgetRows.Page("mask:mlb", Long.MAX_VALUE, NOW));
        assertEquals(2, p2.page);
        assertEquals(WidgetRows.Kind.MASK, p2.body.get(0).kind);
        assertEquals("", p2.headerDay);
        // Wraps both ways.
        assertEquals(0, WidgetRows.turn(2, 1, 3));
        assertEquals(2, WidgetRows.turn(0, -1, 3));
        assertEquals(0, WidgetRows.turn(0, 1, 0));
    }

    @Test
    public void pagerOnlyWhenUnderTwoRowsFitAndThereIsMoreThanOne() throws Exception {
        // Same-day games: 2 rows in 44 dp, no pager.
        List<WidgetRows.Row> sameDay = WidgetRows.items(cache(false, MON_730, MON_9), NY, NOW);
        assertFalse(WidgetRows.plan(sameDay, 44, null).paged);
        assertTrue(WidgetRows.plan(sameDay, 43, null).paged);
        // Next game on another day needs its header too: 62 dp.
        List<WidgetRows.Row> twoDays = WidgetRows.items(cache(false, MON_730, TUE_7), NY, NOW);
        assertTrue(WidgetRows.plan(twoDays, 61, null).paged);
        assertFalse(WidgetRows.plan(twoDays, 62, null).paged);
        // A single game never pages, however small.
        WidgetRows.Plan one = WidgetRows.plan(WidgetRows.items(cache(false, MON_730), NY, NOW), 0, null);
        assertFalse(one.paged);
        assertEquals(1, one.body.size());
        // Nothing upcoming: no rows.
        assertEquals(0, WidgetRows.plan(WidgetRows.items(cache(false), NY, NOW), 100, null).pages);
    }

    @Test
    public void startedGameMovesToTheNextAndOldTapsExpire() throws Exception {
        // The page showed g1 (Mon 9 PM). It started: g0 and g1 are gone.
        List<WidgetRows.Row> later = WidgetRows.items(cache(true, MON_730, MON_9, TUE_7), NY, MON_9 + 60_000);
        WidgetRows.Plan p = WidgetRows.plan(later, 30, new WidgetRows.Page("g1", MON_9, MON_9));
        assertEquals("g2", p.body.get(0).id);
        // An id that is gone with no later game: the mask, then the start again.
        assertEquals(0, WidgetRows.pageIndex(new ArrayList<WidgetRows.Row>(), new WidgetRows.Page("x", 1, 1)));

        String stored = new WidgetRows.Page("g2", TUE_7, NOW).encode();
        assertEquals("g2", WidgetRows.Page.live(stored, NOW + 29 * 60_000).id);
        assertNull(WidgetRows.Page.live(stored, NOW + 31 * 60_000));
        assertNull(WidgetRows.Page.live("junk", NOW));
        assertNull(WidgetRows.Page.live(null, NOW));
        // Ids with a "|" survive the round trip.
        assertEquals("a|b", WidgetRows.Page.live(new WidgetRows.Page("a|b", 1, NOW).encode(), NOW).id);
    }

    @Test
    public void staleNoteOnlyAfterTwelveHours() {
        long now = NOW;
        assertEquals("", WidgetRows.staleLabel(now - 11 * 3_600_000L, now, NY));
        assertEquals("Updated Sun 11:00 PM", WidgetRows.staleLabel(now - 13 * 3_600_000L, now, NY));
        assertEquals("", WidgetRows.staleLabel(0, now, NY));
    }

    // ---- logos, theme

    @Test
    public void logoPathAcceptsEspnTeamArtOnly() {
        assertEquals("/i/teamlogos/nhl/500/scoreboard/nyr.png",
            WidgetCache.logoPath("https://a.espncdn.com/i/teamlogos/nhl/500/scoreboard/nyr.png"));
        assertEquals("/i/teamlogos/ncaa/500/103.png", WidgetCache.logoPath("https://a.espncdn.com/i/teamlogos/ncaa/500/103.png"));
        for (String bad : new String[] {
            null, "", "http://a.espncdn.com/i/teamlogos/nhl/500/nyr.png",
            "https://evil.com/i/teamlogos/nhl/500/nyr.png",
            "https://a.espncdn.com.evil.com/i/teamlogos/nhl/500/nyr.png",
            "https://a.espncdn.com/i/teamlogos/../../x.png",
            "https://a.espncdn.com/i/headshots/nhl/players/full/1.png",
            "https://a.espncdn.com/i/teamlogos/nhl/500/nyr.png?x=1",
            "https://a.espncdn.com/i/teamlogos/nhl/500/nyr.svg",
        }) assertEquals(String.valueOf(bad), "", WidgetCache.logoPath(bad));
        assertEquals("", WidgetCache.checkPath("/i/teamlogos//x.png"));
    }

    @Test
    public void logoUrlUsesTheResizerAndDarkArt() {
        String path = "/i/teamlogos/nhl/500/scoreboard/nyr.png";
        assertEquals("https://a.espncdn.com/combiner/i?img=/i/teamlogos/nhl/500/scoreboard/nyr.png&w=64&h=64",
            WidgetCache.logoUrl(path, false));
        assertEquals("https://a.espncdn.com/combiner/i?img=/i/teamlogos/nhl/500-dark/scoreboard/nyr.png&w=64&h=64",
            WidgetCache.logoUrl(path, true));
    }

    @Test
    public void pruneDeletesTheOldestUnneededFiles() {
        Map<String, Long> files = new HashMap<>();
        for (int i = 0; i < 6; i++) files.put("f" + i, (long) i);
        List<String> out = WidgetCache.pruneList(files, set("f0", "f1"), 3);
        assertEquals(Arrays.asList("f2", "f3", "f4"), out);
        assertTrue(WidgetCache.pruneList(files, Collections.<String>emptySet(), 6).isEmpty());
        // Everything needed: nothing goes, even over the cap.
        assertTrue(WidgetCache.pruneList(files, files.keySet(), 2).isEmpty());
    }

    @Test
    public void themeNormalizes() {
        assertEquals("light", WidgetTheme.normalize("light"));
        assertEquals("dark", WidgetTheme.normalize("dark"));
        assertEquals("system", WidgetTheme.normalize("system"));
        assertEquals("system", WidgetTheme.normalize(null));
        assertEquals("system", WidgetTheme.normalize("Dark"));
        assertEquals("system", WidgetTheme.normalize(""));
    }
}
