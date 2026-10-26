import { expect, it } from "vitest";
import { ARTICLE_DEFAULTS, articlePreferences } from "./preferences";

it("keeps article preferences bounded and independent of caption settings", () => {
  expect(articlePreferences(undefined)).toEqual(ARTICLE_DEFAULTS);
  expect(
    articlePreferences({
      wpm: 9000,
      textSize: -1,
      font: "missing",
      wordFocus: "yes",
      romanize: true,
    }),
  ).toEqual({ ...ARTICLE_DEFAULTS, wpm: 1200, textSize: 16, romanize: true });
  expect(articlePreferences({ wpm: NaN, textSize: Infinity })).toEqual(
    ARTICLE_DEFAULTS,
  );
});
