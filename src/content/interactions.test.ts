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
  reader.style.padding = "8px 12px";
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
    reader.style.setProperty(
      "--trf-size",
      `${settings.fontSize * (settings.autoScale ? 2 : 1)}px`,
    );
  });
  reader.style.setProperty(
    "--trf-size",
    `${settings.fontSize * (settings.autoScale ? 2 : 1)}px`,
  );
  const onToggle = vi.fn();
  const interactions = new CaptionInteractions(reader, stage, {
    getSettings: () => settings,
    onChange,
    onToggle,
  });
  mounted.push(interactions);
  for (const target of [reader, stage, ...reader.querySelectorAll("button")]) {
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
    side: (value: string) =>
      reader.querySelector<HTMLButtonElement>(`[data-side="${value}"]`)!,
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
  it("keeps the caption padding usable on the way from text to a side", () => {
    const { player, reader, stage, side, onToggle, settings } = mount();
    const playback = vi.fn();
    player.addEventListener("click", playback);
    // The CSS hover bridge targets the reader when the pointer is in padding.
    pointer(reader, "pointerdown", 402, 432);
    pointer(reader, "pointerup", 402, 432);
    click(reader);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(stage);
    const handle = side("left");
    pointer(handle, "pointerdown", 400, 430);
    pointer(handle, "pointerup", 380, 420);
    click(handle);
    expect(settings().boxWidth).toBe(42);
    expect(settings().fontSize).toBe(36);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(playback).not.toHaveBeenCalled();
  });

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
      horizontalPosition: 22.4,
      verticalPosition: 83.3,
    });
    pointer(stage, "pointermove", 9999, 9999);
    expect(settings()).toMatchObject({
      horizontalPosition: 77.6,
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

  it.each(["left", "right"])(
    "resizes from %s while keeping the opposite side still",
    (name) => {
      const { reader, side, settings, onToggle, onChange } = mount();
      const before = reader.getBoundingClientRect();
      const west = name === "left";
      const x = west ? before.left : before.right;
      const y = before.top + before.height / 2;
      const handle = side(name);
      pointer(handle, "pointerdown", x, y);
      pointer(handle, "pointermove", x + (west ? -80 : 80), y + 20);
      pointer(handle, "pointerup", x + (west ? -80 : 80), y + 20);
      click(handle);
      const after = reader.getBoundingClientRect();
      expect(settings()).toMatchObject({
        boxWidth: 48,
        fontSize: 36,
      });
      expect(
        onChange.mock.calls.every(([patch]) => !("fontSize" in patch)),
      ).toBe(true);
      expect(west ? after.right : after.left).toBeCloseTo(
        west ? before.right : before.left,
        0,
      );
      expect(after.top).toBeCloseTo(before.top, 0);
      expect(after.height).toBe(before.height);
      expect(onToggle).not.toHaveBeenCalled();
      expect(handle.textContent).toBe(west ? "<" : ">");
      expect(reader.querySelectorAll(".trf-resize-handle")).toHaveLength(2);
    },
  );

  it("narrows the window without changing its text or height", () => {
    const { reader, side, settings } = mount({ verticalPosition: 83.3 });
    const before = reader.getBoundingClientRect();
    key(side("right"), "ArrowLeft");
    expect(settings()).toMatchObject({ boxWidth: 39, fontSize: 36 });
    expect(reader.getBoundingClientRect().height).toBeCloseTo(before.height, 0);
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

  it("resizes the viewport without changing the font or disabling autoscale", () => {
    const { side, settings, reader } = mount({ autoScale: true });
    const before = reader.getBoundingClientRect();
    const handle = side("right");
    pointer(handle, "pointerdown", before.right, before.bottom);
    pointer(
      handle,
      "pointerup",
      before.right + before.width * 0.2,
      before.bottom + before.height * 0.2,
    );
    expect(settings()).toMatchObject({
      fontSize: 36,
      boxWidth: 48,
      autoScale: true,
    });
  });

  it("clamps window dimensions at the player edge and a readable minimum", () => {
    const { side, settings, reader } = mount();
    const handle = side("right");
    pointer(handle, "pointerdown", 700, 530);
    pointer(handle, "pointermove", 9999, 9999);
    pointer(handle, "pointerup", 9999, 9999);
    expect(settings()).toMatchObject({
      fontSize: 36,
      boxWidth: 67.6,
    });
    expect(reader.getBoundingClientRect().right).toBeLessThanOrEqual(1100);
    expect(reader.getBoundingClientRect().bottom).toBeCloseTo(530, 0);
    const enlarged = reader.getBoundingClientRect();
    pointer(handle, "pointerdown", enlarged.right, enlarged.bottom);
    pointer(handle, "pointerup", -9999, -9999);
    expect(settings().boxWidth).toBe(25);
    expect(settings().fontSize).toBe(36);
    expect(reader.getBoundingClientRect().height).toBeCloseTo(100, 0);
  });

  it("ignores vertical side drags and lets height follow the font", () => {
    const { side, reader, settings } = mount();
    const before = reader.getBoundingClientRect();
    const handle = side("left");
    pointer(handle, "pointerdown", before.left, before.top);
    pointer(handle, "pointerup", before.left, -9999);
    expect(reader.getBoundingClientRect().height).toBe(before.height);
    expect(settings().boxWidth).toBe(40);
    expect(settings()).not.toHaveProperty("boxHeight");
  });

  it("supports opening, moving and resizing with the keyboard", () => {
    const { player, stage, side, settings, onToggle } = mount();
    const playback = vi.fn();
    player.addEventListener("keydown", playback);
    key(stage, "Enter");
    key(stage, " ");
    key(stage, "ArrowRight", true);
    key(stage, "ArrowUp");
    const size = settings().fontSize;
    key(side("left"), "ArrowLeft");
    expect(settings().boxWidth).toBe(41);
    key(side("right"), "ArrowDown", true);
    expect(settings()).toMatchObject({
      boxWidth: 41,
      fontSize: size,
    });
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(playback).not.toHaveBeenCalled();
  });

  it("stops a side gesture on Escape without changing its last edit", () => {
    const { side, settings, reader, onToggle } = mount();
    const handle = side("right");
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

  it("adjusts text with the top arrow while width stays fixed and height follows", () => {
    const { reader, settings, onToggle, onChange } = mount({ autoScale: true });
    const size = reader.querySelector<HTMLButtonElement>(".trf-size-handle")!;
    const before = reader.getBoundingClientRect();
    pointer(size, "pointerdown", 500, 400);
    pointer(size, "pointerup", 500, 360);
    click(size);
    expect(settings()).toMatchObject({
      fontSize: 46,
      boxWidth: 40,
      autoScale: true,
    });
    expect(reader.getBoundingClientRect().height).toBeGreaterThan(
      before.height,
    );
    expect(reader.getBoundingClientRect().width).toBe(before.width);
    expect(
      onChange.mock.calls.every(
        ([patch]) => Object.keys(patch).join() === "fontSize",
      ),
    ).toBe(true);
    expect(onToggle).not.toHaveBeenCalled();
    key(size, "ArrowDown", true);
    expect(settings().fontSize).toBe(41);
    pointer(size, "pointerdown", 500, 400);
    pointer(size, "pointerup", 500, -9999);
    expect(settings().fontSize).toBe(72);
    key(size, "ArrowUp");
    expect(settings().fontSize).toBe(72);
    pointer(size, "pointerdown", 500, 400);
    pointer(size, "pointerup", 500, 9999);
    expect(settings().fontSize).toBe(18);
  });

  it("still adjusts text in Reading mode while window geometry stays fixed", () => {
    const { reader, player, settings } = mount();
    player.classList.add("trf-focus-reading");
    const size = reader.querySelector<HTMLButtonElement>(".trf-size-handle")!;
    key(size, "ArrowUp");
    expect(settings()).toMatchObject({ fontSize: 37, boxWidth: 40 });
  });

  it.each(["trf-focus-reading"])(
    "keeps %s fixed while caption clicks still open settings",
    (className) => {
      const { player, reader, stage, side, onChange, onToggle } = mount();
      player.classList.add(className);
      pointer(stage, "pointerdown", 500, 500);
      pointer(stage, "pointermove", 600, 440);
      pointer(stage, "pointerup", 600, 440);
      click(stage);
      key(stage, "Enter");
      key(stage, "ArrowRight");
      for (const name of ["left", "right"]) {
        const handle = side(name);
        pointer(handle, "pointerdown", 500, 500);
        pointer(handle, "pointermove", 600, 600);
        pointer(handle, "pointerup", 600, 600);
        key(handle, "ArrowRight");
      }
      expect(onChange).not.toHaveBeenCalled();
      expect(onToggle).toHaveBeenCalledTimes(2);
      expect(reader.classList.contains("trf-dragging")).toBe(false);
    },
  );

  it.each(["trf-focus-reading"])(
    "ends an in-flight gesture when %s begins",
    (className) => {
      const { player, reader, side, settings, onToggle } = mount();
      const handle = side("right");
      pointer(handle, "pointerdown", 700, 530);
      pointer(handle, "pointermove", 780, 550);
      const edited = { ...settings() };
      player.classList.add(className);
      pointer(handle, "pointermove", 900, 600);
      pointer(handle, "pointerup", 900, 600);
      click(handle);
      expect(settings()).toEqual(edited);
      expect(reader.classList.contains("trf-dragging")).toBe(false);
      expect(onToggle).not.toHaveBeenCalled();
    },
  );

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
