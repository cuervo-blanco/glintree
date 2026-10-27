import { languageOptions } from "../learning/languages";
import { LearningReader, selectedWords } from "../learning/reader";
import { ReaderOverlay } from "../content/overlay";
import {
  FONT_LABELS,
  FONT_STACKS,
  type ReaderFont,
} from "../reader-core/fonts";
import { loadSettings, onSettingsChanged, type Settings } from "../settings";
import {
  articleFromText,
  articleWords,
  type ArticleDocument,
  type ArticleWord,
} from "./model";
import {
  ARTICLE_DEFAULTS,
  articlePreferences,
  type ArticlePreferences,
} from "./preferences";
import { ArticlePlayback } from "./playback";
import {
  loadArticle,
  loadPosition,
  saveArticle,
  savePosition,
} from "./session";
import { ArticleView } from "./view";

const element = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const toolbar = element<HTMLElement>("toolbar");
const stage = element<HTMLElement>("stage");
const content = element<HTMLElement>("content");
const editor = element<HTMLFormElement>("editor");
const documentPane = element<HTMLElement>("document");
const notice = element<HTMLElement>("notice");
const play = element<HTMLButtonElement>("play");
const pace = element<HTMLInputElement>("pace");
const size = element<HTMLInputElement>("size");
const font = element<HTMLSelectElement>("font");
const focus = element<HTMLInputElement>("word-focus");
const follow = element<HTMLInputElement>("follow");
const romanize = element<HTMLInputElement>("romanize");
let preferences: ArticlePreferences = { ...ARTICLE_DEFAULTS };
let settings: Settings;
let article: ArticleDocument | null = null;
let words: ArticleWord[] = [];
let player: ArticlePlayback | null = null;
let view: ArticleView | null = null;
let overlay: ReaderOverlay;
let learning: LearningReader | null = null;
let id = new URLSearchParams(location.search).get("id");
let lastRole = "";
let saveTimer = 0;
let preferencesDirty = false;

function savePreferences(): void {
  window.clearTimeout(saveTimer);
  if (!preferencesDirty) return;
  preferencesDirty = false;
  void chrome.storage.local.set({ articlePreferences: preferences });
}

function followWord(target: HTMLElement | undefined): void {
  if (!target || !preferences.follow || documentPane.hidden) return;
  const top =
    (stage.hidden ? toolbar : stage).getBoundingClientRect().bottom + 20;
  const box = target.getBoundingClientRect();
  if (box.top < top || box.bottom > innerHeight - 50) {
    window.scrollBy({
      top: box.top - top - Math.max(0, innerHeight - top - 50 - box.height) / 2,
      behavior: "instant",
    });
  }
}

function paint(): void {
  if (!player || !article || !words.length || !view) return;
  const current = words[player.index];
  const block = article.blocks[current.block];
  const role = `${block.kind}:${block.level ?? 0}`;
  if (role !== lastRole) {
    lastRole = role;
    overlay.apply({
      ...settings,
      mode: "rsvp",
      autoScale: false,
      romanize: preferences.romanize,
      font:
        block.kind === "heading"
          ? "atkinson_hyperlegible"
          : block.kind === "code"
            ? "jet_brains_mono"
            : preferences.font,
      fontSize: Math.min(
        72,
        preferences.textSize * (block.kind === "heading" ? 1.9 : 1.5),
      ),
      textWeight:
        block.kind === "heading"
          ? 700
          : block.kind === "code"
            ? 400
            : settings.textWeight,
      fontStyle: "normal",
      horizontalPosition: 50,
      boxWidth: 94,
    });
    const palette = getComputedStyle(
      stage.querySelector<HTMLElement>(".trf-reader")!,
    );
    for (const key of ["text", "faded", "accent"])
      document.body.style.setProperty(
        `--trf-article-${key}`,
        palette.getPropertyValue(`--${key}`),
      );
  }
  if (!stage.hidden)
    overlay.render({
      key: String(player.index),
      current: current.word,
      previous: words
        .slice(Math.max(0, player.index - settings.contextBefore), player.index)
        .map((entry) => entry.word),
      upcoming: words
        .slice(player.index + 1, player.index + 1 + settings.contextAfter)
        .map((entry) => entry.word),
    });
  followWord(view.show(player.index));
  play.textContent = player.playing
    ? "Pause"
    : player.finished
      ? "Read again"
      : "Play";
  play.setAttribute("aria-pressed", String(player.playing));
  element<HTMLOutputElement>("progress").textContent =
    `${player.index + 1} / ${words.length}`;
  if (id && (!player.playing || player.index % 20 === 0))
    void savePosition(id, player.index);
}

function applyPreferences(): void {
  pace.value = String(preferences.wpm);
  size.value = String(preferences.textSize);
  font.value = preferences.font;
  focus.checked = preferences.wordFocus;
  follow.checked = preferences.follow;
  romanize.checked = preferences.romanize;
  element<HTMLOutputElement>("pace-value").textContent =
    `${preferences.wpm} WPM`;
  document.body.style.setProperty(
    "--trf-article-font",
    FONT_STACKS[preferences.font],
  );
  document.body.style.setProperty(
    "--trf-article-size",
    `${preferences.textSize}px`,
  );
  stage.hidden = !article || !editor.hidden || !preferences.wordFocus;
  view?.apply(preferences.romanize);
  player?.setSpeed(preferences.wpm);
  lastRole = "";
  if (article)
    element<HTMLElement>("summary").textContent =
      `${words.length.toLocaleString()} words · about ${Math.max(1, Math.ceil(words.length / preferences.wpm))} min`;
  paint();
}

function openDocument(next: ArticleDocument, index = 0): void {
  player?.destroy();
  article = next;
  words = articleWords(next);
  view = new ArticleView(content, next, words);
  learning?.destroy();
  languageOptions(
    element<HTMLSelectElement>("study-language"),
    next.language || "und",
  );
  learning = new LearningReader(document.body, next.language || "und");
  learning.attach(
    content,
    words.map(({ word }) => word.text),
    new Set(
      words.flatMap((word, index) =>
        index && words[index - 1].block !== word.block ? [index] : [],
      ),
    ),
  );
  player = new ArticlePlayback(words, preferences.wpm, paint);
  documentPane.hidden = false;
  editor.hidden = true;
  notice.textContent = "";
  document.title = `${next.title} — Glintree`;
  const title = element<HTMLElement>("article-title");
  title.textContent = next.title;
  title.hidden =
    next.blocks[0]?.kind === "heading" &&
    next.blocks[0].level === 1 &&
    next.blocks[0].text === next.title;
  element<HTMLElement>("byline").textContent = next.byline;
  const source = element<HTMLAnchorElement>("source");
  source.hidden = !/^https?:\/\//i.test(next.url);
  if (!source.hidden) {
    source.href = next.url;
    source.textContent = `Open original · ${new URL(next.url).hostname}`;
  }
  content.lang = next.language;
  content.dir = "auto";
  element<HTMLElement>("romanize-label").hidden = !words.some(({ word }) =>
    /[\p{Script=Devanagari}\p{Script=Bengali}]/u.test(word.text),
  );
  for (const control of [
    play,
    element<HTMLButtonElement>("previous"),
    element<HTMLButtonElement>("next"),
  ])
    control.disabled = !words.length;
  element<HTMLElement>("cancel-edit").hidden = false;
  applyPreferences();
  player.seek(index);
}

function showEditor(): void {
  player?.pause();
  editor.hidden = false;
  documentPane.hidden = true;
  stage.hidden = true;
  play.disabled = true;
  element<HTMLButtonElement>("previous").disabled = true;
  element<HTMLButtonElement>("next").disabled = true;
  element<HTMLTextAreaElement>("text-input").focus();
}

function skip(direction: number): void {
  if (!player || !words.length) return;
  const block = words[player.index].block + direction;
  const index = words.findIndex((word) => word.block >= block);
  player.seek(index < 0 ? words.length - 1 : index);
}

languageOptions(element<HTMLSelectElement>("study-language"), "und");
for (const [value, label] of Object.entries(FONT_LABELS))
  font.add(new Option(label, value));
play.addEventListener("click", () =>
  player?.playing ? player.pause() : player?.play(),
);
element("previous").addEventListener("click", () => skip(-1));
element("next").addEventListener("click", () => skip(1));
element("new-text").addEventListener("click", showEditor);
element("settings").addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
element("cancel-edit").addEventListener("click", () => {
  if (article) openDocument(article, player?.index);
});
content.addEventListener("click", (event) => {
  if (window.getSelection()?.isCollapsed === false) return;
  const word =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-word]")
      : null;
  if (!word) return;
  const index = Number(word.dataset.word);
  if (element<HTMLInputElement>("study-words").checked && !event.altKey) {
    player?.pause();
    captureWord(word.textContent ?? "", index, word);
  } else player?.seek(index);
});

function captureWord(term: string, index: number, target?: HTMLElement): void {
  if (!article || !words[index]) return;
  const sourceTerm = target ? words[index].word.text : term;
  learning?.capture(
    sourceTerm,
    {
      title: article.title,
      url: article.url,
      context: article.blocks[words[index].block].text,
    },
    target,
  );
}
element("study-language").addEventListener("change", () => {
  learning?.setLanguage(element<HTMLSelectElement>("study-language").value);
});
element("learn-selection").addEventListener("click", () => {
  const selected = selectedWords(content);
  if (!selected) {
    notice.textContent =
      "Select a word, phrase or concept in the article first.";
    return;
  }
  player?.pause();
  const first = words[selected.start],
    last = words[selected.end];
  if (!article || !first || !last) return;
  const term =
    first.block === last.block
      ? article.blocks[first.block].text.slice(first.start, last.end)
      : words
          .slice(selected.start, selected.end + 1)
          .map(({ word }) => word.text)
          .join(" ");
  captureWord(term, selected.start);
});

for (const control of [pace, size, font, focus, follow, romanize]) {
  control.addEventListener(
    control instanceof HTMLSelectElement || control.type === "checkbox"
      ? "change"
      : "input",
    () => {
      preferences = articlePreferences({
        ...preferences,
        wpm: Number(pace.value),
        textSize: Number(size.value),
        font: font.value as ReaderFont,
        wordFocus: focus.checked,
        follow: follow.checked,
        romanize: romanize.checked,
      });
      applyPreferences();
      preferencesDirty = true;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(savePreferences, 250);
    },
  );
}

editor.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    const next = articleFromText(
      element<HTMLTextAreaElement>("text-input").value,
      element<HTMLInputElement>("text-title").value.trim() || "Pasted text",
    );
    if (!articleWords(next).length) {
      notice.textContent = "Paste some text to begin.";
      return;
    }
    const nextId = crypto.randomUUID();
    const tab = await chrome.tabs.getCurrent();
    await saveArticle(nextId, { article: next }, tab?.id);
    id = nextId;
    history.replaceState(null, "", `?id=${id}`);
    openDocument(next);
  })().catch(() => {
    notice.textContent = "The text could not be opened. Please try again.";
  });
});

document.addEventListener("keydown", (event) => {
  if (
    !editor.hidden ||
    (event.target instanceof Element &&
      event.target.closest("input,textarea,select,button,a")) ||
    !player
  )
    return;
  if (event.code === "Space") {
    event.preventDefault();
    player.playing ? player.pause() : player.play();
  } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    player.seek(player.index + (event.key === "ArrowRight" ? 1 : -1));
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) player?.pause();
});
document.fonts.addEventListener("loadingdone", () => {
  lastRole = "";
  paint();
});
window.addEventListener("pagehide", () => {
  player?.pause();
  player?.destroy();
  learning?.destroy();
  savePreferences();
});
const resize = new ResizeObserver(() =>
  document.body.style.setProperty(
    "--trf-toolbar-height",
    `${toolbar.offsetHeight}px`,
  ),
);
resize.observe(toolbar);

async function init(): Promise<void> {
  settings = await loadSettings();
  preferences = articlePreferences(
    (await chrome.storage.local.get("articlePreferences")).articlePreferences,
  );
  overlay = new ReaderOverlay({ ...settings, autoScale: false });
  overlay.mount(stage);
  onSettingsChanged((next) => {
    settings = next;
    lastRole = "";
    paint();
  });
  applyPreferences();
  if (id) {
    const result = await loadArticle(id);
    if (result?.article) {
      openDocument(result.article, await loadPosition(id));
      return;
    }
    notice.textContent =
      result?.error ??
      "This article is no longer available in this browser session. Open it from the original page again, or paste its text below.";
  }
  showEditor();
}

void init().catch(() => {
  notice.textContent =
    "The reader could not start. Reload the extension and try again.";
  showEditor();
});
