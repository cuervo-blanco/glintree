import { describe, expect, it } from "vitest";
import {
  dueItems,
  EMPTY_COLLECTION,
  itemKey,
  reviewItem,
  CollectionEditor,
  validateDraft,
} from "./model";
import { learningDraft } from "./panel";

const collection = () => structuredClone(EMPTY_COLLECTION);
describe("learning collection", () => {
  it("keeps language and concept identity separate while normalizing display punctuation", () => {
    expect(itemKey(learningDraft("‘Bonjour!’", "fr-FR"))).toBe(
      itemKey(learningDraft("bonjour", "fr")),
    );
    expect(itemKey(learningDraft("pain", "en"))).not.toBe(
      itemKey(learningDraft("pain", "fr")),
    );
    expect(validateDraft(learningDraft("C++", "en")).term).toBe("C++");
    expect(() =>
      validateDraft({ ...learningDraft("test", "en"), status: "finished" }),
    ).toThrow();
    expect(() => validateDraft(learningDraft("test", "English"))).toThrow(
      "language code",
    );
  });
  it("updates an existing entry and its source history without creating duplicate cards", () => {
    const state = collection();
    const first = new CollectionEditor(state).save(
      {
        ...learningDraft("routing", "en", {
          title: "Networks",
          url: "https://example.com",
          context: "A routing protocol",
        }),
        meaning: "Choosing a path",
        datasets: ["CCNA"],
      },
      100,
    );
    reviewItem(first, true, 200);
    const review = { ...first.review };
    const second = new CollectionEditor(state).save(
      {
        ...first,
        term: "Routing!",
        meaning: "Finding a network path",
        source: {
          title: "Video",
          url: "https://youtube.com/watch?v=abc",
          context: "Dynamic routing",
          seconds: 42,
        },
      },
      300,
    );
    expect(state.items).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.review).toEqual(review);
    expect(second.sources).toHaveLength(2);
    expect(state.datasets.CCNA).toMatch(/^#/);
    new CollectionEditor(state).save(
      { ...second, term: "route selection" },
      400,
      second.id,
    );
    expect(state.items).toHaveLength(1);
    expect(state.items[0].term).toBe("route selection");
    expect(() =>
      new CollectionEditor(state).save(
        learningDraft("new", "en"),
        500,
        "deleted",
      ),
    ).toThrow("deleted");
  });
  it("never schedules blank or known cards, and spaces recall with an explicit retry interval", () => {
    const state = collection();
    const card = new CollectionEditor(state).save(
      { ...learningDraft("学习", "zh"), meaning: "to study" },
      100,
    );
    new CollectionEditor(state).save(learningDraft("school", "en"), 100);
    expect(dueItems(state, 100)).toEqual([card]);
    reviewItem(card, true, 100);
    expect(card.review.due).toBe(86400100);
    reviewItem(card, true, 200);
    expect(card.review.interval).toBe(2);
    reviewItem(card, false, 300);
    expect(card.review.due).toBe(600300);
    expect(dueItems(state, 600299)).toHaveLength(0);
    card.status = "known";
    expect(dueItems(state, 1e12)).toHaveLength(0);
  });
  it("limits persisted context and rejects invalid URLs and dataset types safely", () => {
    const draft = validateDraft({
      ...learningDraft("term", "en"),
      source: {
        title: "x",
        url: "javascript:alert(1)",
        context: "x".repeat(4000),
      },
      datasets: ["__proto__"],
    });
    expect(draft.source?.url).toBe("");
    expect(draft.source?.context).toHaveLength(3000);
    const state = collection();
    new CollectionEditor(state).save(draft);
    expect(Object.hasOwn(state.datasets, "__proto__")).toBe(true);
    expect(() => validateDraft({ ...draft, datasets: [42] })).toThrow();
  });
});
