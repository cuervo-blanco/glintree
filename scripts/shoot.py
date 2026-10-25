"""Capture reading modes and settings; assert ink and word geometry.

Run after: node scripts/build.mjs --dev
"""

import functools
import http.server
import os
import re
import socketserver
import sys
import threading

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("playwright is not installed for this Python. Try: pip install playwright")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(ROOT, "dev-shots")
COLORS = ["customText", "customFaded", "customAccent"]

CHROME_STUB = """
const store = {};
const presets = {};
window.chrome = {
  storage: {
    sync: {
      get: defaults => Promise.resolve({ ...defaults, ...store }),
      set: patch => { Object.assign(store, patch); return Promise.resolve(); },
    },
    local: {
      get: defaults => Promise.resolve({ ...defaults, ...presets }),
      set: patch => { Object.assign(presets, patch); return Promise.resolve(); },
    },
    onChanged: { addListener(){}, removeListener(){} },
  },
};
"""

INKS = """() => {
  const color = (reader, selector) => {
    const node = reader?.querySelector(selector);
    return node ? getComputedStyle(node).color : null;
  };
  const sliding = document.querySelector('.trf-reader[data-mode="rsvp-bionic"]');
  const held = document.querySelector('.trf-reader[data-mode="bionic"][data-motion="static"]');
  return {
    focus: color(sliding, '.trf-word'),
    lead: color(sliding, '.trf-context--after b'),
    context: color(sliding, '.trf-context--after'),
    heldWord: color(held, '.trf-lw--future'),
    heldBold: color(held, '.trf-lw--future b'),
    heldCurrent: color(held, '.trf-lw--current'),
  };
}"""

SWATCHES = """() => Object.fromEntries(
  ['customText', 'customFaded', 'customAccent'].map(key => [
    key, document.getElementById('f-' + key).value.toLowerCase(),
  ])
)"""

MATCHED_SWATCHES = """() => {
  const style = getComputedStyle(document.getElementById('preview'));
  return [['customText', '--text'], ['customFaded', '--faded'], ['customAccent', '--accent']]
    .every(([key, property]) => document.getElementById('f-' + key).value.toLowerCase()
      === style.getPropertyValue(property).trim().toLowerCase());
}"""


def alpha(css):
    if css is None:
        return None
    found = re.search(r"/\s*([0-9.]+)\s*\)", css)
    if found:
        return float(found.group(1))
    if css.startswith("rgba"):
        return float(css.rsplit(",", 1)[1].strip(" )"))
    return 1.0


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    if not os.path.exists(os.path.join(DIST, "modes.html")):
        sys.exit("No dist/modes.html. Build first: node scripts/build.mjs --dev")
    os.makedirs(OUT, exist_ok=True)
    handler = functools.partial(QuietHandler, directory=DIST)
    server = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d" % server.server_address[1]
    errors = []
    try:
        with sync_playwright() as p:
            launch = {}
            if os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"):
                launch["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
            browser = p.chromium.launch(**launch)
            modes = browser.new_page(viewport={"width": 1400, "height": 2420})
            modes.on("pageerror", lambda error: errors.append(str(error)))
            modes.goto(base + "/modes.html")
            modes.wait_for_function("() => window.__ready === true")
            modes.screenshot(path=os.path.join(OUT, "reading-modes.png"), full_page=True)
            jump = modes.evaluate("() => window.__jump")
            inks = modes.evaluate(INKS)
            if not jump:
                sys.exit("The modes harness measured no words.")
            worst = max(abs(word["asCurrent"] - word["asOther"]) for word in jump)
            if worst > 0.6:
                sys.exit("Highlighter changes word width by %.2fpx." % worst)
            print("Highlighter: %d words, worst width change %.2fpx" % (len(jump), worst))
            tiers = {key: alpha(inks[key]) for key in ("focus", "lead", "context")}
            if any(value is None for value in tiers.values()):
                sys.exit("The Bionic ink probe could not find its words.")
            if not (tiers["context"] < tiers["lead"] < tiers["focus"] == 1):
                sys.exit("Bionic ink must progress from context to lead to current word.")
            held = [inks[key] for key in ("heldWord", "heldBold", "heldCurrent")]
            if None in held or len(set(held)) != 1:
                sys.exit("A held Bionic line must use one flat ink colour.")
            print("Bionic: sliding ink tiers and held-line ink pass")

            options = browser.new_page(viewport={"width": 1100, "height": 1100})
            options.on("pageerror", lambda error: errors.append(str(error)))
            options.add_init_script(CHROME_STUB)
            options.goto(base + "/options.html")
            options.wait_for_selector("#f-customText")
            themes = options.locator("#f-theme option").evaluate_all(
                "options => options.map(option => option.value).filter(value => value !== 'custom')"
            )
            for theme in themes:
                options.select_option("#f-theme", theme)
                options.wait_for_function(MATCHED_SWATCHES)
            options.select_option("#f-theme", "slate")
            options.wait_for_function(MATCHED_SWATCHES)
            before = options.evaluate(SWATCHES)
            options.eval_on_selector(
                "#f-customAccent",
                "input => { input.value = '#59cf9b'; input.dispatchEvent(new Event('input', { bubbles: true })); }",
            )
            options.wait_for_function(
                "() => document.getElementById('f-theme').value === 'custom'"
            )
            after = options.evaluate(SWATCHES)
            if after != {**before, "customAccent": "#59cf9b"}:
                sys.exit("Editing a colour must preserve the other inks on screen.")
            options.screenshot(path=os.path.join(OUT, "options.png"), full_page=True)
            print("Settings: %d themes and custom ink seeding pass" % len(themes))
            browser.close()
    finally:
        server.shutdown()
    if errors:
        sys.exit("\n".join(errors))
    print("Screenshots written to " + OUT)


if __name__ == "__main__":
    main()
