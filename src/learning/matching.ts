import {
  languageCode,
  normalizeTerm,
  type LearningCollection,
  type LearningItem,
} from "./model";

export function matchLearningWords(
  words: readonly string[],
  language: string,
  collection: LearningCollection,
  boundaries?: ReadonlySet<number>,
): Map<number, LearningItem> {
  const terms = new Map<string, LearningItem>();
  let longest = 0;
  for (const item of collection.items) {
    if (
      item.language !== languageCode(language) &&
      !(item.kind === "concept" && item.language === "und")
    )
      continue;
    const key = normalizeTerm(item.term).replace(/\s+/g, " ");
    terms.set(key, item);
    longest = Math.max(longest, key.length);
  }
  const matches = new Map<number, LearningItem>();
  for (let start = 0; start < words.length; start++) {
    let text = "",
      end = start,
      found: LearningItem | undefined;
    for (let next = start; next < words.length && next < start + 30; next++) {
      if (next > start && boundaries?.has(next)) break;
      text += (text ? " " : "") + words[next];
      const key = normalizeTerm(text).replace(/\s+/g, " ");
      const compact = /\p{Script=Han}/u.test(key)
        ? key.replace(/\s+/g, "")
        : key;
      if (Math.min(key.length, compact.length) > longest) break;
      const item = terms.get(key) ?? terms.get(compact);
      if (item) {
        found = item;
        end = next;
      }
    }
    if (found) {
      for (let i = start; i <= end; i++) matches.set(i, found);
      start = end;
    }
  }
  return matches;
}
export function paintLearningWords(
  root: HTMLElement,
  words: readonly string[],
  language: string,
  collection: LearningCollection,
  boundaries?: ReadonlySet<number>,
): void {
  const matches = matchLearningWords(words, language, collection, boundaries);
  for (const element of root.querySelectorAll<HTMLElement>(
    "[data-word]:not(.trf-transcript-time)",
  )) {
    const item = matches.get(Number(element.dataset.word));
    if (item) {
      element.dataset.learningStatus = item.status;
      element.dataset.learningId = item.id;
      element.style.setProperty(
        "--trf-list-color",
        collection.datasets[item.datasets[0]] ?? "#7bc5b5",
      );
      element.title = `${item.term} · ${item.status}${item.datasets.length ? ` · ${item.datasets.join(", ")}` : ""}${item.meaning ? `\n${item.meaning}` : ""}`;
    } else {
      delete element.dataset.learningStatus;
      delete element.dataset.learningId;
      element.style.removeProperty("--trf-list-color");
      element.removeAttribute("title");
    }
  }
}
