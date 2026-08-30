#!/usr/bin/env python3
"""Generates every tvOS brand asset from the HideScore mark. Reproducible: run
   /opt/homebrew/bin/python3 tvos/tools/make-assets.py
and the whole `App Icon & Top Shelf Image.brandassets` catalog is rebuilt.

tvOS icons are LAYERED — the system slides the layers against each other when
the icon is focused — so each icon is rendered as three full-bleed images
(background, mark, wordmark) rather than one flat PNG.
"""
import json, os, shutil, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

REPO = os.path.expanduser("~/nospoilerscores")
SVG = os.path.join(REPO, "public", "monkey-see-no-evil.svg")
OUT = os.path.join(REPO, "tvos", "HideScoreTV", "Assets.xcassets")
BRAND = os.path.join(OUT, "App Icon & Top Shelf Image.brandassets")
INTER = os.path.expanduser("~/Library/Fonts/Inter[opsz,wght].ttf")

INFO = {"author": "xcode", "version": 1}
BG_TOP, BG_BOTTOM = (10, 13, 19), (22, 32, 43)
ACCENT = (79, 204, 130)


def font(size, weight=700):
    f = ImageFont.truetype(INTER, size)
    try:
        f.set_variation_by_axes([float(min(max(size, 14), 32)), float(weight)])
    except Exception:
        pass
    return f


def monkey(height):
    """The brand mark, rasterized from the same SVG the website ships."""
    png = "/tmp/hs-monkey-%d.png" % height
    subprocess.run(["rsvg-convert", "-h", str(height), "-o", png, SVG], check=True)
    return Image.open(png).convert("RGBA")


def gradient(w, h, glow=True):
    img = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        d.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)) + (255,))
    if glow:
        # A soft stadium-light wash so the flat background isn't dead space when
        # the parallax slides the layers apart.
        halo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        hd = ImageDraw.Draw(halo)
        r = int(w * 0.42)
        for i in range(r, 0, -max(1, r // 90)):
            a = int(30 * (1 - i / r) ** 2)
            hd.ellipse([w // 2 - i, int(h * 0.16) - i, w // 2 + i, int(h * 0.16) + i], fill=ACCENT + (a,))
        img = Image.alpha_composite(img, halo)
    return img


def centered(draw, text, f, y, w, fill=(255, 255, 255, 255), tracking=0):
    if tracking:
        widths = [draw.textlength(c, font=f) for c in text]
        total = sum(widths) + tracking * (len(text) - 1)
        x = (w - total) / 2
        for c, cw in zip(text, widths):
            draw.text((x, y), c, font=f, fill=fill)
            x += cw + tracking
    else:
        tw = draw.textlength(text, font=f)
        draw.text(((w - tw) / 2, y), text, font=f, fill=fill)


def icon_layers(w, h):
    """(back, middle, front) — background wash, the mark, the wordmark."""
    back = gradient(w, h)

    mid = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    m = monkey(int(h * 0.50))
    mid.paste(m, ((w - m.width) // 2, int(h * 0.13)), m)

    front = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(front)
    size = int(h * 0.155)
    centered(d, "HideScore", font(size, 800), int(h * 0.68), w)
    return back, mid, front


def top_shelf(w, h):
    img = gradient(w, h, glow=False)
    # A wide banner reads left-to-right: mark, then name, then the promise.
    m = monkey(int(h * 0.62))
    img.paste(m, (int(w * 0.13), (h - m.height) // 2), m)
    d = ImageDraw.Draw(img)
    x = int(w * 0.13) + m.width + int(w * 0.035)
    title = font(int(h * 0.24), 800)
    sub = font(int(h * 0.10), 500)
    d.text((x, h * 0.30), "HideScore", font=title, fill=(255, 255, 255, 255))
    d.text((x + 4, h * 0.60), "Scores stay hidden until you say so.", font=sub, fill=ACCENT + (255,))
    return img


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2)
        f.write("\n")


def imagestack(name, w, h, idiom, scales):
    stack = os.path.join(BRAND, name + ".imagestack")
    layers = icon_layers(w * max(scales), h * max(scales))
    write(os.path.join(stack, "Contents.json"),
          {"info": INFO, "layers": [{"filename": n + ".imagestacklayer"} for n in ("Front", "Middle", "Back")]})
    for layer_name, image in zip(("Back", "Middle", "Front"), layers):
        layer = os.path.join(stack, layer_name + ".imagestacklayer")
        write(os.path.join(layer, "Contents.json"), {"info": INFO})
        content = os.path.join(layer, "Content.imageset")
        os.makedirs(content, exist_ok=True)
        images = []
        for scale in scales:
            fn = "layer@%dx.png" % scale if scale > 1 else "layer.png"
            out = image.resize((w * scale, h * scale), Image.LANCZOS)
            # The bottom layer of a tvOS icon may not carry an alpha channel;
            # the layers above it must, or the parallax has nothing to float.
            if layer_name == "Back":
                out = out.convert("RGB")
            out.save(os.path.join(content, fn))
            images.append({"filename": fn, "idiom": idiom, "scale": "%dx" % scale})
        write(os.path.join(content, "Contents.json"), {"images": images, "info": INFO})


def imageset(name, w, h, scales):
    path = os.path.join(BRAND, name + ".imageset")
    os.makedirs(path, exist_ok=True)
    master = top_shelf(w * max(scales), h * max(scales))
    images = []
    for scale in scales:
        fn = "shelf@%dx.png" % scale if scale > 1 else "shelf.png"
        master.resize((w * scale, h * scale), Image.LANCZOS).convert("RGB").save(os.path.join(path, fn))
        images.append({"filename": fn, "idiom": "tv", "scale": "%dx" % scale})
    write(os.path.join(path, "Contents.json"), {"images": images, "info": INFO})


def main():
    if os.path.isdir(BRAND):
        shutil.rmtree(BRAND)
    write(os.path.join(OUT, "Contents.json"), {"info": INFO})

    imagestack("App Icon", 400, 240, "tv", [1, 2])
    # 1280x768 is the App Store icon. Its idiom is "tv" like everything
    # else here: "tv-marketing" (the tvOS analogue of ios-marketing) is
    # accepted by actool without a warning, lands in Assets.car under the
    # "marketing" idiom, and is then invisible to App Store validation,
    # which rejects the upload with "Missing Image Asset ... App Store Icon".
    imagestack("App Icon - App Store", 1280, 768, "tv", [1])
    imageset("Top Shelf Image", 1920, 720, [1, 2])
    imageset("Top Shelf Image Wide", 2320, 720, [1, 2])

    write(os.path.join(BRAND, "Contents.json"), {
        "assets": [
            {"filename": "App Icon.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "400x240"},
            {"filename": "App Icon - App Store.imagestack", "idiom": "tv", "role": "primary-app-icon", "size": "1280x768"},
            {"filename": "Top Shelf Image Wide.imageset", "idiom": "tv", "role": "top-shelf-image-wide", "size": "2320x720"},
            {"filename": "Top Shelf Image.imageset", "idiom": "tv", "role": "top-shelf-image", "size": "1920x720"},
        ],
        "info": INFO,
    })
    print("brand assets written to", BRAND)


if __name__ == "__main__":
    main()
