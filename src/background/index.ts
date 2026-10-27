import { installLearningMessages } from "../learning/background";
import { articleFromText } from "../article/model";
import { forgetArticle, openArticle } from "../article/session";
import type { ArticleResult } from "../article/extraction";

installLearningMessages();

/** The toolbar opens settings; page reading is an explicit context-menu action. */
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "read-article",
      title: "Read this page with Glintree",
      contexts: ["page"],
      documentUrlPatterns: ["https://*/*", "http://*/*"],
    });
    chrome.contextMenus.create({
      id: "read-selection",
      title: "Read selected text with Glintree",
      contexts: ["selection"],
      documentUrlPatterns: ["https://*/*", "http://*/*"],
    });
  });
});

export async function readArticle(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  if (
    tab?.id === undefined ||
    !["read-article", "read-selection"].includes(String(info.menuItemId))
  )
    return;
  const selectedText =
    info.menuItemId === "read-selection" ? (info.selectionText ?? "") : "";
  if (info.menuItemId === "read-selection" && !selectedText.trim()) {
    await openArticle({
      error: "Select some text to read, or paste it below.",
    });
    return;
  }
  const target = {
    tabId: tab.id,
    frameIds: [selectedText ? (info.frameId ?? 0) : 0],
  };
  let result: ArticleResult;
  try {
    await chrome.scripting.executeScript({ target, files: ["extract.js"] });
    const extracted = await chrome.scripting.executeScript({
      target,
      args: [selectedText],
      func: (selection: string) => {
        const extract = window.trfExtractArticle;
        delete window.trfExtractArticle;
        return extract?.(selection);
      },
    });
    result = extracted[0]?.result ?? {
      error: "No readable text was found. You can paste text below.",
    };
  } catch {
    result = selectedText
      ? { article: articleFromText(selectedText, "Selected text") }
      : {
          error:
            "This page cannot be opened directly. Copy its text and paste it below.",
        };
  }
  await openArticle(result);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void readArticle(info, tab);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetArticle(tabId);
});
