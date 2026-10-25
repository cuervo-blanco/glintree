import { afterEach, expect, it, vi } from "vitest";
import { DEFAULTS, loadSettings, normalizeSettings } from "./settings";

afterEach(() => vi.unstubAllGlobals());

it("keeps existing appearance and defaults new placement and focus preferences", async () => {
  vi.stubGlobal("chrome", {
    storage: { sync: { get: async () => ({ fontSize: 30 }) } },
  });
  const settings = await loadSettings();
  expect(settings.fontSize).toBe(30);
  expect(settings.horizontalPosition).toBe(50);
  expect(settings.verticalPosition).toBe(DEFAULTS.verticalPosition);
  expect(settings.focusMode).toBe(false);
  expect("readerInReadMode" in settings).toBe(false);
  expect("customBackground" in settings).toBe(false);
});

it("falls back to defaults when extension storage is unavailable", async () => {
  vi.stubGlobal("chrome", {
    storage: {
      sync: {
        get: async () => {
          throw new Error("unavailable");
        },
      },
    },
  });
  expect(await loadSettings()).toEqual(DEFAULTS);
});

it("keeps supported preferences while discarding removed or malformed values", () => {
  const stored = {
    enabled: false,
    focusMode: true,
    language: "bn",
    romanize: true,
    font: "unknown font",
    mode: "old reading mode",
    theme: "old theme",
    fontStyle: "bold",
    textCase: "lower",
    fontSize: "40",
    letterSpacing: Infinity,
    customText: "invalid colour",
    customAccent: "#Aa7744",
    readerInReadMode: false,
    customBackground: "#ff0000",
  };
  expect(normalizeSettings(stored)).toEqual({
    ...DEFAULTS,
    enabled: false,
    focusMode: true,
    language: "bn",
    romanize: true,
    customAccent: "#Aa7744",
  });
  expect(stored.customBackground).toBe("#ff0000");
});

it("uses defaults for malformed settings containers", () => {
  for (const value of [null, undefined, [], 1, "settings"])
    expect(normalizeSettings(value)).toEqual(DEFAULTS);
});
