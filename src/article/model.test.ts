import { describe, expect, it } from "vitest";
import { articleFromText, articleWords } from "./model";

describe("text documents", () => {
  it("recognizes pasted heading levels, paragraphs, lists, quotes and code", () => {
    const article = articleFromText(
      "# Title\n\nFirst line\ncontinued.\n\n## Section\n- Item one\n2. Item two\n> A quote\n```\nconst x = 1;\n  x++;\n```",
      "My article",
    );
    expect(article.title).toBe("My article");
    expect(article.blocks).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "paragraph", text: "First line continued." },
      { kind: "heading", level: 2, text: "Section" },
      { kind: "list", text: "Item one" },
      { kind: "list", text: "Item two" },
      { kind: "quote", text: "A quote" },
      { kind: "code", text: "const x = 1;\n  x++;" },
    ]);
  });

  it("maps words to exact source ranges and retains punctuation and block boundaries", () => {
    const article = articleFromText(
      "Hello,  reader!\n\nनमस्ते दुनिया।\n\nবাংলা পড়ি।\n\n中文没有空格。Next",
    );
    const words = articleWords(article);
    for (const entry of words)
      expect(
        article.blocks[entry.block].text.slice(entry.start, entry.end),
      ).toBe(entry.word.text);
    expect(words.filter((word) => word.last)).toHaveLength(4);
    expect(
      words.find(({ word }) => word.text === "दुनिया।")?.word.endsSentence,
    ).toBe(true);
    expect(
      words.find(({ word }) => word.text === "পড়ি।")?.word.endsSentence,
    ).toBe(true);
    expect(
      words.some(({ word }) => word.text.endsWith("。") && word.endsSentence),
    ).toBe(true);
    expect(words.filter((word) => word.block === 3).length).toBeGreaterThan(2);
    expect(
      words
        .filter((word) => word.block === 3)
        .map(({ word }) => word.text)
        .join(""),
    ).toBe("中文没有空格。Next");
  });

  it("does not invent text from an empty paste or drop an unclosed code block", () => {
    expect(articleWords(articleFromText(" \n\n"))).toEqual([]);
    expect(articleFromText("```\ncode").blocks).toEqual([
      { kind: "code", text: "code" },
    ]);
  });
});
