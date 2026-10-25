import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, loadSettings } from "./settings";
import {
  applyPreset,
  deletePreset,
  loadPresets,
  onPresetsChanged,
  savePreset,
} from "./presets";

let local: Record<string, unknown>;
let sync: Record<string, unknown>;
type Listener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;
const listeners = new Set<Listener>();
const area = (
  read: () => Record<string, unknown>,
  write: (data: Record<string, unknown>) => void,
) => ({
  get: async (defaults: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(defaults).map(([key, fallback]) => [
        key,
        read()[key] ?? fallback,
      ]),
    ),
  set: async (patch: Record<string, unknown>) => write({ ...read(), ...patch }),
});

beforeEach(() => {
  local = {};
  sync = {};
  listeners.clear();
  vi.stubGlobal("chrome", {
    storage: {
      local: area(
        () => local,
        (next) => {
          local = next;
        },
      ),
      sync: area(
        () => sync,
        (next) => {
          sync = next;
        },
      ),
      onChanged: {
        addListener: (listener: Listener) => listeners.add(listener),
        removeListener: (listener: Listener) => listeners.delete(listener),
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("saved presets", () => {
  it("starts with no built-in reading profiles", async () => {
    expect(await loadPresets()).toEqual([]);
  });

  it("saves, reloads and updates only a chosen preset", async () => {
    const first = await savePreset("  Evening  ", {
      ...DEFAULTS,
      fontSize: 38,
    });
    const second = await savePreset("Study", { ...DEFAULTS, font: "geist" });
    expect(first.name).toBe("Evening");
    await savePreset("Evening", { ...DEFAULTS, fontSize: 42 }, first.id);
    const all = await loadPresets();
    expect(all).toHaveLength(2);
    expect(all.find((entry) => entry.id === first.id)?.settings.fontSize).toBe(
      42,
    );
    expect(all.find((entry) => entry.id === second.id)?.settings.font).toBe(
      "geist",
    );
  });

  it("preserves the user's enabled, language, script and focus choices", async () => {
    sync = { enabled: false, language: "bn", romanize: true, focusMode: true };
    const preset = await savePreset("Reading", { ...DEFAULTS, fontSize: 36 });
    for (const key of ["enabled", "language", "romanize", "focusMode"])
      expect(preset.settings).not.toHaveProperty(key);
    await applyPreset(preset);
    expect(await loadSettings()).toMatchObject({
      enabled: false,
      language: "bn",
      romanize: true,
      focusMode: true,
      fontSize: 36,
    });
  });

  it("fills newly added settings when loading an older preset and discards unknown fields", async () => {
    local.savedPresets = [
      {
        id: "older",
        name: "Older",
        settings: { fontSize: 30, customBackground: "#ff0000", enabled: false },
      },
    ];
    const [preset] = await loadPresets();
    expect(preset.settings.fontSize).toBe(30);
    expect(preset.settings.horizontalPosition).toBe(50);
    expect(preset.settings).not.toHaveProperty("customBackground");
    expect(preset.settings).not.toHaveProperty("enabled");
  });

  it("deletes only the selected saved preset and leaves legacy user data untouched", async () => {
    local.customProfiles = { old: { name: "Old profile" } };
    const removed = await savePreset("Temporary", DEFAULTS);
    const kept = await savePreset("Keep", DEFAULTS);
    await deletePreset(removed.id);
    expect((await loadPresets()).map((preset) => preset.id)).toEqual([kept.id]);
    expect(local.customProfiles).toEqual({ old: { name: "Old profile" } });
  });

  it("ignores malformed saved entries", async () => {
    local.savedPresets = [
      null,
      12,
      {},
      { id: "bad", name: "Bad" },
      { id: "", name: "Bad", settings: {} },
      { id: "array", name: "Bad", settings: [] },
      { id: "good", name: "Good", settings: {} },
    ];
    expect((await loadPresets()).map((preset) => preset.id)).toEqual(["good"]);
  });

  it("validates loaded preset values before applying them to the reader", async () => {
    local.savedPresets = [
      {
        id: "older",
        name: "  Older  ",
        settings: {
          fontSize: "forty",
          contextBefore: NaN,
          font: "missing font",
          mode: "removed mode",
          customText: "red",
          customAccent: "#aa7744",
          enabled: false,
          language: "hi",
          romanize: true,
          focusMode: true,
        },
      },
    ];
    const [preset] = await loadPresets();
    expect(preset.name).toBe("Older");
    await applyPreset(preset);
    expect(await loadSettings()).toEqual({
      ...DEFAULTS,
      customAccent: "#aa7744",
    });
  });

  it("refreshes only for local preset changes and unsubscribes", () => {
    const changed = vi.fn();
    const stop = onPresetsChanged(changed);
    for (const listener of listeners) {
      listener({ savedPresets: {} }, "sync");
      listener({ other: {} }, "local");
      listener({ savedPresets: {} }, "local");
    }
    expect(changed).toHaveBeenCalledTimes(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});
