package com.jacobhl.hidescore;

import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Web → widget bridge (src/lib/widgetBridge.ts). The web app pushes the
 * favorite team ids, its time zone and its Theme pill here; the widget reads
 * them from SharedPreferences. Favorites never leave the device.
 */
@CapacitorPlugin(name = "HideScoreWidget")
public class HideScoreWidgetPlugin extends Plugin {
    @PluginMethod
    public void setPrefs(PluginCall call) {
        JSArray teams = call.getArray("teams", new JSArray());
        String tz = call.getString("tz");
        String rawTheme = call.getString("theme");
        String teamsJson = teams.toString();
        String zone = tz == null ? "" : tz;
        SharedPreferences p = WidgetRefresher.prefs(getContext());
        // A web bundle older than the theme push sends none: keep the stored one.
        String theme = rawTheme == null
            ? p.getString(WidgetRefresher.KEY_THEME, WidgetTheme.SYSTEM)
            : WidgetTheme.normalize(rawTheme);
        boolean dataChanged = !teamsJson.equals(p.getString(WidgetRefresher.KEY_TEAMS, null))
            || !zone.equals(p.getString(WidgetRefresher.KEY_TZ, ""));
        boolean themeChanged = !theme.equals(p.getString(WidgetRefresher.KEY_THEME, WidgetTheme.SYSTEM));
        if (dataChanged || themeChanged) {
            p.edit().putString(WidgetRefresher.KEY_TEAMS, teamsJson).putString(WidgetRefresher.KEY_TZ, zone)
                .putString(WidgetRefresher.KEY_THEME, theme).apply();
            if (HideScoreWidgetProvider.hasWidgets(getContext())) {
                // New favorites need the network; a new theme only recolors the cached rows.
                if (dataChanged) HideScoreWidgetProvider.requestRefresh(getContext());
                else HideScoreWidgetProvider.renderAll(getContext());
            }
        }
        JSObject result = new JSObject();
        result.put("changed", dataChanged || themeChanged);
        call.resolve(result);
    }
}
