import {
  COLLECTION_KEY,
  EMPTY_COLLECTION,
  type LearningCollection,
  type LearningDraft,
} from "./model";

export type LearningCommand =
  | { action: "save"; draft: LearningDraft; id?: string }
  | { action: "import"; drafts: LearningDraft[]; color: string }
  | { action: "review"; id: string; remembered: boolean }
  | { action: "delete"; id: string }
  | { action: "restore"; backup: unknown };
export async function loadCollection(): Promise<LearningCollection> {
  const stored = (await chrome.storage.local.get(COLLECTION_KEY))[
    COLLECTION_KEY
  ];
  return stored ?? structuredClone(EMPTY_COLLECTION);
}
export async function changeCollection(
  command: LearningCommand,
): Promise<{ id?: string }> {
  const result: { error?: string; id?: string } | undefined =
    await chrome.runtime.sendMessage({
      channel: "glintree-learning",
      ...command,
    });
  if (!result)
    throw new Error("Reload the extension to connect the learning collection.");
  if (result.error) throw new Error(result.error);
  return result;
}
export function onCollectionChanged(
  callback: (collection: LearningCollection) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area === "local" && changes[COLLECTION_KEY])
      callback(
        changes[COLLECTION_KEY].newValue ?? structuredClone(EMPTY_COLLECTION),
      );
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
