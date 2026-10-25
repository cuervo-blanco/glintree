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
    const height = settings.fontSize * 2 + 28;
    return rect(
      100 + settings.horizontalPosition * 10 - width / 2,
      650 - settings.verticalPosition * 6 - height,
      width,
      height,
    );
  };
  const style = () =>
    reader.style.setProperty(
      "--trf-size",
      `${settings.fontSize * (settings.autoScale ? 2 : 1)}px`,
    );
  style();
  const onChange = vi.fn((change: Partial<Settings>) => {
    settings = { ...settings, ...change };
    style();
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
    width: reader.querySelector<HTMLButtonElement>(".trf-resize-width")!,
    text: reader.querySelector<HTMLButtonElement>(".trf-resize-text")!,
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

  it("widens symmetrically and keeps an edge-positioned card on screen", () => {
    const { width, settings, onToggle } = mount({ horizontalPosition: 20 });
    pointer(width, "pointerdown", 500, 500);
    pointer(width, "pointermove", 600, 500);
    expect(settings()).toMatchObject({ boxWidth: 60, horizontalPosition: 30 });
    pointer(width, "pointerup", 600, 500);
    click(width);
    expect(onToggle).not.toHaveBeenCalled();
    key(width, "ArrowRight", true);
    expect(settings()).toMatchObject({
      boxWidth: 65,
      horizontalPosition: 32.5,
    });
  });

  it("keeps a narrowing caption on screen when its line wraps taller", () => {
    const { reader, width, settings } = mount({ verticalPosition: 83.3 });
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
    key(width, "ArrowLeft", true);
    expect(settings()).toMatchObject({ boxWidth: 35, verticalPosition: 66.7 });
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

  it("resizes text at the effective player scale without disabling autoscale", () => {
    const { text, settings } = mount({ autoScale: true });
    pointer(text, "pointerdown", 500, 500);
    pointer(text, "pointermove", 520, 520);
    pointer(text, "pointerup", 520, 520);
    expect(settings()).toMatchObject({ fontSize: 46, autoScale: true });
  });

  it("clamps text size and moves a growing card back inside the player", () => {
    const { text, settings, reader } = mount({ verticalPosition: 83.3 });
    pointer(text, "pointerdown", 500, 500);
    pointer(text, "pointermove", 900, 900);
    pointer(text, "pointerup", 900, 900);
    expect(settings()).toMatchObject({ fontSize: 72, verticalPosition: 71.3 });
    expect(reader.getBoundingClientRect().top).toBeGreaterThanOrEqual(50);
  });

  it("supports opening, moving and resizing with the keyboard", () => {
    const { player, stage, width, text, settings, onToggle } = mount();
    const playback = vi.fn();
    player.addEventListener("keydown", playback);
    key(stage, "Enter");
    key(stage, " ");
    key(stage, "ArrowRight", true);
    key(stage, "ArrowUp");
    key(width, "ArrowLeft");
    key(text, "ArrowUp", true);
    expect(settings()).toMatchObject({
      horizontalPosition: 55,
      verticalPosition: 21,
      boxWidth: 39,
      fontSize: 41,
    });
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(playback).not.toHaveBeenCalled();
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
