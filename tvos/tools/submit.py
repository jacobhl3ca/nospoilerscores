#!/usr/bin/env python3
"""Ships the Apple TV app to the App Store, headless.

The tvOS app lives inside the SAME App Store record as the iPhone app
(com.jacobhl.hidescore, app id 6766885311) as a second platform, so it has its
own version train, its own metadata and its own screenshots while sharing the
name, price, categories and age rating.

  python3 submit.py status                 # what's live / in flight
  python3 submit.py metadata               # push the copy in APP_STORE_TVOS.md
                                           # (incl. "What's new" from 1.1 on)
  python3 submit.py screenshots <dir>      # upload 1920x1080 or 3840x2160 PNGs
  python3 submit.py attach <buildNumber>   # wait for processing, attach the build
  python3 submit.py submit                 # send it to review
  python3 submit.py cancel                 # free a version stuck in a rejected
                                           # submission (the deadlock bypass)

Listing copy is read from ../APP_STORE_TVOS.md so the text that ships is the
text in version control — never retyped into a form.
"""
import hashlib, json, os, re, sys, time
sys.path.insert(0, os.path.expanduser("~/scripts/asc"))
from asc_lib import call, token  # noqa: E402

APP = "6766885311"
PLATFORM = "TV_OS"
LOCALE = "en-US"
HERE = os.path.dirname(os.path.abspath(__file__))
COPY = os.path.join(HERE, "..", "APP_STORE_TVOS.md")
SCREENSHOT_TYPE = "APP_APPLE_TV"


# ── listing copy ───────────────────────────────────────────────────────────────

def sections():
    """`## Heading` → body, from the version-controlled copy."""
    text = open(COPY).read()
    out, key, buf = {}, None, []
    for line in text.splitlines():
        m = re.match(r"^## (.+)$", line)
        if m:
            if key:
                out[key] = "\n".join(buf).strip()
            key, buf = m.group(1).strip().lower(), []
        elif key:
            buf.append(line)
    if key:
        out[key] = "\n".join(buf).strip()
    return out


# ── version ────────────────────────────────────────────────────────────────────

def tv_version():
    versions = call("GET", f"/apps/{APP}/appStoreVersions?filter[platform]={PLATFORM}&limit=20")["data"]
    if not versions:
        raise SystemExit("no tvOS version exists — create one first")
    # Newest first; the API returns them in descending createdDate.
    return versions[0]


def localization(version_id):
    for loc in call("GET", f"/appStoreVersions/{version_id}/appStoreVersionLocalizations")["data"]:
        if loc["attributes"]["locale"] == LOCALE:
            return loc
    return call("POST", "/appStoreVersionLocalizations", {"data": {
        "type": "appStoreVersionLocalizations",
        "attributes": {"locale": LOCALE},
        "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}},
    }})["data"]


def app_info_localization():
    """The privacy policy TEXT hangs off the app info, not off the version.

    An Apple TV can't open a browser, so App Store Connect wants the policy as
    text as well as a URL, and refuses to review a tvOS version without it. Only
    the app info still in PREPARE_FOR_SUBMISSION is editable — the other one is
    the copy that is live on the store.
    """
    for info in call("GET", f"/apps/{APP}/appInfos?limit=10")["data"]:
        if info["attributes"].get("state") != "PREPARE_FOR_SUBMISSION":
            continue
        for loc in call("GET", f"/appInfos/{info['id']}/appInfoLocalizations")["data"]:
            if loc["attributes"]["locale"] == LOCALE:
                return loc
    raise SystemExit("no editable app info localization for " + LOCALE)


# ── commands ───────────────────────────────────────────────────────────────────

def cmd_status():
    v = tv_version()
    a = v["attributes"]
    print(f"tvOS {a['versionString']}  {a.get('appVersionState') or a['appStoreState']}  (version {v['id']})")
    try:
        build = call("GET", f"/appStoreVersions/{v['id']}/build")["data"]
        print(f"  attached build: {build['attributes']['version']}")
    except Exception:
        print("  attached build: none")
    # Without the platform filter this lists the iOS builds too, which share
    # the app record and the build-number sequence — build 1 exists twice.
    builds = call("GET", f"/builds?filter[app]={APP}&filter[preReleaseVersion.platform]={PLATFORM}"
                         f"&limit=10&sort=-uploadedDate")["data"]
    for b in builds:
        pre = b.get("relationships", {})
        print(f"  build {b['attributes']['version']:>4}  {b['attributes']['processingState']}  "
              f"uploaded {b['attributes']['uploadedDate']}")
    subs = call("GET", f"/apps/{APP}/reviewSubmissions?limit=10")["data"]
    for s in subs:
        if s["attributes"]["platform"] == PLATFORM:
            print(f"  review submission {s['id']} → {s['attributes']['state']}")


def cmd_metadata():
    s = sections()
    v = tv_version()
    loc = localization(v["id"])
    url = s["support / marketing url"].strip()
    body = {"data": {"type": "appStoreVersionLocalizations", "id": loc["id"], "attributes": {
        "description": s["description"],
        "keywords": s["keywords"],
        "promotionalText": " ".join(s["promotional text"].split()),
        "supportUrl": url,
        "marketingUrl": url,
    }}}
    # Release notes. App Store Connect has no such field on a platform's FIRST
    # version and rejects the attribute outright, so it only rides along once
    # there is a shipped version to be "new" against.
    if "what's new" in s and v["attributes"].get("versionString") != "1.0":
        body["data"]["attributes"]["whatsNew"] = s["what's new"]
    if len(body["data"]["attributes"]["keywords"]) > 100:
        raise SystemExit(f"keywords are {len(body['data']['attributes']['keywords'])} chars — the limit is 100")
    call("PATCH", f"/appStoreVersionLocalizations/{loc['id']}", body)
    print("metadata pushed")

    # Review notes live on the version's review detail, which may not exist yet.
    detail = {"contactFirstName": "Jacob", "contactLastName": "Heifetz-Licht",
              "contactPhone": "REDACTED_PHONE", "contactEmail": "hi@jacobhl.com",
              "demoAccountRequired": False, "notes": s["review notes"]}
    try:
        existing = call("GET", f"/appStoreVersions/{v['id']}/appStoreReviewDetail")["data"]
        call("PATCH", f"/appStoreReviewDetails/{existing['id']}",
             {"data": {"type": "appStoreReviewDetails", "id": existing["id"], "attributes": detail}})
    except Exception:
        call("POST", "/appStoreReviewDetails", {"data": {
            "type": "appStoreReviewDetails", "attributes": detail,
            "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": v["id"]}}}}})
    print("review notes pushed")

    info_loc = app_info_localization()
    call("PATCH", f"/appInfoLocalizations/{info_loc['id']}", {"data": {
        "type": "appInfoLocalizations", "id": info_loc["id"],
        "attributes": {"privacyPolicyText": s["privacy policy text"]}}})
    print("privacy policy text pushed")


def cmd_screenshots(directory):
    import urllib.request
    v = tv_version()
    loc = localization(v["id"])
    sets = call("GET", f"/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets")["data"]
    shot_set = next((s for s in sets if s["attributes"]["screenshotDisplayType"] == SCREENSHOT_TYPE), None)
    if shot_set:
        # Replace wholesale — a half-updated set is worse than a rebuilt one.
        for old in call("GET", f"/appScreenshotSets/{shot_set['id']}/appScreenshots")["data"]:
            call("DELETE", f"/appScreenshots/{old['id']}")
    else:
        shot_set = call("POST", "/appScreenshotSets", {"data": {
            "type": "appScreenshotSets",
            "attributes": {"screenshotDisplayType": SCREENSHOT_TYPE},
            "relationships": {"appStoreVersionLocalization": {
                "data": {"type": "appStoreVersionLocalizations", "id": loc["id"]}}}}})["data"]

    files = sorted(f for f in os.listdir(directory) if f.lower().endswith(".png"))
    for name in files:
        path = os.path.join(directory, name)
        blob = open(path, "rb").read()
        shot = call("POST", "/appScreenshots", {"data": {
            "type": "appScreenshots",
            "attributes": {"fileSize": len(blob), "fileName": name},
            "relationships": {"appScreenshotSet": {
                "data": {"type": "appScreenshotSets", "id": shot_set["id"]}}}}})["data"]
        for op in shot["attributes"]["uploadOperations"]:
            req = urllib.request.Request(op["url"], data=blob[op["offset"]:op["offset"] + op["length"]],
                                         method=op["method"])
            for h in op["requestHeaders"]:
                req.add_header(h["name"], h["value"])
            urllib.request.urlopen(req, timeout=120).read()
        call("PATCH", f"/appScreenshots/{shot['id']}", {"data": {
            "type": "appScreenshots", "id": shot["id"],
            "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(blob).hexdigest()}}})
        print(f"uploaded {name}")

    # Apple processes each upload; a submission before they land 409s.
    for _ in range(60):
        states = [s["attributes"]["assetDeliveryState"]["state"]
                  for s in call("GET", f"/appScreenshotSets/{shot_set['id']}/appScreenshots")["data"]]
        if states and all(s == "COMPLETE" for s in states):
            print(f"{len(states)} screenshots COMPLETE")
            return
        if any(s == "FAILED" for s in states):
            raise SystemExit(f"a screenshot failed asset delivery: {states}")
        time.sleep(10)
    raise SystemExit("screenshots did not finish processing")


def cmd_attach(build_number):
    v = tv_version()
    for attempt in range(90):
        builds = call("GET", f"/builds?filter[app]={APP}&filter[version]={build_number}"
                             f"&filter[preReleaseVersion.platform]={PLATFORM}&limit=5")["data"]
        if builds:
            b = builds[0]
            state = b["attributes"]["processingState"]
            print(f"build {build_number}: {state}")
            if state == "VALID":
                call("PATCH", f"/appStoreVersions/{v['id']}/relationships/build",
                     {"data": {"type": "builds", "id": b["id"]}})
                print("attached")
                return
            if state in ("INVALID", "FAILED"):
                raise SystemExit(f"build {build_number} is {state}")
        else:
            print(f"build {build_number}: not visible yet ({attempt})")
        time.sleep(20)
    raise SystemExit("build never became VALID")


def cmd_cancel():
    """A rejected version stays locked inside its review submission and the API
    deadlocks on every other route. PATCHing the submission {canceled:true} is
    the one thing that frees it."""
    for s in call("GET", f"/apps/{APP}/reviewSubmissions?limit=20")["data"]:
        if s["attributes"]["platform"] == PLATFORM and s["attributes"]["state"] in ("UNRESOLVED_ISSUES", "READY_FOR_REVIEW", "WAITING_FOR_REVIEW"):
            try:
                call("PATCH", f"/reviewSubmissions/{s['id']}",
                     {"data": {"type": "reviewSubmissions", "id": s["id"], "attributes": {"canceled": True}}})
            except Exception as e:
                # An empty READY_FOR_REVIEW draft is "not in cancellable state"
                # (409) — harmless, cmd_submit reuses it. Anything else is real.
                if "409" not in str(e):
                    raise
                print(f"not cancellable, skipping {s['id']} ({s['attributes']['state']})")
                continue
            print(f"cancelled {s['id']} ({s['attributes']['state']})")


def cmd_submit():
    v = tv_version()
    # An empty, never-submitted draft (READY_FOR_REVIEW, 0 items) can sit on the
    # app for good — one has sat beside 1.0's submission (bb390201…) — and Apple
    # refuses to cancel it: PATCH {canceled:true} → 409 "not in cancellable
    # state" (2026-09-06). Reuse it rather than race a second POST against it.
    sub = None
    for s in call("GET", f"/apps/{APP}/reviewSubmissions?limit=20")["data"]:
        if s["attributes"]["platform"] != PLATFORM or s["attributes"]["state"] != "READY_FOR_REVIEW":
            continue
        if not call("GET", f"/reviewSubmissions/{s['id']}/items")["data"]:
            sub = s
            print(f"reusing the empty draft submission {s['id']}")
            break
    if sub is None:
        sub = call("POST", "/reviewSubmissions", {"data": {
            "type": "reviewSubmissions", "attributes": {"platform": PLATFORM},
            "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})["data"]
    call("POST", "/reviewSubmissionItems", {"data": {
        "type": "reviewSubmissionItems",
        "relationships": {
            "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub["id"]}},
            "appStoreVersion": {"data": {"type": "appStoreVersions", "id": v["id"]}}}}})
    call("PATCH", f"/reviewSubmissions/{sub['id']}",
         {"data": {"type": "reviewSubmissions", "id": sub["id"], "attributes": {"submitted": True}}})
    print(f"submitted {sub['id']}")
    cmd_status()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    {"status": cmd_status, "metadata": cmd_metadata, "attach": cmd_attach,
     "screenshots": cmd_screenshots, "submit": cmd_submit, "cancel": cmd_cancel}[cmd](*sys.argv[2:])
