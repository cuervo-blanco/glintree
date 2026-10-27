/**
 * Extension settings, stored in `chrome.storage.sync`.
 *
 * Preferences shared by the YouTube reader and its settings page.
 */

import { FONT_LABELS, type ReaderFont } from "./reader-core/fonts";

export type ReaderTheme =
  | "focus"
  | "paper"
  | "sepia"
  | "contrast"
  | "slate"
  | "mist"
  | "nocturne"
  | "lyric"
  | "caption"
  | "custom";

/**
 * How the words are put on screen.
 *
 * `focusline` rather than `focus`, which is already a theme. Two unions with a
 * shared member name is how `settings.theme === "focus"` gets written where
 * `settings.mode` was meant, and the compiler would accept it.
 */
export type ReadingMode =
  "rsvp" | "rsvp-bionic" | "bionic" | "plain" | "highlight" | "focusline";

/**
 * What each mode is called on the settings page.
 *
 * A record keyed by the union rather than a hand-written list, mirroring
 * `FONT_LABELS`: a mode added to the type and forgotten here fails to build
 * instead of quietly never appearing in the picker.
 */
export const MODE_LABELS: Record<ReadingMode, string> = {
  rsvp: "RSVP — one word at a fixed point",
  "rsvp-bionic": "RSVP + Bionic — pinned word, bolded context",
  bionic: "Bionic — bold leading letters",
  plain: "Plain — a caption line with nothing marked",
  highlight: "Highlighter — a block on the current word",
  focusline: "Focus line — one word, plainly centred",
};

/**
 * How the window advances.
 *
 * An axis of its own, not a mode. "Static" used to be baked into the `plain`
 * mode, which conflated two independent questions — how the window moves, and
 * how the current word is marked — and meant Bionic could only ever slide.
 * Separated, "Bionic held still" is just a combination rather than a new mode.
 *
 * Only the line modes can hold still: RSVP and Focus line show one word at a
 * time, so there is no line to hold, and Highlighter's block needs a current
 * word to sit on. See `readsWholeLine`.
 */
export type Motion = "dynamic" | "static";

export const MOTION_LABELS: Record<Motion, string> = {
  dynamic: "Dynamic — the window slides, a word at a time",
  static: "Static — a whole line, held still",
};

export const THEME_LABELS: Record<ReaderTheme, string> = {
  focus: "Focus",
  paper: "Paper",
  sepia: "Sepia",
  contrast: "High contrast",
  slate: "Slate",
  mist: "Mist",
  nocturne: "Nocturne",
  lyric: "Lyric",
  caption: "Caption",
  custom: "Custom",
};

export interface Settings {
  /** Caption switch; explicit article reading remains available independently. */
  enabled: boolean;
  mode: ReadingMode;
  theme: ReaderTheme;
  font: ReaderFont;
  fontSize: number;
  letterSpacing: number;
  /** Scale the text with the player, so fullscreen is not tiny. */
  autoScale: boolean;
  /** Distance from the bottom of the player, as a percentage of its height. */
  verticalPosition: number;
  /** Caption centre, as a percentage of the player's width. */
  horizontalPosition: number;
  /** Reader width, as a percentage of the player's width. */
  boxWidth: number;
  /** Already-read words kept visible to the left of the pivot. */
  contextBefore: number;
  /** Upcoming words shown to the right of the pivot. */
  contextAfter: number;
  contextOpacity: number;
  /**
   * Colour the bold prefix in Bionic mode.
   *
   * The one rule that makes Bionic loud. Off leaves the emphasis carried by
   * weight alone, which is what people asking for a calmer Bionic mean.
   */
  bionicAccent: boolean;
  /** How opaque the card behind the words is, 0-1. */
  backgroundOpacity: number;
  /** Text colours used by the Custom theme. The background stays black. */
  customText: string;
  customFaded: string;
  customAccent: string;
  /**
   * Whether the line slides or holds still. Read only by the line modes; see
   * `readsWholeLine`, which is the single place that decides.
   */
  motion: Motion;
  /** Italic, for the styles where slanted text is the whole character. */
  fontStyle: "normal" | "italic";
  /**
   * Uppercase the words.
   *
   * Applied with `text-transform`, so the DOM text is untouched and the pivot
   * maths still sees the original characters.
   */
  textCase: "none" | "upper";
  /**
   * 400-700. Heavy weights read over busy video where 400 disappears.
   *
   * Not every family ships every weight -- Geist stops at 600 -- and a weight
   * that is not there is synthesised by the browser rather than refused, which
   * looks thinner than the real thing. `fonts.css` is byte-identical to the
   * desktop app, so adding faces means changing both repositories.
   */
  textWeight: number;
  /**
   * An outline around every glyph, in pixels.
   *
   * The one thing that makes text legible over an arbitrary moving picture,
   * and the reason captions burned into video almost always have one.
   */
  textOutline: number;
  /**
   * Words per line in Static mode, before it breaks regardless of punctuation.
   *
   * Low values give the short, punchy captions people use on Shorts; high ones
   * give a full subtitle band.
   */
  lineWords: number;
  showPivotGuides: boolean;
  removeFillers: boolean;
  /** Hide YouTube's own captions while the reader is running. Leaving both on
   *  means reading the same words twice, in two places. */
  hideNativeCaptions: boolean;
  /** Preferred caption language, as a BCP-47 prefix. */
  language: string;
  romanize: boolean;
  /** Cover the video while keeping playback and captions running. */
  focusMode: boolean;
  /** Show paragraph context while reading in Focus or fullscreen. */
  focusReading: boolean;
  /** Keep the current word at the centre of the reading area. */
  readingCentered: boolean;
}

/**
 * What a fresh install starts with.
 *
 * Existing installs are unaffected by changes here: `loadSettings` asks storage
 * for these keys and gets back whatever was stored, so a default only reaches
 * someone who never set that field.
 */
export const DEFAULTS: Settings = {
  enabled: true,
  mode: "rsvp",
  theme: "focus",
  font: "geist_mono",
  fontSize: 22,
  letterSpacing: 0,
  autoScale: true,
  verticalPosition: 8,
  horizontalPosition: 50,
  boxWidth: 58,
  contextBefore: 3,
  contextAfter: 3,
  contextOpacity: 0.34,
  bionicAccent: true,
  // Matches what `reader.css` used to hardcode, so nothing moves for anyone
  // already using the extension.
  backgroundOpacity: 0.88,
  // Custom starts from the default text colours.
  customText: "#e8e6e3",
  customFaded: "#6e7278",
  customAccent: "#7bc5b5",
  motion: "dynamic",
  fontStyle: "normal",
  textCase: "none",
  textWeight: 600,
  textOutline: 0,
  lineWords: 12,
  showPivotGuides: true,
  removeFillers: true,
  hideNativeCaptions: true,
  language: "en",
  romanize: false,
  focusMode: false,
  focusReading: false,
  readingCentered: false,
};

/** Saved settings can outlive fields and enum values removed by an update. */
export function normalizeSettings(value: unknown): Settings {
  const stored =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const choices: Partial<Record<keyof Settings, readonly string[]>> = {
    mode: Object.keys(MODE_LABELS),
    theme: Object.keys(THEME_LABELS),
    font: Object.keys(FONT_LABELS),
    motion: Object.keys(MOTION_LABELS),
    fontStyle: ["normal", "italic"],
    textCase: ["none", "upper"],
  };
  return Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, fallback]) => {
      const candidate = stored[key];
      const allowed = choices[key as keyof Settings];
      const valid =
        typeof candidate === typeof fallback &&
        (typeof candidate !== "number" || Number.isFinite(candidate)) &&
        (!allowed || allowed.includes(String(candidate))) &&
        (!key.startsWith("custom") ||
          /^#[0-9a-f]{6}$/i.test(String(candidate)));
      return [key, valid ? candidate : fallback];
    }),
  ) as unknown as Settings;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.sync.get(DEFAULTS);
    return normalizeSettings(stored);
  } catch {
    // Storage can be unavailable in a torn-down context during navigation.
    return { ...DEFAULTS };
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

export function onSettingsChanged(
  handler: (settings: Settings) => void,
): () => void {
  const listener = (
    _changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== "sync") return;
    void loadSettings().then(handler);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
