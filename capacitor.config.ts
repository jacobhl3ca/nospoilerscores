import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jacobhl.hidescore',
  appName: 'HideScore',
  webDir: 'out',
  // Load the live website inside the WebView instead of the bundled
  // static export. The bundled copy in `out/` stays as a first-launch
  // fallback. Switching off `capacitor://localhost` to a real https
  // origin fixes YouTube IFrame Player Error 153 (the embed checks the
  // parent origin and rejects non-http schemes) and lets web fixes
  // ship to the app via `git push` instead of requiring a native
  // rebuild + App Store review cycle. Same pattern as tonightnyc.
  server: {
    url: 'https://hidescore.com',
  },
};

export default config;
