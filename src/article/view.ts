import { romanize } from "../content/romanize";
import type { ArticleDocument, ArticleWord, BlockKind } from "./model";

const BLOCK_TAGS: Record<BlockKind, string> = {
  heading: "h2",
  paragraph: "p",
  list: "li",
  quote: "blockquote",
  code: "pre",
  caption: "p",
};

export class ArticleView {
  private spans: HTMLSpanElement[] = [];
  private current = -1;
  private romanized: boolean | null = null;

  constructor(
    root: HTMLElement,
    article: ArticleDocument,
    private words: ArticleWord[],
  ) {
    const nodes = article.blocks.map((block) => {
      const tag =
        block.kind === "heading"
          ? `h${Math.max(1, Math.min(6, block.level ?? 2))}`
          : BLOCK_TAGS[block.kind];
      const node = document.createElement(tag);
      node.dataset.kind = block.kind;
      return node;
    });
    const ends = article.blocks.map(() => 0);
    for (const [index, word] of words.entries()) {
      const node = nodes[word.block];
      const span = document.createElement("span");
      span.className = "trf-article-word";
      span.dataset.word = String(index);
      node.append(
        article.blocks[word.block].text.slice(ends[word.block], word.start),
        span,
      );
      this.spans.push(span);
      ends[word.block] = word.end;
    }
    const content = document.createDocumentFragment();
    let list: HTMLUListElement | null = null;
    for (const [index, node] of nodes.entries()) {
      node.append(article.blocks[index].text.slice(ends[index]));
      if (article.blocks[index].kind === "list") {
        if (!list) {
          list = document.createElement("ul");
          content.append(list);
        }
        list.append(node);
      } else {
        list = null;
        content.append(node);
      }
    }
    root.replaceChildren(content);
    this.apply(false);
  }

  apply(romanized: boolean): void {
    if (this.romanized === romanized) return;
    this.romanized = romanized;
    for (const [index, span] of this.spans.entries())
      span.textContent = romanized
        ? romanize(this.words[index].word.text)
        : this.words[index].word.text;
  }

  show(index: number): HTMLElement | undefined {
    if (index !== this.current) {
      this.spans[this.current]?.classList.remove("trf-article-current");
      this.spans[this.current]?.removeAttribute("aria-current");
      this.current = index;
      this.spans[index]?.classList.add("trf-article-current");
      this.spans[index]?.setAttribute("aria-current", "true");
    }
    return this.spans[index];
  }
}
