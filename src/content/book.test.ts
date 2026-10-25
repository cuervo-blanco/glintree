// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classify } from "../reader-core/words";
import { BookView } from "./book";
import type { TimedWord } from "./captions";

const words = (count: number): TimedWord[] =>
  Array.from({ length: count }, (_, index) => ({
    word: classify(`word${index}`),
    startMs: index * 1000,
    endMs: index * 1000 + 800,
  }));
const views: BookView[] = [];
const observers: {
  callback: () => void;
  disconnect: ReturnType<typeof vi.fn>;
}[] = [];

function mount(source = words(500)) {
  const reader = document.createElement("div");
  const settings = vi.fn();
  document.body.append(reader);
  const view = new BookView(reader, source, settings);
  views.push(view);
  return {
    view,
    root: view.root,
    settings,
    spans: () =>
      Array.from(view.root.querySelectorAll<HTMLElement>(".trf-book-word")),
    current: () => view.root.querySelector<HTMLElement>("[aria-current]"),
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      constructor(callback: () => void) {
        observers.push({ callback, disconnect: this.disconnect });
      }
      observe() {}
    },
  );
});

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  observers.splice(0);
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("book captions", () => {
  it("keeps a bounded excerpt stable until its edge, including across backward seeks", () => {
    const { view, root, spans, current } = mount();
    view.update(250100);
    expect(spans()).toHaveLength(0);
    view.setActive(true);
    expect(spans()).toHaveLength(201);
    expect(spans()[0].dataset.word).toBe("150");
    expect(current()?.dataset.word).toBe("250");
    const word = current();
    view.update(251100);
    expect(spans()[100]).toBe(word);
    expect(root.querySelectorAll("[aria-current]")).toHaveLength(1);
    view.update(311100);
    expect(spans()[0].dataset.word).toBe("211");
    expect(current()?.dataset.word).toBe("311");
    view.update(10100);
    expect(spans()[0].dataset.word).toBe("0");
    expect(current()?.dataset.word).toBe("10");
    expect(spans().length).toBeLessThanOrEqual(201);
  });

  it("uses original timing, leaves gaps unmarked and keeps nearby context", () => {
    const { view, spans, current } = mount();
    view.setActive(true);
    view.update(250100);
    expect(current()?.dataset.word).toBe("250");
    const excerpt = spans()[0];
    view.update(250900);
    expect(current()).toBeNull();
    expect(spans()[0]).toBe(excerpt);
    view.update(499900);
    expect(current()).toBeNull();
    expect(spans().at(-1)?.dataset.word).toBe("499");
    view.update(-100);
    expect(current()).toBeNull();
    expect(spans()[0].dataset.word).toBe("0");
  });

  it("romanizes display in place and restores native words without changing their indices", () => {
    const source = ["um", "नमस्ते", "বাংলা"].map((text, index) => ({
      word: classify(text),
      startMs: index * 1000,
      endMs: (index + 1) * 1000,
    }));
    const { view, spans, current } = mount(source);
    view.update(1100);
    view.apply(true);
    view.setActive(true);
    const hindi = current();
    expect(spans().map((span) => span.textContent)).toEqual([
      "um",
      "namastē",
      "bāṁlā",
    ]);
    view.apply(false);
    expect(current()).toBe(hindi);
    expect(current()?.dataset.word).toBe("1");
    expect(current()?.textContent).toBe("नमस्ते");
  });

  it("moves only on a new wrapped line and recentres paused text after reflow", () => {
    const { view, root, spans } = mount(words(80));
    let columns = 10;
    let height = 120;
    let scroll = 0;
    const scrolls = vi.fn((value: number) => {
      scroll = value;
    });
    Object.defineProperty(root, "clientHeight", { get: () => height });
    Object.defineProperty(root, "scrollTop", {
      get: () => scroll,
      set: scrolls,
    });
    root.style.lineHeight = "24px";
    vi.spyOn(root, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 100, 400, height),
    );
    vi.spyOn(
      HTMLSpanElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function (this: HTMLSpanElement) {
      const first = Number(spans()[0].dataset.word);
      const row = Math.floor((Number(this.dataset.word) - first) / columns);
      const padding =
        parseFloat(root.querySelector("p")!.style.paddingBlock) || 0;
      return new DOMRect(0, 100 + padding + row * 24 - scroll, 30, 24);
    });
    view.setActive(true);
    view.update(12100);
    expect(root.scrollTop).toBe(24);
    scrolls.mockClear();
    view.update(13100);
    expect(scrolls).not.toHaveBeenCalled();
    view.update(22100);
    expect(root.scrollTop).toBe(48);
    expect(scrolls).toHaveBeenCalledOnce();
    columns = 5;
    observers[0].callback();
    expect(root.scrollTop).toBe(96);
    height = 168;
    observers[0].callback();
    expect(root.scrollTop).toBe(96);
    expect(root.querySelector("p")!.style.paddingBlock).toBe("72px");
    columns = 10;
    view.apply(false);
    expect(root.scrollTop).toBe(48);
  });

  it("pins successive words to the middle without rebuilding the paragraph", () => {
    const { view, root, spans, current } = mount(words(8));
    Object.defineProperty(root, "clientHeight", { get: () => 120 });
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 100, 400, 120),
    );
    vi.spyOn(
      HTMLSpanElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function (this: HTMLSpanElement) {
      const transform = this.style.transform;
      const offset = Number(
        transform.match(/translateX\(([-\d.]+)px\)/)?.[1] ?? 0,
      );
      return new DOMRect(Number(this.dataset.word) * 30 + offset, 148, 20, 24);
    });
    view.apply(false, true);
    view.setActive(true);
    const first = spans()[0];
    for (const index of [1, 2, 7, 0]) {
      view.update(index * 1000 + 100);
      const word = current()!.getBoundingClientRect();
      expect(word.left + word.width / 2).toBe(200);
      expect(spans()[0]).toBe(first);
      observers[0].callback();
      expect(current()!.getBoundingClientRect().left + 10).toBe(200);
    }
    view.apply(false, false);
    expect(spans().every((span) => span.style.transform === "")).toBe(true);
  });

  it("opens settings accessibly and releases its geometry observer with the session", () => {
    const { view, root, settings } = mount(words(3));
    view.setActive(true);
    root.click();
    root.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(settings).toHaveBeenCalledTimes(2);
    expect(root.getAttribute("aria-haspopup")).toBe("dialog");
    expect(root.tabIndex).toBe(0);
    view.setActive(false);
    expect(root.hidden).toBe(true);
    view.destroy();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(root.isConnected).toBe(false);
  });

  it("delegates Escape to reader controls while keeping other shortcuts local", () => {
    const { root } = mount(words(3));
    const keydown = vi.fn();
    root.parentElement!.addEventListener("keydown", keydown);
    for (const key of ["Enter", " ", "k", "ArrowRight"])
      root.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    expect(keydown).not.toHaveBeenCalled();
    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(keydown).toHaveBeenCalledOnce();
  });
});
