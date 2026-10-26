import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleFromText } from "./model";
import {
  forgetArticle,
  loadArticle,
  loadPosition,
  openArticle,
  saveArticle,
  savePosition,
} from "./session";

let data: Record<string, unknown>;
const create = vi.fn();
beforeEach(() => {
  data = {};
  create.mockReset().mockResolvedValue({ id: 17 });
  vi.stubGlobal("chrome", {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    tabs: { create },
    storage: {
      session: {
        get: async (key: string) => ({ [key]: data[key] }),
        set: async (value: Record<string, unknown>) => {
          Object.assign(data, value);
        },
        remove: async (keys: string | string[]) => {
          for (const key of [keys].flat()) delete data[key];
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("temporary article sessions", () => {
  it("hands a document to a reader tab and removes it with that tab", async () => {
    const result = { article: articleFromText("A private article") };
    await openArticle(result);
    const url = new URL(create.mock.calls[0][0].url);
    const id = url.searchParams.get("id")!;
    expect(await loadArticle(id)).toEqual(result);
    await savePosition(id, 3);
    expect(await loadPosition(id)).toBe(3);
    await forgetArticle(17);
    expect(await loadArticle(id)).toBeUndefined();
    expect(await loadPosition(id)).toBe(0);
    expect(data).toEqual({});
  });

  it("replaces pasted text without retaining the previous article or its position", async () => {
    await saveArticle("old", { article: articleFromText("Old") }, 17);
    await savePosition("old", 2);
    await saveArticle("new", { article: articleFromText("New") }, 17);
    expect(await loadArticle("old")).toBeUndefined();
    expect(await loadPosition("old")).toBe(0);
    expect((await loadArticle("new"))?.article?.blocks[0].text).toBe("New");
  });

  it("cleans up a document when opening its tab fails", async () => {
    create.mockRejectedValue(new Error("tab unavailable"));
    await expect(
      openArticle({ article: articleFromText("Text") }),
    ).rejects.toThrow("tab unavailable");
    expect(data).toEqual({});
  });
});
