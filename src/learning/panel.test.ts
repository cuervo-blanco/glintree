// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningPanel, learningDraft } from "./panel";
import { EMPTY_COLLECTION } from "./model";
import { selectedWords } from "./reader";
const send = vi.fn();
beforeEach(() => {
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: send,
    },
  });
  send.mockReset().mockResolvedValue({ id: "saved" });
});
afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
  vi.unstubAllGlobals();
});
describe("word and concept capture", () => {
  it("renders source text safely, retains native spelling, and uses the saved identity for edits", async () => {
    const panel = new LearningPanel(document.body, () =>
      structuredClone(EMPTY_COLLECTION),
    );
    panel.open(
      learningDraft("नमस्ते", "hi", {
        title: "Test",
        url: "https://www.youtube.com/watch?v=abc",
        seconds: 42.8,
        context: "<img src=x onerror=alert(1)>",
      }),
    );
    expect(panel.root.querySelector("img")).toBeNull();
    expect(panel.root.querySelector("blockquote")?.textContent).toContain(
      "<img",
    );
    expect(
      panel.root.querySelector<HTMLAnchorElement>("[data-source]")!.href,
    ).toContain("t=42s");
    const form = panel.root.querySelector("form")!;
    (form.elements.namedItem("meaning") as HTMLTextAreaElement).value =
      "greeting";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0][0].draft.term).toBe("नमस्ते");
    await vi.waitFor(() =>
      expect(panel.root.querySelector("[data-notice]")?.textContent).toContain(
        "Saved locally",
      ),
    );
    (form.elements.namedItem("term") as HTMLInputElement).value = "नमस्कार";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0].id).toBe("saved");
    panel.destroy();
    expect(document.body.classList.contains("trf-learning-open")).toBe(false);
  });
  it("captures multiword selections only inside the source reader", () => {
    const root = document.createElement("p");
    root.innerHTML =
      '<span data-word="0">spanning</span> <span data-word="1">tree</span> <span data-word="2">protocol</span>';
    document.body.append(root);
    const range = document.createRange();
    range.setStart(root.firstElementChild!.firstChild!, 0);
    range.setEnd(root.children[1].firstChild!, 4);
    window.getSelection()!.addRange(range);
    expect(selectedWords(root)).toEqual({
      text: "spanning tree",
      start: 0,
      end: 1,
    });
    expect(selectedWords(document.createElement("div"))).toBeNull();
  });
});
