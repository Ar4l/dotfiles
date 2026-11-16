"""Screenshot the Paseo web UI at a desktop or a phone viewport.

Usage: shot.py <base-url> <out.png> <desktop|phone> [step ...]

Steps run in order before the screenshot:
  text:<visible text>     click the first element with this text
  label:<aria label>      click the first element with this accessibility label
  xy:<x>,<y>              click at viewport coordinates
  scroll:<pixels>         wheel-scroll at the centre of the content pane
  wait:<ms>               pause
  url                     print the current URL

Prints the page URL and console errors; never prints storage or cookies.
"""

import os
import sys

from playwright.sync_api import sync_playwright

VIEWPORTS = {
    "desktop": {"width": 1440, "height": 900, "scale": 2, "mobile": False},
    "phone": {"width": 390, "height": 844, "scale": 3, "mobile": True},
}

# The web UI bundled with the nix build of Paseo 0.15.4 reads BottomSheetModalInternalProvider
# from the @gorhom/bottom-sheet index, which does not export it, so the app crashes at the root.
# Rewrite that one reference in the response this browser receives; nothing on disk changes.
BROKEN = "n.BottomSheetModalInternalProvider,{value:A,children:P}"
FIXED = "r(3828).BottomSheetModalInternalProvider,{value:A,children:P}"


def patch_bundle(route):
    response = route.fetch()
    body = response.text()
    if BROKEN in body:
        body = body.replace(BROKEN, FIXED)
    route.fulfill(response=response, body=body)


def main() -> int:
    base, target, name, *steps = sys.argv[1:]
    vp = dict(VIEWPORTS[name])
    if os.environ.get("VIEWPORT"):
        vp["width"], vp["height"] = (int(v) for v in os.environ["VIEWPORT"].split("x"))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": vp["width"], "height": vp["height"]},
            device_scale_factor=vp["scale"],
            is_mobile=vp["mobile"],
            has_touch=vp["mobile"],
            color_scheme=os.environ.get("SCHEME", "dark"),
            timezone_id="Asia/Shanghai",
        )
        page = ctx.new_page()
        page.route("**/_expo/static/js/web/index-*.js", patch_bundle)
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text[:300]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.goto(base, wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        for step in steps:
            kind, _, arg = step.partition(":")
            try:
                if kind == "text":
                    loc = page.get_by_text(arg, exact=False).first
                    loc.tap(timeout=5000) if vp["mobile"] else loc.click(timeout=5000)
                    page.wait_for_timeout(1500)
                elif kind == "label":
                    loc = page.get_by_label(arg, exact=True).first
                    loc.tap(timeout=5000) if vp["mobile"] else loc.click(timeout=5000)
                    page.wait_for_timeout(1500)
                elif kind == "xy":
                    x, y = (float(v) for v in arg.split(","))
                    page.touchscreen.tap(x, y) if vp["mobile"] else page.mouse.click(x, y)
                    page.wait_for_timeout(1500)
                elif kind == "scroll":
                    if vp["mobile"]:
                        page.evaluate(
                            """(dy) => { const els = [...document.querySelectorAll('*')].filter(
                                 e => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible'
                                   && getComputedStyle(e).overflowY !== 'hidden');
                               els.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
                               if (els[0]) els[0].scrollBy(0, dy); }""",
                            int(arg),
                        )
                    else:
                        page.mouse.move(vp["width"] * 0.65, vp["height"] * 0.6)
                        page.mouse.wheel(0, int(arg))
                    page.wait_for_timeout(700)
                elif kind == "wait":
                    page.wait_for_timeout(int(arg))
                elif kind == "goto":
                    page.goto(base.rstrip("/") + arg, wait_until="domcontentloaded")
                    page.wait_for_timeout(4000)
                elif kind == "back":
                    page.go_back()
                    page.wait_for_timeout(1500)
                elif kind == "count":
                    print(f"count {arg!r}: {page.get_by_label(arg, exact=True).count()}")
                elif kind == "url":
                    print(f"url: {page.url}")
                else:
                    print(f"unknown step {step!r}")
            except Exception as exc:  # noqa: BLE001
                print(f"step {step!r} failed: {str(exc)[:240]}")
        clip = None
        if os.environ.get("CLIP"):
            x, y, w, h = (float(v) for v in os.environ["CLIP"].split(","))
            clip = {"x": x, "y": y, "width": w, "height": h}
        page.screenshot(path=target, clip=clip)
        print(f"[{name}] url={page.url} errors={len(errors)} -> {target}")
        for e in errors[:8]:
            print(f"  console error: {e}")
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
