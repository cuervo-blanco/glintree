import { describe, expect, it } from "vitest";
import { classify } from "../reader-core/words";
import type { TimedWord } from "./captions";
import { readingWpm } from "./speed";

const timeline = (starts: number[]): TimedWord[] =>
  starts.map((startMs) => ({
    word: classify("word"),
    startMs,
    endMs: startMs + 200,
  }));

describe("caption reading pace", () => {
  it("follows playback speed without changing the caption timeline", () => {
    const words = timeline(
      Array.from({ length: 100 }, (_, index) => index * 200),
    );
    const before = structuredClone(words);
    expect(readingWpm(words, 50, 1)).toBe(300);
    expect(readingWpm(words, 50, 2)).toBe(600);
    expect(readingWpm(words, 50, 0.5)).toBe(150);
    expect(words).toEqual(before);
  });

  it("keeps the same estimate at the edges of a steady transcript", () => {
    const words = timeline(
      Array.from({ length: 100 }, (_, index) => index * 200),
    );
    expect(readingWpm(words, 0, 1)).toBe(300);
    expect(readingWpm(words, words.length - 1, 1)).toBe(300);
  });

  it("averages irregular word intervals instead of the current word alone", () => {
    const words = timeline([0, 100, 1000]);
    expect(readingWpm(words, 1, 1)).toBe(120);
    expect(readingWpm(words, 2, 1)).toBe(120);
  });

  it("uses nearby speech after a seek, excluding a distant pause", () => {
    const words = timeline([0, 200, 20000, 20100, 20200]);
    expect(readingWpm(words, 0, 1)).toBe(300);
    expect(readingWpm(words, 3, 1)).toBe(600);
    expect(readingWpm(words, -1, 1)).toBeNull();
  });

  it("includes pauses inside the local window but not trailing cue padding", () => {
    const words = timeline([0, 200, 4000, 4200]);
    words[3].endMs = 30000;
    expect(readingWpm(words, 1, 1)).toBe(43);
  });

  it("needs at least two distinct timed onsets", () => {
    expect(readingWpm([], 0, 1)).toBeNull();
    expect(readingWpm(timeline([1000]), 0, 1)).toBeNull();
    expect(readingWpm(timeline([1000, 1000]), 1, 1)).toBeNull();
    expect(readingWpm(timeline([1000, 20000]), 0, 1)).toBeNull();
  });

  it.each([0, -1, NaN, Infinity])(
    "rejects an invalid playback rate: %s",
    (rate) => {
      expect(readingWpm(timeline([0, 200]), 0, rate)).toBeNull();
    },
  );

  it.each([-1, 2, 0.5, NaN])(
    "returns no estimate for an unknown word: %s",
    (index) => {
      expect(readingWpm(timeline([0, 200]), index, 1)).toBeNull();
    },
  );
});
