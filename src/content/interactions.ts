import type { Settings } from "../settings";

interface InteractionOptions {
  getSettings: () => Settings;
  onChange: (patch: Partial<Settings>) => void;
  onToggle: () => void;
}

type Corner = "nw" | "ne" | "sw" | "se";
type Gesture = "move" | Corner;
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
    for (const [corner, label] of [
      ["nw", "top left"],
      ["ne", "top right"],
      ["sw", "bottom left"],
      ["se", "bottom right"],
    ] as const) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "trf-resize-handle";
      handle.dataset.corner = corner;
      handle.setAttribute("aria-label", `Resize captions from ${label}`);
      handle.title = "Drag a corner to resize captions. Arrow keys resize.";
      reader.append(handle);
      this.handles.push(handle);
      this.attach(handle, corner);
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
        if (
          this.reader.parentElement?.classList.contains("trf-focus-fullscreen")
        )
          return;
        const amount =
          (event.shiftKey ? 5 : 1) *
          (event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1);
        const settings = this.options.getSettings();
        const player = this.reader.parentElement?.getBoundingClientRect();
        if (!player?.width || !player.height) return;
        const box = this.reader.getBoundingClientRect();
        if (kind !== "move") {
          const outward =
            event.key === "ArrowLeft" || event.key === "ArrowRight"
              ? (kind.endsWith("w") ? -1 : 1) *
                (event.key === "ArrowLeft" ? -1 : 1)
              : (kind.startsWith("n") ? -1 : 1) *
                (event.key === "ArrowUp" ? -1 : 1);
          this.resize(
            box,
            settings,
            kind,
            1 + (outward * (event.shiftKey ? 5 : 1)) / settings.fontSize,
            player,
          );
        } else {
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
        if (
          this.reader.parentElement?.classList.contains("trf-focus-fullscreen")
        )
          return;
        const player = this.reader.parentElement?.getBoundingClientRect();
        if (!player?.width || !player.height) return;
        const box = this.reader.getBoundingClientRect();
        const settings = this.options.getSettings();
        let dragged = false;
        target.setPointerCapture?.(event.pointerId);
        const move = (next: PointerEvent): void => {
          if (next.pointerId !== event.pointerId) return;
          next.stopPropagation();
          if (
            this.reader.parentElement?.classList.contains(
              "trf-focus-fullscreen",
            )
          ) {
            this.finish?.();
            return;
          }
          const dx = next.clientX - event.clientX;
          const dy = next.clientY - event.clientY;
          if (!dragged && Math.hypot(dx, dy) < 4) return;
          dragged = true;
          next.preventDefault();
          this.reader.classList.add("trf-dragging");
          if (kind !== "move") {
            const x = kind.endsWith("w") ? -dx : dx;
            const y = kind.startsWith("n") ? -dy : dy;
            // Project onto the original diagonal, keeping font and box in step.
            const scale =
              1 +
              (x * box.width + y * box.height) /
                (box.width ** 2 + box.height ** 2);
            this.resize(box, settings, kind, scale, player);
          } else {
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
    if (this.reader.parentElement?.classList.contains("trf-focus-fullscreen"))
      return {};
    const x =
      clamp(left, player.left, player.right - width) + width / 2 - player.left;
    const y =
      player.bottom - clamp(top, player.top, player.bottom - height) - height;
    return {
      horizontalPosition: Math.round((x / player.width) * 1000) / 10,
      verticalPosition: Math.round((y / player.height) * 1000) / 10,
    };
  }

  private resize(
    box: DOMRect,
    settings: Settings,
    corner: Corner,
    scale: number,
    player: DOMRect,
  ): void {
    const west = corner.endsWith("w");
    const north = corner.startsWith("n");
    const x = west ? box.right : box.left;
    const y = north ? box.bottom : box.top;
    const factor = clamp(
      scale,
      Math.max(25 / settings.boxWidth, 18 / settings.fontSize),
      Math.min(
        94 / settings.boxWidth,
        72 / settings.fontSize,
        (west ? x - player.left : player.right - x) / box.width,
        (north ? y - player.top : player.bottom - y) / box.height,
      ),
    );
    const round = (value: number): number => Math.round(value * 10) / 10;
    this.options.onChange({
      boxWidth: round(settings.boxWidth * factor),
      fontSize: round(settings.fontSize * factor),
    });
    const next = this.reader.getBoundingClientRect();
    this.options.onChange(
      this.position(
        west ? x - next.width : x,
        north ? y - next.height : y,
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
