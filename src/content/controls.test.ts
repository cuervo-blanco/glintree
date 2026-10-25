// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, type Settings } from "../settings";
import { ReaderControls } from "./controls";
import { BookView } from "./book";

const save = vi.fn().mockResolvedValue(undefined);
const mounted: ReaderControls[] = [];
const books: BookView[] = [];

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
  for (const book of books.splice(0)) book.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reader controls", () => {
  it("skips invisible caption editing targets during a gap", () => {
    const { reader, controls } = mount();
    const targets = reader.querySelectorAll<HTMLElement>(
      ".trf-stage, .trf-resize-handle, .trf-size-handle",
    );
    controls.setIdle(true);
    expect(Array.from(targets, (target) => target.tabIndex)).toEqual([
      -1, -1, -1, -1,
    ]);
    controls.setIdle(false);
    expect(Array.from(targets, (target) => target.tabIndex)).toEqual([
      0, 0, 0, 0,
    ]);
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

  it("exits Focus with Escape from the caption stage", () => {
    const { player, stage, onChange } = mount(true, { focusMode: true });
    const playerKey = vi.fn();
    player.addEventListener("keydown", playerKey);
    stage.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ focusMode: false });
    expect(playerKey).not.toHaveBeenCalled();
  });

  it("keeps text size in the panel and window geometry on the captions", () => {
    const { reader, input } = mount();
    for (const key of [
      "horizontalPosition",
      "verticalPosition",
      "boxWidth",
      "boxHeight",
      "autoScale",
    ]) {
      expect(reader.querySelector(`[data-field="${key}"]`)).toBeNull();
    }
    for (const key of [
      "mode",
      "font",
      "fontSize",
      "theme",
      "customAccent",
      "romanize",
      "focusMode",
    ] as const)
      expect(input(key)).toBeInstanceOf(HTMLElement);
    expect(reader.querySelectorAll(".trf-resize-handle")).toHaveLength(2);
  });

  it("changes text size independently of the caption window", () => {
    const { input, onChange } = mount(true, { boxWidth: 70 });
    input("fontSize").value = "36";
    input("fontSize").dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ fontSize: 36 });
    vi.advanceTimersByTime(250);
    expect(save).toHaveBeenCalledExactlyOnceWith({ fontSize: 36 });
  });

  it("docks appearance beside Reading mode and keeps edits and its close button usable", () => {
    const { player, reader, stage, dialog, input, onChange } = mount();
    const book = new BookView(reader, [], () => stage.click());
    books.push(book);
    book.setActive(true);
    player.classList.add("trf-focus-reading");
    book.root.click();
    expect(dialog.hidden).toBe(false);
    expect(dialog.classList.contains("trf-controls--sidebar")).toBe(true);
    expect(dialog.style.left).toBe("-210px");
    expect(dialog.style.top).toBe("-492px");
    expect(dialog.style.getPropertyValue("--trf-panel-width")).toBe("320px");
    expect(dialog.style.getPropertyValue("--trf-panel-height")).toBe("520px");
    const text = input("fontSize");
    text.focus();
    text.value = "40";
    text.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ fontSize: 40 });
    expect(document.activeElement).toBe(text);
    dialog
      .querySelector<HTMLButtonElement>('[aria-label="Close appearance"]')!
      .click();
    expect(dialog.hidden).toBe(true);
    expect(reader.classList.contains("trf-editing")).toBe(false);
    expect(document.activeElement).toBe(book.root);
  });

  it("returns an open appearance panel to its floating layout when Reading mode ends", () => {
    const { player, stage, dialog, controls } = mount();
    player.classList.add("trf-focus-reading");
    stage.click();
    expect(dialog.classList.contains("trf-controls--sidebar")).toBe(true);
    player.classList.remove("trf-focus-reading");
    controls.layout();
    expect(dialog.hidden).toBe(false);
    expect(dialog.classList.contains("trf-controls--sidebar")).toBe(false);
    expect(dialog.style.getPropertyValue("--trf-panel-width")).toBe("340px");
  });

  it("labels the editable controls rather than their displayed values", () => {
    const { reader, input } = mount();
    for (const row of reader.querySelectorAll<HTMLLabelElement>(
      ".trf-control-row",
    )) {
      expect(row.control).toBe(input(row.dataset.field as keyof Settings));
    }
  });

  it("closes appearance before a second Escape from book captions exits Focus", () => {
    const { player, reader, stage, input, dialog, onChange } = mount(true, {
      focusMode: true,
      focusReading: true,
    });
    const view = new BookView(reader, [], () => stage.click());
    books.push(view);
    view.setActive(true);
    const book = view.root;
    const playerKey = vi.fn();
    player.addEventListener("keydown", playerKey);
    stage.click();
    expect(book.getAttribute("aria-expanded")).toBe("true");
    input("fontSize").focus();
    input("fontSize").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(dialog.hidden).toBe(true);
    expect(document.activeElement).toBe(book);
    expect(book.getAttribute("aria-expanded")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
    book.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith({
      focusMode: false,
      focusReading: false,
    });
    expect(playerKey).not.toHaveBeenCalled();
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
      customText: "#222222",
      customFaded: "#333333",
      customAccent: "#444444",
    });
    reader.style.setProperty("--bg", "#303438");
    reader.style.setProperty("--text", "#e4e1dc");
    reader.style.setProperty("--faded", "#7f858a");
    reader.style.setProperty("--accent", "#c97958");
    controls.apply({ ...DEFAULTS, theme: "slate" });
    expect(reader.querySelector('[data-field="customBackground"]')).toBeNull();
    expect(input("customText").value).toBe("#e4e1dc");
    input("customAccent").value = "#aa7744";
    input("customAccent").dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      theme: "custom",
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

  it("lets Show video leave Reading mode after native fullscreen restores it", () => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    const fullscreen = vi.spyOn(document, "fullscreenElement", "get");
    const { player, controls, onChange, input } = mount(true, {
      focusReading: true,
    });
    const checkbox = input("focusMode") as HTMLInputElement;
    const backdrop = player.querySelector<HTMLDivElement>(
      ".trf-focus-backdrop",
    )!;
    const focus = player.querySelector<HTMLButtonElement>(
      ".trf-reader-status button",
    )!;
    expect(backdrop.hidden).toBe(true);
    fullscreen.mockReturnValue(player);
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(backdrop.hidden).toBe(false);
    expect(focus.getAttribute("aria-label")).toBe("Show video");
    expect(checkbox.checked).toBe(true);
    controls.setHidden(true);
    expect(backdrop.hidden).toBe(true);
    controls.setHidden(false);
    expect(backdrop.hidden).toBe(false);
    focus.click();
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      focusMode: false,
      focusReading: false,
    });
    expect(backdrop.hidden).toBe(true);
    expect(checkbox.checked).toBe(false);
    onChange.mockClear();
    controls.apply({ ...DEFAULTS, focusReading: true });
    expect(checkbox.checked).toBe(true);
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      focusMode: false,
      focusReading: false,
    });
    controls.apply({ ...DEFAULTS, focusReading: true });
    fullscreen.mockReturnValue(null);
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(backdrop.hidden).toBe(true);
    expect(focus.textContent).toBe("Focus");
    expect(checkbox.checked).toBe(false);
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
