import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { CRUMBS, iframeAllow, installNativeCrashGuards, isIosApp, presentationCrumb } from "../src/lib/nativeCrashGuards.ts";

// GitHub #290, #268, #66: three native iOS crashes with no app frame in the
// Sentry event. No test here can run Swift or WebKit's player, so none of them
// reproduces a crash. These tests pin the guards: the web half in full, and
// the native half by reading the Swift and the Info.plist sources.

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const iosApp = () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } });

test("isIosApp: only Capacitor's native iOS bridge counts", () => {
  assert.equal(isIosApp(iosApp()), true);
  assert.equal(isIosApp({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } }), false);
  assert.equal(isIosApp({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }), false);
  assert.equal(isIosApp({}), false);
  assert.equal(isIosApp(null), false);
  assert.equal(isIosApp({ Capacitor: { isNativePlatform: () => { throw new Error("bridge gone"); } } }), false);
});

test("#290: an embed iframe asks for picture-in-picture in a browser, not in the iOS app", () => {
  assert.equal(iframeAllow({}), "autoplay; encrypted-media; fullscreen; picture-in-picture");
  assert.equal(iframeAllow(iosApp()), "autoplay; encrypted-media; fullscreen");
});

test("presentationCrumb: the three WebKit modes, nothing else", () => {
  assert.equal(presentationCrumb("inline"), CRUMBS.inline);
  assert.equal(presentationCrumb("fullscreen"), CRUMBS.fullscreen);
  assert.equal(presentationCrumb("picture-in-picture"), CRUMBS.pip);
  assert.equal(presentationCrumb("other"), null);
  assert.equal(presentationCrumb(undefined), null);
});

// A document that records its listeners, and the elements the guards look at.
type Listener = (e: unknown) => void;
function fakeWindow(app: boolean) {
  const listeners = new Map<string, Listener>();
  const posted: unknown[] = [];
  const document = {
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    removeEventListener: (type: string, fn: Listener) => { if (listeners.get(type) === fn) listeners.delete(type); },
  };
  const w = {
    document,
    ...(app ? iosApp() : {}),
    webkit: { messageHandlers: { hsBreadcrumb: { postMessage: (m: unknown) => posted.push(m) } } },
  };
  const fire = (type: string, e: object) => listeners.get(type)?.(e);
  return { w: w as unknown as Window, listeners, posted, fire };
}

function fakeVideo(controls = true) {
  const attrs = new Set<string>();
  return {
    nodeType: 1, tagName: "VIDEO", controls, disablePictureInPicture: false, webkitPresentationMode: "inline",
    setAttribute: (name: string) => attrs.add(name),
    attrs,
  };
}

test("#290: in the iOS app a <video> loses picture-in-picture before it plays", () => {
  const { w, fire } = fakeWindow(true);
  installNativeCrashGuards(w);
  const v = fakeVideo();
  fire("loadstart", { type: "loadstart", target: v });
  assert.equal(v.disablePictureInPicture, true);
  assert.ok(v.attrs.has("disablepictureinpicture"));
});

test("#290: in a browser a <video> keeps picture-in-picture", () => {
  const { w, fire, posted } = fakeWindow(false);
  installNativeCrashGuards(w);
  const v = fakeVideo();
  fire("loadstart", { type: "loadstart", target: v });
  fire("play", { type: "play", target: v });
  assert.equal(v.disablePictureInPicture, false);
  assert.equal(v.attrs.size, 0);
  assert.deepEqual(posted, []);
});

test("#290: play and presentation changes go to the shell as fixed breadcrumbs", () => {
  const { w, fire, posted } = fakeWindow(true);
  installNativeCrashGuards(w);
  const v = fakeVideo();
  fire("play", { type: "play", target: v });
  v.webkitPresentationMode = "fullscreen";
  fire("webkitpresentationmodechanged", { type: "webkitpresentationmodechanged", target: v });
  v.webkitPresentationMode = "inline";
  fire("webkitpresentationmodechanged", { type: "webkitpresentationmodechanged", target: v });
  fire("enterpictureinpicture", { type: "enterpictureinpicture", target: v });
  assert.deepEqual(posted, [CRUMBS.play, CRUMBS.fullscreen, CRUMBS.inline, CRUMBS.pip]);
});

test("an autoplay card (no controls) gets the guard but no play breadcrumb", () => {
  const { w, fire, posted } = fakeWindow(true);
  installNativeCrashGuards(w);
  const v = fakeVideo(false);
  fire("play", { type: "play", target: v });
  assert.equal(v.disablePictureInPicture, true);
  assert.deepEqual(posted, []);
});

test("#66: a long press on an image is a breadcrumb; a tap and a scroll are not", () => {
  let t = 0;
  const { w, fire, posted } = fakeWindow(true);
  installNativeCrashGuards(w, () => t);
  const img = { nodeType: 1, tagName: "IMG" };
  const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }], target: img });

  fire("touchstart", touch(10, 10)); t += 120; fire("touchend", {});
  assert.deepEqual(posted, [], "a tap");

  fire("touchstart", touch(10, 10)); t += 100; fire("touchmove", touch(10, 60)); t += 600; fire("touchend", {});
  assert.deepEqual(posted, [], "a scroll that starts on an image");

  fire("touchstart", touch(10, 10)); t += 520; fire("touchcancel", {});
  assert.deepEqual(posted, [CRUMBS.longPress], "iOS cancels the touch when its image menu opens");

  fire("touchstart", { touches: [{ clientX: 0, clientY: 0 }], target: { nodeType: 1, tagName: "DIV" } }); t += 900; fire("touchend", {});
  assert.equal(posted.length, 1, "not an image");
});

test("the uninstall function removes every listener", () => {
  const { w, listeners } = fakeWindow(true);
  const off = installNativeCrashGuards(w);
  assert.ok(listeners.size > 0);
  off();
  assert.equal(listeners.size, 0);
});

test("breadcrumbs carry fixed lower-case words only (no title, no digits)", () => {
  for (const c of Object.values(CRUMBS)) assert.match(c.message, /^[a-z -]+$/);
});

test("the shell accepts exactly the breadcrumbs the page sends", () => {
  const swift = read("ios/App/App/MainViewController.swift");
  const block = swift.match(/breadcrumbs: \[String: Set<String>\] = \[([\s\S]*?)\n\s*\]/);
  assert.ok(block, "BREADCRUMBS allowlist in MainViewController.swift");
  const native = new Set<string>();
  for (const line of block[1].matchAll(/"(\w+)": \[([^\]]*)\]/g)) {
    for (const m of line[2].matchAll(/"([^"]+)"/g)) native.add(`${line[1]}:${m[1]}`);
  }
  const web = new Set(Object.values(CRUMBS).map((c) => `${c.category}:${c.message}`));
  assert.deepEqual([...native].sort(), [...web].sort());
  assert.match(swift, /add\(WeakScriptMessageHandler\(self\), name: Self\.breadcrumbName\)/);
});

test("#290 native half: the web view configuration keeps PiP off", () => {
  assert.match(read("ios/App/App/MainViewController.swift"), /configuration\.allowsPictureInPictureMediaPlayback = false/);
});

test("#268 native half: Google sign-in moves to main before any UIKit work", () => {
  const swift = read("ios/App/App/GoogleAuthPlugin.swift");
  const authorize = swift.match(/@objc func authorize\(_ call: CAPPluginCall\) \{([\s\S]*?)\n {4}\}/);
  assert.ok(authorize);
  assert.match(authorize[1], /DispatchQueue\.main\.async/);
  assert.doesNotMatch(authorize[1], /ASWebAuthenticationSession|view\.window|pendingCall/);
  assert.match(swift, /SentrySDK\.addBreadcrumb/);
});

// #66: `__abort_with_payload` is how iOS stops an app that reaches a
// privacy-protected resource with no usage string in Info.plist.
function plistString(plist: string, key: string): string | null {
  const m = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return m ? m[1] : null;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const p = join(dir, name);
    return statSync(join(ROOT, p)).isDirectory() ? sourceFiles(p) : /\.(tsx?|mjs|js)$/.test(name) ? [p] : [];
  });
}

test("#66: Info.plist names a reason for every privacy resource the site can reach", () => {
  const plist = read("ios/App/App/Info.plist");
  // The image menu's "Save to Photos" is always reachable outside the board.
  assert.ok(plistString(plist, "NSPhotoLibraryAddUsageDescription")?.trim(), "NSPhotoLibraryAddUsageDescription");

  const src = sourceFiles("src").map(read).join("\n");
  const needs: Array<[RegExp, string[]]> = [
    [/getUserMedia/, ["NSCameraUsageDescription", "NSMicrophoneUsageDescription"]],
    [/navigator\.geolocation/, ["NSLocationWhenInUseUsageDescription"]],
    [/type=["']file["']/, ["NSCameraUsageDescription"]],
  ];
  for (const [use, keys] of needs) {
    if (!use.test(src)) continue;
    for (const key of keys) assert.ok(plistString(plist, key)?.trim(), `${key} (site uses ${use})`);
  }
});
