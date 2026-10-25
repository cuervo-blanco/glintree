import type { Settings } from "../settings";

interface InteractionOptions {
  getSettings: () => Settings;
  onChange: (patch: Partial<Settings>) => void;
  onToggle: () => void;
}

type Gesture = "move" | "width" | "text";
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
    this.attach(stage, "move");
    for (const [kind, label, symbol] of [
      ["width", "Resize caption width", "↔"],
      ["text", "Resize caption text", "↘"],
    ] as const) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = `trf-resize-${kind}`;
      handle.setAttribute("aria-label", label);
      handle.title = `${label}. Drag or use arrow keys.`;
      handle.textContent = symbol;
      reader.append(handle);
      this.handles.push(handle);
      this.attach(handle, kind);
    }
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
        if (kind === "move" && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          this.options.onToggle();
          return;
        }
        if (!event.key.startsWith("Arrow")) return;
        event.preventDefault();
        const amount =
          (event.shiftKey ? 5 : 1) *
          (event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1);
        const settings = this.options.getSettings();
        if (kind === "text") this.textSize(settings.fontSize + amount);
        else if (kind === "width") this.width(settings.boxWidth + amount);
        else {
          const player = this.reader.parentElement?.getBoundingClientRect();
          if (!player?.width || !player.height) return;
          const box = this.reader.getBoundingClientRect();
          const x =
            event.key === "ArrowLeft" || event.key === "ArrowRight"
              ? (amount * player.width) / 100
              : 0;
          const y =
            event.key === "ArrowUp" || event.key === "ArrowDown"
              ? (-amount * player.height) / 100
              : 0;
          this.options.onChange(
            this.position(
              box.left + x,
              box.top + y,
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
        target.focus({ preventScroll: true });
        const player = this.reader.parentElement?.getBoundingClientRect();
        if (!player?.width || !player.height) return;
        const box = this.reader.getBoundingClientRect();
        const settings = this.options.getSettings();
        const scale =
          (parseFloat(
            getComputedStyle(this.reader).getPropertyValue("--trf-size"),
          ) || settings.fontSize) / settings.fontSize;
        let dragged = false;
        target.setPointerCapture?.(event.pointerId);
        const move = (next: PointerEvent): void => {
          if (next.pointerId !== event.pointerId) return;
          next.stopPropagation();
          const dx = next.clientX - event.clientX;
          const dy = next.clientY - event.clientY;
          if (!dragged && Math.hypot(dx, dy) < 4) return;
          dragged = true;
          next.preventDefault();
          this.reader.classList.add("trf-dragging");
          if (kind === "width")
            this.width(settings.boxWidth + (dx * 200) / player.width);
          else if (kind === "text")
            this.textSize(settings.fontSize + (dx + dy) / (2 * scale));
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

  private position(
    left: number,
    top: number,
    width: number,
    height: number,
    player: DOMRect,
  ): Partial<Settings> {
    const x =
      clamp(left, player.left, player.right - width) + width / 2 - player.left;
    const y =
      player.bottom - clamp(top, player.top, player.bottom - height) - height;
    return {
      horizontalPosition: Math.round((x / player.width) * 1000) / 10,
      verticalPosition: Math.round((y / player.height) * 1000) / 10,
    };
  }

  private width(value: number): void {
    const boxWidth = clamp(Math.round(value), 25, 94);
    const { horizontalPosition } = this.options.getSettings();
    this.options.onChange({
      boxWidth,
      horizontalPosition: clamp(
        horizontalPosition,
        boxWidth / 2,
        100 - boxWidth / 2,
      ),
    });
    this.keepInPlayer();
  }

  private textSize(value: number): void {
    this.options.onChange({ fontSize: clamp(Math.round(value), 18, 72) });
    this.keepInPlayer();
  }

  private keepInPlayer(): void {
    const player = this.reader.parentElement?.getBoundingClientRect();
    if (!player?.width || !player.height) return;
    const box = this.reader.getBoundingClientRect();
    if (
      box.left < player.left ||
      box.right > player.right ||
      box.top < player.top ||
      box.bottom > player.bottom
    ) {
      this.options.onChange(
        this.position(box.left, box.top, box.width, box.height, player),
      );
    }
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
