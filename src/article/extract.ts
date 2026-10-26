import { extractArticle, type ArticleResult } from "./extraction";

declare global {
  interface Window {
    trfExtractArticle?: (selectedText: string) => ArticleResult;
  }
}

window.trfExtractArticle = (selectedText) =>
  extractArticle(document, selectedText);
