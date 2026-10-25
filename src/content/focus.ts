import { wordAt, type TimedWord } from "./captions";
import { buildLines } from "./lines";
import { romanize } from "./romanize";

interface FocusSettings {
  focusMode: boolean;
  romanize: boolean;
}

const activeViews = new WeakMap<HTMLElement, FocusView>();

export class FocusView {
  readonly controls = document.createElement("div");
  private fullscreen = document.createElement("button");
  private transcript = document.createElement("button");
  private panel = document.createElement("aside");
  private body = document.createElement("div");
  private follow = document.createElement("button");
  private notice = document.createElement("span");
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
    private options: { onFocus: (enabled: boolean) => void },
  ) {
    activeViews.set(player, this);
    this.controls.className = "trf-focus-tools";
    this.fullscreen.type = this.transcript.type = this.follow.type = "button";
    this.fullscreen.textContent = "Fullscreen focus";
    this.fullscreen.addEventListener(
      "click",
      () => void this.enterFullscreen(),
    );
    this.transcript.textContent = "Transcript";
    this.transcript.setAttribute("aria-expanded", "false");
    this.transcript.addEventListener("click", () => this.toggleTranscript());
    this.notice.className = "trf-focus-notice";
    this.notice.setAttribute("role", "status");
    this.controls.append(this.fullscreen, this.transcript, this.notice);

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
    this.body.className = "trf-transcript-body";
    this.body.tabIndex = 0;
    this.body.setAttribute("aria-label", "Timed caption words");
    this.body.addEventListener("click", (event) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>("button[data-word]")
          : null;
      const word = target && this.words[Number(target.dataset.word)];
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
    document.addEventListener("fullscreenchange", this.fullscreenChanged, {
      signal: this.abort.signal,
    });
  }

  private fullscreenChanged = (): void => {
    const focused =
      this.settings.focusMode && document.fullscreenElement === this.player;
    this.player.classList.toggle("trf-focus-fullscreen", focused);
    this.fullscreen.textContent = focused
      ? "Exit fullscreen"
      : "Fullscreen focus";
    this.fullscreen.setAttribute("aria-pressed", String(focused));
  };

  private async enterFullscreen(): Promise<void> {
    this.notice.textContent = "";
    this.fullscreen.disabled = true;
    try {
      if (this.player.classList.contains("trf-focus-fullscreen")) {
        await document.exitFullscreen();
      } else {
        this.options.onFocus(true);
        if (document.fullscreenElement !== this.player)
          await this.player.requestFullscreen();
      }
      if (this.destroyed) {
        // A navigation can finish while the browser is entering fullscreen.
        if (
          document.fullscreenElement === this.player &&
          !activeViews.has(this.player)
        )
          await document.exitFullscreen();
      } else this.fullscreenChanged();
    } catch {
      if (this.destroyed) return;
      this.notice.textContent = "Fullscreen is unavailable in this window.";
    } finally {
      if (!this.destroyed) this.fullscreen.disabled = false;
    }
  }

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
    this.built = true;
    this.mark(this.current, true);
  }

  private display(text: string): string {
    return this.settings.romanize ? romanize(text) : text;
  }

  apply(settings: FocusSettings): void {
    const changedScript = settings.romanize !== this.settings.romanize;
    this.settings = settings;
    this.fullscreenChanged();
    if (changedScript && this.built) {
      for (const [index, button] of this.buttons.entries())
        button.textContent = this.display(this.words[index].word.text);
    }
  }

  update(timeMs: number): void {
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
    this.controls.hidden = hidden;
    this.panel.hidden = hidden || !this.open;
    if (!hidden && this.open && this.following) this.scrollToCurrent();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    if (activeViews.get(this.player) === this) {
      activeViews.delete(this.player);
      this.player.classList.remove(
        "trf-focus-fullscreen",
        "trf-transcript-open",
      );
    }
    this.controls.remove();
    this.panel.remove();
  }
}

function timestamp(timeMs: number): string {
  const seconds = Math.max(0, Math.floor(timeMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
