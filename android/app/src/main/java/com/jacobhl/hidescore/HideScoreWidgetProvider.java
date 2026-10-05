package com.jacobhl.hidescore;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget: upcoming games for the favorite teams, never a score.
 *
 * The 30-min system tick re-renders from the cache (games that have started drop
 * off) and hits the network at most every 3 h. A favorites change in the app
 * (HideScoreWidgetPlugin) and the ↻ button fetch at once.
 */
public class HideScoreWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.jacobhl.hidescore.WIDGET_REFRESH";
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();
    private static final int MAX_ROWS = 5;

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        renderAll(context);
        if (WidgetRefresher.networkDue(context)) fetch(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr, int id, Bundle options) {
        render(context, mgr, id);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_REFRESH.equals(intent.getAction())) {
            renderAll(context);
            fetch(context);
            return;
        }
        super.onReceive(context, intent);
    }

    /** Cache first, then the network inside goAsync(); WidgetRefresher stops itself at 8 s. */
    private void fetch(Context context) {
        final Context app = context.getApplicationContext();
        final PendingResult pending = goAsync();
        EXEC.execute(() -> {
            try {
                WidgetRefresher.refresh(app);
                renderAll(app);
            } finally {
                pending.finish();
            }
        });
    }

    static boolean hasWidgets(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        return mgr.getAppWidgetIds(new ComponentName(context, HideScoreWidgetProvider.class)).length > 0;
    }

    /** Ask every widget to fetch now (favorites changed). */
    static void requestRefresh(Context context) {
        context.sendBroadcast(new Intent(context, HideScoreWidgetProvider.class).setAction(ACTION_REFRESH));
    }

    static void renderAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        for (int id : mgr.getAppWidgetIds(new ComponentName(context, HideScoreWidgetProvider.class))) {
            render(context, mgr, id);
        }
    }

    private static void render(Context context, AppWidgetManager mgr, int id) {
        String pkg = context.getPackageName();
        RemoteViews views = new RemoteViews(pkg, R.layout.widget_hidescore);
        SharedPreferences p = WidgetRefresher.prefs(context);
        TimeZone zone = WidgetRefresher.zone(p);

        views.removeAllViews(R.id.widget_rows);
        String updated = "";
        int max = rowsFor(mgr.getAppWidgetOptions(id));
        List<String[]> rows = new ArrayList<>();  // {chip, teams, time, channel}
        String message = null;

        if (!p.contains(WidgetRefresher.KEY_TEAMS)) {
            message = "Open HideScore to set up";
        } else if (WidgetRefresher.leaguesInOrder(p.getString(WidgetRefresher.KEY_TEAMS, "[]")).isEmpty()) {
            message = "Pick favorite teams in HideScore";
        } else {
            String raw = p.getString(WidgetRefresher.KEY_CACHE, null);
            if (raw == null) {
                message = "Loading upcoming games…";
            } else {
                try {
                    JSONObject cache = new JSONObject(raw);
                    updated = "Updated " + format("h:mm a", cache.optLong("updated"), zone);
                    rows = rowsFromCache(cache, zone);
                    if (rows.isEmpty()) message = "No upcoming games this week";
                } catch (Exception e) {
                    message = "Open HideScore to set up";
                }
            }
        }

        if (message != null) {
            views.addView(R.id.widget_rows, messageRow(pkg, message));
        } else {
            for (int i = 0; i < rows.size() && i < max; i++) {
                String[] r = rows.get(i);
                RemoteViews row = new RemoteViews(pkg, R.layout.widget_row);
                row.setTextViewText(R.id.row_league, r[0]);
                row.setTextViewText(R.id.row_teams, r[1]);
                row.setTextViewText(R.id.row_time, r[2]);
                row.setTextViewText(R.id.row_channel, r[3]);
                views.addView(R.id.widget_rows, row);
            }
        }
        views.setTextViewText(R.id.widget_updated, updated);

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch != null) {
            launch.setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
                context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        Intent refresh = new Intent(context, HideScoreWidgetProvider.class).setAction(ACTION_REFRESH);
        views.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(
            context, 1, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        mgr.updateAppWidget(id, views);
    }

    /** Postseason leagues first as one generic row each, then games by start time. */
    static List<String[]> rowsFromCache(JSONObject cache, TimeZone zone) {
        List<String[]> rows = new ArrayList<>();
        JSONObject leagues = cache.optJSONObject("leagues");
        JSONArray names = leagues == null ? null : leagues.names();
        List<String> masked = new ArrayList<>();
        for (int i = 0; names != null && i < names.length(); i++) {
            String key = names.optString(i);
            JSONObject l = leagues.optJSONObject(key);
            if (l != null && l.optBoolean("post")) {
                masked.add(key);
                rows.add(new String[] {chip(key, l), "Playoffs: open HideScore", "", ""});
            }
        }
        long now = System.currentTimeMillis();
        List<WidgetParser.Game> games = new ArrayList<>();
        JSONArray arr = cache.optJSONArray("games");
        for (int i = 0; arr != null && i < arr.length(); i++) {
            WidgetParser.Game g = WidgetParser.Game.fromJson(arr.optJSONObject(i));
            if (g.startMs > now && !masked.contains(g.league)) games.add(g);
        }
        Collections.sort(games, (a, b) -> Long.compare(a.startMs, b.startMs));
        for (WidgetParser.Game g : games) {
            JSONObject l = leagues == null ? null : leagues.optJSONObject(g.league);
            rows.add(new String[] {chip(g.league, l), g.away + " @ " + g.home, format("EEE h:mm a", g.startMs, zone), g.channel});
        }
        return rows;
    }

    /** "MLB", "NFL"…; a long catalog label ("Premier League") falls back to the key ("EPL"). */
    private static String chip(String key, JSONObject league) {
        String label = league == null ? "" : league.optString("label");
        return label.isEmpty() || label.length() > 6 ? key.toUpperCase(Locale.US) : label;
    }

    private static RemoteViews messageRow(String pkg, String text) {
        RemoteViews row = new RemoteViews(pkg, R.layout.widget_message);
        row.setTextViewText(R.id.widget_message, text);
        return row;
    }

    /** Rows that fit the widget's current height (header + footer ≈ 52 dp, a row ≈ 24 dp). */
    private static int rowsFor(Bundle options) {
        int h = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (h <= 0 && options != null) h = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (h <= 0) return 3;
        return Math.max(1, Math.min(MAX_ROWS, (h - 52) / 24));
    }

    private static String format(String pattern, long ms, TimeZone zone) {
        SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US);
        f.setTimeZone(zone);
        return f.format(new Date(ms));
    }
}
