import {
  DEFAULTS,
  normalizeSettings,
  saveSettings,
  type Settings,
} from "./settings";

export type PresetSettings = Omit<
  Settings,
  "enabled" | "language" | "romanize" | "focusMode"
>;

export interface Preset {
  id: string;
  name: string;
  settings: PresetSettings;
}

const KEY = "savedPresets";
const USER_FIELDS = new Set(["enabled", "language", "romanize", "focusMode"]);

function appearance(value: unknown): PresetSettings {
  const settings = normalizeSettings(value);
  return Object.fromEntries(
    Object.keys(DEFAULTS)
      .filter((key) => !USER_FIELDS.has(key))
      .map((key) => [key, settings[key as keyof Settings]]),
  ) as PresetSettings;
}

export async function loadPresets(): Promise<Preset[]> {
  const stored = await chrome.storage.local.get({ [KEY]: [] });
  const value: unknown = stored[KEY];
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const preset = entry as Partial<Preset>;
    if (
      typeof preset.id !== "string" ||
      !preset.id.trim() ||
      typeof preset.name !== "string" ||
      !preset.settings ||
      typeof preset.settings !== "object" ||
      Array.isArray(preset.settings)
    )
      return [];
    return [
      {
        id: preset.id,
        name: preset.name.trim().slice(0, 60) || "Untitled preset",
        settings: appearance(preset.settings),
      },
    ];
  });
}

export async function savePreset(
  name: string,
  settings: Settings,
  id: string = crypto.randomUUID(),
): Promise<Preset> {
  const preset: Preset = {
    id,
    name: name.trim().slice(0, 60) || "Untitled preset",
    settings: appearance(settings),
  };
  const all = (await loadPresets()).filter((entry) => entry.id !== id);
  await chrome.storage.local.set({ [KEY]: [...all, preset] });
  return preset;
}

export async function applyPreset(preset: Preset): Promise<void> {
  await saveSettings(appearance(preset.settings));
}

export async function deletePreset(id: string): Promise<void> {
  await chrome.storage.local.set({
    [KEY]: (await loadPresets()).filter((preset) => preset.id !== id),
  });
}

export function onPresetsChanged(handler: () => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area === "local" && KEY in changes) handler();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
