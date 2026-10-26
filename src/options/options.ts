/** Settings and the live reader preview share the same field definitions. */
import { ReaderOverlay } from "../content/overlay";
import { readsWholeLine } from "../content/lines";
import { classify, type Word } from "../reader-core/words";
import {
  applyPreset,
  deletePreset,
  loadPresets,
  onPresetsChanged,
  savePreset,
  type Preset,
} from "../presets";
import {
  CUSTOM_COLOR_KEYS,
  FIELDS,
  type Field,
  type Group,
} from "../settingsFields";
import {
  DEFAULTS,
  loadSettings,
  onSettingsChanged,
  saveSettings,
  type Settings,
} from "../settings";

document.getElementById("read-text")?.addEventListener("click", () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("article.html") });
});

const SAMPLES: Record<string, Word[]> = Object.fromEntries(
  Object.entries({
    en: "Read at your own pace, follow the speaker and return to any word you want to practise.",
    hi: "नमस्ते! मैं हिन्दी सीख रहा हूँ।",
    bn: "নমস্কার! আমি বাংলা শিখছি।",
  }).map(([language, text]) => [language, text.split(/\s+/).map(classify)]),
);

let settings: Settings = { ...DEFAULTS };
let overlay: ReaderOverlay;
let previewIndex = 0;
let pending: Partial<Settings> = {};
let flushHandle = 0;
const HEX = /^#[0-9a-f]{6}$/i;

function palette(): Partial<Settings> {
  const preview = document.getElementById("preview");
  if (!preview) return {};
  const style = getComputedStyle(preview);
  return Object.fromEntries(
    CUSTOM_COLOR_KEYS.map((key, index) => [
      key,
      style.getPropertyValue(["--text", "--faded", "--accent"][index]).trim(),
    ]).filter(([, value]) => HEX.test(value)),
  );
}

function preview(): void {
  const words = SAMPLES[settings.language] ?? SAMPLES.en;
  const at = previewIndex % words.length;
  const start = readsWholeLine(settings)
    ? Math.floor(at / settings.lineWords) * settings.lineWords
    : at;
  overlay.render({
    key: `${settings.language}:${start}`,
    current: words[start],
    previous: readsWholeLine(settings)
      ? []
      : words.slice(Math.max(0, at - settings.contextBefore), at),
    upcoming: words.slice(
      start + 1,
      start +
        1 +
        (readsWholeLine(settings)
          ? settings.lineWords - 1
          : settings.contextAfter),
    ),
  });
}

function syncFields(): void {
  const colours = palette();
  const held = readsWholeLine(settings);
  for (const field of FIELDS) {
    const input = document.getElementById(`f-${field.key}`);
    if (!(
      input instanceof HTMLInputElement || input instanceof HTMLSelectElement
    ))
      continue;
    const value =
      field.kind === "color"
        ? (colours[field.key] ?? settings[field.key])
        : settings[field.key];
    if (field.kind === "toggle" && input instanceof HTMLInputElement)
      input.checked = Boolean(value);
    else if (input.value !== String(value)) input.value = String(value);
    const output = input.parentElement?.querySelector("output");
    if (output)
      output.textContent =
        field.kind === "range" && field.format
          ? field.format(Number(value))
          : String(value);
    const inactive =
      field.key === "motion"
        ? settings.mode !== "plain" && settings.mode !== "bionic"
        : field.key === "lineWords"
          ? !held
          : field.key === "contextBefore" || field.key === "contextAfter"
            ? held
            : field.key === "bionicAccent"
              ? settings.mode !== "bionic" && settings.mode !== "rsvp-bionic"
              : false;
    input.closest<HTMLElement>(".row")!.dataset.inactive = String(inactive);
  }
}

function paint(): void {
  // The preview has no video player to scale against.
  overlay.apply({ ...settings, autoScale: false });
  preview();
  syncFields();
}

function flushSave(): Promise<void> {
  window.clearTimeout(flushHandle);
  if (!Object.keys(pending).length) return Promise.resolve();
  const batch = pending;
  pending = {};
  return saveSettings(batch);
}

function update(patch: Partial<Settings>): void {
  if (
    CUSTOM_COLOR_KEYS.some((key) => key in patch) &&
    settings.theme !== "custom"
  ) {
    patch = { ...palette(), ...patch, theme: "custom" };
  }
  settings = { ...settings, ...patch };
  pending = { ...pending, ...patch };
  // A drag must preview immediately without exhausting storage.sync's write quota.
  window.clearTimeout(flushHandle);
  flushHandle = window.setTimeout(() => void flushSave(), 250);
  paint();
}

function row(field: Field): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "row";
  wrapper.dataset.field = field.key;
  const copy = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = field.label;
  copy.append(label);
  if (field.help) {
    const help = document.createElement("p");
    help.textContent = field.help;
    copy.append(help);
  }
  const control = document.createElement("div");
  control.className = "control";
  const input = document.createElement(
    field.kind === "select" ? "select" : "input",
  );
  label.htmlFor = input.id = `f-${field.key}`;
  if (input instanceof HTMLSelectElement && field.kind === "select") {
    for (const option of field.options)
      input.add(new Option(option.label, option.value));
  } else if (input instanceof HTMLInputElement) {
    input.type = field.kind === "toggle" ? "checkbox" : field.kind;
    if (field.kind === "range") {
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.step);
    }
  }
  input.addEventListener(
    field.kind === "range" || field.kind === "color" ? "input" : "change",
    () => {
      const value =
        field.kind === "toggle" && input instanceof HTMLInputElement
          ? input.checked
          : field.kind === "range"
            ? Number(input.value)
            : input.value;
      update({ [field.key]: value });
    },
  );
  control.append(input);
  if (field.kind === "range" || field.kind === "color")
    control.append(document.createElement("output"));
  wrapper.append(copy, control);
  return wrapper;
}

async function presets(): Promise<void> {
  const select = document.getElementById("preset-select") as HTMLSelectElement;
  const name = document.getElementById("preset-name") as HTMLInputElement;
  const remove = document.getElementById("preset-delete") as HTMLButtonElement;
  const status = document.getElementById("preset-status")!;
  let all: Preset[] = [];
  let selectedId = "";
  const refresh = async (): Promise<void> => {
    all = await loadPresets();
    select.replaceChildren(
      new Option("Choose a saved preset", ""),
      ...all.map((preset) => new Option(preset.name, preset.id)),
    );
    select.value = all.some((preset) => preset.id === selectedId)
      ? selectedId
      : "";
    remove.disabled = !select.value;
  };
  select.addEventListener("change", () => {
    selectedId = select.value;
    const preset = all.find((entry) => entry.id === select.value);
    remove.disabled = !preset;
    if (!preset) return;
    name.value = preset.name;
    void (async () => {
      await flushSave();
      await applyPreset(preset);
      settings = { ...settings, ...preset.settings };
      paint();
      status.textContent = `Loaded ${preset.name}.`;
    })();
  });
  document
    .getElementById("preset-form")!
    .addEventListener("submit", (event) => {
      event.preventDefault();
      void (async () => {
        await flushSave();
        const selected = all.find(
          (preset) =>
            preset.id === select.value && preset.name === name.value.trim(),
        );
        const saved = await savePreset(name.value, settings, selected?.id);
        selectedId = saved.id;
        await refresh();
        select.value = saved.id;
        remove.disabled = false;
        name.value = saved.name;
        status.textContent = `Saved ${saved.name}.`;
      })();
    });
  remove.addEventListener("click", () => {
    const id = select.value;
    if (!id) return;
    selectedId = "";
    void deletePreset(id)
      .then(refresh)
      .then(() => {
        name.value = "";
        status.textContent = "Preset deleted.";
      });
  });
  onPresetsChanged(() => void refresh());
  await refresh();
}

async function main(): Promise<void> {
  settings = await loadSettings();
  overlay = new ReaderOverlay({ ...settings, autoScale: false });
  const host = document.getElementById("preview-host")!;
  overlay.mount(host);
  const reader = host.querySelector<HTMLElement>(".trf-reader")!;
  reader.id = "preview";
  const basicAppearance = new Set([
    "theme",
    "font",
    "fontSize",
    "backgroundOpacity",
    ...CUSTOM_COLOR_KEYS,
  ]);
  const basicReading = new Set(["enabled", "mode", "motion", "focusMode"]);
  for (const group of ["reading", "appearance", "captions"] as Group[]) {
    const groupHost = document.getElementById(`group-${group}`)!;
    for (const field of FIELDS.filter((field) => field.group === group)) {
      const advanced =
        (group === "appearance" && !basicAppearance.has(field.key)) ||
        (group === "reading" && !basicReading.has(field.key));
      const target = advanced
        ? document.getElementById(`advanced-${group}`)!
        : groupHost;
      target.append(row(field));
    }
  }
  paint();
  await presets();
  onSettingsChanged((next) => {
    settings = { ...next, ...pending };
    paint();
  });
  window.setInterval(() => {
    previewIndex += 1;
    preview();
  }, 380);
  window.addEventListener("pagehide", () => void flushSave());
}

void main();
