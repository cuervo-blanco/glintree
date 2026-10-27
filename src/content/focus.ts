import { languageOptions } from "../learning/languages";
import { LearningReader, selectedWords } from "../learning/reader";
import { wordAt, type TimedWord } from "./captions";
import { buildLines } from "./lines";
import { romanize } from "./romanize";
import { BookView } from "./book";

interface FocusSettings {
  focusMode: boolean;
  romanize: boolean;
  focusReading?: boolean;
  readingCentered?: boolean;
}

export class FocusView {
  readonly controls = document.createElement("div");
  private learning: LearningReader | null = null;
  private studying = true;
  private transcript = document.createElement("button");
  private reading = document.createElement("button");
  private book: BookView;
  private panel = document.createElement("aside");
  private body = document.createElement("div");
  private follow = document.createElement("button");
  private centered = document.createElement("button");
  private buttons: HTMLButtonElement[] = [];
  private abort = new AbortController();
  private settings: FocusSettings = { focusMode: false, romanize: false };
  private current = -1;
  private open = false;
  private following = true;
  private hidden = false;
  private built = false;
  private destroyed = false;

  constructor(
    private player: HTMLElement,
    private video: HTMLVideoElement,
    private words: TimedWord[],
    private options: {
      onCenter: (enabled: boolean) => void;
      onReading: (enabled: boolean) => void;
      language?: string;
    },
  ) {
    const reader = player.querySelector<HTMLElement>(".trf-reader")!;
    if (options.language)
      this.learning = new LearningReader(player, options.language);
    this.book = new BookView(
      reader,
      words,
      () => reader.querySelector<HTMLElement>(".trf-stage")?.click(),
      () =>
        this.learning?.attach(
          this.book.root,
          this.words.map(({ word }) => word.text),
        ),
    );
    this.book.root.addEventListener(
      "click",
      (event) => {
        if (!this.learning || window.getSelection()?.isCollapsed === false)
          return;
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-word]")
            : null;
        if (!target) return;
        event.stopImmediatePropagation();
        if (this.studying && !event.altKey)
          this.capture(Number(target.dataset.word), undefined, target);
        else this.seek(Number(target.dataset.word));
      },
      { capture: true },
    );
    if (this.learning) {
      this.book.root.title =
        "Click a word to study it. Click padding or press Enter for appearance.";
      this.book.root.setAttribute(
        "aria-label",
        "Reading mode captions. Click words to study; press Enter for appearance.",
      );
    }
    this.controls.className = "trf-focus-tools";
    this.transcript.type =
      this.follow.type =
      this.reading.type =
      this.centered.type =
        "button";
    this.reading.textContent = "Reading mode";
    this.reading.title = "Read a flowing paragraph around the current word";
    this.reading.addEventListener("click", () =>
      this.options.onReading(!this.settings.focusReading),
    );
    this.centered.textContent = "Centre word";
    this.centered.title =
      "Keep the current word in the middle of the reading area";
    this.centered.addEventListener("click", () =>
      this.options.onCenter(!this.settings.readingCentered),
    );
    this.transcript.textContent = "Transcript";
    this.transcript.setAttribute("aria-expanded", "false");
    this.transcript.addEventListener("click", () => this.toggleTranscript());
    this.controls.append(this.reading, this.centered, this.transcript);
    if (this.learning) {
      const learn = document.createElement("button");
      learn.type = "button";
      learn.textContent = "Learn current word";
      learn.addEventListener("click", () => this.capture(this.current));
      const selection = document.createElement("button");
      selection.type = "button";
      selection.textContent = "Save selection";
      selection.title =
        "Select a phrase or concept in the transcript or Reading mode first";
      selection.addEventListener("click", () => {
        const selected =
          selectedWords(this.body) ?? selectedWords(this.book.root);
        if (selected)
          this.capture(
            selected.start,
            this.words
              .slice(selected.start, selected.end + 1)
              .map(({ word }) => word.text)
              .join(" "),
          );
        else {
          this.toggleTranscript(true);
          this.body.focus();
        }
      });
      this.controls.append(learn, selection);
    }

    this.panel.className = "trf-transcript";
    this.panel.setAttribute("aria-label", "Video transcript");
    this.panel.hidden = true;
    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = "Transcript";
    this.follow.textContent = "Follow";
    this.follow.title = "Keep the current word in view";
    this.follow.setAttribute("aria-pressed", "true");
    this.follow.addEventListener("click", () => {
      this.following = !this.following;
      this.follow.setAttribute("aria-pressed", String(this.following));
      if (this.following) this.scrollToCurrent();
    });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close transcript");
    close.addEventListener("click", () => {
      this.toggleTranscript(false);
      this.transcript.focus();
    });
    header.append(title, this.follow, close);
    if (this.learning) {
      const study = document.createElement("button");
      study.type = "button";
      study.textContent = "Study words";
      study.title =
        "Click words to inspect and save them. Turn off to seek; timestamps always seek.";
      study.setAttribute("aria-pressed", "true");
      study.addEventListener("click", () => {
        this.studying = !this.studying;
        study.setAttribute("aria-pressed", String(this.studying));
      });
      const language = document.createElement("select");
      languageOptions(language, options.language ?? "und");
      language.setAttribute("aria-label", "Study language");
      language.title = "Language used for word study";
      language.addEventListener("change", () =>
        this.learning?.setLanguage(language.value.trim() || "und"),
      );
      header.append(study, language);
    }
    this.body.className = "trf-transcript-body";
    this.body.tabIndex = 0;
    this.body.setAttribute("aria-label", "Timed caption words");
    this.body.addEventListener("click", (event) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>("button[data-word]")
          : null;
      const word = target && this.words[Number(target.dataset.word)];
      if (
        !word ||
        (target.classList.contains("trf-transcript-word") &&
          window.getSelection()?.isCollapsed === false)
      )
        return;
      if (
        this.learning &&
        this.studying &&
        !event.altKey &&
        target.classList.contains("trf-transcript-word")
      ) {
        this.capture(Number(target.dataset.word), undefined, target);
        return;
      }
      this.seek(Number(target.dataset.word));
    });
    for (const type of ["wheel", "touchmove"])
      this.body.addEventListener(type, () => this.stopFollowing(), {
        passive: true,
      });
    this.body.addEventListener("keydown", (event) => {
      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(
          event.key,
        )
      )
        this.stopFollowing();
    });
    this.body.addEventListener("pointerdown", (event) => {
      if (event.target === this.body) this.stopFollowing();
    });
    this.panel.append(header, this.body);
    player.append(this.panel);

    for (const target of [this.controls, this.panel]) {
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
      ]) {
        target.addEventListener(type, (event) => event.stopPropagation());
      }
    }
    this.panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.toggleTranscript(false);
      this.transcript.focus();
    });
    document.addEventListener("fullscreenchange", this.syncReading, {
      signal: this.abort.signal,
    });
  }

  private syncReading = (): void => {
    const available =
      this.settings.focusMode || document.fullscreenElement === this.player;
    const active = available && !!this.settings.focusReading;
    this.reading.hidden = !available;
    this.reading.setAttribute(
      "aria-pressed",
      String(!!this.settings.focusReading),
    );
    this.centered.hidden = !active;
    this.centered.setAttribute(
      "aria-pressed",
      String(!!this.settings.readingCentered),
    );
    this.player.classList.toggle("trf-focus-reading", active);
    this.book.setActive(active && !this.hidden);
  };

  private stopFollowing(): void {
    this.following = false;
    this.follow.setAttribute("aria-pressed", "false");
  }

  private toggleTranscript(open = !this.open): void {
    this.open = open;
    if (open && !this.built) this.buildTranscript();
    this.panel.hidden = !open || this.hidden;
    this.transcript.setAttribute("aria-expanded", String(open));
    this.player.classList.toggle("trf-transcript-open", open);
    if (open) this.scrollToCurrent();
  }

  private buildTranscript(): void {
    const fragment = document.createDocumentFragment();
    for (const line of buildLines(
      this.words.map(({ word }) => word),
      16,
    )) {
      const row = document.createElement("div");
      row.className = "trf-transcript-line";
      const time = document.createElement("button");
      time.type = "button";
      time.className = "trf-transcript-time";
      time.dataset.word = String(line.startIndex);
      time.textContent = timestamp(this.words[line.startIndex].startMs);
      time.setAttribute("aria-label", `Seek to ${time.textContent}`);
      const text = document.createElement("p");
      text.dir = "auto";
      for (let index = line.startIndex; index < line.endIndex; index += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.word = String(index);
        button.className = "trf-transcript-word";
        button.textContent = this.display(this.words[index].word.text);
        this.buttons.push(button);
        text.append(button, " ");
      }
      row.append(time, text);
      fragment.append(row);
    }
    this.body.append(fragment);
    this.learning?.attach(
      this.body,
      this.words.map(({ word }) => word.text),
    );
    this.built = true;
    this.mark(this.current, true);
  }

  private seek(index: number): void {
    const word = this.words[index];
    if (!word) return;
    this.video.currentTime = word.startMs / 1000;
    window.postMessage(
      {
        channel: "trf-youtube",
        kind: "player-seek",
        payload: { seconds: word.startMs / 1000 },
      },
      window.location.origin,
    );
    // Paused playback presents no frames, so redraw at the selected word now.
    this.video.dispatchEvent(new Event("seeked"));
    this.update(word.startMs);
  }

  private capture(index: number, term?: string, target?: HTMLElement): void {
    if (!this.words[index]) return;
    this.video.pause();
    this.learning?.capture(
      term ?? this.words[index].word.text,
      {
        title: document.title.replace(/ - YouTube$/, ""),
        url: location.href,
        context: this.words
          .slice(Math.max(0, index - 8), index + 17)
          .map(({ word }) => word.text)
          .join(" "),
        seconds: this.words[index].startMs / 1000,
      },
      target ?? (term === undefined ? this.buttons[index] : undefined),
    );
  }

  private display(text: string): string {
    return this.settings.romanize ? romanize(text) : text;
  }

  apply(settings: FocusSettings): void {
    const changedScript = settings.romanize !== this.settings.romanize;
    this.settings = settings;
    this.syncReading();
    this.book.apply(settings.romanize, !!settings.readingCentered);
    if (changedScript && this.built) {
      for (const [index, button] of this.buttons.entries())
        button.textContent = this.display(this.words[index].word.text);
    }
  }

  update(timeMs: number): void {
    this.book.update(timeMs);
    const next = wordAt(this.words, timeMs);
    if (next === this.current) return;
    this.mark(this.current, false);
    this.current = next;
    this.mark(next, true);
    if (this.open && this.following) this.scrollToCurrent();
  }

  private mark(index: number, current: boolean): void {
    const button = this.buttons[index];
    if (!button) return;
    button.classList.toggle("trf-current", current);
    if (current) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  }

  private scrollToCurrent(): void {
    const button = this.buttons[this.current];
    if (!button || this.panel.hidden || !this.body.clientHeight) return;
    const word = button.getBoundingClientRect();
    const pane = this.body.getBoundingClientRect();
    // Scroll this pane only; scrollIntoView can also move the whole YouTube page.
    if (word.top < pane.top) this.body.scrollTop += word.top - pane.top;
    else if (word.bottom > pane.bottom)
      this.body.scrollTop += word.bottom - pane.bottom;
  }

  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    if (hidden) this.learning?.panel.close();
    this.controls.hidden = hidden;
    this.panel.hidden = hidden || !this.open;
    this.syncReading();
    if (!hidden && this.open && this.following) this.scrollToCurrent();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    this.player.classList.remove("trf-transcript-open", "trf-focus-reading");
    this.controls.remove();
    this.panel.remove();
    this.book.destroy();
    this.learning?.destroy();
  }
}

function timestamp(timeMs: number): string {
  const seconds = Math.max(0, Math.floor(timeMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
