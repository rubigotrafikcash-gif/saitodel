"""Capture desktop/mobile screenshots and QA a local HTML file or HTTP(S) URL.

Requires Playwright and a browser: python3 -m pip install playwright
                             python3 -m playwright install chromium
"""

import argparse
import json
import math
import sys
from pathlib import Path
from urllib.parse import urlparse


VIEWS = (("desktop", 1440, 900), ("mobile", 390, 844))
NAVIGATION_TIMEOUT_MS = 60000
NETWORK_IDLE_TIMEOUT_MS = 5000
EARLY_PAINT_MS = 350

QA_JS = """() => {
  const viewport = document.documentElement.clientWidth;
  const overflow = [...document.querySelectorAll('body *')].filter(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.right > viewport + 1 && getComputedStyle(element).position !== 'fixed';
  }).slice(0, 5).map(element => element.tagName.toLowerCase());
  const videos = [...document.querySelectorAll('video')].map(video => ({
    src: video.currentSrc || video.src, ready: video.readyState, paused: video.paused,
    error: video.error ? video.error.code : null,
    h264Support: video.canPlayType('video/mp4; codecs="avc1.42E01E"')
  }));
  const heading = document.querySelector('h1');
  return {
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth, viewport,
    horizontalOverflow: document.documentElement.scrollWidth > viewport + 1,
    overflowingElements: overflow, pageHeight: document.documentElement.scrollHeight,
    videos,
    brokenImages: [...document.images].filter(image => image.complete && !image.naturalWidth)
      .map(image => image.src),
    fontsLoaded: [...new Set([...document.fonts].filter(font => font.status === 'loaded')
      .map(font => font.family))],
    h1: heading ? {text: heading.innerText, fontSize: getComputedStyle(heading).fontSize,
      font: getComputedStyle(heading).fontFamily} : null
  };
}"""


def nonnegative_seconds(value):
    seconds = float(value)
    if not math.isfinite(seconds) or seconds < 0:
        raise argparse.ArgumentTypeError("wait must be a finite nonnegative number")
    return seconds


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", help="Existing HTML file or HTTP(S) URL")
    parser.add_argument("out_dir", nargs="?", type=Path, default=Path("shots"))
    parser.add_argument("--wait", type=nonnegative_seconds, default=2.5)
    parser.add_argument("--full", action="store_true", help="Capture the full page")
    return parser.parse_args(argv)


def target_url(target):
    if target.startswith(("http://", "https://")):
        if not urlparse(target).netloc:
            raise ValueError("HTTP(S) target needs a hostname")
        return target
    path = Path(target).expanduser().resolve()
    if not path.is_file():
        raise ValueError(f"HTML file does not exist: {path}")
    return path.as_uri()


def launch_browser(playwright):
    from playwright.sync_api import Error as PlaywrightError
    try:
        return playwright.chromium.launch(channel="chrome"), "chrome"
    except PlaywrightError:
        return playwright.chromium.launch(), "chromium"


def capture_view(browser, url, output, name, width, height, wait, full):
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    with browser.new_context(
        viewport={"width": width, "height": height}, device_scale_factor=1,
        is_mobile=name == "mobile", has_touch=name == "mobile",
    ) as context:
        page = context.new_page()
        errors, failed = [], []
        page.on("console", lambda message: errors.append(message.text)
                if message.type == "error" else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("requestfailed", lambda request: failed.append(
            f"{request.url} ({request.failure})"))
        page.on("response", lambda response: failed.append(
            f"{response.url} (HTTP {response.status})") if response.status >= 400 else None)
        response = page.goto(url, wait_until="domcontentloaded", timeout=NAVIGATION_TIMEOUT_MS)
        if response is not None and response.status >= 400:
            raise RuntimeError(f"Page navigation returned HTTP {response.status}: {url}")
        if name == "desktop":
            page.wait_for_timeout(EARLY_PAINT_MS)
            page.screenshot(path=str(output / "desktop-early.png"))
        try:
            page.wait_for_load_state("networkidle", timeout=NETWORK_IDLE_TIMEOUT_MS)
        except PlaywrightTimeoutError:
            pass  # Pages with polling can still be inspected after the requested wait.
        page.wait_for_timeout(int(wait * 1000))
        page.screenshot(path=str(output / f"{name}.png"), full_page=full)
        report = page.evaluate(QA_JS)
        report["consoleErrors"] = errors
        report["failedRequests"] = [item for item in failed if "ERR_ABORTED" not in item]
        return report


def shoot(url, output, wait=2.5, full=False):
    from playwright.sync_api import sync_playwright
    output.mkdir(parents=True, exist_ok=True)
    for filename in ("qa.json", "desktop.png", "mobile.png", "desktop-early.png"):
        (output / filename).unlink(missing_ok=True)
    with sync_playwright() as playwright:
        browser, engine = launch_browser(playwright)
        try:
            report = {"browser": engine, "target": url}
            for name, width, height in VIEWS:
                report[name] = capture_view(
                    browser, url, output, name, width, height, wait, full,
                )
        finally:
            browser.close()
    (output / "qa.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main(argv=None):
    args = parse_args(argv)
    try:
        url = target_url(args.target)
        from playwright.sync_api import Error as PlaywrightError
        report = shoot(url, args.out_dir, args.wait, args.full)
    except ImportError:
        print("Screenshot failed: install Playwright and its Chromium browser.", file=sys.stderr)
        return 1
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"Screenshot failed: {exc}", file=sys.stderr)
        return 1
    except PlaywrightError as exc:
        print(f"Screenshot failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
