package com.jacobhl.hidescore;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import android.os.Build;
import android.webkit.RenderProcessGoneDetail;
import com.getcapacitor.WebViewListener;
import io.sentry.Sentry;
import io.sentry.SentryEvent;
import io.sentry.SentryLevel;
import io.sentry.protocol.Message;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HideScoreGoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
        installBackHandler();
        reportRendererCrashes();
        loadAppLink(getIntent());
        loadSharedText(getIntent());
    }

    // Capacitor's own Android layer has no back-button handling at all, so what the
    // hardware/gesture Back does is whatever happens to be registered. Here that was
    // @capacitor/app's callback, which goes back in WebView history when it can and
    // otherwise does *nothing*: at the root page Back was a dead button and the app
    // could not be dismissed with it. (The shells without @capacitor/app have the
    // opposite bug, closing the app from any depth.) Registering after
    // super.onCreate() puts this callback last, and the dispatcher runs the most
    // recently added one first, so this is the behaviour that wins.
    //
    // goBack() pops WebView history, which fires popstate on hidescore.com, so the
    // ?v= video-modal history entries in HomeContent.tsx still unwind correctly.
    private void installBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });
    }

    // The activity is singleTask, so a link tapped while the app is already running
    // arrives here rather than through onCreate.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadAppLink(intent);
        loadSharedText(intent);
    }

    // This app is a server.url shell — the WebView loads hidescore.com itself — so
    // handling an app link means pointing that WebView at the incoming URL. Without
    // this the link opens the app but leaves it on whatever page it was showing, which
    // is indistinguishable from the link being ignored. @capacitor/app is not used for
    // this, so it is done natively.
    private void loadAppLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null) return;
        if (!"https".equals(uri.getScheme())) return;  // hidescore-auth:// is the plugin's, not ours
        String host = uri.getHost();
        if (!"hidescore.com".equals(host) && !"www.hidescore.com".equals(host)) return;
        if (getBridge() == null || getBridge().getWebView() == null) return;
        final String url = uri.toString();
        runOnUiThread(() -> getBridge().getWebView().loadUrl(url));
    }

    // Share sheet → /watch. The YouTube app shares "Title https://youtu.be/ID"
    // as EXTRA_TEXT; the page pulls the link out of it (lib/youtubeLink.ts), so
    // the text is forwarded whole. Built on the configured server url so a dev
    // build pointed elsewhere stays there.
    private void loadSharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        if (!"text/plain".equals(intent.getType())) return;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text == null || text.length() == 0) return;
        if (getBridge() == null || getBridge().getWebView() == null) return;
        String server = getBridge().getServerUrl();
        if (server == null) server = "https://hidescore.com";
        final String url = Uri.parse(server).buildUpon()
            .path("/watch")
            .clearQuery()
            .appendQueryParameter("text", text.toString())
            .build()
            .toString();
        runOnUiThread(() -> getBridge().getWebView().loadUrl(url));
    }

    // A WebView renderer crash happens in a DIFFERENT process
    // (com.google.android.webview:sandboxed_process0), so sentry-android — which
    // lives in this process — cannot see it. Until now it only ever got reported by
    // accident, on the occasions when the renderer's death dragged this process down
    // with it. Android hands the event to the app process here instead.
    //
    // Returning false is deliberate: the platform then terminates this process,
    // which is exactly what happens today. This closes the reporting blind spot
    // without changing behaviour. Recovering the WebView in place (return true,
    // rebuild it, reload server.url) is a bigger call and a separate one.
    //
    // flush() blocks the UI thread for up to two seconds, which is acceptable in a
    // process that is about to be killed and is the only way the event survives.
    private void reportRendererCrashes() {
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                boolean crashed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail.didCrash();
                SentryEvent event = new SentryEvent();
                event.setLevel(SentryLevel.FATAL);
                Message message = new Message();
                // didCrash() false means Android killed the renderer to reclaim
                // memory rather than the renderer faulting. Same dead app, very
                // different fix, so keep them in separate Sentry groups.
                message.setMessage(crashed
                    ? "WebView renderer crashed"
                    : "WebView renderer killed by the system (out of memory)");
                event.setMessage(message);
                Sentry.captureEvent(event);
                Sentry.flush(2000);
                return false;
            }
        });
    }
}
