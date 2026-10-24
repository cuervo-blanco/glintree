import { saveSettings, type Settings } from "../settings";
import { CUSTOM_COLOR_KEYS, FIELDS, type Field } from "../settingsFields";

export interface ReaderControlsOptions {
  romanizable: boolean;
  onChange: (patch: Partial<Settings>) => void;
}

export class ReaderControls {
  private root = document.createElement("details");
  private summary = document.createElement("summary");
  private panel = document.createElement("div");
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
    this.summary.textContent = "Appearance";
    this.summary.title = "Reader appearance";
    this.panel.className = "trf-control-panel";
    const fields = [
      ...FIELDS.filter((f) => f.key === "mode" || f.key === "romanize"),
      ...FIELDS.filter((f) => f.group === "appearance"),
    ];
    for (const field of fields) {
      if (field.key === "romanize" && !options.romanizable) continue;
      this.panel.append(this.row(field));
    }
    this.root.append(this.summary, this.panel);
    reader.append(this.root);

    // Only the controls own these events; the word stream stays click-through.
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
      this.root.addEventListener(type, (event) => event.stopPropagation());
    }
    this.root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.root.open = false;
      this.summary.focus();
    });
    this.root.addEventListener("toggle", () => {
      this.apply(this.settings);
      this.layout();
    });
    this.apply(settings);
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
        this.pending = { ...this.pending, ...patch };
        this.options.onChange(patch);
        this.apply({ ...this.settings, ...patch });
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.flush(), 250);
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
        style
          .getPropertyValue(["--bg", "--text", "--faded", "--accent"][index])
          .trim(),
      ]).filter(([, value]) => /^#[0-9a-f]{6}$/i.test(value)),
    );
  }

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
  }

  layout(): void {
    const player = this.reader.parentElement;
    if (!player || this.reader.classList.contains("trf-hidden")) return;
    const bounds = player.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    if (!bounds.width || !bounds.height) return;
    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value));
    this.root.style.transform = "";
    this.panel.style.transform = "";
    const raw = this.summary.getBoundingClientRect();
    this.root.style.transform = `translate(${clamp(raw.left, bounds.left + 12, bounds.right - raw.width - 12) - raw.left}px, ${clamp(raw.top, bounds.top + 12, bounds.bottom - raw.height - 12) - raw.top}px)`;
    const button = this.summary.getBoundingClientRect();
    const above = button.top - bounds.top - 12;
    const below = bounds.bottom - button.bottom - 12;
    const width = Math.min(340, Math.max(0, bounds.width - 24));
    if (!this.root.open) this.anchor = null;
    this.root.dataset.below = String(below > above);
    this.root.style.setProperty("--trf-panel-width", `${width}px`);
    this.root.style.setProperty(
      "--trf-panel-height",
      `${Math.max(0, Math.min(this.anchor?.height ?? Math.max(above, below) - 6, bounds.height - 24))}px`,
    );
    this.root.style.setProperty(
      "--trf-panel-right",
      `${Math.min(0, button.right - bounds.left - width - 12)}px`,
    );
    if (!this.root.open) return;
    const panel = this.panel.getBoundingClientRect();
    // Moving the reader must not move a slider out from under the pointer.
    this.anchor ??= {
      x: (panel.left - bounds.left) / bounds.width,
      y: (panel.top - bounds.top) / bounds.height,
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
    this.panel.style.transform = `translate(${left - panel.left}px, ${top - panel.top}px)`;
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
    this.root.remove();
  }
}
