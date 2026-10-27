import { describe, expect, it } from "vitest";
import { importList } from "./import";

describe("learning list imports", () => {
  it("reads BOM, quoted commas, escaped quotes and multiline UTF-8 examples", () => {
    const items = importList(
      '\uFEFFterm,meaning,examples\r\n学习,"study, learn","他说""学习""\n每天学习"\r\n',
      "HSK4",
      "zh",
      "word",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      term: "学习",
      meaning: "study, learn",
      examples: '他说"学习"\n每天学习',
      language: "zh",
      datasets: ["HSK4"],
      status: "new",
    });
  });
  it("accepts TSV, plain lists and typed JSON concepts", () => {
    expect(
      importList(
        "word\tdefinition\nrouter\tDirects packets",
        "CCNA",
        "en",
        "concept",
      )[0],
    ).toMatchObject({ kind: "concept", meaning: "Directs packets" });
    expect(importList("नमस्ते\nবাংলা", "Practice", "hi", "word")).toHaveLength(
      2,
    );
    expect(
      importList(
        '[{"concept":"spanning tree","meaning":"Prevents loops","language":"en"}]',
        "CCNA",
        "und",
        "concept",
      )[0].term,
    ).toBe("spanning tree");
  });
  it("rejects bad rows as a whole and reports the row without applying partial imports", () => {
    expect(() =>
      importList('["valid", {"term": ""}]', "List", "en", "word"),
    ).toThrow("Row 2");
    expect(() =>
      importList('term,meaning\na,"unclosed', "List", "en", "word"),
    ).toThrow("quoted");
    expect(() => importList("test", "", "en", "word")).toThrow("Row 1");
  });
});
