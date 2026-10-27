import {
  COLLECTION_KEY,
  CollectionEditor,
  reviewItem,
  validateDraft,
} from "./model";
import { loadCollection } from "./store";

// One writer prevents imports and saves in different tabs from losing each other.
let pending: Promise<unknown> = Promise.resolve();
export async function applyLearningCommand(
  value: unknown,
): Promise<{ id?: string }> {
  if (!value || typeof value !== "object")
    throw new Error("Invalid learning request.");
  const command = value as Record<string, unknown>;
  const collection = await loadCollection();
  const editor = new CollectionEditor(collection);
  let savedId: string | undefined;
  switch (command.action) {
    case "save":
      savedId = editor.save(
        validateDraft(command.draft),
        Date.now(),
        typeof command.id === "string" ? command.id : undefined,
      ).id;
      break;
    case "import": {
      if (
        !Array.isArray(command.drafts) ||
        !command.drafts.length ||
        command.drafts.length > 10000
      )
        throw new Error("Import at most 10,000 rows at a time.");
      if (
        typeof command.color !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(command.color)
      )
        throw new Error("Choose a list color.");
      const drafts = command.drafts.map(validateDraft);
      for (const draft of drafts) {
        const previous = editor.find(draft);
        editor.save(
          previous
            ? {
                ...draft,
                meaning: previous.meaning || draft.meaning,
                examples: previous.examples || draft.examples,
                status: previous.status,
                datasets: [
                  ...new Set([...previous.datasets, ...draft.datasets]),
                ],
              }
            : draft,
        );
        for (const name of draft.datasets)
          collection.datasets[name] = command.color;
      }
      break;
    }
    case "review": {
      const item = collection.items.find((entry) => entry.id === command.id);
      if (!item || typeof command.remembered !== "boolean")
        throw new Error("The review card no longer exists.");
      reviewItem(item, command.remembered);
      break;
    }
    case "restore": {
      const backup = command.backup;
      if (
        !backup ||
        typeof backup !== "object" ||
        !("format" in backup) ||
        backup.format !== "glintree-learning" ||
        !("version" in backup) ||
        backup.version !== 1 ||
        !("items" in backup) ||
        !Array.isArray(backup.items) ||
        backup.items.length > 50000
      )
        throw new Error(
          "Choose a valid version 1 collection backup with at most 50,000 items.",
        );
      for (const entry of backup.items) {
        if (!entry || typeof entry !== "object")
          throw new Error("Invalid backup item.");
        const record = entry as Record<string, unknown>;
        const draft = validateDraft(entry);
        const previous = editor.find(draft);
        const item = editor.save(
          previous
            ? {
                ...previous,
                datasets: [
                  ...new Set([...previous.datasets, ...draft.datasets]),
                ],
              }
            : draft,
        );
        if (!record.review || typeof record.review !== "object")
          throw new Error("Invalid review history.");
        const review = record.review as Record<string, unknown>;
        for (const value of [
          record.created,
          record.updated,
          review.due,
          review.interval,
          review.repetitions,
        ]) {
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
            throw new Error("Invalid review history.");
        }
        if (!previous) {
          item.created = record.created as number;
          item.updated = record.updated as number;
          item.review = {
            due: review.due as number,
            interval: Math.min(180, review.interval as number),
            repetitions: review.repetitions as number,
          };
        }
        if (!Array.isArray(record.sources) || record.sources.length > 5)
          throw new Error("Invalid source history.");
        const sources = record.sources.map(
          (source) => validateDraft({ ...draft, source }).source!,
        );
        item.sources = [...item.sources, ...sources]
          .filter(
            (source, index, all) =>
              all.findIndex(
                (candidate) =>
                  candidate.url === source.url &&
                  candidate.context === source.context &&
                  candidate.seconds === source.seconds,
              ) === index,
          )
          .slice(-5);
      }
      if (
        "datasets" in backup &&
        backup.datasets &&
        typeof backup.datasets === "object"
      ) {
        for (const [name, color] of Object.entries(backup.datasets))
          if (
            Object.hasOwn(collection.datasets, name) &&
            typeof color === "string" &&
            /^#[0-9a-f]{6}$/i.test(color)
          )
            collection.datasets[name] = color;
      }
      break;
    }
    case "delete":
      collection.items = collection.items.filter(
        (item) => item.id !== command.id,
      );
      break;
    default:
      throw new Error("Unknown learning action.");
  }
  await chrome.storage.local.set({ [COLLECTION_KEY]: collection });
  return { id: savedId };
}
export function installLearningMessages(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      !message ||
      typeof message !== "object" ||
      !("channel" in message) ||
      message.channel !== "glintree-learning"
    )
      return;
    if (sender.id !== chrome.runtime.id) return;
    const operation = pending.then(() => applyLearningCommand(message));
    pending = operation.catch(() => undefined);
    void operation.then(
      (result) => respond(result),
      (error: unknown) =>
        respond({
          error:
            error instanceof Error
              ? error.message
              : "The collection could not be saved.",
        }),
    );
    return true;
  });
}
