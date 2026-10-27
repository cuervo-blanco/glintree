import {
  EMPTY_COLLECTION,
  type LearningCollection,
  type LearningSource,
} from "./model";
import { LearningPanel, learningDraft } from "./panel";
import { paintLearningWords } from "./matching";
import { loadCollection, onCollectionChanged } from "./store";

export class LearningReader {
  private collection: LearningCollection = structuredClone(EMPTY_COLLECTION);
  readonly panel: LearningPanel;
  private unlisten: () => void;
  private destroyed = false;
  private revision = 0;
  private roots: {
    root: HTMLElement;
    words: readonly string[];
    boundaries?: ReadonlySet<number>;
  }[] = [];
  constructor(
    host: HTMLElement,
    private language: string,
  ) {
    this.panel = new LearningPanel(host, () => this.collection);
    this.unlisten = onCollectionChanged((collection) => {
      this.revision++;
      this.collection = collection;
      this.paint();
    });
    const revision = this.revision;
    void loadCollection()
      .then((collection) => {
        if (this.destroyed || revision !== this.revision) return;
        this.collection = collection;
        this.paint();
      })
      .catch(() => undefined);
  }
  attach(
    root: HTMLElement,
    words: readonly string[],
    boundaries?: ReadonlySet<number>,
  ): void {
    this.roots = this.roots.filter(
      (entry) => entry.root.isConnected && entry.root !== root,
    );
    this.roots.push({ root, words, boundaries });
    paintLearningWords(root, words, this.language, this.collection, boundaries);
  }
  setLanguage(language: string): void {
    this.language = language;
    this.paint();
  }
  private paint(): void {
    for (const { root, words, boundaries } of this.roots)
      paintLearningWords(
        root,
        words,
        this.language,
        this.collection,
        boundaries,
      );
  }
  capture(term: string, source: LearningSource, element?: HTMLElement): void {
    const item = this.collection.items.find(
      (entry) => entry.id === element?.dataset.learningId,
    );
    this.panel.open(
      item ? { ...item, source } : learningDraft(term, this.language, source),
    );
  }
  destroy(): void {
    this.destroyed = true;
    this.unlisten();
    this.panel.destroy();
    this.roots = [];
  }
}
export function selectedWords(
  root: HTMLElement,
): { text: string; start: number; end: number } | null {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    !selection.rangeCount ||
    !selection.toString().trim()
  )
    return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const words = [...root.querySelectorAll<HTMLElement>("[data-word]")].filter(
    (word) => range.intersectsNode(word),
  );
  if (!words.length) return null;
  return {
    text: selection.toString().trim(),
    start: Number(words[0].dataset.word),
    end: Number(words[words.length - 1].dataset.word),
  };
}
