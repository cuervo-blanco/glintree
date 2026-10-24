/**
 * Orthographic transliteration: written vowels stay, even where speech drops
 * them. Letter values follow ISO 15919; Unicode's Indic model supplies the
 * consonant + optional nukta + vowel-sign/virama structure.
 * https://github.com/indic-transliteration/common_maps/blob/master/roman/iso.toml
 * https://www.unicode.org/faq/indic.html
 */

function letters(groups: string, values: string): ReadonlyMap<string, string> {
  const latin = values.split(" ");
  return new Map(
    groups
      .split(" ")
      .flatMap((group, index) =>
        Array.from(group, (letter) => [letter, latin[index]] as const),
      ),
  );
}

const CONSONANTS = letters(
  "कক खখ गগ घঘ ङঙ चচ छছ जজ झঝ ञঞ टট ठঠ डড ढঢ णণ तত थথ दদ धধ नন पপ फফ बব भভ मম यয रর लল ळ व शশ षষ सস हহ",
  "k kh g gh ṅ c ch j jh ñ ṭ ṭh ḍ ḍh ṇ t th d dh n p ph b bh m y r l ḷ v ś ṣ s h",
);
const NUKTA = letters(
  "कক खখ गগ जজ डড ढঢ फফ यয न र ळ",
  "q k͟h ġ z ṛ ṛh f ẏ ṉ ṟ ḻ",
);
const VOWELS = letters(
  "अঅ आআ इই ईঈ उউ ऊঊ ऋঋ ॠৠ ऌঌ ॡৡ ऍ ऎ एএ ऐঐ ऑ ऒ ओও औঔ",
  "a ā i ī u ū r̥ r̥̄ l̥ l̥̄ ê e ē ai ô o ō au",
);
const VOWEL_SIGNS = letters(
  "ाা िি ीী ुু ूূ ृৃ ॄৄ ॢৢ ॣৣ ॅ ॆ ेে ैৈ ॉ ॊ ोো ौৌ",
  "ā i ī u ū r̥ r̥̄ l̥ l̥̄ ê e ē ai ô o ō au",
);
const SIGNS = letters("ँঁ ंং ःঃ ऽঽ ॐ ৎ", "m̐ ṁ ḥ ' ōṁ t");
const DIGITS = letters("०০ १১ २২ ३৩ ४৪ ५৫ ६৬ ७৭ ८৮ ९৯", "0 1 2 3 4 5 6 7 8 9");

function romanizeRun(text: string): string {
  // NFD makes both spellings of nukta letters identical, but also splits the
  // Bengali o/au signs. Recompose those signs before reading vowel marks.
  const chars = Array.from(
    text.normalize("NFD").replace(/ে[াৗ]/gu, (vowel) => vowel.normalize("NFC")),
  );
  let out = "";
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    let consonant = CONSONANTS.get(char);
    if (consonant !== undefined) {
      if (chars[index + 1] === "़" || chars[index + 1] === "়") {
        const modified = NUKTA.get(char);
        if (modified !== undefined) {
          consonant = modified;
          index += 1;
        }
      }

      const next = chars[index + 1];
      let vowel = "a";
      if (next === "्" || next === "্") {
        vowel = "";
        index += 1;
        // These control conjunct shaping, which has no Latin equivalent.
        while (chars[index + 1] === "\u200c" || chars[index + 1] === "\u200d") {
          index += 1;
        }
      } else if (VOWEL_SIGNS.has(next)) {
        vowel = VOWEL_SIGNS.get(next)!;
        index += 1;
      }
      out += consonant + vowel;
    } else {
      out +=
        VOWELS.get(char) ??
        VOWEL_SIGNS.get(char) ??
        SIGNS.get(char) ??
        DIGITS.get(char) ??
        char;
    }
  }
  return out;
}

export function romanize(text: string): string {
  // Normalise only Indic runs, so mixed Latin and other scripts stay intact.
  return text.replace(/[\u0900-\u09ff\u200c\u200d]+/gu, romanizeRun);
}
