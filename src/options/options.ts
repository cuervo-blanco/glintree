/**
 * Settings page.
 *
 * The controls are generated from a schema rather than hand-written markup, so
 * adding a setting is one entry rather than an HTML block plus a wiring block
 * that can silently disagree with each other.
 *
 * The preview runs the real overlay class over a fixed passage: every control
 * here changes something you can only judge by looking at it.
 *
 * Profiles come first on the page, because picking one is the decision that
 * makes most of the rest unnecessary.
 */

import { ReaderOverlay } from "../content/overlay";
import { ProfileBar } from "./profileBar";
import { mountAiSettings } from "./aiSettings";
import { loadDevicePrefs, saveDevicePrefs } from "../settings";
import { classify, type Word } from "../reader-core/words";
import { readsWholeLine } from "../content/lines";
import {
  CUSTOM_COLOR_KEYS,
  FIELDS,
  type Field,
  type Group,
} from "../settingsFields";
import {
  DEFAULTS,
  loadSettings,
  saveSettings,
  type ReadingMode,
  type Settings,
} from "../settings";

const SAMPLES: Record<string, Word[]> = Object.fromEntries(
  Object.entries({
    en: "The highlighted letter marks the optimal recognition point, the exact position your brain uses to identify a whole word at once.",
    hi: "नमस्ते! मैं हिन्दी सीख रहा हूँ।",
    bn: "নমস্কার! আমি বাংলা শিখছি।",
  }).map(([language, text]) => [language, text.split(/\s+/).map(classify)]),
);

let settings: Settings = { ...DEFAULTS };
let overlay: ReaderOverlay | null = null;
let profileBar: ProfileBar | null = null;
let previewIndex = 0;

function row(field: Field, onChange: (value: unknown) => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "row";
  // Read back by `syncDependentControls`, which dims the rows that do not
  // currently decide anything.
  wrapper.dataset.field = String(field.key);

  const text = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = field.label;
  text.append(label);
  if (field.help) {
    const help = document.createElement("p");
    help.textContent = field.help;
    text.append(help);
  }

  const control = document.createElement("div");
  control.className = "control";

  if (field.kind === "toggle") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(settings[field.key]);
    input.addEventListener("change", () => onChange(input.checked));
    label.htmlFor = input.id = `f-${String(field.key)}`;
    control.append(input);
  } else if (field.kind === "select") {
    const select = document.createElement("select");
    for (const option of field.options) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      select.append(el);
    }
    select.value = String(settings[field.key]);
    select.addEventListener("change", () => onChange(select.value));
    label.htmlFor = select.id = `f-${String(field.key)}`;
    control.append(select);
  } else if (field.kind === "color") {
    const input = document.createElement("input");
    input.type = "color";
    input.value = String(settings[field.key]);
    const output = document.createElement("output");
    output.textContent = input.value;
    // `input`, not `change`: a colour picker streams while it is dragged, which
    // is what makes the preview worth having. `update` debounces the write.
    input.addEventListener("input", () => {
      output.textContent = input.value;
      onChange(input.value);
    });
    label.htmlFor = input.id = `f-${String(field.key)}`;
    control.append(input, output);
  } else if (field.kind === "range") {
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step);
    input.value = String(settings[field.key]);
    const output = document.createElement("output");
    const show = (v: number) =>
      (output.textContent = field.format ? field.format(v) : String(v));
    show(Number(settings[field.key]));
    input.addEventListener("input", () => {
      show(Number(input.value));
      onChange(Number(input.value));
    });
    label.htmlFor = input.id = `f-${String(field.key)}`;
    control.append(input, output);
  } else {
    /*
     * A field kind with no branch is a build error rather than a control that
     * renders as something else. This chain used to end in a bare `else` that
     * was the range branch, so adding a kind produced a broken slider.
     */
    const unhandled: never = field;
    throw new Error(`unhandled field kind: ${JSON.stringify(unhandled)}`);
  }

  wrapper.append(text, control);
  return wrapper;
}

/**
 * Keep the controls that depend on other controls honest.
 *
 * Two rows only mean something in one mode or theme. Rather than hiding them —
 * which makes them impossible to find — they are dimmed, the same treatment the
 * export-folder row gets when the save dialog is on.
 */
/** The modes that read `motion` at all. Mirrors `readsWholeLine`. */
const canHold = (mode: ReadingMode): boolean =>
  mode === "plain" || mode === "bionic";

/**
 * The palette the preview is actually rendering.
 *
 * Read back off the element rather than duplicated in TypeScript, so the
 * stylesheet stays the one place a theme is defined. Custom properties have
 * their `var()` chains resolved by the time they are computed, so this returns
 * plain hex even for the Custom theme, whose `--bg` is a `var()` reference.
 */
function shownPalette(): Record<
  (typeof CUSTOM_COLOR_KEYS)[number],
  string
> | null {
  const root = document.getElementById("preview");
  if (!root) return null; // called before the preview is mounted
  const styles = getComputedStyle(root);
  const read = (name: string): string => styles.getPropertyValue(name).trim();
  const palette = {
    customBackground: read("--bg"),
    customText: read("--text"),
    customFaded: read("--faded"),
    customAccent: read("--accent"),
  };
  return Object.values(palette).every((v) => HEX.test(v)) ? palette : null;
}

/** `<input type="color">` accepts nothing else, so anything else is skipped. */
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Point the four pickers at the palette on screen.
 *
 * THE BUG THIS FIXES: they were filled once when the row was built and never
 * again, so choosing Slate left them showing whatever was last stored. That was
 * misleading on its own, and actively wrong in combination with the rule that
 * touching a picker switches to Custom -- "Slate, but greener" silently became
 * the old stored palette with a green accent, because the other three were
 * never seeded from Slate at all.
 */
function paintSwatches(): void {
  const palette =
    settings.theme === "custom"
      ? {
          customBackground: settings.customBackground,
          customText: settings.customText,
          customFaded: settings.customFaded,
          customAccent: settings.customAccent,
        }
      : shownPalette();
  if (!palette) return;

  for (const key of CUSTOM_COLOR_KEYS) {
    const input = document.getElementById(`f-${key}`);
    if (!(input instanceof HTMLInputElement)) continue;
    const value = palette[key];
    // Never write the value being dragged back onto its own input.
    if (!HEX.test(value) || input.value.toLowerCase() === value.toLowerCase()) {
      continue;
    }
    input.value = value;
    const shown = input.parentElement?.querySelector("output");
    if (shown) shown.textContent = value;
  }
}

function syncDependentControls(): void {
  const theme = document.getElementById("f-theme");
  if (theme instanceof HTMLSelectElement && theme.value !== settings.theme) {
    // Picking a colour switches the theme for you, so the select has to follow
    // without rebuilding the row the pointer is currently inside.
    theme.value = settings.theme;
  }

  const dim = (key: string, inactive: boolean): void => {
    const row = document.querySelector<HTMLElement>(
      `.row[data-field="${key}"]`,
    );
    if (row) row.dataset.inactive = String(inactive);
  };

  for (const key of CUSTOM_COLOR_KEYS) dim(key, settings.theme !== "custom");
  paintSwatches();
  dim("bionicAccent", settings.mode !== "bionic");
  // A held line is built from the transcript's punctuation, so neither count is
  // read; line length is what it uses instead of them.
  const held = readsWholeLine(settings);
  dim("contextBefore", held);
  dim("contextAfter", held);
  dim("lineWords", !held);
  // And motion itself means nothing to the four modes that cannot hold a line.
  dim("motion", !canHold(settings.mode));
}

/** Autoscale sizes the text against the *player*, and the preview is not one —
 *  left on, it would scale against the options page and balloon. The preview
 *  therefore always shows the configured size, which is what the slider means. */
const previewSettings = (from: Settings): Settings => ({
  ...from,
  autoScale: false,
});

let pending: Partial<Settings> = {};
let flushHandle = 0;

/**
 * Coalesce writes.
 *
 * A range input fires `input` continuously while dragged, and `chrome.storage
 * .sync` rejects more than 120 writes a minute — one unhurried drag of one
 * slider exceeds that on its own, and the rejection is silent, so the setting
 * simply stops saving. The preview still updates on every frame; only the write
 * waits for the control to settle.
 */
function queueSave(patch: Partial<Settings>): void {
  pending = { ...pending, ...patch };
  window.clearTimeout(flushHandle);
  flushHandle = window.setTimeout(flushSave, 250);
}

function flushSave(): Promise<void> {
  window.clearTimeout(flushHandle);
  if (Object.keys(pending).length === 0) return Promise.resolve();
  const batch = pending;
  pending = {};
  return saveSettings(batch);
}

// Closing the tab mid-drag would otherwise drop the last edit.
window.addEventListener("pagehide", () => void flushSave());

function update(patch: Partial<Settings>): void {
  /*
   * Touching a custom colour selects the Custom theme.
   *
   * Otherwise the four pickers do nothing at all until you separately find the
   * theme dropdown and change it — which reads as four broken controls rather
   * than as a theme you have not switched to yet.
   */
  const touchedPalette = CUSTOM_COLOR_KEYS.some((key) => key in patch);
  if (touchedPalette && settings.theme !== "custom") {
    /*
     * Fork the palette that is on screen, not the one last stored.
     *
     * Seeding all four and then letting the touched one override is what makes
     * "this theme, but greener" mean that. Taking only the changed colour left
     * the other three at stale values, so nudging Slate's accent produced
     * whatever palette happened to be saved, with a green accent on it.
     */
    patch = { ...(shownPalette() ?? {}), ...patch, theme: "custom" };
  }

  settings = { ...settings, ...patch };
  queueSave(patch);
  overlay?.apply(previewSettings(settings));
  // The picker shows whether the live settings still match their profile, so it
  // has to hear about every edit — not only about profile switches. Repaints
  // from what it already holds; it does not re-read storage per frame.
  profileBar?.repaint();
  syncDependentControls();
}

/** Rebuild every control from `settings`. Cheaper to reason about than patching
 *  each control in place, and there is no state in them worth preserving. */
function renderFields(): void {
  for (const group of ["reading", "appearance", "captions"] as Group[]) {
    const host = document.getElementById(`group-${group}`);
    if (!host) continue;
    host.replaceChildren();
    for (const field of FIELDS.filter((f) => f.group === group)) {
      host.append(
        row(field, (value) =>
          update({ [field.key]: value } as Partial<Settings>),
        ),
      );
    }
  }
  syncDependentControls();
}

/** Advance the preview at a readable, fixed pace. There is no queue to react to
 *  here, so the adaptive pacing the desktop app uses would have nothing to do. */
function runPreview(): void {
  const host = document.getElementById("preview");
  if (!host) return;
  overlay = new ReaderOverlay(previewSettings(settings));
  // Reuse the existing markup rather than mounting a second copy.
  host.replaceWith(
    ((): HTMLElement => {
      const mounted = (overlay as unknown as { root: HTMLElement }).root;
      mounted.id = "preview";
      return mounted;
    })(),
  );

  window.setInterval(() => {
    const words = SAMPLES[settings.language] ?? SAMPLES.en;
    previewIndex = (previewIndex + 1) % words.length;
    overlay?.render({
      current: words[previewIndex],
      previous: words.slice(
        Math.max(0, previewIndex - settings.contextBefore),
        previewIndex,
      ),
      upcoming: words.slice(
        previewIndex + 1,
        previewIndex + 1 + settings.contextAfter,
      ),
    });
  }, 380);
}

/**
 * Preferences that belong to this browser rather than to a reading style.
 *
 * Rendered by hand rather than through `FIELDS`, because that schema is bound
 * to the synced `Settings` object and these deliberately are not part of it —
 * a profile switch must not start opening read mode by itself.
 */
async function mountDevicePrefs(): Promise<void> {
  const host = document.getElementById("group-device");
  if (!host) return;

  const prefs = await loadDevicePrefs();

  // The folder field decides nothing while the save dialog is on, and two
  // controls that both look live is a small lie about which one wins.
  let folderRow: HTMLElement | null = null;
  let folderInput: HTMLInputElement | null = null;

  const syncFolderRow = (askWhere: boolean): void => {
    if (folderRow) folderRow.dataset.inactive = String(askWhere);
    if (folderInput) folderInput.disabled = askWhere;
  };

  const text = (
    key: "exportFolder",
    label: string,
    help: string,
    placeholder: string,
  ): HTMLElement => {
    const wrapper = el("div", "row");
    const copy = el("div");
    const name = el("label", undefined, label);
    copy.append(name, el("p", undefined, help));

    const control = el("div", "control");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.value = prefs[key];
    input.id = `d-${key}`;
    name.htmlFor = input.id;
    input.addEventListener("change", () => {
      void saveDevicePrefs({ [key]: input.value.trim() });
    });
    control.append(input);

    wrapper.append(copy, control);
    folderRow = wrapper;
    folderInput = input;
    return wrapper;
  };

  const toggle = (
    key:
      "statsTracking" | "autoReadMode" | "exportTranscript" | "exportAskWhere",
    label: string,
    help: string,
  ): HTMLElement => {
    const wrapper = el("div", "row");
    const text = el("div");
    const name = el("label", undefined, label);
    text.append(name);
    text.append(el("p", undefined, help));

    const control = el("div", "control");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = prefs[key];
    input.id = `d-${key}`;
    name.htmlFor = input.id;
    input.addEventListener("change", () => {
      void saveDevicePrefs({ [key]: input.checked });
      if (key === "exportAskWhere") syncFolderRow(input.checked);
    });
    control.append(input);

    wrapper.append(text, control);
    return wrapper;
  };

  host.append(
    toggle(
      "autoReadMode",
      "Open read mode automatically",
      "Enter read mode as soon as a video with captions loads. Also on the toolbar popup, next to Open read mode.",
    ),
    toggle(
      "exportTranscript",
      "Include the transcript in exports",
      "Append the whole spoken transcript to the end of an exported file. Off by default: it is the largest thing in the file and buries the notes.",
    ),
    toggle(
      "exportAskWhere",
      "Ask where to save",
      "Open the save dialog on every export, so a file can go to any folder on this computer — a notes vault, for instance. Chrome remembers the last one you picked, so after the first time it is one keypress.",
    ),
    text(
      "exportFolder",
      "Export folder",
      "Used only when the save dialog is off. A folder inside Downloads, for example Obsidian/Inbox — Chrome does not let an extension write anywhere else on its own.",
      "Obsidian/Inbox",
    ),
    toggle(
      "statsTracking",
      "Track study stats",
      "Record watch time, coverage and how often you return to a video. Everything stays on this device; turning it off stops the recording, it does not merely hide it.",
    ),
  );

  syncFolderRow(prefs.exportAskWhere);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function main(): Promise<void> {
  settings = await loadSettings();

  const profileHost = document.getElementById("group-profile");
  if (profileHost) {
    profileBar = new ProfileBar(profileHost, {
      settings: () => settings,
      // A slider edit still waiting on its debounce would otherwise land after
      // the profile did, and quietly overwrite one of its values.
      flushPending: flushSave,
      onApplied: (next) => {
        settings = next;
        renderFields();
        overlay?.apply(previewSettings(settings));
        // After the preview repaints, not before: the swatches read it.
        syncDependentControls();
      },
    });
    await profileBar.refresh();
  }

  renderFields();

  const aiHost = document.getElementById("group-ai");
  if (aiHost) mountAiSettings(aiHost);

  await mountDevicePrefs();

  runPreview();
  // The preview is the thing the swatches read, and it did not exist until now.
  syncDependentControls();
}

void main();
