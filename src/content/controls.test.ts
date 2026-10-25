// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, type Settings } from "../settings";
import { ReaderControls } from "./controls";

const save = vi.fn().mockResolvedValue(undefined);
const mounted: ReaderControls[] = [];

function mount(romanizable = true, patch: Partial<Settings> = {}) {
  const player = document.createElement("div");
  const reader = document.createElement("div");
  reader.className = "trf-reader";
  const stage = document.createElement("div");
  stage.className = "trf-stage";
  stage.textContent = "বাংলা";
  reader.append(stage);
  player.append(reader);
  document.body.append(player);
  vi.spyOn(player, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 1000, 600),
  );
  vi.spyOn(reader, "getBoundingClientRect").mockReturnValue(
    new DOMRect(210, 492, 580, 60),
  );
  const onChange = vi.fn();
  const controls = new ReaderControls(
    reader,
    { ...DEFAULTS, ...patch },
    { romanizable, onChange },
  );
  controls.mount(player);
  mounted.push(controls);
  const dialog = reader.querySelector<HTMLDivElement>(
    '[role="dialog"][aria-label="Caption appearance"]',
  )!;
  const input = (key: keyof Settings) => {
    const element = reader.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-field="${key}"] input, [data-field="${key}"] select`,
    );
    if (!element) throw new Error(`missing control: ${key}`);
    return element;
  };
  return { player, reader, stage, dialog, controls, onChange, input };
}

beforeEach(() => {
  vi.useFakeTimers();
  save.mockClear();
  vi.stubGlobal("chrome", { storage: { sync: { set: save } } });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  for (const controls of mounted.splice(0)) controls.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reader controls", () => {
  it("skips invisible caption editing targets during a gap", () => {
    const { reader, controls } = mount();
    const targets = reader.querySelectorAll<HTMLElement>(
      ".trf-stage, .trf-resize-width, .trf-resize-text",
    );
    controls.setIdle(true);
    expect(Array.from(targets, (target) => target.tabIndex)).toEqual([
      -1, -1, -1,
    ]);
    controls.setIdle(false);
    expect(Array.from(targets, (target) => target.tabIndex)).toEqual([0, 0, 0]);
  });
  it("opens and closes settings by clicking the captions without a separate button", () => {
    const { reader, stage, dialog } = mount();
    expect(dialog.hidden).toBe(true);
    expect(reader.querySelector("summary")).toBeNull();
    expect(
      Array.from(reader.querySelectorAll("button")).some(
        (button) => button.textContent === "Appearance",
      ),
    ).toBe(false);
    stage.click();
    expect(dialog.hidden).toBe(false);
    expect(stage.getAttribute("aria-expanded")).toBe("true");
    stage.click();
    expect(dialog.hidden).toBe(true);
    expect(stage.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes with Escape or an outside click and returns keyboard focus to the captions", () => {
    const { player, stage, dialog, input } = mount();
    stage.click();
    input("font").focus();
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    input("font").dispatchEvent(escape);
    expect(dialog.hidden).toBe(true);
    expect(document.activeElement).toBe(stage);
    expect(escape.defaultPrevented).toBe(true);
    stage.click();
    player.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(dialog.hidden).toBe(true);
  });

  it("keeps appearance choices in the panel and leaves direct sizing and positioning to the captions", () => {
    const { reader, input } = mount();
    for (const key of [
      "horizontalPosition",
      "verticalPosition",
      "fontSize",
      "boxWidth",
      "autoScale",
    ]) {
      expect(reader.querySelector(`[data-field="${key}"]`)).toBeNull();
    }
    for (const key of [
      "mode",
      "font",
      "theme",
      "customAccent",
      "romanize",
      "focusMode",
    ] as const)
      expect(input(key)).toBeInstanceOf(HTMLElement);
    expect(
      reader.querySelector('[aria-label="Resize caption width"]'),
    ).not.toBeNull();
    expect(
      reader.querySelector('[aria-label="Resize caption text"]'),
    ).not.toBeNull();
  });

  it("previews gesture and range edits immediately, then coalesces their saved values", () => {
    const { stage, input, onChange } = mount();
    stage.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(onChange).toHaveBeenCalledWith({
      horizontalPosition: 51,
      verticalPosition: 8,
    });
    const spacing = input("letterSpacing");
    for (const value of [1, 1.25, 1.5]) {
      spacing.value = String(value);
      spacing.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(100);
    }
    expect(onChange).toHaveBeenLastCalledWith({ letterSpacing: 1.5 });
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(save).toHaveBeenCalledExactlyOnceWith({
      horizontalPosition: 51,
      verticalPosition: 8,
      letterSpacing: 1.5,
    });
  });

  it("keeps the last edits when navigation destroys the reader mid-edit", () => {
    const { input, controls, player, reader } = mount();
    input("textWeight").value = "700";
    input("textWeight").dispatchEvent(new Event("input"));
    input("theme").value = "sepia";
    input("theme").dispatchEvent(new Event("change"));
    controls.destroy();
    expect(save).toHaveBeenCalledExactlyOnceWith({
      textWeight: 700,
      theme: "sepia",
    });
    expect(reader.querySelector(".trf-controls")).toBeNull();
    expect(
      player.querySelector(".trf-reader-status, .trf-focus-backdrop"),
    ).toBeNull();
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

  it("syncs external settings without replacing a focused control", () => {
    const { stage, input, controls, reader } = mount();
    stage.click();
    const spacing = input("letterSpacing");
    spacing.focus();
    controls.apply({
      ...DEFAULTS,
      letterSpacing: 2,
      mode: "plain",
      romanize: true,
    });
    expect(document.activeElement).toBe(spacing);
    expect(input("letterSpacing")).toBe(spacing);
    expect(spacing.value).toBe("2");
    expect(
      reader.querySelector('[data-field="letterSpacing"] output')?.textContent,
    ).toBe("2px");
    expect(input("mode").value).toBe("plain");
    expect((input("romanize") as HTMLInputElement).checked).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it.each(["click", "keydown", "wheel"])(
    "keeps %s interactions from reaching the video player",
    (type) => {
      const { player, input } = mount();
      const playerEvent = vi.fn();
      player.addEventListener(type, playerEvent);
      const event = new Event(type, { bubbles: true, cancelable: true });
      input("letterSpacing").dispatchEvent(event);
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

  it("lets the panel and the discreet focus control cover and restore the video", () => {
    const { player, input, controls, onChange } = mount();
    const backdrop = player.querySelector<HTMLDivElement>(
      ".trf-focus-backdrop",
    )!;
    const focus = player.querySelector<HTMLButtonElement>(
      ".trf-reader-status button",
    )!;
    expect(backdrop.hidden).toBe(true);
    const checkbox = input("focusMode") as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenLastCalledWith({ focusMode: true });
    expect(backdrop.hidden).toBe(false);
    expect(focus.getAttribute("aria-label")).toBe("Show video");
    expect(focus.getAttribute("aria-pressed")).toBe("true");
    focus.click();
    expect(onChange).toHaveBeenLastCalledWith({ focusMode: false });
    expect(checkbox.checked).toBe(false);
    expect(backdrop.hidden).toBe(true);
    controls.setHidden(true);
    controls.apply({ ...DEFAULTS, focusMode: true });
    expect(backdrop.hidden).toBe(true);
    expect(
      player.querySelector<HTMLDivElement>(".trf-reader-status")!.hidden,
    ).toBe(true);
    controls.setHidden(false);
    expect(backdrop.hidden).toBe(false);
    expect(
      player.querySelector<HTMLDivElement>(".trf-reader-status")!.hidden,
    ).toBe(false);
  });

  it("shows an estimated current WPM, pause state and caption gaps out of the word stream", () => {
    const { player, stage, controls } = mount();
    const pace = player.querySelector(".trf-reader-status > output")!;
    controls.setSpeed(303, false);
    expect(pace.textContent).toBe("≈ 300 WPM");
    controls.setSpeed(300, true);
    expect(pace.textContent).toBe("Paused");
    controls.setSpeed(null, false);
    expect(pace.textContent).toBe("— WPM");
    expect(stage.contains(pace)).toBe(false);
  });
});
