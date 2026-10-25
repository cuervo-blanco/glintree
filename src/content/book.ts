import { wordAt, type TimedWord } from "./captions";
import { romanize } from "./romanize";

/** A flowing excerpt keeps the current line steady while its word advances. */
export class BookView {
  readonly root = document.createElement("div");
  private text = document.createElement("p");
  private spans: HTMLSpanElement[] = [];
  private resize: ResizeObserver;
  private active = false;
  private romanized = false;
  private centered = false;
  private shifted: HTMLSpanElement[] = [];
  private current = -1;
  private anchor = 0;
  private start = 0;
  private end = 0;
  private line: number | null = null;
  private gutter = -1;

  constructor(
    reader: HTMLElement,
    private words: TimedWord[],
    onSettings: () => void,
  ) {
    this.root.className = "trf-book";
    this.root.hidden = true;
    this.root.tabIndex = 0;
    this.root.setAttribute("role", "button");
    this.root.setAttribute(
      "aria-label",
      "Reading mode captions. Open appearance settings",
    );
    this.root.setAttribute("aria-haspopup", "dialog");
    this.root.setAttribute("aria-expanded", "false");
    this.root.title = "Click to adjust text appearance";
    this.text.dir = "auto";
    this.root.append(this.text);
    reader.append(this.root);
    this.root.addEventListener("click", (event) => {
      if (event.detail < 2) onSettings();
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") event.stopPropagation();
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onSettings();
    });
    for (const type of [
      "click",
      "dblclick",
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "keyup",
      "keypress",
      "wheel",
      "touchstart",
      "touchend",
    ]) {
      this.root.addEventListener(type, (event) => event.stopPropagation());
    }
    this.resize = new ResizeObserver(this.reflow);
    this.resize.observe(this.root);
    this.resize.observe(this.text);
    document.fonts?.addEventListener("loadingdone", this.reflow);
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.root.hidden = !active;
    if (active) this.render();
  }

  apply(romanized: boolean, centered = false): void {
    const changed = this.romanized !== romanized;
    this.romanized = romanized;
    this.centered = centered;
    if (changed) {
      for (const [offset, span] of this.spans.entries()) {
        const text = this.words[this.start + offset].word.text;
        span.textContent = romanized ? romanize(text) : text;
      }
    }
    // Font, script and player changes can wrap the same word onto another line.
    this.line = null;
    this.reflow();
  }

  update(timeMs: number): void {
    const next = wordAt(this.words, timeMs);
    let anchor = next;
    if (anchor < 0) {
      let low = 0;
      let high = this.words.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (this.words[middle].startMs <= timeMs) low = middle + 1;
        else high = middle;
      }
      anchor = Math.max(0, low - 1);
    }
    if (next === this.current && anchor === this.anchor) return;
    this.mark(this.current, false);
    this.current = next;
    this.anchor = anchor;
    if (this.active) this.render();
  }

  private mark(index: number, current: boolean): void {
    const span = this.spans[index - this.start];
    if (!span) return;
    span.classList.toggle("trf-book-current", current);
    if (current) span.setAttribute("aria-current", "true");
    else span.removeAttribute("aria-current");
  }

  private render(): void {
    // Refill only near an excerpt edge, rather than rewrapping every word.
    if (
      !this.spans.length ||
      (this.start > 0 && this.anchor < this.start + 40) ||
      (this.end < this.words.length && this.anchor >= this.end - 40)
    ) {
      this.start = Math.max(0, this.anchor - 100);
      this.end = Math.min(this.words.length, this.anchor + 101);
      const content = document.createDocumentFragment();
      this.spans = [];
      for (let index = this.start; index < this.end; index += 1) {
        const span = document.createElement("span");
        span.className = "trf-book-word";
        span.dataset.word = String(index);
        const text = this.words[index].word.text;
        span.textContent = this.romanized ? romanize(text) : text;
        content.append(span, " ");
        this.spans.push(span);
      }
      this.text.replaceChildren(content);
      this.line = null;
    }
    this.mark(this.current, true);
    this.reflow();
  }

  private reflow = (): void => {
    if (!this.active || !this.root.clientHeight) return;
    for (const word of this.shifted) word.style.transform = "";
    this.shifted = [];
    const span = this.spans[this.anchor - this.start];
    if (!span) return;
    const lineHeight =
      parseFloat(getComputedStyle(this.root).lineHeight) ||
      span.getBoundingClientRect().height;
    const gutter = Math.max(0, (this.root.clientHeight - lineHeight) / 2);
    if (gutter !== this.gutter) {
      this.gutter = gutter;
      this.text.style.paddingBlock = `${gutter}px`;
      this.line = null;
    }
    const word = span.getBoundingClientRect();
    const view = this.root.getBoundingClientRect();
    if (this.centered) {
      // Shift just this line so the surrounding paragraph keeps its full width.
      const offset = view.left + view.width / 2 - word.left - word.width / 2;
      this.shifted = this.spans.filter(
        (item) => Math.abs(item.getBoundingClientRect().top - word.top) < 1,
      );
      for (const item of this.shifted)
        item.style.transform = `translateX(${offset}px)`;
    }
    const line = Math.round(word.top - view.top + this.root.scrollTop);
    if (line === this.line) return;
    this.line = line;
    this.root.scrollTop = line - (this.root.clientHeight - word.height) / 2;
  };

  destroy(): void {
    this.resize.disconnect();
    document.fonts?.removeEventListener("loadingdone", this.reflow);
    this.root.remove();
  }
}
