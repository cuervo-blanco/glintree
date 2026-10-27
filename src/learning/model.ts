export type LearningStatus = "new" | "learning" | "known";
export type ItemKind = "word" | "phrase" | "concept";
export interface LearningSource {
  title: string;
  url: string;
  context: string;
  seconds?: number;
}
export interface LearningDraft {
  term: string;
  language: string;
  kind: ItemKind;
  meaning: string;
  examples: string;
  datasets: string[];
  status: LearningStatus;
  source?: LearningSource;
}
export interface LearningItem extends Omit<LearningDraft, "source"> {
  id: string;
  sources: LearningSource[];
  created: number;
  updated: number;
  review: { due: number; interval: number; repetitions: number };
}
export interface LearningCollection {
  items: LearningItem[];
  datasets: Record<string, string>;
}
export const COLLECTION_KEY = "learningCollectionV1";
export const EMPTY_COLLECTION: LearningCollection = { items: [], datasets: {} };
export const LIST_COLORS = [
  "#7bc5b5",
  "#d4ad72",
  "#a7a0dc",
  "#db91a1",
  "#8cb9df",
];
export const STATUSES: LearningStatus[] = ["new", "learning", "known"];
export const KINDS: ItemKind[] = ["word", "phrase", "concept"];
export const cleanTerm = (text: string): string =>
  text
    .trim()
    .replace(
      /^[\s.,!?;:。，！？；：।॥“”‘’"'()[\]{}]+|[\s.,!?;:。，！？；：।॥“”‘’"'()[\]{}]+$/gu,
      "",
    );
export const normalizeTerm = (text: string): string =>
  cleanTerm(text).normalize("NFKC").toLowerCase().replace(/\s+/gu, " ");
export const languageCode = (text: string): string =>
  text.trim().toLowerCase().split(/[-_]/)[0] || "und";
export const itemKey = (
  item: Pick<LearningDraft, "term" | "language" | "kind">,
): string =>
  `${languageCode(item.language)}:${item.kind}:${normalizeTerm(item.term)}`;

export function validateDraft(value: unknown): LearningDraft {
  if (!value || typeof value !== "object")
    throw new Error("Invalid learning item.");
  const draft = value as Partial<LearningDraft>;
  const term = typeof draft.term === "string" ? cleanTerm(draft.term) : "";
  if (!term || term.length > 200)
    throw new Error("Use a term between 1 and 200 characters.");
  if (
    typeof draft.language !== "string" ||
    !/^[a-z]{2,3}(?:[-_][a-z0-9]+)*$/i.test(draft.language)
  )
    throw new Error(
      "Use a language code such as en, zh, hi, bn, or und for concepts.",
    );
  if (!KINDS.includes(draft.kind!) || !STATUSES.includes(draft.status!))
    throw new Error("Choose a valid type and learning status.");
  if (
    typeof draft.meaning !== "string" ||
    draft.meaning.length > 5000 ||
    typeof draft.examples !== "string" ||
    draft.examples.length > 8000
  )
    throw new Error("The meaning or examples are too long.");
  if (
    !Array.isArray(draft.datasets) ||
    draft.datasets.length > 20 ||
    draft.datasets.some(
      (name) => typeof name !== "string" || !name.trim() || name.length > 60,
    )
  )
    throw new Error("Use list names of at most 60 characters.");
  let source: LearningSource | undefined;
  if (draft.source) {
    const s = draft.source;
    if (
      typeof s.title !== "string" ||
      typeof s.url !== "string" ||
      typeof s.context !== "string" ||
      (s.seconds !== undefined &&
        (!Number.isFinite(s.seconds) || s.seconds < 0))
    )
      throw new Error("Invalid source context.");
    let url = "";
    try {
      const parsed = new URL(s.url);
      if (["http:", "https:"].includes(parsed.protocol)) url = parsed.href;
    } catch {
      /* Pasted sources can omit a link. */
    }
    source = {
      title: s.title.slice(0, 300),
      url: url.slice(0, 3000),
      context: s.context.slice(0, 3000),
      ...(s.seconds === undefined ? {} : { seconds: s.seconds }),
    };
  }
  return {
    term,
    language: languageCode(draft.language),
    kind: draft.kind!,
    meaning: draft.meaning.trim(),
    examples: draft.examples.trim(),
    datasets: [...new Set(draft.datasets.map((name) => name.trim()))],
    status: draft.status!,
    ...(source ? { source } : {}),
  };
}

export class CollectionEditor {
  private byKey: Map<string, LearningItem>;
  constructor(private collection: LearningCollection) {
    this.byKey = new Map(collection.items.map((item) => [itemKey(item), item]));
  }
  find(draft: LearningDraft): LearningItem | undefined {
    return this.byKey.get(itemKey(draft));
  }
  save(
    draft: LearningDraft,
    now = Date.now(),
    existingId?: string,
  ): LearningItem {
    const collection = this.collection;
    const previous = existingId
      ? collection.items.find((item) => item.id === existingId)
      : this.find(draft);
    if (existingId && !previous)
      throw new Error(
        "This item was deleted in another tab. Add it again as a new item.",
      );
    if (existingId && this.find(draft) && this.find(draft)!.id !== previous?.id)
      throw new Error(
        "An item with this term, language and type already exists.",
      );
    const { source, ...fields } = draft;
    const sources = [...(previous?.sources ?? [])];
    if (
      source &&
      !sources.some(
        (s) =>
          s.url === source.url &&
          s.context === source.context &&
          s.seconds === source.seconds,
      )
    )
      sources.push(source);
    const item: LearningItem = {
      ...fields,
      id: previous?.id ?? crypto.randomUUID(),
      sources: sources.slice(-5),
      created: previous?.created ?? now,
      updated: now,
      review: previous?.review ?? { due: now, interval: 0, repetitions: 0 },
    };
    if (previous) collection.items[collection.items.indexOf(previous)] = item;
    else collection.items.push(item);
    if (previous) this.byKey.delete(itemKey(previous));
    this.byKey.set(itemKey(item), item);
    for (const name of draft.datasets) {
      if (!Object.hasOwn(collection.datasets, name))
        Object.defineProperty(collection.datasets, name, {
          value:
            LIST_COLORS[
              Object.keys(collection.datasets).length % LIST_COLORS.length
            ],
          writable: true,
          enumerable: true,
          configurable: true,
        });
    }
    return item;
  }
}

export function reviewItem(
  item: LearningItem,
  remembered: boolean,
  now = Date.now(),
): void {
  const interval = remembered
    ? item.review.interval
      ? Math.min(180, item.review.interval * 2)
      : 1
    : 0;
  item.review = {
    interval,
    due: now + (remembered ? interval * 86400000 : 600000),
    repetitions: item.review.repetitions + 1,
  };
  item.status = "learning";
  item.updated = now;
}
export const dueItems = (
  collection: LearningCollection,
  now = Date.now(),
): LearningItem[] =>
  collection.items
    .filter(
      (item) =>
        item.meaning && item.status !== "known" && item.review.due <= now,
    )
    .sort((a, b) => a.review.due - b.review.due);
