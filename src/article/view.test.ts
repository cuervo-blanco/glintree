// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { articleFromText, articleWords } from "./model";
import { ArticleView } from "./view";

afterEach(() => document.body.replaceChildren());
describe("article view", () => {
  it("renders semantic blocks and source spacing without interpreting page HTML", () => {
    const root = document.createElement("article");
    document.body.append(root);
    const article = articleFromText(
      "# Heading\n\nText <img/src=x/onerror=bad()>\n\n- Item\n> Quote\n```\nx = 1\n  y = 2\n```",
    );
    new ArticleView(root, article, articleWords(article));
    expect(root.querySelector("h1")?.textContent).toBe("Heading");
    expect(root.querySelector("ul > li")?.textContent).toBe("Item");
    expect(root.querySelector("blockquote")?.textContent).toBe("Quote");
    expect(root.querySelector("pre")?.textContent).toBe("x = 1\n  y = 2");
    expect(root.querySelector("img,script")).toBeNull();
    expect(root.textContent).toContain("<img/src=x/onerror=bad()>");
  });

  it("romanizes in place and keeps one active source index", () => {
    const root = document.createElement("article");
    const article = articleFromText("नमस्ते বাংলা");
    const view = new ArticleView(root, article, articleWords(article));
    const first = view.show(0);
    view.apply(true);
    expect(view.show(0)).toBe(first);
    expect(first?.textContent).toBe("namastē");
    view.show(1);
    expect(root.querySelectorAll("[aria-current]")).toHaveLength(1);
    expect(first?.hasAttribute("aria-current")).toBe(false);
    expect(root.querySelector("[aria-current]")?.textContent).toBe("bāṁlā");
    view.apply(false);
    expect(first?.textContent).toBe("नमस्ते");
  });
});
