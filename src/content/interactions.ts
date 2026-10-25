import type { Settings } from "../settings";

interface InteractionOptions {
  getSettings: () => Settings;
  onChange: (patch: Partial<Settings>) => void;
  onToggle: () => void;
}

type Side = "left" | "right";
type Gesture = "move" | "font" | Side;
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export class CaptionInteractions {
  private abort = new AbortController();
  private handles: HTMLButtonElement[] = [];
  private finish: (() => void) | null = null;
  private ignoreClick = false;

  constructor(
    private reader: HTMLElement,
    private stage: HTMLElement,
    private options: InteractionOptions,
  ) {
    reader.classList.add("trf-interactive");
    stage.tabIndex = 0;
    stage.setAttribute("role", "button");
    stage.setAttribute("aria-label", "Caption appearance");
    stage.title =
      "Click to adjust captions. Drag to move. Arrow keys move; Enter opens settings.";
    this.attach(reader, "move");
    reader.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape" || !this.finish) return;
        event.preventDefault();
        event.stopPropagation();
        this.finish();
      },
      { signal: this.abort.signal, capture: true },
    );
    for (const [side, arrow] of [
      ["left", "<"],
      ["right", ">"],
    ] as const) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "trf-resize-handle";
      handle.dataset.side = side;
      handle.textContent = arrow;
      handle.setAttribute("aria-label", `Resize captions from ${side}`);
      handle.title =
        "Drag left or right to change caption width. Arrow keys resize.";
      reader.append(handle);
      this.handles.push(handle);
      this.attach(handle, side);
    }
    const size = document.createElement("button");
    size.type = "button";
    size.className = "trf-size-handle";
    size.textContent = "↕";
    size.setAttribute("aria-label", "Adjust caption text size");
    size.title =
      "Drag up to enlarge text, down to reduce it. Arrow keys adjust text size.";
    reader.append(size);
    this.handles.push(size);
    this.attach(size, "font");
  }

  private attach(target: HTMLElement, kind: Gesture): void {
    const signal = this.abort.signal;
    for (const type of [
      "mousedown",
      "mouseup",
      "dblclick",
      "keyup",
      "keypress",
    ]) {
      target.addEventListener(type, (event) => event.stopPropagation(), {
        signal,
      });
    }
    target.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        if (kind === "move" && !this.ignoreClick && event.detail < 2)
          this.options.onToggle();
        this.ignoreClick = false;
      },
      { signal },
    );
    target.addEventListener(
      "keydown",
      (event) => {
        event.stopPropagation();
        if (event.key === "Escape" && this.finish) {
          event.preventDefault();
          this.finish();
          return;
        }
        if (kind === "move" && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          this.options.onToggle();
          return;
        }
        if (!event.key.startsWith("Arrow")) return;
        event.preventDefault();
        if (kind === "font") {
          const direction = ["ArrowUp", "ArrowRight"].includes(event.key)
            ? 1
            : -1;
          this.options.onChange({
            fontSize: clamp(
              this.options.getSettings().fontSize +
                direction * (event.shiftKey ? 5 : 1),
              18,
              72,
            ),
          });
          return;
        }
        if (this.fixed()) return;
        const player = this.reader.parentElement?.getBoundingClientRect();
        if (!player?.width || !player.height) return;
        const box = this.reader.getBoundingClientRect();
        const step = event.shiftKey ? 5 : 1;
        const dx =
          ((event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowRight"
              ? 1
              : 0) *
            player.width *
            step) /
          100;
        const dy =
          ((event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0) *
            player.height *
            step) /
          100;
        if (kind !== "move") {
          this.resize(box, kind, dx, player);
        } else {
          this.options.onChange(
            this.position(
              box.left + dx,
              box.top + dy,
              box.width,
              box.height,
              player,
            ),
          );
        }
      },
      { signal },
    );
    target.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || event.isPrimary === false) return;
        event.stopPropagation();
        this.finish?.();
        this.ignoreClick = false;
        (kind === "move" ? this.stage : target).focus({ preventScroll: true });
        if (kind !== "font" && this.fixed()) return;
        const player = this.reader.parentElement?.getBoundingClientRect();
        if (!player?.width || !player.height) return;
        const box = this.reader.getBoundingClientRect();
        const font = this.options.getSettings().fontSize;
        const scale =
          (parseFloat(
            getComputedStyle(this.reader).getPropertyValue("--trf-size"),
          ) || font) / font;
        let dragged = false;
        target.setPointerCapture?.(event.pointerId);
        const move = (next: PointerEvent): void => {
          if (next.pointerId !== event.pointerId) return;
          next.stopPropagation();
          if (kind !== "font" && this.fixed()) {
            this.finish?.();
            return;
          }
          const dx = next.clientX - event.clientX;
          const dy = next.clientY - event.clientY;
          if (!dragged && Math.hypot(dx, dy) < 4) return;
          dragged = true;
          next.preventDefault();
          this.reader.classList.add("trf-dragging");
          if (kind === "font")
            this.options.onChange({
              fontSize: clamp(Math.round(font - dy / (2 * scale)), 18, 72),
            });
          else if (kind !== "move") this.resize(box, kind, dx, player);
          else {
            const size = this.reader.getBoundingClientRect();
            this.options.onChange(
              this.position(
                box.left + dx,
                box.top + dy,
                size.width,
                size.height,
                player,
              ),
            );
          }
        };
        const end = (next?: PointerEvent): void => {
          if (next && next.pointerId !== event.pointerId) return;
          if (next?.type === "pointerup") move(next);
          next?.stopPropagation();
          this.ignoreClick = dragged || next?.type === "pointercancel";
          this.reader.classList.remove("trf-dragging");
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", end);
          target.removeEventListener("pointercancel", end);
          target.removeEventListener("lostpointercapture", end);
          this.finish = null;
          if (target.hasPointerCapture?.(event.pointerId))
            target.releasePointerCapture(event.pointerId);
        };
        this.finish = end;
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", end);
        target.addEventListener("pointercancel", end);
        target.addEventListener("lostpointercapture", end);
      },
      { signal },
    );
  }

  private fixed(): boolean {
    return this.reader.parentElement?.matches(".trf-focus-reading") ?? false;
  }

  private position(
    left: number,
    top: number,
    width: number,
    height: number,
    player: DOMRect,
  ): Partial<Settings> {
    if (this.fixed()) return {};
    const x =
      clamp(left, player.left + 24, player.right - width - 24) +
      width / 2 -
      player.left;
    const y =
      player.bottom - clamp(top, player.top, player.bottom - height) - height;
    return {
      horizontalPosition: Math.round((x / player.width) * 1000) / 10,
      verticalPosition: Math.round((y / player.height) * 1000) / 10,
    };
  }

  private resize(box: DOMRect, side: Side, dx: number, player: DOMRect): void {
    const west = side === "left";
    const x = west ? box.right : box.left;
    const maxWidth = Math.min(
      player.width * 0.94,
      player.width - 48,
      west ? x - player.left - 24 : player.right - x - 24,
    );
    const width = clamp(
      box.width + (west ? -dx : dx),
      Math.min(player.width * 0.25, maxWidth),
      maxWidth,
    );
    const round = (value: number): number => Math.round(value * 10) / 10;
    // The window is a viewport: its geometry must not change the text size.
    this.options.onChange({
      boxWidth: round((width / player.width) * 100),
    });
    const next = this.reader.getBoundingClientRect();
    this.options.onChange(
      this.position(
        west ? x - next.width : x,
        box.top,
        next.width,
        next.height,
        player,
      ),
    );
  }

  destroy(): void {
    this.abort.abort();
    this.finish?.();
    this.reader.classList.remove("trf-interactive");
    for (const handle of this.handles) handle.remove();
    for (const attr of ["tabindex", "role", "aria-label", "title"])
      this.stage.removeAttribute(attr);
  }
}
