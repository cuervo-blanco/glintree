// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleFromText, articleWords } from "./model";
import { ArticlePlayback } from "./playback";

const players: ArticlePlayback[] = [];
function mount(text = "Heading\n\nHello, reader. More words") {
  const change = vi.fn();
  const player = new ArticlePlayback(
    articleWords(articleFromText(text)),
    600,
    change,
  );
  players.push(player);
  return { player, change };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  players.splice(0).forEach((player) => player.destroy());
  vi.useRealTimers();
});

describe("article playback", () => {
  it("waits for Play, gives block endings a pause and applies punctuation timing", () => {
    const { player } = mount();
    vi.advanceTimersByTime(1000);
    expect(player.index).toBe(0);
    player.play();
    vi.advanceTimersByTime(199);
    expect(player.index).toBe(0);
    vi.advanceTimersByTime(1);
    expect(player.index).toBe(1);
    vi.advanceTimersByTime(115);
    expect(player.index).toBe(2);
    vi.advanceTimersByTime(150);
    expect(player.index).toBe(3);
  });

  it("pauses and seeks without leaving a second timer running", () => {
    const { player } = mount();
    player.play();
    player.play();
    vi.advanceTimersByTime(200);
    expect(player.index).toBe(1);
    player.pause();
    vi.advanceTimersByTime(2000);
    expect(player.index).toBe(1);
    player.seek(3);
    expect(player.playing).toBe(false);
    player.play();
    vi.advanceTimersByTime(100);
    expect(player.index).toBe(4);
  });

  it("reschedules speed changes and clamps both ends of manual seeking", () => {
    const { player } = mount("One two three four");
    player.play();
    player.setSpeed(1200);
    vi.advanceTimersByTime(50);
    expect(player.index).toBe(1);
    player.seek(-10);
    expect(player.index).toBe(0);
    player.seek(999);
    expect(player.index).toBe(3);
  });

  it("finishes, restarts and stops cleanly when destroyed", () => {
    const { player } = mount("One");
    player.play();
    vi.advanceTimersByTime(200);
    expect(player.finished).toBe(true);
    expect(player.playing).toBe(false);
    player.play();
    expect(player.finished).toBe(false);
    player.destroy();
    vi.advanceTimersByTime(1000);
    expect(player.playing).toBe(false);
  });
});
