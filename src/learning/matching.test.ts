// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { EMPTY_COLLECTION, CollectionEditor } from "./model";
import { learningDraft } from "./panel";
import { matchLearningWords, paintLearningWords } from "./matching";

describe("learning highlights", () => {
  it("prefers whole phrases and handles segmented Han without matching inside unrelated words", () => {
    const state = structuredClone(EMPTY_COLLECTION);
    new CollectionEditor(state).save(learningDraft("tree", "en"));
    const concept = new CollectionEditor(state).save({
      ...learningDraft("spanning tree", "und"),
      kind: "concept",
    });
    const matches = matchLearningWords(
      ["spanning", "tree,", "trees", "tree"],
      "en",
      state,
    );
    expect(matches.get(0)?.id).toBe(concept.id);
    expect(matches.get(1)?.id).toBe(concept.id);
    expect(matches.has(2)).toBe(false);
    new CollectionEditor(state).save(learningDraft("图书馆", "zh"));
    expect(
      matchLearningWords(["去", "图书", "馆。"], "zh", state).get(1)?.term,
    ).toBe("图书馆");
    expect(matchLearningWords(["tree"], "fr", state).size).toBe(0);
  });
  it("changes only decoration metadata and clears obsolete highlights", () => {
    const root = document.createElement("p");
    root.innerHTML =
      '<span data-word="0"><b>routing</b></span> <span data-word="1">works</span>';
    const state = structuredClone(EMPTY_COLLECTION);
    new CollectionEditor(state).save({
      ...learningDraft("routing", "en"),
      status: "learning",
      datasets: ["CCNA"],
    });
    const children = [...root.firstElementChild!.childNodes];
    paintLearningWords(root, ["routing", "works"], "en", state);
    expect(root.firstElementChild?.getAttribute("data-learning-status")).toBe(
      "learning",
    );
    expect([...root.firstElementChild!.childNodes]).toEqual(children);
    paintLearningWords(root, ["routing", "works"], "fr", state);
    expect(root.querySelector("[data-learning-status]")).toBeNull();
    expect(root.textContent).toBe("routing works");
  });
});
