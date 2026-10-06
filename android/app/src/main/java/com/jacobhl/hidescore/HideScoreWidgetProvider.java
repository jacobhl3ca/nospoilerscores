package com.jacobhl.hidescore;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Home-screen widget: upcoming games for the favorite teams, never a score.
 *
 * The 30-min system tick re-renders from the cache (games that have started drop
 * off) and hits the network at most every 3 h. A favorites change in the app
 * (HideScoreWidgetPlugin) and the refresh button fetch at once.
 */
public class HideScoreWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.jacobhl.hidescore.WIDGET_REFRESH";
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();
    // Root padding + header row + "Updated" footer, in dp (widget_hidescore.xml).
    private static final int CHROME_DP = 60;

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
        List<WidgetRows.Row> rows = new ArrayList<>();
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
                    updated = "Updated " + WidgetRows.format("h:mm a", cache.optLong("updated"), zone);
                    rows = WidgetRows.fromCache(cache, zone, System.currentTimeMillis());
                    if (rows.isEmpty()) message = "No upcoming games this week";
                } catch (Exception e) {
                    message = "Open HideScore to set up";
                }
            }
        }

        if (message != null) {
            views.addView(R.id.widget_rows, messageRow(pkg, message));
        } else {
            for (WidgetRows.Row r : WidgetRows.fit(rows, budgetDp(mgr.getAppWidgetOptions(id)))) {
                views.addView(R.id.widget_rows, rowView(pkg, r));
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

    private static RemoteViews rowView(String pkg, WidgetRows.Row r) {
        if (r.kind == WidgetRows.Kind.DAY) {
            RemoteViews day = new RemoteViews(pkg, R.layout.widget_day);
            day.setTextViewText(R.id.widget_day, r.teams);
            return day;
        }
        RemoteViews row = new RemoteViews(pkg, R.layout.widget_row);
        row.setViewVisibility(R.id.row_time, r.kind == WidgetRows.Kind.MASK ? View.GONE : View.VISIBLE);
        row.setTextViewText(R.id.row_time, r.time);
        row.setTextViewText(R.id.row_league, r.chip);
        row.setTextViewText(R.id.row_teams, r.teams);
        row.setTextViewText(R.id.row_channel, r.channel);
        return row;
    }

    private static RemoteViews messageRow(String pkg, String text) {
        RemoteViews row = new RemoteViews(pkg, R.layout.widget_message);
        row.setTextViewText(R.id.widget_message, text);
        return row;
    }

    /** Height left for rows (portrait = max height); 3 game rows' worth when unknown. */
    private static int budgetDp(Bundle options) {
        int h = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (h <= 0 && options != null) h = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (h <= 0) return 3 * WidgetRows.GAME_DP + WidgetRows.DAY_DP;
        return h - CHROME_DP;
    }
}
