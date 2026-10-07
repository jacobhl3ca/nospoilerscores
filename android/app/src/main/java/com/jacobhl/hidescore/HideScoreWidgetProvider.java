package com.jacobhl.hidescore;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
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
 * The hourly system tick re-renders from the cache (games that have started
 * drop off) and hits the network at most every 3 h. A favorites change in the
 * app (HideScoreWidgetPlugin) and the refresh button fetch at once. The ‹ ›
 * arrows of a 1-row widget redraw from the cache, no network.
 */
public class HideScoreWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.jacobhl.hidescore.WIDGET_REFRESH";
    static final String ACTION_PAGE = "com.jacobhl.hidescore.WIDGET_PAGE";
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();
    // Root padding + header row, in dp (widget_hidescore.xml).
    private static final int CHROME_DP = 44;
    private static final String KEY_PAGE = "page_";
    // Narrower than this (dp), the channel cell goes so the team names fit. A
    // 4-wide Pixel widget is 360 dp, 3-wide 266 dp; the pager's arrows take 48 dp.
    private static final int LIST_CHANNEL_DP = 300;
    private static final int PAGER_CHANNEL_DP = 340;

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
    public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor e = WidgetRefresher.prefs(context).edit();
        for (int id : ids) e.remove(KEY_PAGE + id);
        e.apply();
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_REFRESH.equals(intent.getAction())) {
            renderAll(context);
            fetch(context);
            return;
        }
        if (ACTION_PAGE.equals(intent.getAction())) {
            turnPage(context, intent.getData());
            return;
        }
        super.onReceive(context, intent);
    }

    /** Cache first, then the network inside goAsync(); one 9 s limit for data and logos. */
    private void fetch(Context context) {
        final Context app = context.getApplicationContext();
        final PendingResult pending = goAsync();
        EXEC.execute(() -> {
            try {
                long deadline = System.currentTimeMillis() + WidgetRefresher.STOP_AFTER_MS;
                WidgetRefresher.refresh(app, deadline);
                renderAll(app);
                if (WidgetLogos.fetchMissing(app, deadline)) renderAll(app);
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

    /** hs-widget://page/<id>/<dir>: one step ‹ or ›, wrapping, from the live list. */
    private static void turnPage(Context context, Uri data) {
        List<String> seg = data == null ? null : data.getPathSegments();
        if (seg == null || seg.size() != 2) return;
        int id, dir;
        try {
            id = Integer.parseInt(seg.get(0));
            dir = Integer.parseInt(seg.get(1)) > 0 ? 1 : -1;
        } catch (NumberFormatException e) {
            return;
        }
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        SharedPreferences p = WidgetRefresher.prefs(context);
        long now = System.currentTimeMillis();
        WidgetRows.Plan plan = plan(context, mgr, id, now);
        if (plan != null && plan.paged && plan.pages > 1) {
            WidgetRows.Row next = plan.all.get(WidgetRows.turn(plan.page, dir, plan.pages));
            p.edit().putString(KEY_PAGE + id, new WidgetRows.Page(next.id, next.startMs, now).encode()).apply();
        }
        render(context, mgr, id);
    }

    /** The rows for widget {@code id}, or null when it shows a message instead. */
    private static WidgetRows.Plan plan(Context context, AppWidgetManager mgr, int id, long now) {
        SharedPreferences p = WidgetRefresher.prefs(context);
        String raw = p.getString(WidgetRefresher.KEY_CACHE, null);
        if (raw == null) return null;
        try {
            List<WidgetRows.Row> items = WidgetRows.items(new JSONObject(raw), WidgetRefresher.zone(p), now);
            WidgetRows.Page page = WidgetRows.Page.live(p.getString(KEY_PAGE + id, null), now);
            return WidgetRows.plan(items, budgetDp(mgr.getAppWidgetOptions(id)), page);
        } catch (Exception e) {
            return null;
        }
    }

    private static void render(Context context, AppWidgetManager mgr, int id) {
        try {
            mgr.updateAppWidget(id, build(context, mgr, id, true));
        } catch (RuntimeException tooBig) {
            // Bitmaps over the host's limit (or a bad logo file): the rows without logos.
            mgr.updateAppWidget(id, build(context, mgr, id, false));
        }
    }

    private static RemoteViews build(Context context, AppWidgetManager mgr, int id, boolean logos) {
        String pkg = context.getPackageName();
        RemoteViews views = new RemoteViews(pkg, R.layout.widget_hidescore);
        SharedPreferences p = WidgetRefresher.prefs(context);
        TimeZone zone = WidgetRefresher.zone(p);
        WidgetTheme theme = WidgetTheme.of(context);
        long now = System.currentTimeMillis();

        views.removeAllViews(R.id.widget_rows);
        String message = null;
        WidgetRows.Plan plan = null;

        if (!p.contains(WidgetRefresher.KEY_TEAMS)) {
            message = "Open HideScore to set up";
        } else if (WidgetCache.leaguesInOrder(p.getString(WidgetRefresher.KEY_TEAMS, "[]"), null).isEmpty()) {
            message = "Pick favorite teams in HideScore";
        } else if (p.getString(WidgetRefresher.KEY_CACHE, null) == null) {
            message = "Loading upcoming games…";
        } else {
            plan = plan(context, mgr, id, now);
            if (plan == null) message = "Open HideScore to set up";
            else if (plan.pages == 0) message = "No upcoming games this week";
        }

        String headerDay = "";
        String count = "";
        if (message != null) {
            views.addView(R.id.widget_rows, messageRow(pkg, message, theme));
        } else if (plan.paged) {
            headerDay = plan.headerDay;
            count = (plan.page + 1) + "/" + plan.pages;
            boolean channel = roomFor(mgr.getAppWidgetOptions(id), PAGER_CHANNEL_DP);
            views.addView(R.id.widget_rows, pager(context, id, plan.body.get(0), theme, logos, channel));
        } else {
            headerDay = plan.headerDay;
            boolean channel = roomFor(mgr.getAppWidgetOptions(id), LIST_CHANNEL_DP);
            for (WidgetRows.Row r : plan.body) views.addView(R.id.widget_rows, rowView(context, r, theme, logos, channel, true));
        }
        views.setTextViewText(R.id.widget_day, headerDay);
        views.setTextViewText(R.id.widget_count, count);
        views.setViewVisibility(R.id.widget_count, count.isEmpty() ? View.GONE : View.VISIBLE);
        String stale = message == null ? WidgetRows.staleLabel(p.getLong(WidgetRefresher.KEY_FULL_OK, 0), now, zone) : "";
        views.setTextViewText(R.id.widget_stale, stale);
        views.setViewVisibility(R.id.widget_stale, stale.isEmpty() ? View.GONE : View.VISIBLE);

        theme.bg(views, R.id.widget_root);
        theme.accent(views, R.id.widget_day);
        theme.muted(views, R.id.widget_stale, R.id.widget_count);
        theme.tint(views, R.id.widget_refresh);

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch != null) {
            launch.setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(
                context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        Intent refresh = new Intent(context, HideScoreWidgetProvider.class).setAction(ACTION_REFRESH);
        views.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(
            context, 1, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return views;
    }

    /** ‹ row › for a 1-row widget; the arrows fill the body's height. */
    private static RemoteViews pager(Context context, int id, WidgetRows.Row row, WidgetTheme theme, boolean logos,
                                     boolean channel) {
        RemoteViews pager = new RemoteViews(context.getPackageName(), R.layout.widget_pager);
        // Narrow pager: the chip goes too (the arrows take its room); the team logos stay.
        pager.addView(R.id.pager_row, rowView(context, row, theme, logos, channel, channel || row.kind != WidgetRows.Kind.GAME));
        pager.setOnClickPendingIntent(R.id.pager_prev, pageIntent(context, id, -1));
        pager.setOnClickPendingIntent(R.id.pager_next, pageIntent(context, id, 1));
        theme.muted(pager, R.id.pager_prev, R.id.pager_next);
        return pager;
    }

    private static PendingIntent pageIntent(Context context, int id, int dir) {
        Intent i = new Intent(context, HideScoreWidgetProvider.class).setAction(ACTION_PAGE)
            .setData(Uri.parse("hs-widget://page/" + id + "/" + dir));
        return PendingIntent.getBroadcast(context, 100 + id * 2 + (dir > 0 ? 1 : 0), i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static RemoteViews rowView(Context context, WidgetRows.Row r, WidgetTheme theme, boolean logos,
                                       boolean channel, boolean chip) {
        String pkg = context.getPackageName();
        if (r.kind == WidgetRows.Kind.DAY) {
            RemoteViews day = new RemoteViews(pkg, R.layout.widget_day);
            day.setTextViewText(R.id.row_day, r.teams);
            theme.accent(day, R.id.row_day);
            return day;
        }
        RemoteViews row = new RemoteViews(pkg, R.layout.widget_row);
        boolean game = r.kind == WidgetRows.Kind.GAME;
        int shown = game ? View.VISIBLE : View.GONE;
        row.setViewVisibility(R.id.row_time, shown);
        row.setViewVisibility(R.id.row_at, shown);
        row.setViewVisibility(R.id.row_home, shown);
        row.setTextViewText(R.id.row_time, r.time);
        row.setTextViewText(R.id.row_league, r.chip);
        row.setTextViewText(R.id.row_away, game ? r.away : r.teams);
        row.setTextViewText(R.id.row_home, r.home);
        row.setTextViewText(R.id.row_channel, r.channel);
        row.setViewVisibility(R.id.row_channel, channel ? View.VISIBLE : View.GONE);
        row.setViewVisibility(R.id.row_league, chip ? View.VISIBLE : View.GONE);
        if (game && logos) {
            WidgetLogos.apply(context, row, R.id.row_away_logo, r.awayLogo, theme);
            WidgetLogos.apply(context, row, R.id.row_home_logo, r.homeLogo, theme);
        } else {
            row.setViewVisibility(R.id.row_away_logo, View.GONE);
            row.setViewVisibility(R.id.row_home_logo, View.GONE);
        }
        theme.text(row, R.id.row_time, R.id.row_league, R.id.row_away, R.id.row_at, R.id.row_home);
        theme.muted(row, R.id.row_channel);
        theme.chip(row, R.id.row_league);
        return row;
    }

    private static RemoteViews messageRow(String pkg, String text, WidgetTheme theme) {
        RemoteViews row = new RemoteViews(pkg, R.layout.widget_message);
        row.setTextViewText(R.id.widget_message, text);
        theme.muted(row, R.id.widget_message);
        return row;
    }

    /** True when the portrait width (= min width) is at least {@code dp}, or unknown. */
    private static boolean roomFor(Bundle options, int dp) {
        int w = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        return w <= 0 || w >= dp;
    }

    /** Height left for rows (portrait = max height); the list's 2-row size when unknown. */
    private static int budgetDp(Bundle options) {
        int h = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (h <= 0 && options != null) h = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (h <= 0) return WidgetRows.ONE_ROW_BUDGET_DP + WidgetRows.GAME_DP;
        return h - CHROME_DP;
    }
}
