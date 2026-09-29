import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jacobhl.hidescore',
  appName: 'HideScore',
  webDir: 'out',
  // Load the live website inside the WebView instead of the bundled
  // static export. Switching off `capacitor://localhost` to a real https
  // origin fixes YouTube IFrame Player Error 153 (the embed checks the
  // parent origin and rejects non-http schemes) and lets web fixes
  // ship to the app via `git push` instead of requiring a native
  // rebuild + App Store review cycle. Same pattern as tonightnyc.
  //
  // `errorPath` is what actually makes a bundled copy reachable: without
  // it Capacitor never loads anything from assets when `server.url` is
  // set, so a dropped connection shows the WebView's raw net:: error and
  // every other bundled file is dead weight inside the app download.
  // Only `offline.html` ships to the native shells — see
  // `scripts/trim-android-assets.sh`.
  server: {
    url: 'https://hidescore.com',
    errorPath: 'offline.html',
  },
  // WKWebView only runs service workers when the app opts into App-Bound
  // Domains. With the SW allowed, `/sw-v*.js` installs on the first online
  // open and a cold open with no network paints the saved board (P9)
  // instead of falling through to `offline.html`, whose capacitor://
  // origin can never read the board saved under https://hidescore.com.
  // The domain list lives in `ios/App/App/Info.plist` (`WKAppBoundDomains`).
  // With this on, top-level navigation to any other domain fails inside the
  // WebView; every external link already goes through
  // `src/lib/openExternal.ts` (SFSafariViewController / AppLauncher).
  ios: {
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
