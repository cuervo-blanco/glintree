import { orpIndex, splitAtOrp, type SplitWord } from "../reader-core/orp";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function graphemes(text: string): string[] {
  const out: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    const last = out.length - 1;
    // Older Unicode tables break Indic conjuncts after a virama, including one
    // followed by ZWJ. Keep the following consonant in the same reading unit.
    if (
      last >= 0 &&
      /[\u094d\u09cd]\u200d?$/u.test(out[last]) &&
      /^\p{L}/u.test(segment)
    ) {
      out[last] += segment;
    } else {
      out.push(segment);
    }
  }
  return out;
}

export function splitAtReadingOrp(text: string): SplitWord {
  if (!/[\p{Script=Devanagari}\p{Script=Bengali}\p{M}]/u.test(text)) {
    return splitAtOrp(text);
  }
  const chars = graphemes(text);
  // One representative per cluster reuses the shared thresholds without
  // counting vowel signs as letters. Preserve punctuation for the same reason.
  const shape = chars
    .map((char) =>
      /^[।॥]$/u.test(char) ? "." : char.length === 1 ? char : "x",
    )
    .join("");
  const at = orpIndex(shape);
  return {
    before: chars.slice(0, at).join(""),
    pivot: chars[at] ?? "",
    after: chars.slice(at + 1).join(""),
  };
}
