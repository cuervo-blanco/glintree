import { describe, expect, it } from "vitest";
import { romanize } from "./romanize";

describe("orthographic Indic romanization", () => {
  it.each([
    ["नमस्ते", "namastē"],
    ["हिंदी", "hiṁdī"],
    ["भारत", "bhārata"],
    ["क़िला", "qilā"],
    ["फ़िल्म", "filma"],
    ["शक्ति क्षेत्र", "śakti kṣētra"],
    ["क कि की कु कू कृ कॄ के कै को कौ", "ka ki kī ku kū kr̥ kr̥̄ kē kai kō kau"],
    ["अ आ इ ई उ ऊ ऋ ॠ ऌ ॡ", "a ā i ī u ū r̥ r̥̄ l̥ l̥̄"],
    ["বাংলা", "bāṁlā"],
    ["আমি করি", "āmi kari"],
    ["পড়ি বই ভালো", "paṛi bai bhālō"],
    ["জ্ঞ শক্তি", "jña śakti"],
    ["উৎপল", "utpala"],
  ])("transliterates %s without guessing pronunciation", (native, latin) => {
    expect(romanize(native)).toBe(latin);
  });

  it.each(["फ़िल्म", "क़िला", "ড়", "ঢ়", "য়", "ऱ", "ऩ", "ऴ", "ভালো", "কৌতুক"])(
    "treats canonical spellings of %s identically",
    (text) => {
      expect(romanize(text.normalize("NFD"))).toBe(
        romanize(text.normalize("NFC")),
      );
    },
  );

  it.each([
    ["क् क्‍ष क्‌ष", "k kṣa kṣa"],
    ["ক্ ক্‍ষ ক্‌ষ", "k kṣa kṣa"],
    ["ज़ ड़ ढ़ य़", "za ṛa ṛha ẏa"],
    ["ক় খ় গ় জ় ফ়", "qa k͟ha ġa za fa"],
    ["ড় ঢ় য়", "ṛa ṛha ẏa"],
    ["০১২৩৪৫৬৭৮৯ ०१२३४५६७८९।॥", "0123456789 0123456789।॥"],
    [
      "TextReadsFast: नमस्ते, বাংলা! 中文 😊",
      "TextReadsFast: namastē, bāṁlā! 中文 😊",
    ],
  ])("keeps word boundaries and marks in %s", (native, latin) => {
    expect(romanize(native)).toBe(latin);
  });

  it("preserves other scripts, unknown characters and Latin normalization", () => {
    const text = "English e\u0301 中文 العربية 🙂 \u097f \u09ff \u200d";
    expect(romanize(text)).toBe(text);
    expect(romanize("")).toBe("");
  });
});
