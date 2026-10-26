// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { articleBlocks, extractArticle } from "./extraction";

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe("article extraction", () => {
  it("preserves heading levels, lists, quotes, captions and code without duplicate nested text", () => {
    const root = document.createElement("article");
    root.innerHTML =
      "<h1>Title</h1><p>First <strong>paragraph</strong>.</p><h2>Section</h2><ul><li><p>One</p><ul><li>Nested</li></ul></li><li>Two</li></ul><blockquote><p>Quote one.</p><p>Quote two.</p></blockquote><pre><code>let x = 1;\nreturn x;</code></pre><figcaption>Image caption</figcaption><nav><p>Navigation</p></nav><p hidden>Hidden</p><script>bad()</script>";
    expect(articleBlocks(root)).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "paragraph", text: "First paragraph." },
      { kind: "heading", level: 2, text: "Section" },
      { kind: "list", text: "One" },
      { kind: "list", text: "Nested" },
      { kind: "list", text: "Two" },
      { kind: "quote", text: "Quote one. Quote two." },
      { kind: "code", text: "let x = 1;\nreturn x;" },
      { kind: "caption", text: "Image caption" },
    ]);
  });

  it("finds the article rather than navigation and never changes the live document", () => {
    document.title = "A field guide to careful reading";
    const paragraph =
      "Reading a long article should preserve its structure, its headings and the words the author wrote. Paragraphs give each idea room, and clear section titles help a reader find the next topic. ";
    document.body.innerHTML = `<nav>Subscribe Log in Menu</nav><main><article><h1>A field guide to careful reading</h1><p>${paragraph.repeat(4)}</p><h2>Taking your time</h2><p>${paragraph.repeat(4)}</p><aside><p>Related stories</p></aside></article></main><footer>Contact Subscribe</footer>`;
    const original = document.body.innerHTML;
    const result = extractArticle(document);
    expect(result.article?.title).toBe(document.title);
    expect(
      result.article?.blocks.some(
        (block) =>
          block.kind === "heading" && block.text === "Taking your time",
      ),
    ).toBe(true);
    expect(
      result.article?.blocks.map((block) => block.text).join(" "),
    ).not.toMatch(/Subscribe|Related stories/);
    expect(document.body.innerHTML).toBe(original);
  });

  it("reads just the selected fragment and keeps its headings", () => {
    document.body.innerHTML =
      "<p>Outside</p><section><h2>Selected heading</h2><p>Only this paragraph.</p></section><p>Also outside</p>";
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("section")!);
    window.getSelection()!.addRange(range);
    const result = extractArticle(document, window.getSelection()!.toString());
    expect(result.article?.blocks).toEqual([
      { kind: "heading", level: 2, text: "Selected heading" },
      { kind: "paragraph", text: "Only this paragraph." },
    ]);
  });

  it("retains paragraphs when a selection has plain divs or no surviving range", () => {
    const root = document.createElement("article");
    root.innerHTML = "<div>One</div><div>Two</div>";
    expect(articleBlocks(root).map((block) => block.text)).toEqual([
      "One",
      "Two",
    ]);
    expect(extractArticle(document, "Selected words").article?.blocks).toEqual([
      { kind: "paragraph", text: "Selected words" },
    ]);
  });

  it("offers a paste fallback when the page has no text", () => {
    expect(extractArticle(document).error).toMatch(/No readable/);
  });
});
