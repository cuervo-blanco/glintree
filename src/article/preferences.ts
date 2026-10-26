import { FONT_STACKS, type ReaderFont } from "../reader-core/fonts";

export interface ArticlePreferences {
  wpm: number;
  textSize: number;
  font: ReaderFont;
  wordFocus: boolean;
  follow: boolean;
  romanize: boolean;
}

export const ARTICLE_DEFAULTS: ArticlePreferences = {
  wpm: 250,
  textSize: 22,
  font: "literata",
  wordFocus: true,
  follow: true,
  romanize: false,
};

export function articlePreferences(value: unknown): ArticlePreferences {
  const saved =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const number = (key: "wpm" | "textSize", min: number, max: number) =>
    typeof saved[key] === "number" && Number.isFinite(saved[key])
      ? Math.max(min, Math.min(max, saved[key]))
      : ARTICLE_DEFAULTS[key];
  return {
    wpm: number("wpm", 80, 1200),
    textSize: number("textSize", 16, 36),
    font:
      typeof saved.font === "string" && Object.hasOwn(FONT_STACKS, saved.font)
        ? (saved.font as ReaderFont)
        : ARTICLE_DEFAULTS.font,
    wordFocus: typeof saved.wordFocus === "boolean" ? saved.wordFocus : true,
    follow: typeof saved.follow === "boolean" ? saved.follow : true,
    romanize: typeof saved.romanize === "boolean" ? saved.romanize : false,
  };
}
