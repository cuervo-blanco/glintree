import { languageOptions } from "./languages";
import {
  cleanTerm,
  itemKey,
  KINDS,
  STATUSES,
  type LearningCollection,
  type LearningDraft,
} from "./model";
import { changeCollection } from "./store";

export class LearningPanel {
  readonly root = document.createElement("aside");
  private form: HTMLFormElement;
  private draft: LearningDraft | null = null;
  private closed = true;
  private generation = 0;
  private itemId: string | undefined;
  private returnFocus: HTMLElement | null = null;
  constructor(
    private host: HTMLElement,
    private collection: () => LearningCollection,
    private onClose = (): void => {},
  ) {
    this.root.className = "trf-learning-panel";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "Learning item");
    this.root.innerHTML = `
      <header><strong>Glintree <small>· Capture</small></strong><button type="button" data-close aria-label="Close learning item">×</button></header>
      <form>
        <label>Word, phrase or concept<input name="term" required maxlength="200"></label>
        <div class="trf-learning-fields"><label>Language<select name="language"></select></label><label>Type<select name="kind">${KINDS.map((kind) => `<option>${kind}</option>`).join("")}</select></label></div>
        <p class="trf-learning-help">Choose Not specified for a concept shared across languages.</p>
        <label>Meaning / explanation<textarea name="meaning" rows="3" maxlength="5000"></textarea></label>
        <label>Other uses / examples<textarea name="examples" rows="3" maxlength="8000"></textarea></label>
        <label>Lists / topics <small>separate with commas</small><input name="datasets" maxlength="1200" placeholder="HSK4, Travel, CCNA"></label>
        <label>Progress<select name="status">${STATUSES.map((status) => `<option>${status}</option>`).join("")}</select></label>
        <blockquote data-context></blockquote><a data-source target="_blank" rel="noopener noreferrer" hidden>Return to source</a>
        <p class="trf-learning-help">Saving a meaning makes this item ready for flashcard review.</p>
        <footer><button type="submit">Save item</button><a data-collection target="_blank">Collection & review ↗</a></footer>
        <p role="status" data-notice></p>
      </form>`;
    this.form = this.root.querySelector("form")!;
    this.root.querySelector<HTMLAnchorElement>("[data-collection]")!.href =
      chrome.runtime.getURL("learn.html");
    this.root
      .querySelector("[data-close]")!
      .addEventListener("click", () => this.close());
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.save();
    });
    for (const type of [
      "click",
      "dblclick",
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "keydown",
      "keyup",
      "keypress",
      "wheel",
    ])
      this.root.addEventListener(type, (event) => event.stopPropagation());
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });
    host.append(this.root);
  }
  private field(
    name: string,
  ): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
    return this.form.elements.namedItem(name) as HTMLInputElement;
  }
  open(draft: LearningDraft): void {
    const item = this.collection().items.find(
      (entry) => itemKey(entry) === itemKey(draft),
    );
    this.generation++;
    this.draft = draft;
    this.itemId = item?.id;
    this.closed = false;
    this.returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const values = item ?? draft;
    languageOptions(
      this.field("language") as HTMLSelectElement,
      values.language,
    );
    for (const key of [
      "term",
      "language",
      "kind",
      "meaning",
      "examples",
      "status",
    ] as const)
      this.field(key).value = values[key];
    this.field("datasets").value = values.datasets.join(", ");
    this.root.querySelector("[data-context]")!.textContent =
      draft.source?.context || item?.sources[0]?.context || "";
    const link = this.root.querySelector<HTMLAnchorElement>("[data-source]")!;
    const source = draft.source ?? item?.sources[0];
    link.hidden = !source?.url;
    if (source?.url && /^https?:\/\//i.test(source.url)) {
      const url = new URL(source.url);
      if (source.seconds !== undefined)
        url.searchParams.set("t", `${Math.floor(source.seconds)}s`);
      link.href = url.href;
    } else {
      link.hidden = true;
      link.removeAttribute("href");
    }
    this.notice("");
    this.root.hidden = false;
    this.host.classList.add("trf-learning-open");
    this.field("meaning").focus({ preventScroll: true });
  }
  private notice(text: string): void {
    this.root.querySelector("[data-notice]")!.textContent = text;
  }
  private async save(): Promise<void> {
    if (!this.draft) return;
    const mine = this.generation;
    const button = this.form.querySelector<HTMLButtonElement>("[type=submit]")!;
    button.disabled = true;
    try {
      const result = await changeCollection({
        action: "save",
        id: this.itemId,
        draft: {
          ...this.draft,
          term: this.field("term").value,
          language: this.field("language").value.trim(),
          kind: this.field("kind").value as LearningDraft["kind"],
          meaning: this.field("meaning").value,
          examples: this.field("examples").value,
          datasets: this.field("datasets")
            .value.split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          status: this.field("status").value as LearningDraft["status"],
        },
      });
      if (mine === this.generation) {
        this.itemId = result.id;
        this.notice(
          "Saved locally. Your collection and highlights are updated.",
        );
      }
    } catch (error) {
      if (mine === this.generation)
        this.notice(
          error instanceof Error ? error.message : "Could not save this item.",
        );
    } finally {
      button.disabled = false;
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.root.hidden = true;
    this.host.classList.remove("trf-learning-open");
    this.returnFocus?.focus({ preventScroll: true });
    this.onClose();
  }
  destroy(): void {
    this.close();
    this.root.remove();
  }
}
export function learningDraft(
  term: string,
  language: string,
  source?: LearningDraft["source"],
): LearningDraft {
  return {
    term: cleanTerm(term),
    language: language || "und",
    kind: /\s/u.test(term.trim()) ? "phrase" : "word",
    meaning: "",
    examples: "",
    datasets: [],
    status: "new",
    ...(source ? { source } : {}),
  };
}
