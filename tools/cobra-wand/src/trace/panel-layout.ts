/**
 * Panel-resizer — Engrove Manual Trace Tool v18.
 *
 * Hanterar de draggabara separatorerna i tre-kolumns-layouten via CSS-variablerna
 * `--rail` (vänster panel) och `--inspector` (höger panel). Persisterar i
 * localStorage (bäst-ansträngning; tyst vid fel). Nollställs vid dubbelklick.
 */

export const PANEL_LAYOUT_KEY = "engrove_trace_v17_layout";
export const PANEL_DEFAULTS: Record<string, number> = { rail: 94, inspector: 390 };

export interface PanelLimits {
  railMin: number; railMax: number;
  inspectorMin: number; inspectorMax: number;
}

export function panelLayoutLimits(): PanelLimits {
  const vw = Math.max(720, window.innerWidth || 1200);
  const rootStyle = getComputedStyle(document.documentElement);
  const rail = parseFloat(rootStyle.getPropertyValue("--rail")) || PANEL_DEFAULTS.rail;
  const inspector = parseFloat(rootStyle.getPropertyValue("--inspector")) || PANEL_DEFAULTS.inspector;
  const minimumCanvas = Math.min(720, Math.max(480, vw * 0.42));
  return {
    railMin: 84,
    railMax: Math.max(110, Math.min(190, vw - inspector - minimumCanvas - 20)),
    inspectorMin: 330,
    inspectorMax: Math.max(360, Math.min(640, vw - rail - minimumCanvas - 20)),
  };
}

export function readPanelWidth(name: string): number {
  return (
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--" + name)) ||
    PANEL_DEFAULTS[name] ||
    0
  );
}

export function clampPanelValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function savePanelLayout(): void {
  try {
    localStorage.setItem(
      PANEL_LAYOUT_KEY,
      JSON.stringify({ rail: Math.round(readPanelWidth("rail")), inspector: Math.round(readPanelWidth("inspector")) }),
    );
  } catch (_) {}
}

export function updatePanelSeparatorAria(leftResizer: HTMLElement | null, rightResizer: HTMLElement | null): void {
  const lim = panelLayoutLimits();
  if (leftResizer) {
    leftResizer.setAttribute("aria-valuemin", String(Math.round(lim.railMin)));
    leftResizer.setAttribute("aria-valuemax", String(Math.round(lim.railMax)));
    leftResizer.setAttribute("aria-valuenow", String(Math.round(readPanelWidth("rail"))));
  }
  if (rightResizer) {
    rightResizer.setAttribute("aria-valuemin", String(Math.round(lim.inspectorMin)));
    rightResizer.setAttribute("aria-valuemax", String(Math.round(lim.inspectorMax)));
    rightResizer.setAttribute("aria-valuenow", String(Math.round(readPanelWidth("inspector"))));
  }
}

export function applyPanelWidth(
  name: string, value: number, persist = true,
  leftResizer: HTMLElement | null = null, rightResizer: HTMLElement | null = null,
): void {
  const lim = panelLayoutLimits();
  const bounds = name === "rail" ? [lim.railMin, lim.railMax] : [lim.inspectorMin, lim.inspectorMax];
  const next = clampPanelValue(value, bounds[0], bounds[1]);
  document.documentElement.style.setProperty("--" + name, next + "px");
  updatePanelSeparatorAria(leftResizer, rightResizer);
  if (persist) savePanelLayout();
}

export function restorePanelLayout(
  leftResizer: HTMLElement | null = null, rightResizer: HTMLElement | null = null,
): void {
  let saved: Record<string, number> | null = null;
  try { saved = JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY) || "null") as Record<string, number>; } catch (_) {}
  if (saved && Number.isFinite(saved.rail)) applyPanelWidth("rail", saved.rail, false, leftResizer, rightResizer);
  if (saved && Number.isFinite(saved.inspector)) applyPanelWidth("inspector", saved.inspector, false, leftResizer, rightResizer);
  updatePanelSeparatorAria(leftResizer, rightResizer);
}

export function installPanelResizer(
  handleEl: HTMLElement | null, name: string, direction: 1 | -1,
  onResize?: () => void,
  leftResizer: HTMLElement | null = null, rightResizer: HTMLElement | null = null,
): void {
  if (!handleEl) return;
  let startX = 0, startWidth = 0, active = false;
  const finish = (): void => {
    if (!active) return;
    active = false;
    handleEl.classList.remove("dragging");
    document.body.classList.remove("panel-resizing");
    savePanelLayout();
    onResize?.();
  };
  handleEl.addEventListener("pointerdown", (e) => {
    if ((e as MouseEvent).button !== 0) return;
    active = true;
    startX = (e as MouseEvent).clientX;
    startWidth = readPanelWidth(name);
    handleEl.classList.add("dragging");
    document.body.classList.add("panel-resizing");
    (handleEl as HTMLElement & { setPointerCapture?(id: number): void }).setPointerCapture?.((e as PointerEvent).pointerId);
    e.preventDefault();
  });
  handleEl.addEventListener("pointermove", (e) => {
    if (!active) return;
    const delta = ((e as MouseEvent).clientX - startX) * direction;
    applyPanelWidth(name, startWidth + delta, false, leftResizer, rightResizer);
    e.preventDefault();
  });
  handleEl.addEventListener("pointerup", finish);
  handleEl.addEventListener("pointercancel", finish);
  handleEl.addEventListener("dblclick", () => {
    applyPanelWidth(name, PANEL_DEFAULTS[name] ?? 0, true, leftResizer, rightResizer);
    onResize?.();
  });
  handleEl.addEventListener("keydown", (e) => {
    const step = (e as KeyboardEvent).shiftKey ? 24 : 8;
    let delta = 0;
    if ((e as KeyboardEvent).key === "ArrowLeft") delta = -step * direction;
    if ((e as KeyboardEvent).key === "ArrowRight") delta = step * direction;
    if (!delta) return;
    applyPanelWidth(name, readPanelWidth(name) + delta, true, leftResizer, rightResizer);
    e.preventDefault();
  });
}
