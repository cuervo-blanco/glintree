import { saveSettings, type Settings } from "../settings";
import { CUSTOM_COLOR_KEYS, FIELDS, type Field } from "../settingsFields";
import { CaptionInteractions } from "./interactions";

export interface ReaderControlsOptions {
  romanizable: boolean;
  onChange: (patch: Partial<Settings>) => void;
}

export class ReaderControls {
  private root = document.createElement("div");
  private panel = document.createElement("div");
  private backdrop = document.createElement("div");
  private status = document.createElement("div");
  private pace = document.createElement("output");
  private focus = document.createElement("button");
  private stage: HTMLElement;
  private interactions: CaptionInteractions;
  private resize: ResizeObserver | null = null;
  private suppressed = false;
  private inputs = new Map<Field, HTMLInputElement | HTMLSelectElement>();
  private settings: Settings;
  private pending: Partial<Settings> = {};
  private timer = 0;
  private anchor: { x: number; y: number; height: number } | null = null;

  constructor(
    private reader: HTMLElement,
    settings: Settings,
    private options: ReaderControlsOptions,
  ) {
    this.settings = settings;
    this.root.className = "trf-controls";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "Caption appearance");
    this.panel.className = "trf-control-panel";
    const heading = document.createElement("div");
    heading.className = "trf-control-heading";
    const title = document.createElement("strong");
    title.textContent = "Appearance";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close appearance");
    close.addEventListener("click", this.close);
    heading.append(title, close);
    this.panel.append(heading);
    const direct = [
      "horizontalPosition",
      "verticalPosition",
      "boxWidth",
      "autoScale",
    ];
    const fields = [
      ...FIELDS.filter((f) =>
        ["mode", "romanize", "focusMode"].includes(f.key),
      ),
      ...FIELDS.filter(
        (f) => f.group === "appearance" && !direct.includes(f.key),
      ),
    ];
    for (const field of fields) {
      if (field.key === "romanize" && !options.romanizable) continue;
      this.panel.append(this.row(field));
    }
    this.root.append(this.panel);
    reader.append(this.root);

    this.stage = reader.querySelector<HTMLElement>(".trf-stage")!;
    this.interactions = new CaptionInteractions(reader, this.stage, {
      getSettings: () => this.settings,
      onChange: (patch) => this.change(patch),
      onToggle: () => this.toggle(),
    });
    this.stage.setAttribute("aria-haspopup", "dialog");
    this.stage.setAttribute("aria-expanded", "false");
    this.backdrop.className = "trf-focus-backdrop";
    this.backdrop.setAttribute("aria-hidden", "true");
    this.status.className = "trf-reader-status";
    this.pace.title =
      "Estimated caption words per minute, adjusted for playback speed";
    this.pace.setAttribute("aria-live", "off");
    this.pace.textContent = "— WPM";
    this.focus.type = "button";
    this.focus.addEventListener("click", () =>
      this.change({ focusMode: !this.isFocused() }),
    );
    this.status.append(this.pace, this.focus);

    // Editing controls must never trigger the player's playback shortcuts.
    for (const type of [
      "click",
      "dblclick",
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "touchstart",
      "touchend",
      "wheel",
      "keydown",
      "keyup",
      "keypress",
    ]) {
      for (const target of [this.root, this.status])
        target.addEventListener(type, (event) => event.stopPropagation());
    }
    this.root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.close();
    });
    this.reader.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!this.root.hidden) this.toggle(false);
      else if (this.settings.focusMode) this.change({ focusMode: false });
    });
    document.addEventListener("pointerdown", this.outside);
    document.addEventListener("fullscreenchange", this.syncFocus);
    this.apply(settings);
  }

  private outside = (event: Event): void => {
    if (this.root.hidden) return;
    if (
      event.target instanceof Node &&
      !this.reader.contains(event.target) &&
      !this.status.contains(event.target)
    )
      this.toggle(false);
  };

  private toggle(open = this.root.hidden): void {
    this.root.hidden = !open;
    this.reader.classList.toggle("trf-editing", open);
    this.stage.setAttribute("aria-expanded", String(open));
    this.reader
      .querySelector(".trf-book")
      ?.setAttribute("aria-expanded", String(open));
    if (!open) this.anchor = null;
    this.apply(this.settings);
    this.layout();
  }

  private close = (): void => {
    this.toggle(false);
    (
      this.reader.querySelector<HTMLElement>(".trf-book:not([hidden])") ??
      this.stage
    ).focus();
  };

  private change(patch: Partial<Settings>): void {
    if (patch.focusMode === false && this.settings.focusReading)
      patch = { ...patch, focusReading: false };
    this.pending = { ...this.pending, ...patch };
    this.settings = { ...this.settings, ...patch };
    this.options.onChange(patch);
    this.apply(this.settings);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 250);
  }

  mount(player: HTMLElement): void {
    for (const stray of player.querySelectorAll(
      ".trf-focus-backdrop, .trf-reader-status",
    )) {
      if (stray !== this.backdrop && stray !== this.status) stray.remove();
    }
    player.append(this.backdrop, this.status);
    this.resize?.disconnect();
    this.resize = new ResizeObserver(() => this.layout());
    this.resize.observe(this.reader);
    this.apply(this.settings);
  }

  setHidden(hidden: boolean): void {
    this.suppressed = hidden;
    this.status.hidden = hidden;
    this.syncFocus();
  }

  setSpeed(wpm: number | null, paused: boolean): void {
    const text = paused
      ? "Paused"
      : wpm === null
        ? "— WPM"
        : `≈ ${Math.round(wpm / 10) * 10} WPM`;
    if (this.pace.textContent !== text) this.pace.textContent = text;
  }

  attachFocus(controls: HTMLElement): void {
    this.status.append(controls);
  }

  setIdle(idle: boolean): void {
    for (const target of this.reader.querySelectorAll<HTMLElement>(
      ".trf-stage, .trf-resize-handle, .trf-size-handle",
    )) {
      target.tabIndex = idle ? -1 : 0;
      target.setAttribute("aria-disabled", String(idle));
    }
  }

  private row(field: Field): HTMLElement {
    const row = document.createElement("label");
    row.className = "trf-control-row";
    row.dataset.field = field.key;
    row.title = field.help ?? "";
    const label = document.createElement("span");
    label.textContent =
      field.key === "romanize" ? "Romanized script" : field.label;
    const input = document.createElement(
      field.kind === "select" ? "select" : "input",
    );
    input.id = `trf-caption-${field.key}`;
    row.htmlFor = input.id;
    if (input instanceof HTMLSelectElement && field.kind === "select") {
      for (const option of field.options)
        input.add(new Option(option.label, option.value));
    } else if (input instanceof HTMLInputElement) {
      input.type = field.kind === "toggle" ? "checkbox" : field.kind;
      if (field.kind === "range") {
        input.min = String(field.min);
        input.max = String(field.max);
        input.step = String(field.step);
      }
    }
    if (field.kind === "range" || field.kind === "color")
      label.append(document.createElement("output"));
    input.addEventListener(
      field.kind === "range" || field.kind === "color" ? "input" : "change",
      () => {
        const value =
          field.kind === "toggle" && input instanceof HTMLInputElement
            ? input.checked
            : field.kind === "range"
              ? Number(input.value)
              : input.value;
        let patch: Partial<Settings> = { [field.key]: value };
        // Editing a colour starts from the palette on screen, as in Options.
        if (field.kind === "color" && this.settings.theme !== "custom") {
          patch = { ...this.palette(), ...patch, theme: "custom" };
        }
        this.change(patch);
      },
    );
    this.inputs.set(field, input);
    row.append(label, input);
    return row;
  }

  private palette(): Partial<Settings> {
    const style = getComputedStyle(this.reader);
    return Object.fromEntries(
      CUSTOM_COLOR_KEYS.map((key, index) => [
        key,
        style.getPropertyValue(["--text", "--faded", "--accent"][index]).trim(),
      ]).filter(([, value]) => /^#[0-9a-f]{6}$/i.test(value)),
    );
  }

  private isFocused(): boolean {
    return (
      this.settings.focusMode ||
      (this.settings.focusReading &&
        !!document.fullscreenElement &&
        document.fullscreenElement === this.reader.parentElement)
    );
  }

  private syncFocus = (): void => {
    const focused = this.isFocused();
    this.backdrop.hidden = this.suppressed || !focused;
    this.focus.textContent = focused ? "Show video" : "Focus";
    this.focus.setAttribute(
      "aria-label",
      focused ? "Show video" : "Hide video for focused reading",
    );
    this.focus.setAttribute("aria-pressed", String(focused));
    for (const [field, input] of this.inputs) {
      if (field.key === "focusMode" && input instanceof HTMLInputElement)
        input.checked = focused;
    }
  };

  apply(settings: Settings): void {
    this.settings = settings;
    const palette = this.palette();
    for (const [field, input] of this.inputs) {
      const value =
        field.kind === "color"
          ? (palette[field.key] ?? settings[field.key])
          : settings[field.key];
      if (field.kind === "toggle" && input instanceof HTMLInputElement)
        input.checked = Boolean(value);
      else if (input.value !== String(value)) input.value = String(value);
      const output = input.parentElement?.querySelector("output");
      if (output)
        output.textContent =
          field.kind === "range" && field.format
            ? field.format(Number(value))
            : String(value);
    }
    this.syncFocus();
  }

  layout(): void {
    const player = this.reader.parentElement;
    if (!player || this.reader.classList.contains("trf-hidden")) return;
    const bounds = player.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.reader.style.bottom = `clamp(0px, ${this.settings.verticalPosition}%, ${Math.max(0, player.clientHeight - this.reader.offsetHeight)}px)`;
    const card = this.reader.getBoundingClientRect();
    this.reader.style.setProperty(
      "--trf-handle-top",
      `${Math.max(-24, bounds.top - card.top)}px`,
    );
    const sidebar = player.classList.contains("trf-focus-reading");
    this.root.classList.toggle("trf-controls--sidebar", sidebar);
    if (this.root.hidden) return;
    if (sidebar) {
      // Dock to the player, even though the controls inherit the reader's palette.
      this.root.style.left = `${bounds.left - card.left}px`;
      this.root.style.top = `${bounds.top - card.top}px`;
      this.root.style.setProperty(
        "--trf-panel-width",
        `${Math.min(320, bounds.width * 0.4)}px`,
      );
      this.root.style.setProperty(
        "--trf-panel-height",
        `${Math.max(0, bounds.height - 80)}px`,
      );
      return;
    }
    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value));
    const above = card.top - bounds.top - 20;
    const below = bounds.bottom - card.bottom - 20;
    const width = Math.min(340, Math.max(0, bounds.width - 24));
    this.root.style.setProperty("--trf-panel-width", `${width}px`);
    this.root.style.setProperty(
      "--trf-panel-height",
      `${Math.max(0, Math.min(this.anchor?.height ?? Math.max(120, above, below), 420, bounds.height - 24))}px`,
    );
    const panel = this.panel.getBoundingClientRect();
    // Moving the reader must not move a slider out from under the pointer.
    this.anchor ??= {
      x: (card.right - bounds.left - width) / bounds.width,
      y:
        (above > below
          ? card.top - bounds.top - panel.height - 8
          : card.bottom - bounds.top + 8) / bounds.height,
      height: panel.height,
    };
    const left = clamp(
      bounds.left + this.anchor.x * bounds.width,
      bounds.left + 12,
      bounds.right - panel.width - 12,
    );
    const top = clamp(
      bounds.top + this.anchor.y * bounds.height,
      bounds.top + 12,
      bounds.bottom - panel.height - 12,
    );
    this.root.style.left = `${left - card.left - this.reader.clientLeft}px`;
    this.root.style.top = `${top - card.top - this.reader.clientTop}px`;
  }

  private flush(): void {
    window.clearTimeout(this.timer);
    if (Object.keys(this.pending).length === 0) return;
    const patch = this.pending;
    this.pending = {};
    void saveSettings(patch).catch(() => undefined);
  }

  destroy(): void {
    // Navigation or closing the tab mid-drag must keep the final edit.
    this.flush();
    document.removeEventListener("pointerdown", this.outside);
    document.removeEventListener("fullscreenchange", this.syncFocus);
    this.resize?.disconnect();
    this.interactions.destroy();
    this.backdrop.remove();
    this.status.remove();
    this.root.remove();
  }
}
