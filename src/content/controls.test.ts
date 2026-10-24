// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, type Settings } from "../settings";
import { FIELDS } from "../settingsFields";
import { ReaderControls } from "./controls";

const save = vi.fn().mockResolvedValue(undefined);
const mounted: ReaderControls[] = [];

function mount(romanizable = true, patch: Partial<Settings> = {}) {
  const player = document.createElement("div");
  const reader = document.createElement("div");
  player.append(reader);
  document.body.append(player);
  const onChange = vi.fn();
  const controls = new ReaderControls(
    reader,
    { ...DEFAULTS, ...patch },
    { romanizable, onChange },
  );
  mounted.push(controls);
  const input = (key: keyof Settings) => {
    const element = reader.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-field="${key}"] input, [data-field="${key}"] select`,
    );
    if (!element) throw new Error(`missing control: ${key}`);
    return element;
  };
  return { player, reader, controls, onChange, input };
}

beforeEach(() => {
  vi.useFakeTimers();
  save.mockClear();
  vi.stubGlobal("chrome", { storage: { sync: { set: save } } });
});

afterEach(() => {
  for (const controls of mounted.splice(0)) controls.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reader controls", () => {
  it("previews every edit immediately and saves a settled slider drag once", () => {
    const { input, onChange } = mount();
    const size = input("fontSize");
    for (const value of [30, 31, 32]) {
      size.value = String(value);
      size.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(100);
    }
    expect(onChange.mock.calls).toEqual([
      [{ fontSize: 30 }],
      [{ fontSize: 31 }],
      [{ fontSize: 32 }],
    ]);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(save).toHaveBeenCalledExactlyOnceWith({ fontSize: 32 });
  });

  it("keeps the last edits when navigation destroys the controls mid-drag", () => {
    const { input, controls, reader } = mount();
    input("fontSize").value = "36";
    input("fontSize").dispatchEvent(new Event("input"));
    input("theme").value = "sepia";
    input("theme").dispatchEvent(new Event("change"));
    controls.destroy();
    expect(save).toHaveBeenCalledExactlyOnceWith({
      fontSize: 36,
      theme: "sepia",
    });
    expect(reader.querySelector(".trf-controls")).toBeNull();
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("offers native and romanized script only for a supported transcript", () => {
    expect(
      mount(false).reader.querySelector('[data-field="romanize"]'),
    ).toBeNull();
    const { input, onChange } = mount(true, { romanize: true });
    const script = input("romanize") as HTMLInputElement;
    expect(script.checked).toBe(true);
    script.checked = false;
    script.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledWith({ romanize: false });
    script.checked = true;
    script.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenLastCalledWith({ romanize: true });
  });

  it("syncs settings without replacing the focused control", () => {
    const { input, controls, reader } = mount();
    const size = input("fontSize");
    size.focus();
    controls.apply({
      ...DEFAULTS,
      fontSize: 48,
      mode: "plain",
      romanize: true,
    });
    expect(document.activeElement).toBe(size);
    expect(input("fontSize")).toBe(size);
    expect(size.value).toBe("48");
    expect(
      reader.querySelector('[data-field="fontSize"] output')?.textContent,
    ).toBe("48px");
    expect(input("mode").value).toBe("plain");
    expect((input("romanize") as HTMLInputElement).checked).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("closes with Escape and returns focus to the appearance button", () => {
    const { reader, input } = mount();
    const details = reader.querySelector("details")!;
    const summary = reader.querySelector("summary")!;
    details.open = true;
    input("fontSize").focus();
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    input("fontSize").dispatchEvent(escape);
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    expect(escape.defaultPrevented).toBe(true);
  });

  it.each(["click", "keydown", "wheel"])(
    "keeps %s interactions from reaching the video player",
    (type) => {
      const { player, input } = mount();
      const playerEvent = vi.fn();
      player.addEventListener(type, playerEvent);
      const event = new Event(type, { bubbles: true, cancelable: true });
      input("fontSize").dispatchEvent(event);
      expect(playerEvent).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    },
  );

  it("starts an edited custom colour from the palette currently on screen", () => {
    const { reader, input, onChange, controls } = mount(false, {
      theme: "slate",
      customBackground: "#111111",
      customText: "#222222",
      customFaded: "#333333",
      customAccent: "#444444",
    });
    reader.style.setProperty("--bg", "#303438");
    reader.style.setProperty("--text", "#e4e1dc");
    reader.style.setProperty("--faded", "#7f858a");
    reader.style.setProperty("--accent", "#c97958");
    controls.apply({ ...DEFAULTS, theme: "slate" });
    expect(input("customBackground").value).toBe("#303438");
    input("customAccent").value = "#aa7744";
    input("customAccent").dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      theme: "custom",
      customBackground: "#303438",
      customText: "#e4e1dc",
      customFaded: "#7f858a",
      customAccent: "#aa7744",
    });
    vi.advanceTimersByTime(250);
    expect(save).toHaveBeenCalledWith(onChange.mock.calls[0][0]);
  });

  it("makes every shared appearance setting available on the reader", () => {
    const { reader, input } = mount();
    for (const field of FIELDS.filter(
      (field) => field.group === "appearance",
    )) {
      expect(input(field.key)).toBeInstanceOf(HTMLElement);
      expect(
        reader.querySelector(`[data-field="${field.key}"]`)?.textContent,
      ).toContain(field.label);
    }
    const mode = FIELDS.find((field) => field.key === "mode");
    expect(mode?.kind).toBe("select");
    if (mode?.kind !== "select") throw new Error("missing reading modes");
    expect(
      Array.from((input("mode") as HTMLSelectElement).options).map(
        (option) => option.value,
      ),
    ).toEqual(mode.options.map((option) => option.value));
  });
});
