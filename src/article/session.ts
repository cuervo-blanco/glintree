import type { ArticleResult } from "./extraction";

const articleKey = (id: string) => `article:${id}`;
const tabKey = (id: number) => `article-tab:${id}`;
const positionKey = (id: string) => `article-position:${id}`;

export async function loadPosition(id: string): Promise<number> {
  const value: unknown = (await chrome.storage.session.get(positionKey(id)))[
    positionKey(id)
  ];
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

export function savePosition(id: string, index: number): Promise<void> {
  return chrome.storage.session.set({ [positionKey(id)]: index });
}

export async function saveArticle(
  id: string,
  result: ArticleResult,
  tabId?: number,
): Promise<void> {
  const previous: unknown =
    tabId === undefined
      ? undefined
      : (await chrome.storage.session.get(tabKey(tabId)))[tabKey(tabId)];
  await chrome.storage.session.set({
    [articleKey(id)]: result,
    ...(tabId === undefined ? {} : { [tabKey(tabId)]: id }),
  });
  if (typeof previous === "string" && previous !== id)
    await chrome.storage.session.remove([
      articleKey(previous),
      positionKey(previous),
    ]);
}

export async function loadArticle(
  id: string,
): Promise<ArticleResult | undefined> {
  return (await chrome.storage.session.get(articleKey(id)))[articleKey(id)] as
    ArticleResult | undefined;
}

export async function openArticle(result: ArticleResult): Promise<void> {
  const id = crypto.randomUUID();
  await saveArticle(id, result);
  try {
    const tab = await chrome.tabs.create({
      url: `${chrome.runtime.getURL("article.html")}?id=${id}`,
    });
    if (tab.id !== undefined)
      await chrome.storage.session.set({ [tabKey(tab.id)]: id });
  } catch (error) {
    await chrome.storage.session.remove(articleKey(id));
    throw error;
  }
}

export async function forgetArticle(tabId: number): Promise<void> {
  const id: unknown = (await chrome.storage.session.get(tabKey(tabId)))[
    tabKey(tabId)
  ];
  if (typeof id === "string")
    await chrome.storage.session.remove([
      articleKey(id),
      positionKey(id),
      tabKey(tabId),
    ]);
}
