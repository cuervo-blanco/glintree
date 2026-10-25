// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classify } from "../reader-core/words";
import type { TimedWord } from "./captions";
import { FocusView } from "./focus";

const words: TimedWord[] = [
  { word: classify("um"), startMs: 0, endMs: 1000 },
  { word: classify("नमस्ते"), startMs: 1300, endMs: 2200 },
  { word: classify("বাংলা"), startMs: 2700, endMs: 3500 },
  { word: classify("world."), startMs: 4500, endMs: 5500 },
];
const views: FocusView[] = [];
let fullscreenElement: Element | null;
const setFullscreen = (element: Element | null): void => {
  fullscreenElement = element;
  document.dispatchEvent(new Event("fullscreenchange"));
};

function mount(player = document.createElement("div")) {
  const video = document.createElement("video");
  const reader = document.createElement("div");
  reader.className = "trf-reader";
  player.append(video, reader);
  document.body.append(player);
  let settings = { focusMode: false, romanize: false };
  const onFocus = vi.fn((focusMode: boolean) => {
    settings = { ...settings, focusMode };
    view.apply(settings);
  });
  const view = new FocusView(player, video, words, { onFocus });
  views.push(view);
  player.append(view.controls);
  view.apply(settings);
  const button = (label: string) =>
    Array.from(player.querySelectorAll("button")).find(
      (element) =>
        element.textContent === label ||
        element.getAttribute("aria-label") === label,
    )!;
  return {
    view,
    player,
    video,
    onFocus,
    button,
    panel: player.querySelector<HTMLElement>(".trf-transcript")!,
    body: player.querySelector<HTMLElement>(".trf-transcript-body")!,
    entries: () =>
      Array.from(
        player.querySelectorAll<HTMLButtonElement>(".trf-transcript-word"),
      ),
  };
}

beforeEach(() => {
  fullscreenElement = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: vi.fn(async () => setFullscreen(null)),
  });
});

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("focus transcript", () => {
  it("builds the complete native transcript only when opened, including fillers", () => {
    const { view, button, panel, entries } = mount();
    expect(entries()).toHaveLength(0);
    expect(panel.hidden).toBe(true);
    view.update(1400);
    button("Transcript").click();
    expect(panel.hidden).toBe(false);
    expect(entries().map((entry) => entry.textContent)).toEqual(
      words.map(({ word }) => word.text),
    );
    expect(entries()[1].getAttribute("aria-current")).toBe("true");
    button("Transcript").click();
    expect(panel.hidden).toBe(true);
    button("Transcript").click();
    expect(entries()).toHaveLength(words.length);
  });

  it("seeks each word and timestamp exactly without starting paused playback", () => {
    const { video, button, entries, player } = mount();
    const post = vi.spyOn(window, "postMessage");
    const seeked = vi.fn();
    video.addEventListener("seeked", seeked);
    button("Transcript").click();
    entries()[2].click();
    expect(video.currentTime).toBe(2.7);
    expect(video.paused).toBe(true);
    expect(seeked).toHaveBeenCalledOnce();
    expect(post).toHaveBeenLastCalledWith(
      {
        channel: "trf-youtube",
        kind: "player-seek",
        payload: { seconds: 2.7 },
      },
      window.location.origin,
    );
    expect(entries()[2].getAttribute("aria-current")).toBe("true");
    player.querySelector<HTMLButtonElement>(".trf-transcript-time")!.click();
    expect(video.currentTime).toBe(0);
  });

  it("changes scripts in place while preserving native seek times", () => {
    const { view, button, entries, video } = mount();
    view.apply({ focusMode: false, romanize: true });
    button("Transcript").click();
    const hindi = entries()[1];
    const bengali = entries()[2];
    expect(hindi.textContent).toBe("namastē");
    expect(bengali.textContent).toBe("bāṁlā");
    hindi.focus();
    view.apply({ focusMode: false, romanize: false });
    expect(entries()[1]).toBe(hindi);
    expect(document.activeElement).toBe(hindi);
    expect(hindi.textContent).toBe("नमस्ते");
    hindi.click();
    expect(video.currentTime).toBe(1.3);
  });

  it("marks the current word and clears it in caption gaps", () => {
    const { view, button, entries } = mount();
    button("Transcript").click();
    view.update(1400);
    expect(entries()[1].getAttribute("aria-current")).toBe("true");
    view.update(2800);
    expect(entries()[1].hasAttribute("aria-current")).toBe(false);
    expect(entries()[2].getAttribute("aria-current")).toBe("true");
    view.update(4000);
    expect(entries().some((entry) => entry.hasAttribute("aria-current"))).toBe(
      false,
    );
  });

  it("scrolls only its pane and stops following while the user reads elsewhere", () => {
    const { view, button, entries, body } = mount();
    button("Transcript").click();
    Object.defineProperty(body, "clientHeight", { value: 200 });
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 300, 200),
    );
    const wordBox = vi
      .spyOn(entries()[1], "getBoundingClientRect")
      .mockReturnValue(new DOMRect(10, 260, 60, 20));
    view.update(1400);
    expect(body.scrollTop).toBe(80);
    wordBox.mockClear();
    view.setHidden(false);
    view.setHidden(false);
    expect(wordBox).not.toHaveBeenCalled();
    body.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    view.update(2800);
    expect(button("Follow").getAttribute("aria-pressed")).toBe("false");
    expect(body.scrollTop).toBe(80);
    vi.spyOn(entries()[2], "getBoundingClientRect").mockReturnValue(
      new DOMRect(10, 300, 60, 20),
    );
    button("Follow").click();
    expect(button("Follow").getAttribute("aria-pressed")).toBe("true");
    expect(body.scrollTop).toBe(200);
  });

  it("lets keyboard and touch scrolling suspend following too", () => {
    const { button, body } = mount();
    button("Transcript").click();
    body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }),
    );
    expect(button("Follow").getAttribute("aria-pressed")).toBe("false");
    button("Follow").click();
    body.dispatchEvent(new Event("touchmove", { bubbles: true }));
    expect(button("Follow").getAttribute("aria-pressed")).toBe("false");
  });

  it("hides during ads, remembers an open panel and closes with Escape", () => {
    const { view, button, panel, body } = mount();
    button("Transcript").click();
    view.setHidden(true);
    expect(panel.hidden).toBe(true);
    expect(view.controls.hidden).toBe(true);
    view.setHidden(false);
    expect(panel.hidden).toBe(false);
    body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(panel.hidden).toBe(true);
    expect(button("Transcript").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button("Transcript"));
  });

  it.each(["click", "keydown", "wheel"])(
    "keeps %s interactions away from YouTube",
    (type) => {
      const { button, panel, player } = mount();
      button("Transcript").click();
      const listener = vi.fn();
      player.addEventListener(type, listener);
      panel.dispatchEvent(new Event(type, { bubbles: true }));
      expect(listener).not.toHaveBeenCalled();
    },
  );
});

describe("fullscreen focus", () => {
  it("centres focus in native fullscreen and restores normal video when Focus is off", () => {
    const { view, player, button } = mount();
    view.apply({ focusMode: true, romanize: false });
    setFullscreen(player);
    expect(player.classList.contains("trf-focus-fullscreen")).toBe(true);
    expect(button("Exit fullscreen").getAttribute("aria-pressed")).toBe("true");
    view.apply({ focusMode: false, romanize: false });
    expect(player.classList.contains("trf-focus-fullscreen")).toBe(false);
    expect(document.fullscreenElement).toBe(player);
  });

  it("enters fullscreen on the existing player and exits with the same control", async () => {
    const { player, button, onFocus } = mount();
    const request = vi.fn(async () => setFullscreen(player));
    player.requestFullscreen = request;
    const fullscreen = button("Fullscreen focus");
    fullscreen.click();
    await vi.waitFor(() => expect(fullscreen.disabled).toBe(false));
    expect(onFocus).toHaveBeenCalledWith(true);
    expect(request).toHaveBeenCalledOnce();
    expect(player.classList.contains("trf-focus-fullscreen")).toBe(true);
    fullscreen.click();
    await vi.waitFor(() =>
      expect(fullscreen.textContent).toBe("Fullscreen focus"),
    );
    expect(document.fullscreenElement).toBeNull();
    expect(player.classList.contains("trf-focus-fullscreen")).toBe(false);
  });

  it("reports a failed request without leaving fullscreen layout applied", async () => {
    const { player, button } = mount();
    player.requestFullscreen = vi.fn().mockRejectedValue(new Error("blocked"));
    const fullscreen = button("Fullscreen focus");
    fullscreen.click();
    await vi.waitFor(() => expect(fullscreen.disabled).toBe(false));
    expect(player.classList.contains("trf-focus-fullscreen")).toBe(false);
    expect(player.querySelector(".trf-focus-notice")?.textContent).toContain(
      "unavailable",
    );
  });

  it("handles fullscreen exit rejection without an unhandled promise", async () => {
    const { view, player, button } = mount();
    view.apply({ focusMode: true, romanize: false });
    setFullscreen(player);
    vi.mocked(document.exitFullscreen).mockRejectedValue(new Error("blocked"));
    const fullscreen = button("Exit fullscreen");
    fullscreen.click();
    await vi.waitFor(() => expect(fullscreen.disabled).toBe(false));
    expect(player.querySelector(".trf-focus-notice")?.textContent).toContain(
      "unavailable",
    );
  });

  it("cleans up a fullscreen request that completes after its view is destroyed", async () => {
    const { view, player, button } = mount();
    let resolve!: () => void;
    player.requestFullscreen = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    button("Fullscreen focus").click();
    view.destroy();
    setFullscreen(player);
    resolve();
    await vi.waitFor(() =>
      expect(document.exitFullscreen).toHaveBeenCalledOnce(),
    );
    expect(document.fullscreenElement).toBeNull();
    expect(
      player.querySelector(".trf-transcript, .trf-focus-tools"),
    ).toBeNull();
    expect(player.classList.contains("trf-focus-fullscreen")).toBe(false);
  });

  it("does not end a newer view's fullscreen when an old request settles", async () => {
    const old = mount();
    let resolve!: () => void;
    old.player.requestFullscreen = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    old.button("Fullscreen focus").click();
    old.view.destroy();
    const next = mount(old.player);
    next.view.apply({ focusMode: true, romanize: false });
    setFullscreen(old.player);
    old.view.destroy();
    resolve();
    await Promise.resolve();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
    expect(old.player.classList.contains("trf-focus-fullscreen")).toBe(true);
  });
});
