import { classify, type Word } from "../reader-core/words";

export type BlockKind =
  "heading" | "paragraph" | "list" | "quote" | "code" | "caption";

export interface ArticleBlock {
  kind: BlockKind;
  text: string;
  level?: number;
}

export interface ArticleDocument {
  title: string;
  url: string;
  byline: string;
  language: string;
  blocks: ArticleBlock[];
}

export interface ArticleWord {
  word: Word;
  block: number;
  start: number;
  end: number;
  last: boolean;
}

const chinese = new Intl.Segmenter("zh-Hans", { granularity: "word" });

export function articleWords(article: ArticleDocument): ArticleWord[] {
  const words: ArticleWord[] = [];
  for (const [block, { text }] of article.blocks.entries()) {
    const first = words.length;
    for (const match of text.matchAll(/\S+/gu)) {
      const chunk = match[0];
      const boundaries = [0];
      if (/\p{Script=Han}/u.test(chunk)) {
        let seen = false;
        for (const part of chinese.segment(chunk)) {
          if (part.isWordLike && seen) boundaries.push(part.index);
          if (part.isWordLike) seen = true;
        }
      }
      boundaries.push(chunk.length);
      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const start = match.index + boundaries[index];
        const end = match.index + boundaries[index + 1];
        const word = classify(text.slice(start, end));
        word.endsSentence ||= /[。！？।॥]["'”’)\]]*$/u.test(word.text);
        word.endsClause ||= /[，、；：]["'”’)\]]*$/u.test(word.text);
        words.push({ word, block, start, end, last: false });
      }
    }
    if (words.length > first) words[words.length - 1].last = true;
  }
  return words;
}

export function articleFromText(
  text: string,
  title = "Pasted text",
): ArticleDocument {
  const blocks: ArticleBlock[] = [];
  let paragraph: string[] = [];
  let code: string[] | null = null;
  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) {
      flush();
      if (code) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = null;
      } else code = [];
    } else if (code) code.push(line);
    else if (!line.trim()) flush();
    else {
      const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
      const list = line.match(/^\s*(?:[-*+] |\d+[.)] )(.+)$/);
      const quote = line.match(/^\s*>\s?(.*)$/);
      if (heading || list || quote) {
        flush();
        blocks.push(
          heading
            ? { kind: "heading", level: heading[1].length, text: heading[2] }
            : { kind: list ? "list" : "quote", text: (list ?? quote)![1] },
        );
      } else paragraph.push(line.trim());
    }
  }
  flush();
  if (code?.length) blocks.push({ kind: "code", text: code.join("\n") });
  return {
    title,
    url: "",
    byline: "",
    language: "",
    blocks: blocks.filter((block) => block.text.trim()),
  };
}
