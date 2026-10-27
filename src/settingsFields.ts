import { FONT_LABELS, type ReaderFont } from "./reader-core/fonts";
import {
  MODE_LABELS,
  MOTION_LABELS,
  THEME_LABELS,
  type Motion,
  type ReaderTheme,
  type ReadingMode,
  type Settings,
} from "./settings";

export type Group = "reading" | "appearance" | "captions";

interface BaseField {
  key: keyof Settings;
  label: string;
  help?: string;
  group: Group;
}

interface ToggleField extends BaseField {
  kind: "toggle";
}

interface SelectField extends BaseField {
  kind: "select";
  options: Array<{ value: string; label: string }>;
}

interface RangeField extends BaseField {
  kind: "range";
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
}

interface ColorField extends BaseField {
  kind: "color";
}

export type Field = ToggleField | SelectField | RangeField | ColorField;

/** The colours that only mean anything under the Custom theme. */
export const CUSTOM_COLOR_KEYS = [
  "customText",
  "customFaded",
  "customAccent",
] as const;

export const FIELDS: Field[] = [
  {
    kind: "toggle",
    key: "enabled",
    group: "reading",
    label: "Caption reader enabled",
    help: "Turn the YouTube caption reader off without uninstalling.",
  },
  {
    kind: "select",
    key: "mode",
    group: "reading",
    label: "Caption mode",
    help: "RSVP pins one word to a fixed focal point. The rest show a line and mark where the speaker is in it.",
    // Derived from the union rather than listed, so a mode added to `Settings`
    // and forgotten here fails to build instead of never reaching the picker.
    options: (Object.keys(MODE_LABELS) as ReadingMode[]).map((value) => ({
      value,
      label: MODE_LABELS[value],
    })),
  },
  {
    kind: "select",
    key: "motion",
    group: "reading",
    label: "Motion",
    help: "Slide word by word, or hold a complete line. Available in Plain and Bionic.",
    options: (Object.keys(MOTION_LABELS) as Motion[]).map((value) => ({
      value,
      label: MOTION_LABELS[value],
    })),
  },
  {
    kind: "toggle",
    key: "focusMode",
    group: "reading",
    label: "Focus mode",
    help: "Hide the video behind the captions while audio continues.",
  },
  {
    kind: "toggle",
    key: "focusReading",
    group: "reading",
    label: "Reading mode",
    help: "Show a paragraph around the current word in Focus or fullscreen.",
  },
  {
    kind: "toggle",
    key: "readingCentered",
    group: "reading",
    label: "Centre word in Reading mode",
    help: "Hold the current word in the middle while keeping surrounding lines visible.",
  },
  {
    kind: "range",
    key: "contextBefore",
    group: "reading",
    label: "Words behind",
    help: "How many already-read words stay visible to the left.",
    min: 0,
    max: 5,
    step: 1,
  },
  {
    kind: "range",
    key: "contextAfter",
    group: "reading",
    label: "Words ahead",
    help: "How many upcoming words are visible to the right.",
    min: 0,
    max: 8,
    step: 1,
  },
  {
    kind: "toggle",
    key: "showPivotGuides",
    group: "reading",
    label: "Pivot marks",
    help: "The small marks above and below the focal letter, for the eye to anchor on.",
  },
  {
    kind: "select",
    key: "theme",
    group: "appearance",
    label: "Colour preset",
    help: "Colour presets for the text. The caption background stays black.",
    options: (Object.keys(THEME_LABELS) as ReaderTheme[]).map((value) => ({
      value,
      label: THEME_LABELS[value],
    })),
  },
  {
    kind: "color",
    key: "customText",
    group: "appearance",
    label: "Current word colour",
  },
  {
    kind: "color",
    key: "customFaded",
    group: "appearance",
    label: "Surrounding word colour",
  },
  {
    kind: "color",
    key: "customAccent",
    group: "appearance",
    label: "Accent colour",
    help: "The focal letter, Reading mode's current word, resize arrows and highlighter.",
  },
  {
    kind: "select",
    key: "font",
    group: "appearance",
    label: "Reading font",
    help: "Monospace aligns the focal letter exactly. Atkinson Hyperlegible is designed for low vision.",
    options: (Object.keys(FONT_LABELS) as ReaderFont[]).map((value) => ({
      value,
      label: FONT_LABELS[value],
    })),
  },
  {
    kind: "range",
    key: "fontSize",
    group: "appearance",
    label: "Text size",
    min: 18,
    max: 72,
    step: 1,
    format: (v) => `${v}px`,
  },
  {
    kind: "toggle",
    key: "autoScale",
    group: "appearance",
    label: "Scale with the player",
    help: "Keep the text the same size relative to the video, so fullscreen does not shrink it into the picture.",
  },
  {
    kind: "range",
    key: "verticalPosition",
    group: "appearance",
    label: "Height above the bottom",
    help: "Where the reader sits over the video.",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}%`,
  },
  {
    kind: "range",
    key: "horizontalPosition",
    group: "appearance",
    label: "Horizontal position",
    help: "Where the reader is centred over the video.",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}%`,
  },
  {
    kind: "range",
    key: "boxWidth",
    group: "appearance",
    label: "Reader width",
    help: "As a share of the player's width. Wider shows more surrounding words before they are trimmed.",
    min: 25,
    max: 94,
    step: 1,
    format: (v) => `${v}%`,
  },
  {
    kind: "range",
    key: "letterSpacing",
    group: "appearance",
    label: "Letter spacing",
    min: -1,
    max: 6,
    step: 0.25,
    format: (v) => `${v}px`,
  },
  {
    kind: "range",
    key: "contextOpacity",
    group: "appearance",
    label: "Surrounding word dimness",
    help: "Fainter keeps fixation tighter.",
    min: 0,
    max: 1,
    step: 0.02,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    kind: "select",
    key: "fontStyle",
    group: "appearance",
    label: "Slant",
    help: "No italic faces are bundled, so this slants the upright one. It reads well on the serifs and less so on the monospaces.",
    options: [
      { value: "normal", label: "Upright" },
      { value: "italic", label: "Italic" },
    ],
  },
  {
    kind: "select",
    key: "textCase",
    group: "appearance",
    label: "Letter case",
    options: [
      { value: "none", label: "As written" },
      { value: "upper", label: "UPPERCASE" },
    ],
  },
  {
    kind: "range",
    key: "textWeight",
    group: "appearance",
    label: "Text weight",
    help: "Heavier holds up over busy video, where a regular weight disappears into it. Not every face has every weight — Geist stops at 600, and beyond that the browser thickens it itself, which looks thinner than a real bold.",
    min: 400,
    max: 700,
    step: 100,
  },
  {
    kind: "range",
    key: "textOutline",
    group: "appearance",
    label: "Outline",
    help: "A dark edge around every letter. The single most effective thing for reading over a moving picture, and what lets a caption work with no card behind it at all.",
    min: 0,
    max: 4,
    step: 1,
    format: (v) => (v === 0 ? "None" : `${v}px`),
  },
  {
    kind: "range",
    key: "lineWords",
    group: "reading",
    label: "Words per line",
    help: "Static mode only. Low is short and punchy; high gives a full subtitle band. Lines still break early at a sentence.",
    min: 3,
    max: 16,
    step: 1,
  },
  {
    kind: "range",
    key: "backgroundOpacity",
    group: "appearance",
    label: "Background opacity",
    help: "How much of the video shows through the black caption background.",
    min: 0,
    max: 1,
    step: 0.02,
    format: (v) => (v === 0 ? "No card" : `${Math.round(v * 100)}%`),
  },
  {
    kind: "toggle",
    key: "bionicAccent",
    group: "reading",
    label: "Colour the bold letters",
    help: "Bionic only. Off leaves the emphasis carried by weight alone, which is the calmer version of the mode.",
  },
  {
    kind: "toggle",
    key: "removeFillers",
    group: "captions",
    label: "Remove fillers",
    help: "Drop um, uh and similar. They pass unnoticed in speech but interrupt a written stream.",
  },
  {
    kind: "toggle",
    key: "hideNativeCaptions",
    group: "captions",
    label: "Hide YouTube's captions",
    help: "Leaving both on means reading the same words twice, in two places.",
  },
  {
    kind: "select",
    key: "language",
    group: "captions",
    label: "Preferred language",
    help: "Which caption track to pick when a video offers several.",
    options: [
      { value: "en", label: "English" },
      { value: "nl", label: "Nederlands" },
      { value: "de", label: "Deutsch" },
      { value: "fr", label: "Français" },
      { value: "es", label: "Español" },
      { value: "hi", label: "हिन्दी (Hindi)" },
      { value: "bn", label: "বাংলা (Bengali)" },
      { value: "zh", label: "中文 (Chinese)" },
    ],
  },
  {
    kind: "toggle",
    key: "romanize",
    group: "captions",
    label: "Romanize Hindi and Bengali",
    help: "Show Latin letters with diacritics instead of Devanagari or Bangla script.",
  },
];
