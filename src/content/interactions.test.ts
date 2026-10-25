// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, type Settings } from "../settings";
import { CaptionInteractions } from "./interactions";

const mounted: CaptionInteractions[] = [];
const rect = (
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect => new DOMRect(left, top, width, height);

function mount(patch: Partial<Settings> = {}) {
  let settings = {
    ...DEFAULTS,
    fontSize: 36,
    autoScale: false,
    boxWidth: 40,
    verticalPosition: 20,
    ...patch,
  };
  const player = document.createElement("div");
  const reader = document.createElement("div");
  const stage = document.createElement("div");
  reader.append(stage);
  player.append(reader);
  document.body.append(player);
  player.getBoundingClientRect = () => rect(100, 50, 1000, 600);
  reader.getBoundingClientRect = () => {
    const width = settings.boxWidth * 10;
    const height = settings.fontSize * (settings.autoScale ? 2 : 1) * 2 + 28;
    return rect(
      100 + settings.horizontalPosition * 10 - width / 2,
      650 - settings.verticalPosition * 6 - height,
      width,
      height,
    );
  };
  const onChange = vi.fn((change: Partial<Settings>) => {
    settings = { ...settings, ...change };
  });
  const onToggle = vi.fn();
  const interactions = new CaptionInteractions(reader, stage, {
    getSettings: () => settings,
    onChange,
    onToggle,
  });
  mounted.push(interactions);
  for (const target of [stage, ...reader.querySelectorAll("button")]) {
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
  }
  return {
    player,
    reader,
    stage,
    interactions,
    onChange,
    onToggle,
    settings: () => settings,
    corner: (value: string) =>
      reader.querySelector<HTMLButtonElement>(`[data-corner="${value}"]`)!,
  };
}

function pointer(
  target: HTMLElement,
  type: string,
  x: number,
  y: number,
  pointerId = 1,
): void {
  const event = new MouseEvent(type, {
    button: 0,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
  Object.assign(event, { pointerId, isPrimary: true });
  target.dispatchEvent(event);
}

const click = (target: HTMLElement, detail = 1) =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }));
const key = (target: HTMLElement, value: string, shiftKey = false) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: value,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );

afterEach(() => {
  for (const interaction of mounted.splice(0)) interaction.destroy();
  document.body.replaceChildren();
});

describe("caption interactions", () => {
  it("opens settings on a caption click without clicking the player", () => {
    const { player, stage, onToggle, onChange } = mount();
    const playback = vi.fn();
    player.addEventListener("click", playback);
    player.addEventListener("pointerdown", playback);
    pointer(stage, "pointerdown", 500, 500);
    pointer(stage, "pointerup", 500, 500);
    click(stage);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(playback).not.toHaveBeenCalled();
    expect(stage.getAttribute("role")).toBe("button");
    expect(stage.tabIndex).toBe(0);
  });

  it("allows slight hand movement during a click", () => {
    const { stage, onChange, onToggle } = mount();
    pointer(stage, "pointerdown", 500, 500);
    pointer(stage, "pointermove", 503, 500);
    pointer(stage, "pointerup", 503, 500);
    click(stage);
    expect(onChange).not.toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("drags both position axes and consumes the following click", () => {
    const { stage, onChange, onToggle, settings } = mount();
    pointer(stage, "pointerdown", 500, 500);
    pointer(stage, "pointermove", 900, 500, 2);
    expect(onChange).not.toHaveBeenCalled();
    pointer(stage, "pointermove", 600, 440);
    expect(settings()).toMatchObject({
      horizontalPosition: 60,
      verticalPosition: 30,
    });
    pointer(stage, "pointerup", 620, 440);
    expect(settings().horizontalPosition).toBe(62);
    click(stage);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("keeps the whole caption card within the player", () => {
    const { stage, settings } = mount();
    pointer(stage, "pointerdown", 500, 500);
    pointer(stage, "pointermove", -9999, -9999);
    expect(settings()).toMatchObject({
      horizontalPosition: 20,
      verticalPosition: 83.3,
    });
    pointer(stage, "pointermove", 9999, 9999);
    expect(settings()).toMatchObject({
      horizontalPosition: 80,
      verticalPosition: 0,
    });
    pointer(stage, "pointerup", 9999, 9999);
  });

  it("ends cancelled gestures without opening settings or accepting later moves", () => {
    const { reader, stage, onToggle, settings } = mount();
    pointer(stage, "pointerdown", 500, 500);
    pointer(stage, "pointermove", 600, 440);
    pointer(stage, "pointercancel", 600, 440);
    pointer(stage, "pointermove", 900, 900);
    click(stage);
    expect(settings()).toMatchObject({
      horizontalPosition: 60,
      verticalPosition: 30,
    });
    expect(onToggle).not.toHaveBeenCalled();
    expect(reader.classList.contains("trf-dragging")).toBe(false);
  });

  it.each(["nw", "ne", "sw", "se"])(
    "resizes from %s while keeping the opposite corner still",
    (name) => {
      const { reader, corner, settings, onToggle } = mount();
      const before = reader.getBoundingClientRect();
      const west = name.endsWith("w");
      const north = name.startsWith("n");
      const x = west ? before.left : before.right;
      const y = north ? before.top : before.bottom;
      const handle = corner(name);
      pointer(handle, "pointerdown", x, y);
      pointer(
        handle,
        "pointermove",
        x + (west ? -80 : 80),
        y + (north ? -20 : 20),
      );
      pointer(
        handle,
        "pointerup",
        x + (west ? -80 : 80),
        y + (north ? -20 : 20),
      );
      click(handle);
      const after = reader.getBoundingClientRect();
      expect(settings()).toMatchObject({ boxWidth: 48, fontSize: 43.2 });
      expect(west ? after.right : after.left).toBeCloseTo(
        west ? before.right : before.left,
        0,
      );
      expect(north ? after.bottom : after.top).toBeCloseTo(
        north ? before.bottom : before.top,
        0,
      );
      expect(onToggle).not.toHaveBeenCalled();
      expect(handle.textContent).toBe("");
      expect(reader.querySelectorAll(".trf-resize-handle")).toHaveLength(4);
    },
  );

  it("keeps a narrowing caption on screen when its line wraps taller", () => {
    const { reader, corner, settings } = mount({ verticalPosition: 83.3 });
    const original = reader.getBoundingClientRect;
    reader.getBoundingClientRect = () => {
      const box = original();
      const height = settings().boxWidth < 40 ? 200 : box.height;
      return rect(
        box.left,
        650 - settings().verticalPosition * 6 - height,
        box.width,
        height,
      );
    };
    key(corner("ne"), "ArrowLeft", true);
    expect(settings().boxWidth).toBeLessThan(40);
    expect(settings().verticalPosition).toBe(66.7);
    expect(reader.getBoundingClientRect().top).toBeCloseTo(50, 0);
  });

  it("uses the new line height when captions change during a drag", () => {
    const { stage, onChange, settings } = mount();
    pointer(stage, "pointerdown", 500, 500);
    onChange({ fontSize: 72 });
    pointer(stage, "pointermove", 500, -9999);
    expect(settings().verticalPosition).toBe(71.3);
    pointer(stage, "pointercancel", 500, -9999);
  });

  it("scales the font and box together without disabling autoscale", () => {
    const { corner, settings, reader } = mount({ autoScale: true });
    const before = reader.getBoundingClientRect();
    const handle = corner("se");
    pointer(handle, "pointerdown", before.right, before.bottom);
    pointer(
      handle,
      "pointerup",
      before.right + before.width * 0.2,
      before.bottom + before.height * 0.2,
    );
    expect(settings()).toMatchObject({
      fontSize: 43.2,
      boxWidth: 48,
      autoScale: true,
    });
  });

  it("clamps the shared scale at the player edge and minimum caption width", () => {
    const { corner, settings, reader } = mount();
    const handle = corner("se");
    pointer(handle, "pointerdown", 700, 530);
    pointer(handle, "pointermove", 9999, 9999);
    pointer(handle, "pointerup", 9999, 9999);
    expect(settings()).toMatchObject({ fontSize: 63, boxWidth: 70 });
    expect(reader.getBoundingClientRect().right).toBeLessThanOrEqual(1100);
    const enlarged = reader.getBoundingClientRect();
    pointer(handle, "pointerdown", enlarged.right, enlarged.bottom);
    pointer(handle, "pointerup", -9999, -9999);
    expect(settings().boxWidth).toBe(25);
    expect(settings().fontSize).toBe(22.5);
  });

  it("supports opening, moving and resizing with the keyboard", () => {
    const { player, stage, corner, settings, onToggle } = mount();
    const playback = vi.fn();
    player.addEventListener("keydown", playback);
    key(stage, "Enter");
    key(stage, " ");
    key(stage, "ArrowRight", true);
    key(stage, "ArrowUp");
    const size = settings().fontSize;
    key(corner("nw"), "ArrowLeft");
    expect(settings().fontSize).toBe(size + 1);
    key(corner("se"), "ArrowDown", true);
    expect(settings().fontSize).toBe(size + 6);
    expect(settings().boxWidth / 40).toBeCloseTo(settings().fontSize / size, 2);
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(playback).not.toHaveBeenCalled();
  });

  it("stops a corner gesture on Escape without changing its last edit", () => {
    const { corner, settings, reader, onToggle } = mount();
    const handle = corner("se");
    pointer(handle, "pointerdown", 700, 530);
    pointer(handle, "pointermove", 780, 550);
    const edited = { ...settings() };
    key(handle, "Escape");
    pointer(handle, "pointermove", 900, 600);
    click(handle);
    expect(settings()).toEqual(edited);
    expect(reader.classList.contains("trf-dragging")).toBe(false);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("keeps fullscreen focus centred while caption clicks still open settings", () => {
    const { player, reader, stage, corner, onChange, onToggle } = mount();
    player.classList.add("trf-focus-fullscreen");
    pointer(stage, "pointerdown", 500, 500);
    pointer(stage, "pointermove", 600, 440);
    pointer(stage, "pointerup", 600, 440);
    click(stage);
    key(stage, "Enter");
    key(stage, "ArrowRight");
    for (const name of ["nw", "ne", "sw", "se"]) {
      const handle = corner(name);
      pointer(handle, "pointerdown", 500, 500);
      pointer(handle, "pointermove", 600, 600);
      pointer(handle, "pointerup", 600, 600);
      key(handle, "ArrowRight");
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(reader.classList.contains("trf-dragging")).toBe(false);
  });

  it("ends an in-flight gesture when fullscreen focus begins", () => {
    const { player, reader, corner, settings, onToggle } = mount();
    const handle = corner("se");
    pointer(handle, "pointerdown", 700, 530);
    pointer(handle, "pointermove", 780, 550);
    const edited = { ...settings() };
    player.classList.add("trf-focus-fullscreen");
    pointer(handle, "pointermove", 900, 600);
    pointer(handle, "pointerup", 900, 600);
    click(handle);
    expect(settings()).toEqual(edited);
    expect(reader.classList.contains("trf-dragging")).toBe(false);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("still allows direct editing in focus without fullscreen", () => {
    const { stage, settings } = mount({ focusMode: true });
    pointer(stage, "pointerdown", 500, 500);
    pointer(stage, "pointerup", 600, 440);
    expect(settings()).toMatchObject({
      horizontalPosition: 60,
      verticalPosition: 30,
    });
  });

  it("does not toggle a second time on a double-click", () => {
    const { stage, onToggle } = mount();
    click(stage, 1);
    click(stage, 2);
    stage.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, detail: 2 }),
    );
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("cleans up capture, handles and listeners during a drag", () => {
    const { player, reader, stage, interactions, settings, onToggle } = mount();
    pointer(stage, "pointerdown", 500, 500);
    pointer(stage, "pointermove", 600, 440);
    interactions.destroy();
    pointer(stage, "pointermove", 900, 900);
    expect(settings()).toMatchObject({
      horizontalPosition: 60,
      verticalPosition: 30,
    });
    expect(reader.querySelectorAll("button")).toHaveLength(0);
    expect(reader.classList.contains("trf-dragging")).toBe(false);
    expect(stage.hasAttribute("role")).toBe(false);
    const playerClick = vi.fn();
    player.addEventListener("click", playerClick);
    click(stage);
    expect(playerClick).toHaveBeenCalledOnce();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
