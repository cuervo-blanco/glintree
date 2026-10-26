import type { ArticleWord } from "./model";

export class ArticlePlayback {
  index = 0;
  playing = false;
  finished = false;
  private timer = 0;

  constructor(
    private words: ArticleWord[],
    public wpm: number,
    private change: () => void,
  ) {}

  play(): void {
    if (this.playing || !this.words.length) return;
    if (this.finished) this.index = 0;
    this.finished = false;
    this.playing = true;
    this.change();
    this.schedule();
  }

  pause(): void {
    window.clearTimeout(this.timer);
    this.playing = false;
    this.change();
  }

  seek(index: number): void {
    window.clearTimeout(this.timer);
    this.playing = false;
    this.finished = false;
    this.index = Math.max(0, Math.min(this.words.length - 1, index));
    this.change();
  }

  setSpeed(wpm: number): void {
    this.wpm = Math.max(80, Math.min(1200, wpm));
    if (this.playing) {
      window.clearTimeout(this.timer);
      this.schedule();
    }
  }

  private schedule(): void {
    const current = this.words[this.index];
    const pause = current.last
      ? 2
      : current.word.endsSentence
        ? 1.5
        : current.word.endsClause
          ? 1.15
          : 1;
    this.timer = window.setTimeout(
      () => {
        if (this.index < this.words.length - 1) {
          this.index += 1;
          this.change();
          this.schedule();
        } else {
          this.playing = false;
          this.finished = true;
          this.change();
        }
      },
      (60_000 / this.wpm) * pause,
    );
  }

  destroy(): void {
    window.clearTimeout(this.timer);
    this.playing = false;
  }
}
