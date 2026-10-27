import { wordAt, type TimedWord } from "./captions";
import { romanize } from "./romanize";
import { splitAtReadingOrp } from "./graphemes";

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
    private onWordsRendered = (): void => {},
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
        this.fill(span, this.words[this.start + offset].word.text);
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
    const following = next >= 0 && next === this.anchor + 1;
    this.mark(this.current, false);
    this.current = next;
    this.anchor = anchor;
    if (this.active) this.render(following);
  }

  private mark(index: number, current: boolean): void {
    const span = this.spans[index - this.start];
    if (!span) return;
    span.classList.toggle("trf-book-current", current);
    if (current) {
      span.setAttribute("aria-current", "true");
      span.getAnimations?.().forEach((animation) => animation.cancel());
    } else span.removeAttribute("aria-current");
  }

  private fill(span: HTMLElement, text: string): void {
    const { before, pivot, after } = splitAtReadingOrp(
      this.romanized ? romanize(text) : text,
    );
    const letter = document.createElement("span");
    letter.className = "trf-pivot";
    letter.textContent = pivot;
    span.replaceChildren(before, letter, after);
  }

  private render(following = false): void {
    const previousLine = this.line;
    // Refill only near an excerpt edge, rather than rewrapping every word.
    if (
      !this.spans.length ||
      (this.start > 0 && this.anchor < this.start + 40) ||
      (this.end < this.words.length && this.anchor >= this.end - 40)
    ) {
      let start = Math.max(0, this.anchor - 100);
      const retained = this.spans[start - this.start];
      // Starting on a retained line keeps nearby words from rewrapping mid-playback.
      if (retained && this.root.clientHeight) {
        const top = retained.getBoundingClientRect().top;
        while (
          start > this.start &&
          Math.abs(
            this.spans[start - this.start - 1].getBoundingClientRect().top -
              top,
          ) < 1
        )
          start -= 1;
      }
      this.start = start;
      this.end = Math.min(this.words.length, this.anchor + 101, start + 201);
      const content = document.createDocumentFragment();
      this.spans = [];
      for (let index = this.start; index < this.end; index += 1) {
        const span = document.createElement("span");
        span.className = "trf-book-word";
        span.dataset.word = String(index);
        this.fill(span, this.words[index].word.text);
        content.append(span, " ");
        this.spans.push(span);
      }
      this.text.replaceChildren(content);
      this.onWordsRendered();
      this.line = null;
    }
    this.mark(this.current, true);
    this.reflow();
    if (
      following &&
      previousLine !== null &&
      previousLine !== this.line &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      // Soften a line change without fading the focal word or delaying its timing.
      for (const span of this.spans) {
        if (Number(span.dataset.word) !== this.current)
          span.animate?.([{ opacity: 0.35 }, { opacity: 1 }], {
            duration: 60,
            easing: "ease-out",
          });
      }
    }
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
      const pivot = span
        .querySelector<HTMLElement>(".trf-pivot")!
        .getBoundingClientRect();
      const spacing =
        parseFloat(getComputedStyle(this.root).letterSpacing) || 0;
      const offset =
        view.left + view.width / 2 - pivot.left - (pivot.width - spacing) / 2;
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
