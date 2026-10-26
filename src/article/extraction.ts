import { Readability } from "@mozilla/readability";
import {
  articleFromText,
  type ArticleBlock,
  type ArticleDocument,
} from "./model";

export type ArticleResult =
  | { article: ArticleDocument; error?: never }
  | { error: string; article?: never };

const BLOCKS = "h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption";

export function articleBlocks(root: HTMLElement): ArticleBlock[] {
  root
    .querySelectorAll(
      "script,style,noscript,nav,aside,footer,form,button,[hidden],[aria-hidden='true']",
    )
    .forEach((element) => element.remove());
  const blocks: ArticleBlock[] = [];
  for (const node of root.querySelectorAll<HTMLElement>(BLOCKS)) {
    if (node.parentElement?.closest("blockquote,pre")) continue;
    if (node.tagName === "P" && node.closest("li")) continue;
    const copy = node.cloneNode(true) as HTMLElement;
    if (node.tagName === "LI")
      copy.querySelectorAll("ul,ol").forEach((list) => list.remove());
    copy.querySelectorAll("br").forEach((line) => line.replaceWith("\n"));
    copy.querySelectorAll("p,div").forEach((line) => line.append("\n\n"));
    const text =
      node.tagName === "PRE"
        ? copy.textContent?.trim()
        : copy.textContent?.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const heading = /^H([1-6])$/.exec(node.tagName);
    blocks.push({
      kind: heading
        ? "heading"
        : node.tagName === "LI"
          ? "list"
          : node.tagName === "BLOCKQUOTE"
            ? "quote"
            : node.tagName === "PRE"
              ? "code"
              : node.tagName === "FIGCAPTION"
                ? "caption"
                : "paragraph",
      text,
      ...(heading ? { level: Number(heading[1]) } : {}),
    });
  }
  if (!blocks.length && root.textContent?.trim()) {
    root.querySelectorAll("br").forEach((line) => line.replaceWith("\n"));
    root.querySelectorAll("div").forEach((line) => line.append("\n\n"));
    return articleFromText(root.textContent ?? "").blocks;
  }
  return blocks;
}

export function extractArticle(
  document: Document,
  selectedText = "",
): ArticleResult {
  try {
    let root: HTMLElement;
    let title = document.title || "Article";
    let byline = "";
    let language = document.documentElement.lang;
    if (selectedText) {
      root = document.createElement("article");
      const selection = document.defaultView?.getSelection();
      if (selection && !selection.isCollapsed) {
        for (let index = 0; index < selection.rangeCount; index += 1)
          root.append(selection.getRangeAt(index).cloneContents());
      } else root.textContent = selectedText;
    } else {
      // Readability changes its input. The live page must remain untouched.
      const clone = document.cloneNode(true) as Document;
      clone
        .querySelectorAll("[hidden],[aria-hidden='true']")
        .forEach((node) => node.remove());
      const parsed = new Readability(clone, { charThreshold: 200 }).parse();
      if (parsed?.content) {
        root = document.createElement("article");
        const content = new DOMParser().parseFromString(
          parsed.content,
          "text/html",
        );
        root.append(...content.body.childNodes);
        title = parsed.title || title;
        byline = parsed.byline || "";
        language = parsed.lang || language;
      } else {
        const main = document.querySelector<HTMLElement>(
          "article,main,[role='main']",
        );
        if (!main)
          return {
            error:
              "No readable article was found. Select the text you want to read, or paste it below.",
          };
        root = main.cloneNode(true) as HTMLElement;
      }
    }
    const blocks = articleBlocks(root);
    if (!blocks.length)
      return { error: "No readable text was found. You can paste text below." };
    if (!selectedText) {
      if (blocks[0].kind === "heading" && blocks[0].text === title)
        blocks[0].level = 1;
      else blocks.unshift({ kind: "heading", level: 1, text: title });
    }
    if (
      blocks.reduce((total, block) => total + block.text.length, 0) > 1_000_000
    )
      return {
        error:
          "This page is too long to open at once. Select a section and read that instead.",
      };
    return { article: { title, url: document.URL, byline, language, blocks } };
  } catch {
    return {
      error:
        "This page could not be opened in the reader. Select some text, or paste it below.",
    };
  }
}
