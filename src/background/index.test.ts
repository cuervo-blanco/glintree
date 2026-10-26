import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleFromText } from "../article/model";

const { open, forget } = vi.hoisted(() => ({
  open: vi.fn().mockResolvedValue(undefined),
  forget: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../article/session", () => ({
  openArticle: open,
  forgetArticle: forget,
}));
const installed = vi.fn(),
  clicked = vi.fn(),
  removed = vi.fn(),
  action = vi.fn();
const create = vi.fn(),
  execute = vi.fn(),
  options = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("chrome", {
    action: { onClicked: { addListener: action } },
    runtime: {
      onInstalled: { addListener: installed },
      openOptionsPage: options,
    },
    contextMenus: {
      create,
      removeAll: (done: () => void) => done(),
      onClicked: { addListener: clicked },
    },
    tabs: { onRemoved: { addListener: removed } },
    scripting: { executeScript: execute },
  });
});
afterEach(() => vi.unstubAllGlobals());
const tab = { id: 42 } as chrome.tabs.Tab;

describe("article entry points", () => {
  it("registers explicit page and selection actions while the toolbar still opens settings", async () => {
    await import("./index");
    installed.mock.calls[0][0]();
    expect(create.mock.calls.map(([item]) => item.id)).toEqual([
      "read-article",
      "read-selection",
    ]);
    expect(create.mock.calls[0][0].contexts).toEqual(["page"]);
    expect(create.mock.calls[1][0].contexts).toEqual(["selection"]);
    action.mock.calls[0][0]();
    expect(options).toHaveBeenCalledOnce();
    removed.mock.calls[0][0](42);
    expect(forget).toHaveBeenCalledWith(42);
  });

  it("injects into the chosen tab, hands off structured content, and clears its temporary global", async () => {
    const result = { article: articleFromText("Structured text") };
    execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ result }]);
    const { readArticle } = await import("./index");
    await readArticle(
      {
        menuItemId: "read-article",
        editable: false,
        pageUrl: "https://example.com/article",
      },
      tab,
    );
    expect(execute.mock.calls[0][0]).toEqual({
      target: { tabId: 42, frameIds: [0] },
      files: ["extract.js"],
    });
    expect(open).toHaveBeenCalledExactlyOnceWith(result);
    const extract = vi.fn().mockReturnValue(result);
    const isolated: { trfExtractArticle?: typeof extract } = {
      trfExtractArticle: extract,
    };
    vi.stubGlobal("window", isolated);
    expect(execute.mock.calls[1][0].func("selection")).toEqual(result);
    expect(extract).toHaveBeenCalledWith("selection");
    expect(isolated.trfExtractArticle).toBeUndefined();
  });

  it("uses selected text even when an embedded frame cannot be injected", async () => {
    execute.mockRejectedValue(new Error("restricted frame"));
    const { readArticle } = await import("./index");
    await readArticle(
      {
        menuItemId: "read-selection",
        editable: false,
        pageUrl: "https://example.com/article",
        selectionText: "Chosen words",
        frameId: 3,
      },
      tab,
    );
    expect(execute.mock.calls[0][0].target.frameIds).toEqual([3]);
    expect(open.mock.calls[0][0].article.blocks).toEqual([
      { kind: "paragraph", text: "Chosen words" },
    ]);
  });

  it("offers a paste fallback on restricted pages and ignores unrelated actions", async () => {
    execute.mockRejectedValue(new Error("restricted"));
    const { readArticle } = await import("./index");
    await readArticle(
      {
        menuItemId: "read-article",
        editable: false,
        pageUrl: "https://example.com/article",
      },
      undefined,
    );
    await readArticle(
      {
        menuItemId: "unrelated",
        editable: false,
        pageUrl: "https://example.com/article",
      },
      tab,
    );
    expect(open).not.toHaveBeenCalled();
    await readArticle(
      {
        menuItemId: "read-article",
        editable: false,
        pageUrl: "https://example.com/article",
      },
      tab,
    );
    expect(open.mock.calls[0][0].error).toContain("paste");
  });

  it("never reads the whole page when a selected-text action has no text", async () => {
    const { readArticle } = await import("./index");
    await readArticle(
      {
        menuItemId: "read-selection",
        editable: false,
        pageUrl: "https://example.com/article",
      },
      tab,
    );
    expect(execute).not.toHaveBeenCalled();
    expect(open.mock.calls[0][0].error).toContain("Select some text");
  });
});
