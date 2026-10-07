package com.jacobhl.hidescore;

import android.content.Context;
import android.content.res.Configuration;
import android.widget.RemoteViews;

/**
 * The widget follows the app's Theme pills (system / light / dark), pushed by
 * the web app (HideScoreWidgetPlugin). System = the layouts' @color/widget_*,
 * which values-night switches. Light or dark = every themed view gets its
 * color here, through RemoteViews methods that exist at API 24.
 */
final class WidgetTheme {
    static final String SYSTEM = "system";
    static final String LIGHT = "light";
    static final String DARK = "dark";

    /** Null = follow the system (no overrides). */
    final Boolean forced;
    private final int text, muted, accent, bg, chip;

    private WidgetTheme(Context c, Boolean forced) {
        this.forced = forced;
        boolean d = forced != null && forced;
        text = c.getColor(d ? R.color.widget_dark_text : R.color.widget_light_text);
        muted = c.getColor(d ? R.color.widget_dark_muted : R.color.widget_light_muted);
        accent = c.getColor(d ? R.color.widget_dark_accent : R.color.widget_light_accent);
        bg = d ? R.drawable.widget_bg_dark : R.drawable.widget_bg_light;
        chip = d ? R.drawable.widget_chip_dark : R.drawable.widget_chip_light;
    }

    static WidgetTheme of(Context c) {
        return new WidgetTheme(c, forced(c));
    }

    /** "light" / "dark"; anything else (null, "", old values) = "system". */
    static String normalize(String raw) {
        if (LIGHT.equals(raw)) return LIGHT;
        if (DARK.equals(raw)) return DARK;
        return SYSTEM;
    }

    /** TRUE = dark, FALSE = light, null = system. */
    static Boolean forced(Context c) {
        String t = normalize(WidgetRefresher.prefs(c).getString(WidgetRefresher.KEY_THEME, SYSTEM));
        return SYSTEM.equals(t) ? null : DARK.equals(t);
    }

    /** Dark art for the logos: the forced theme, else the system's night mode. */
    boolean darkNow(Context c) {
        if (forced != null) return forced;
        int night = c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return night == Configuration.UI_MODE_NIGHT_YES;
    }

    void text(RemoteViews v, int... ids) {
        color(v, text, ids);
    }

    void muted(RemoteViews v, int... ids) {
        color(v, muted, ids);
    }

    void accent(RemoteViews v, int... ids) {
        color(v, accent, ids);
    }

    void bg(RemoteViews v, int id) {
        if (forced != null) v.setInt(id, "setBackgroundResource", bg);
    }

    void chip(RemoteViews v, int id) {
        if (forced != null) v.setInt(id, "setBackgroundResource", chip);
    }

    /** An icon drawn in the muted color (the ↻ button). */
    void tint(RemoteViews v, int id) {
        if (forced != null) v.setInt(id, "setColorFilter", muted);
    }

    private void color(RemoteViews v, int color, int... ids) {
        if (forced == null) return;
        for (int id : ids) v.setTextColor(id, color);
    }
}
