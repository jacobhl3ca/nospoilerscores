package com.jacobhl.hidescore;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.LruCache;
import android.view.View;
import android.widget.RemoteViews;
import java.io.File;
import java.io.FileOutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Team logos for the widget rows: 64×64 PNGs from ESPN, kept on disk in
 * files/widget_logos and fetched once. A 0-byte dark file = ESPN has no dark
 * art for that team, so the light art is used on dark too.
 */
final class WidgetLogos {
    private WidgetLogos() {}

    private static final String DIR = "widget_logos";
    private static final int MAX_FILES = 200;
    // One Bitmap per file per process: RemoteViews dedupes a Bitmap only by instance.
    private static final LruCache<String, Bitmap> MEMORY = new LruCache<>(64);

    private static File dir(Context c) {
        return new File(c.getFilesDir(), DIR);
    }

    private static File file(Context c, String url) {
        return new File(dir(c), sha1(url) + ".png");
    }

    /**
     * Fetch the logos the cached games need and do not have yet, until
     * {@code deadline}. True when a file was added (render again).
     */
    static boolean fetchMissing(Context c, long deadline) {
        String raw = WidgetRefresher.prefs(c).getString(WidgetRefresher.KEY_CACHE, null);
        if (raw == null) return false;
        Set<String> paths = new LinkedHashSet<>();
        try {
            JSONArray games = new JSONObject(raw).optJSONArray("games");
            for (int i = 0; games != null && i < games.length(); i++) {
                WidgetParser.Game g = WidgetParser.Game.fromJson(games.optJSONObject(i));
                if (!g.awayLogo.isEmpty()) paths.add(g.awayLogo);
                if (!g.homeLogo.isEmpty()) paths.add(g.homeLogo);
            }
        } catch (Exception e) {
            return false;
        }
        File dir = dir(c);
        if (!dir.isDirectory() && !dir.mkdirs()) return false;

        Set<String> keep = new HashSet<>();
        List<Callable<Boolean>> tasks = new ArrayList<>();
        for (String path : paths) {
            for (final boolean dark : new boolean[] {false, true}) {
                final String url = WidgetCache.logoUrl(path, dark);
                final File f = file(c, url);
                keep.add(f.getName());
                if (f.exists()) continue;
                tasks.add(() -> save(url, f, dark));
            }
        }
        boolean added = false;
        long left = deadline - System.currentTimeMillis();
        if (!tasks.isEmpty() && left > 500) {
            ExecutorService pool = Executors.newFixedThreadPool(4);
            try {
                for (Future<Boolean> f : pool.invokeAll(tasks, left, TimeUnit.MILLISECONDS)) {
                    try {
                        if (f.get()) added = true;
                    } catch (Exception skipped) {
                        // timed out or offline: next refresh tries again
                    }
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                pool.shutdownNow();
            }
        }
        prune(dir, keep);
        return added;
    }

    private static boolean save(String url, File f, boolean dark) throws Exception {
        byte[] png;
        try {
            png = WidgetRefresher.getBytes(url, 4000);
        } catch (WidgetRefresher.HttpStatus e) {
            if (!dark || e.code != 404) throw e;
            png = new byte[0];  // no dark art for this team: marker, light art on dark
        }
        if (png.length > 0 && BitmapFactory.decodeByteArray(png, 0, png.length) == null) return false;
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(png);
        }
        return tmp.renameTo(f);
    }

    private static void prune(File dir, Set<String> keep) {
        File[] files = dir.listFiles();
        if (files == null || files.length <= MAX_FILES) return;
        Map<String, Long> ages = new HashMap<>();
        for (File f : files) ages.put(f.getName(), f.lastModified());
        for (String name : WidgetCache.pruneList(ages, keep, MAX_FILES)) {
            //noinspection ResultOfMethodCallIgnored
            new File(dir, name).delete();
            MEMORY.remove(name);
        }
    }

    /** The light or dark art for {@code path}, or null when it is not on disk yet. */
    static Bitmap load(Context c, String path, boolean dark) {
        if (path == null || path.isEmpty()) return null;
        File f = file(c, WidgetCache.logoUrl(path, dark));
        if (dark && f.isFile() && f.length() == 0) return load(c, path, false);
        String key = f.getName();
        Bitmap b = MEMORY.get(key);
        if (b != null) return b;
        if (!f.isFile()) return dark ? load(c, path, false) : null;
        b = BitmapFactory.decodeFile(f.getPath());
        if (b != null) MEMORY.put(key, b);
        return b;
    }

    /**
     * Put the logo on {@code id}, or hide it. System theme on API 31+: both
     * arts, the launcher picks by night mode. Otherwise the art for {@code dark}.
     */
    static void apply(Context c, RemoteViews v, int id, String path, WidgetTheme theme) {
        Bitmap light = load(c, path, false);
        if (light == null) {
            v.setViewVisibility(id, View.GONE);
            return;
        }
        v.setViewVisibility(id, View.VISIBLE);
        if (theme.forced == null && Build.VERSION.SDK_INT >= 31) {
            Bitmap dark = load(c, path, true);
            if (dark == null || dark == light) {
                v.setImageViewBitmap(id, light);
            } else {
                v.setIcon(id, "setImageIcon", Icon.createWithBitmap(light), Icon.createWithBitmap(dark));
            }
            return;
        }
        Bitmap b = theme.darkNow(c) ? load(c, path, true) : light;
        v.setImageViewBitmap(id, b == null ? light : b);
    }

    private static String sha1(String s) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-1").digest(s.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : h) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
