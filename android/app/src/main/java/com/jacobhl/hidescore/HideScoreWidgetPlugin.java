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
 * favorite team ids and its time zone here; the widget reads them from
 * SharedPreferences. Favorites never leave the device.
 */
@CapacitorPlugin(name = "HideScoreWidget")
public class HideScoreWidgetPlugin extends Plugin {
    @PluginMethod
    public void setPrefs(PluginCall call) {
        JSArray teams = call.getArray("teams", new JSArray());
        String tz = call.getString("tz");
        String teamsJson = teams.toString();
        String zone = tz == null ? "" : tz;
        SharedPreferences p = WidgetRefresher.prefs(getContext());
        boolean changed = !teamsJson.equals(p.getString(WidgetRefresher.KEY_TEAMS, null))
            || !zone.equals(p.getString(WidgetRefresher.KEY_TZ, ""));
        if (changed) {
            p.edit().putString(WidgetRefresher.KEY_TEAMS, teamsJson).putString(WidgetRefresher.KEY_TZ, zone).apply();
            if (HideScoreWidgetProvider.hasWidgets(getContext())) HideScoreWidgetProvider.requestRefresh(getContext());
        }
        JSObject result = new JSObject();
        result.put("changed", changed);
        call.resolve(result);
    }
}
