import { languageOptions } from "./languages";
import {
  dueItems,
  EMPTY_COLLECTION,
  normalizeTerm,
  type LearningCollection,
  type LearningDraft,
  type LearningItem,
  type ItemKind,
} from "./model";
import { changeCollection, loadCollection, onCollectionChanged } from "./store";
import { importList } from "./import";
import { LearningPanel, learningDraft } from "./panel";

const element = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const make = (tag: string, text: string): HTMLElement => {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
};
let collection: LearningCollection = structuredClone(EMPTY_COLLECTION);
let preview: LearningDraft[] = [];
let previewGeneration = 0;
let revision = 0;
let activeTab = "collection";
let activeCard = "";
languageOptions(element<HTMLSelectElement>("list-language"), "en");
const panel = new LearningPanel(document.body, () => collection);
const notice = (text: string): void => {
  element("notice").textContent = text;
};
const report = (error: unknown): void =>
  notice(
    error instanceof Error
      ? error.message
      : "The operation could not be completed.",
  );
function action(
  text: string,
  run: () => Promise<void> | void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.addEventListener("click", () => {
    button.disabled = true;
    void Promise.resolve()
      .then(run)
      .catch(report)
      .finally(() => {
        button.disabled = false;
      });
  });
  return button;
}
function selectOptions(id: string, values: string[], label: string): void {
  const select = element<HTMLSelectElement>(id),
    previous = select.value;
  select.replaceChildren(
    new Option(label, ""),
    ...values.sort().map((value) => new Option(value, value)),
  );
  if (values.includes(previous)) select.value = previous;
}
function openItem(item: LearningItem): void {
  panel.open(item);
}
function render(): void {
  element("stats").textContent =
    `${collection.items.length.toLocaleString()} saved · ${Object.keys(collection.datasets).length} lists / topics · ${dueItems(collection).length} cards ready to review`;
  selectOptions(
    "language",
    [...new Set(collection.items.map((item) => item.language))],
    "All languages",
  );
  selectOptions("dataset", Object.keys(collection.datasets), "All lists");
  renderItems();
  if (activeTab === "review") renderCard();
}
function renderItems(): void {
  const query = normalizeTerm(element<HTMLInputElement>("search").value);
  const language = element<HTMLSelectElement>("language").value,
    dataset = element<HTMLSelectElement>("dataset").value,
    status = element<HTMLSelectElement>("status").value;
  const items = collection.items
    .filter(
      (item) =>
        (!language || item.language === language) &&
        (!dataset || item.datasets.includes(dataset)) &&
        (!status || item.status === status) &&
        (!query ||
          normalizeTerm(
            [item.term, item.meaning, item.examples, ...item.datasets].join(
              " ",
            ),
          ).includes(query)),
    )
    .sort((a, b) => b.updated - a.updated);
  const root = element("items");
  root.replaceChildren();
  if (!items.length) {
    const empty = make(
      "p",
      collection.items.length
        ? "No matches. Try another search or filter."
        : "Start with something you want to keep. Click a word in an article or the YouTube transcript, select a concept, import a list, or add an item here.",
    );
    empty.className = "trf-learning-empty";
    root.append(empty);
  }
  for (const item of items.slice(0, 200)) {
    const row = make("div", "");
    row.className = "trf-learning-item";
    row.style.setProperty(
      "--trf-list-color",
      collection.datasets[item.datasets[0]] ?? "#7bc5b5",
    );
    const identity = make("div", ""),
      term = action(item.term, () => openItem(item));
    term.className = "trf-learning-term";
    identity.append(
      term,
      make("small", `${item.language} · ${item.kind} · ${item.status}`),
    );
    const detail = make("div", "");
    detail.append(
      make("p", item.meaning || "Add a meaning to prepare its review card."),
      make("small", item.datasets.join(" · ") || "No list"),
    );
    const remove = action("Delete", async () => {
      if (remove.dataset.confirm !== "yes") {
        remove.dataset.confirm = "yes";
        remove.textContent = "Confirm delete";
        return;
      }
      await changeCollection({ action: "delete", id: item.id });
    });
    row.append(identity, detail, remove);
    root.append(row);
  }
  element("count").textContent =
    `${items.length.toLocaleString()} matches${items.length > 200 ? " · showing the first 200; narrow your search to see more" : ""}`;
}
function renderCard(): void {
  const due = dueItems(collection);
  const item = due.find((entry) => entry.id === activeCard) ?? due[0];
  const root = element("card");
  root.replaceChildren();
  activeCard = item?.id ?? "";
  if (!item) {
    root.append(
      make("h2", "You're up to date"),
      make(
        "p",
        "No cards are due. Add meanings to your saved words or concepts, or come back when the next review is ready.",
      ),
    );
    return;
  }
  root.append(
    make("small", `${item.language} · ${item.kind} · ${due.length} due`),
    make("h2", item.term),
  );
  const back = make("div", "");
  back.hidden = true;
  back.append(make("p", item.meaning));
  if (item.examples) back.append(make("p", item.examples));
  if (item.sources[0]?.context)
    back.append(make("blockquote", item.sources[0].context));
  const buttons = make("footer", "");
  for (const remembered of [false, true])
    buttons.append(
      action(remembered ? "Remembered" : "Again", async () => {
        await changeCollection({ action: "review", id: item.id, remembered });
        activeCard = "";
      }),
    );
  buttons.append(
    action("Known", async () => {
      await changeCollection({
        action: "save",
        draft: { ...item, status: "known" },
        id: item.id,
      });
      activeCard = "";
    }),
  );
  back.append(buttons);
  const reveal = action("Show meaning", () => {
    reveal.hidden = true;
    back.hidden = false;
  });
  root.append(
    reveal,
    back,
    action("Edit item", () => openItem(item)),
  );
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tab]"))
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab!;
    notice("");
    for (const tab of ["collection", "review", "import"])
      element(tab).hidden = tab !== activeTab;
    for (const control of document.querySelectorAll<HTMLButtonElement>(
      "[data-tab]",
    ))
      control.setAttribute("aria-pressed", String(control === button));
    if (activeTab === "review") renderCard();
  });
for (const id of ["search", "language", "dataset", "status"])
  element(id).addEventListener(
    id === "search" ? "input" : "change",
    renderItems,
  );
element("new-item").addEventListener("click", () =>
  panel.open(learningDraft("", "en")),
);
const confirmImport = element<HTMLButtonElement>("confirm-import");
element("import-form").addEventListener("input", () => {
  preview = [];
  confirmImport.disabled = true;
  element("import-preview").replaceChildren();
});
element("import-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const mine = ++previewGeneration;
  void (async () => {
    const file = element<HTMLInputElement>("list-file").files?.[0];
    if (!file || file.size > 5000000)
      throw new Error("Choose a file smaller than 5 MB.");
    const text = await file.text();
    if (mine !== previewGeneration) return;
    preview = importList(
      text,
      element<HTMLInputElement>("list-name").value,
      element<HTMLInputElement>("list-language").value,
      element<HTMLSelectElement>("list-kind").value as ItemKind,
    );
    const root = element("import-preview");
    root.replaceChildren(
      make("h2", `${preview.length} rows ready`),
      ...preview
        .slice(0, 12)
        .map((item) =>
          make("p", `${item.term} — ${item.meaning || "No meaning yet"}`),
        ),
    );
    confirmImport.textContent = `Import ${preview.length} items`;
    confirmImport.disabled = false;
    notice("");
  })().catch(report);
});
confirmImport.addEventListener("click", () => {
  confirmImport.disabled = true;
  void changeCollection({
    action: "import",
    drafts: preview,
    color: element<HTMLInputElement>("list-color").value,
  })
    .then(() => {
      notice(
        "List imported. Matching items will be highlighted in your readers.",
      );
      preview = [];
    })
    .catch((error: unknown) => {
      confirmImport.disabled = false;
      report(error);
    });
});
element("export").addEventListener("click", () => {
  const blob = new Blob(
    [
      JSON.stringify(
        { format: "glintree-learning", version: 1, ...collection },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `glintree-learning-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
element<HTMLInputElement>("restore").addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  void (async () => {
    const file = input.files?.[0];
    if (!file || file.size > 10000000)
      throw new Error("Choose a collection backup smaller than 10 MB.");
    const data: unknown = JSON.parse(await file.text());
    if (
      !data ||
      typeof data !== "object" ||
      !("format" in data) ||
      data.format !== "glintree-learning"
    )
      throw new Error("Choose a Glintree collection backup.");
    await changeCollection({ action: "restore", backup: data });
    notice("Backup merged with your collection.");
  })()
    .catch(report)
    .finally(() => {
      input.value = "";
    });
});
onCollectionChanged((next) => {
  revision++;
  collection = next;
  render();
});
void loadCollection()
  .then((next) => {
    if (revision) return;
    collection = next;
    render();
  })
  .catch(report);
