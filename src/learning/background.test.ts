import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyLearningCommand, installLearningMessages } from "./background";
import {
  COLLECTION_KEY,
  EMPTY_COLLECTION,
  type LearningCollection,
} from "./model";
import { learningDraft } from "./panel";
let state: LearningCollection;
const set = vi.fn();
const listen = vi.fn();
beforeEach(() => {
  state = structuredClone(EMPTY_COLLECTION);
  set.mockReset();
  listen.mockReset();
  set.mockImplementation(async (value: Record<string, LearningCollection>) => {
    state = structuredClone(value[COLLECTION_KEY]);
  });
  vi.stubGlobal("chrome", {
    runtime: { id: "extension", onMessage: { addListener: listen } },
    storage: {
      local: {
        get: async () => ({ [COLLECTION_KEY]: structuredClone(state) }),
        set,
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("collection writes", () => {
  it("merges imported memberships and preserves personal definitions and review progress", async () => {
    await applyLearningCommand({
      action: "save",
      draft: {
        ...learningDraft("router", "en"),
        meaning: "My definition",
        datasets: ["Saved"],
      },
    });
    await applyLearningCommand({
      action: "review",
      id: state.items[0].id,
      remembered: true,
    });
    const previous = structuredClone(state.items[0]);
    await applyLearningCommand({
      action: "import",
      drafts: [
        {
          ...learningDraft("Router!", "en"),
          meaning: "A different meaning",
          datasets: ["CCNA"],
        },
      ],
      color: "#abcdef",
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      id: previous.id,
      meaning: "My definition",
      status: "learning",
      review: previous.review,
      datasets: ["Saved", "CCNA"],
    });
    expect(state.datasets.CCNA).toBe("#abcdef");
  });
  it("rejects invalid imports without writing a partial collection", async () => {
    await expect(
      applyLearningCommand({
        action: "import",
        drafts: [learningDraft("valid", "en"), {}],
        color: "#abcdef",
      }),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
    expect(state.items).toHaveLength(0);
  });
  it("serializes cross-tab messages and recovers after a failed write", async () => {
    installLearningMessages();
    const receive = listen.mock.calls[0][0] as (
      message: unknown,
      sender: { id: string },
      respond: (result: unknown) => void,
    ) => boolean;
    const send = (term: string) =>
      new Promise<unknown>((resolve) =>
        receive(
          {
            channel: "glintree-learning",
            action: "save",
            draft: learningDraft(term, "en"),
          },
          { id: "extension" },
          resolve,
        ),
      );
    set.mockRejectedValueOnce(new Error("quota exceeded"));
    expect(await send("first")).toMatchObject({ error: "quota exceeded" });
    await Promise.all([send("second"), send("third")]);
    expect(state.items.map((item) => item.term)).toEqual(["second", "third"]);
    expect(
      receive({ channel: "glintree-learning" }, { id: "other" }, vi.fn()),
    ).toBeUndefined();
  });
  it("restores sources and review dates while keeping newer local definitions", async () => {
    await applyLearningCommand({
      action: "save",
      draft: {
        ...learningDraft("term", "en", {
          title: "Source",
          url: "https://example.com",
          context: "Original sentence",
          seconds: 12,
        }),
        meaning: "original",
      },
    });
    await applyLearningCommand({
      action: "review",
      id: state.items[0].id,
      remembered: true,
    });
    const backup = {
      format: "glintree-learning",
      version: 1,
      ...structuredClone(state),
    };
    state = structuredClone(EMPTY_COLLECTION);
    await applyLearningCommand({ action: "restore", backup });
    expect(state.items[0].review).toEqual(backup.items[0].review);
    expect(state.items[0].sources).toEqual(backup.items[0].sources);
    await applyLearningCommand({
      action: "save",
      draft: { ...state.items[0], meaning: "new personal definition" },
    });
    await applyLearningCommand({ action: "restore", backup });
    expect(state.items).toHaveLength(1);
    expect(state.items[0].meaning).toBe("new personal definition");
  });
});
