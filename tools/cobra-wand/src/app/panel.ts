/**
 * Parameterpanel — Engrove Alien LT (Rev B). Muterar params direkt och
 * signalerar onChange; regenerering/debounce ägs av main.ts. Full ombyggnad
 * endast vid refresh() (AI-apply/preset/återställning).
 *
 * D1-koppling: ändrad stationshöjd justerar spinen LOKALT kring bevarad
 * centerlinje (svanhalsfallet bevaras) via adjustSpineForStationHeight.
 */
import type { CobraParams } from "../core/types.js";
import { adjustSpineForStationHeight } from "../core/defaults.js";

export interface PanelHandle {
  refresh(): void;
}

type Getter = () => number;
type Setter = (v: number) => void;

export function buildPanel(container: HTMLElement, getParams: () => CobraParams, onChange: () => void): PanelHandle {
  const render = (): void => {
    const params = getParams();
    container.innerHTML = "";
    container.append(
      groupGlobal(params, onChange),
      groupStations(params, onChange),
      groupShell(params, onChange, render),
      groupFeatures(params, onChange),
      groupManufacturing(params, onChange),
    );
  };
  render();
  return { refresh: render };
}

function details(title: string, badge?: { text: string; cls: string; title?: string }, open = true): {
  root: HTMLDetailsElement;
  body: HTMLDivElement;
} {
  const root = document.createElement("details");
  root.className = "group";
  root.open = open;
  const summary = document.createElement("summary");
  summary.textContent = title;
  if (badge) {
    const b = document.createElement("span");
    b.className = `badge ${badge.cls}`;
    b.textContent = badge.text;
    if (badge.title) b.title = badge.title;
    summary.append(b);
  }
  const body = document.createElement("div");
  body.className = "group-body";
  root.append(summary, body);
  return { root, body };
}

function numField(
  label: string, get: Getter, set: Setter, min: number, max: number, step: number,
  onChange: () => void, title?: string,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "field";
  const lab = document.createElement("label");
  lab.textContent = label;
  if (title) lab.title = title;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(get());
  input.addEventListener("change", () => {
    const v = Number(input.value);
    if (!Number.isFinite(v) || v < min || v > max) {
      input.classList.add("invalid");
      input.title = `Tillåtet intervall: ${min} … ${max}`;
      return;
    }
    input.classList.remove("invalid");
    set(v);
    onChange();
  });
  row.append(lab, input);
  return row;
}

function boolField(label: string, get: () => boolean, set: (v: boolean) => void, onChange: () => void): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "field";
  const lab = document.createElement("label");
  lab.textContent = label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "checkbox";
  input.checked = get();
  input.addEventListener("change", () => {
    set(input.checked);
    onChange();
  });
  row.append(lab, input);
  return row;
}

function groupGlobal(p: CobraParams, onChange: () => void): HTMLElement {
  const g = details("Globala mått", {
    text: "Alien LT",
    cls: "info",
    title: "L = 237,1 mm (L2N, Verified ur TD028-modal). X=0 nålspets, X=1,0·L pivot. Kroppen är rak och Y-symmetrisk (tangentiell LT).",
  });
  const d = p.globalDimensions;
  g.body.append(
    numField("Funktionell längd L (mm)", () => d.functionalLength_mm, (v) => (d.functionalLength_mm = v), 150, 400, 0.1, onChange,
      "Nålspets→pivot. Verified: 237,1."),
    numField("Nos-utsträckning x/L", () => d.noseExtent_norm, (v) => (d.noseExtent_norm = v), -0.15, 0, 0.005, onChange,
      "Främre fysisk gräns (u). Alien LT: −0,05."),
    numField("Bak-utsträckning x/L", () => d.rearExtent_norm, (v) => (d.rearExtent_norm = v), 1.0, 1.4, 0.005, onChange,
      "Bakre fysisk gräns (u) — svanhals + ballastlob. Alien LT: 1,25."),
    numField("Slot-toe-in (°)", () => d.slotToeIn_deg, (v) => (d.slotToeIn_deg = v), -5, 5, 0.1, onChange,
      "Roterar ENDAST slotparet; kroppen förblir rak."),
  );
  return g.root;
}

function groupStations(p: CobraParams, onChange: () => void): HTMLElement {
  const g = details("Stationer", {
    text: "spec §7–§10",
    cls: "photo",
    title: "Breddknutar ur slutrapport §8; höjd seedar spinen (D1); corner/belly inverterade ur §10. Verified som spec, visuellt uppskattade i källan.",
  });
  const scroll = document.createElement("div");
  scroll.className = "table-scroll";
  const tbl = document.createElement("table");
  tbl.className = "stations";
  const headCols: { abbr: string; title: string }[] = [
    { abbr: "x/L", title: "Position längs kroppen (u = X/L). X=0 nålspets, X=1 pivot." },
    { abbr: "bredd", title: "Stationsbredd (mm)" },
    { abbr: "höjd", title: "Stationshöjd (mm) — justerar spinen lokalt (D1)" },
    { abbr: "crown", title: "Crown-faktor: >1 plattare tak, <1 spetsigare rygg" },
    { abbr: "belly", title: "Belly relief: 0 = ingen avplaning, 1 = kraftig käklinje" },
    { abbr: "corner", title: "Corner fairness: 0 = ellips (n=2), 1 = kantig (n=5)" },
  ];
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const h of headCols) {
    const th = document.createElement("th");
    th.textContent = h.abbr;
    th.title = h.title;
    trh.append(th);
  }
  thead.append(trh);
  tbl.append(thead);
  const tb = document.createElement("tbody");
  const cols: {
    key: "x_norm" | "width_mm" | "height_mm" | "crownFactor" | "bellyRelief" | "cornerFairness";
    min: number; max: number; step: number;
  }[] = [
    { key: "x_norm", min: -0.15, max: 1.4, step: 0.01 },
    { key: "width_mm", min: 2, max: 80, step: 0.1 },
    { key: "height_mm", min: 2, max: 60, step: 0.1 },
    { key: "crownFactor", min: 0.5, max: 2, step: 0.05 },
    { key: "bellyRelief", min: 0, max: 1, step: 0.05 },
    { key: "cornerFairness", min: 0, max: 1, step: 0.05 },
  ];
  p.stations.forEach((st, idx) => {
    const tr = document.createElement("tr");
    for (const c of cols) {
      const td = document.createElement("td");
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = String(c.min);
      inp.max = String(c.max);
      inp.step = String(c.step);
      inp.value = String(st[c.key]);
      inp.addEventListener("change", () => {
        const v = Number(inp.value);
        if (!Number.isFinite(v) || v < c.min || v > c.max) {
          inp.style.outline = "1px solid var(--fail)";
          return;
        }
        inp.style.outline = "";
        st[c.key] = v;
        if (c.key === "height_mm") {
          // D1: lokal spine-justering kring bevarad centerlinje.
          adjustSpineForStationHeight(p.spine, st.x_norm, st.height_mm);
        }
        onChange();
      });
      td.append(inp);
      tr.append(td);
    }
    tr.title = `Station ${idx + 1} (u=${st.x_norm})`;
    tb.append(tr);
  });
  tbl.append(tb);
  scroll.append(tbl);
  g.body.append(scroll);
  return g.root;
}

function groupShell(p: CobraParams, onChange: () => void, rerender: () => void): HTMLElement {
  const g = details("Skal", { text: "Assumed", cls: "assumed", title: "Vägg 1,6 mm + slot/sadel-läpp +0,6 mm @[0,0.14] + root hood +0,8 mm @[0.92,1.06] är dokumenterade antaganden." });
  g.body.append(
    numField("Väggtjocklek (mm)", () => p.shell.wallThickness_mm, (v) => (p.shell.wallThickness_mm = v), 0.4, 8, 0.05, onChange),
  );
  p.shell.localReinforcementZones.forEach((z, i) => {
    const row = document.createElement("div");
    row.className = "zone-row";
    const lab = document.createElement("label");
    lab.textContent = `Zon ${i + 1} [x0–x1] +mm`;
    const wrap = document.createElement("div");
    wrap.className = "zone-inputs";
    const mk = (get: Getter, set: Setter, min: number, max: number, step: number, title: string): HTMLInputElement => {
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = String(min);
      inp.max = String(max);
      inp.step = String(step);
      inp.value = String(get());
      inp.title = title;
      inp.addEventListener("change", () => {
        const v = Number(inp.value);
        if (!Number.isFinite(v) || v < min || v > max) return;
        set(v);
        onChange();
      });
      return inp;
    };
    const del = document.createElement("button");
    del.className = "btn ghost";
    del.textContent = "×";
    del.title = "Ta bort zon";
    del.addEventListener("click", () => {
      p.shell.localReinforcementZones.splice(i, 1);
      onChange();
      rerender();
    });
    wrap.append(
      mk(() => z.x0_norm, (v) => (z.x0_norm = v), -0.15, 1.4, 0.01, "x0/L (start)"),
      mk(() => z.x1_norm, (v) => (z.x1_norm = v), -0.15, 1.4, 0.01, "x1/L (slut)"),
      mk(() => z.extra_mm, (v) => (z.extra_mm = v), 0, 6, 0.1, "extra väggtjocklek (mm)"),
      del,
    );
    row.append(lab, wrap);
    g.body.append(row);
  });
  const add = document.createElement("button");
  add.className = "btn";
  add.textContent = "+ förstärkningszon";
  add.addEventListener("click", () => {
    if (p.shell.localReinforcementZones.length >= 12) return;
    p.shell.localReinforcementZones.push({ x0_norm: 0.4, x1_norm: 0.6, extra_mm: 0.5 });
    onChange();
    rerender();
  });
  g.body.append(add);
  return g.root;
}

function groupFeatures(p: CobraParams, onChange: () => void): HTMLElement {
  const g = details("Features", { text: "Assumed", cls: "assumed" });
  const f = p.features;
  g.body.append(
    boolField("Cartridge-sadel (undersida)", () => f.cartridgeSaddle.enabled, (v) => (f.cartridgeSaddle.enabled = v), onChange),
    numField("· längd (mm)", () => f.cartridgeSaddle.length_mm, (v) => (f.cartridgeSaddle.length_mm = v), 5, 60, 0.5, onChange),
    numField("· bredd (mm)", () => f.cartridgeSaddle.width_mm, (v) => (f.cartridgeSaddle.width_mm = v), 4, 40, 0.5, onChange),
    numField("· djup (mm)", () => f.cartridgeSaddle.depth_mm, (v) => (f.cartridgeSaddle.depth_mm = v), 1, 20, 0.5, onChange,
      "Nisch uppåt från undersidan; taket clampas under dorsalskalet (D5, aldrig genomskärning)."),
    numField("· centrum x/L", () => f.cartridgeSaddle.center_x_norm, (v) => (f.cartridgeSaddle.center_x_norm = v), -0.05, 0.3, 0.01, onChange),
    boolField("Headshell-slots (par)", () => f.topSlots.enabled, (v) => (f.topSlots.enabled = v), onChange),
    numField("· längd (mm)", () => f.topSlots.length_mm, (v) => (f.topSlots.length_mm = v), 4, 30, 0.1, onChange),
    numField("· c-c (mm)", () => f.topSlots.spacing_mm, (v) => (f.topSlots.spacing_mm = v), 6, 30, 0.05, onChange, "Half-inch: 12,7"),
    numField("· bredd (mm)", () => f.topSlots.width_mm, (v) => (f.topSlots.width_mm = v), 1.5, 6, 0.05, onChange, "Assumed 2,9 = M2.5 medium"),
    numField("· centrum x/L", () => f.topSlots.center_x_norm, (v) => (f.topSlots.center_x_norm = v), 0, 0.3, 0.01, onChange),
    boolField("Skruvkanal (ballastlob)", () => f.screwChannel.enabled, (v) => (f.screwChannel.enabled = v), onChange),
    numField("· Ø (mm)", () => f.screwChannel.diameter_mm, (v) => (f.screwChannel.diameter_mm = v), 2, 12, 0.1, onChange),
    numField("· centrum x/L", () => f.screwChannel.center_x_norm, (v) => (f.screwChannel.center_x_norm = v), 1.0, 1.35, 0.01, onChange),
    boolField("Rotnav (pivotgränssnitt)", () => f.rootHub.enabled, (v) => (f.rootHub.enabled = v), onChange),
    numField("· Ø (mm)", () => f.rootHub.diameter_mm, (v) => (f.rootHub.diameter_mm = v), 4, 30, 0.1, onChange),
    numField("· höjd över skal (mm)", () => f.rootHub.height_mm, (v) => (f.rootHub.height_mm = v), 0, 20, 0.5, onChange),
  );
  return g.root;
}

function groupManufacturing(p: CobraParams, onChange: () => void): HTMLElement {
  const g = details("Tillverkning", undefined, false);
  const m = p.manufacturing;
  g.body.append(
    numField("STL chordal tolerans (mm)", () => m.stlChordalTolerance_mm, (v) => (m.stlChordalTolerance_mm = v), 0.001, 0.5, 0.001, onChange),
    numField("Min feature (mm)", () => m.minFeature_mm, (v) => (m.minFeature_mm = v), 0.05, 5, 0.05, onChange),
    numField("Min vägg (mm)", () => m.minWall_mm, (v) => (m.minWall_mm = v), 0.2, 8, 0.05, onChange),
    numField("Min draft (°)", () => m.draftMin_deg, (v) => (m.draftMin_deg = v), 0, 15, 0.5, onChange),
  );
  return g.root;
}
