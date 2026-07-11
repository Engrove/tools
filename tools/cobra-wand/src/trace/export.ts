/**
 * Trace-export (port av v14): JSON-berikning (svg_binding, geometry_summary,
 * sampled_polyline_64), traceDescription-kontraktet och SVG-overlaybyggaren
 * med samtliga 13 dataattribut + metadata-block. Källexakt.
 */
import {
  clone, defaultShapeDescription, ensureAllMeta, TRACE_COLORS as C,
  type TraceMeta, type TraceShape, type TraceState,
} from "./model.js";
import { measureLen, samplePath } from "./geometry.js";
import { updateMeasurements } from "./frame.js";

export function svgElementKind(s: TraceShape | null): string {
  if (!s) return "unknown";
  if (s.type === "line" || s.type === "path") return "path";
  if (s.type === "station" || s.type === "measure") return "line";
  if (s.type === "rect") return "rect";
  if (s.type === "circle") return "circle";
  if (s.type === "poly" || s.type === "mask" || s.type === "zone")
    return (("closed" in s && s.closed) || s.type === "zone") ? "polygon" : "polyline";
  return "unknown";
}

export function shapeGeomSummary(s: TraceShape | null): Record<string, unknown> {
  if (!s) return {};
  switch (s.type) {
    case "path":
      return { node_count: s.nodes?.length || 0, closed: !!s.closed,
        svg_command: "M + cubic Bezier C segments",
        json_geometry: "nodes[].x/y with nodes[].in/out handles",
        sample_export: "sampled_polyline_64" };
    case "line":
      return { point_count: s.points?.length || 0, svg_command: "M L", json_geometry: "points[0..1]" };
    case "measure":
      return { point_count: s.points?.length || 0, svg_element: "line",
        json_geometry: "points[0..1], length_px, real_length, unit, scale flags" };
    case "zone":
      return { point_count: s.points?.length || 0, closed: true, svg_element: "polygon",
        json_geometry: "points[]",
        zone_semantics: "named translucent AI context zone; may overlap other zones" };
    case "poly": case "mask":
      return { point_count: s.points?.length || 0, closed: !!s.closed,
        svg_element: s.closed ? "polygon" : "polyline", json_geometry: "points[]" };
    case "station":
      return { svg_element: "line",
        json_geometry: "orientation plus x/y/y1/y2/x1/x2, station_index, origin_ref, spacing_px" };
    case "rect": return { svg_element: "rect", json_geometry: "x,y,w,h" };
    case "circle": return { svg_element: "circle", json_geometry: "cx,cy,r" };
    default: return {};
  }
}

export function svgBindingForShape(s: TraceShape, i: number): Record<string, unknown> {
  return {
    stable_join_key: "shape.id",
    json_path: `$.shapes[${i}]`,
    json_id: s.id,
    svg_group_id: s.id,
    svg_selector: `g#${s.id}`,
    svg_data_json_id: s.id,
    svg_data_json_path: `$.shapes[${i}]`,
    svg_data_type: s.type,
    rendered_svg_element: svgElementKind(s),
    coordinate_space: "image_px_top_left_origin_y_down",
    note: "The SVG group with this id/data-json-id is the visual overlay rendering of this exact JSON shape.",
  };
}

export function traceDescription(S: TraceState): Record<string, unknown> {
  return {
    sv: "Engrove Manual Trace JSON är den redigerbara datamodellen. Matchande SVG är den visuella overlayn/renderingen av exakt samma data ovanpå exakt samma bild. JSON äger koordinaterna; SVG visar dem visuellt. AI ska koppla JSON och SVG via shape.id ↔ SVG <g id> / data-json-id och ska inte försöka gissa kopplingen från bilden.",
    en: "The Engrove Manual Trace JSON is the editable source data model. The matching SVG is the visual overlay/rendering of the exact same data on the exact same image. JSON owns the coordinates; SVG shows them visually. An AI reader must join JSON and SVG by shape.id ↔ SVG <g id> / data-json-id and must not infer the relationship visually.",
    file_pair_contract: {
      purpose: "The JSON and SVG form a paired export. Keep both files together when asking AI to interpret the trace.",
      source_of_truth: "JSON coordinates are authoritative for editable geometry. SVG is the visual overlay/proof and contains metadata that repeats the JSON/SVG binding.",
      primary_join_key: "shape.id",
      json_to_svg: "For each JSON shape at $.shapes[index], find SVG <g id='{shape.id}' data-json-id='{shape.id}' data-json-path='$.shapes[index]'>.",
      svg_to_json: "For each SVG group with data-json-id, find the JSON shape with the same id.",
      image_alignment: "Both files use the same image pixel coordinate frame: top-left origin, x right, y down before trace_frame engineering axes are applied.",
    },
    pairing: {
      json_default_filename: "engrove_manual_trace.json",
      svg_default_filename: "engrove_manual_trace.svg",
      stable_join_key: "shape.id",
      svg_group_rule: "Each exported SVG shape is wrapped in <g id='{shape.id}' data-json-id='{shape.id}' data-json-path='$.shapes[index]' data-type='{shape.type}'>...</g>.",
      image_rule: "If image.dataUrl is included in JSON, the same image is embedded in SVG as <image>; otherwise image.name/width/height still define the common image coordinate frame.",
    },
    coordinate_contract: {
      coordinate_space: "image_px_top_left_origin_y_down",
      origin: "trace_frame.origin defines the user-selected engineering origin in image pixels; stations are measured relative to this origin when present.",
      axes: S.frame.axes,
      scale: S.frame.scale,
      ai_reading_order: [
        "Read description.pairing and description.shape_type_mapping.",
        "Read image width/height and trace_frame origin/axes/scale.",
        "For every shape, join JSON shape.id to SVG g#id or data-json-id.",
        "Use JSON coordinates as editable/source geometry; use SVG as visual proof/overlay.",
        "Use shape.description, role, name and type to classify contours, stations, masks and measurements.",
      ],
    },
    metadata_contract: {
      object_name: "Every shape has a system-created default name that may be replaced by the operator.",
      description: "Every selected object can carry a free-text description for AI/CAD interpretation.",
      references: "references[] stores semantic relations such as parallel_to, perpendicular_to, center_of, tangent_to, aligned_with, offset_from, origin_at and proxy_for.",
      origin: "trace_frame.origin_metadata describes what the origin physically means, for example stylus_tip, pivot, cartridge_proxy or headshell_datum.",
    },
    shape_type_mapping: {
      path: "JSON nodes[] with in/out handles -> SVG <path d='M ... C ...'>.",
      poly: "JSON points[] -> SVG <polyline> or <polygon>.",
      line: "JSON points[0..1] -> SVG <path d='M ... L ...'>.",
      measure: "JSON points[0..1] plus length/scale metadata -> SVG <line> with data-length-px/data-real-length.",
      station: "JSON x/y1/y2/station_index -> SVG vertical <line>.",
      rect: "JSON x/y/w/h -> SVG <rect>.",
      circle: "JSON cx/cy/r -> SVG <circle>.",
      mask: "JSON points[] ignore/occlusion mask -> SVG <polyline> or <polygon>.",
    },
    claim_boundary: "Manual trace data may express object understanding and geometry intent. It is not CAD/metrology truth unless calibration, scale, station/origin, masks and point placement are verified.",
  };
}

export function enrichShapeForExport(s: TraceShape, i: number): TraceShape {
  const c = clone(s);
  c.description = c.description || defaultShapeDescription(c, i);
  c.svg_binding = svgBindingForShape(c, i);
  c.geometry_summary = shapeGeomSummary(c);
  if (c.type === "path") c.sampled_polyline_64 = samplePath(c, 16);
  return c;
}

export interface TraceExport {
  schema_version: string;
  trace_meta: TraceMeta;
  description: Record<string, unknown>;
  coordinate_space: string;
  image: { name: string; width: number; height: number; dataUrl?: string } | null;
  view: { s: number; x: number; y: number };
  trace_frame: TraceState["frame"];
  selectedId: string | null;
  shapes: TraceShape[];
}

/** Fullständig exportmodell (outObj). `trace_meta` är Rev C-tillägget (additivt). */
export function outObj(S: TraceState, includeImage = false): TraceExport {
  ensureAllMeta(S);
  updateMeasurements(S);
  return {
    schema_version: S.schema_version,
    trace_meta: clone(S.meta),
    description: traceDescription(S),
    coordinate_space: "image_px_top_left_origin_y_down",
    image: S.img
      ? { name: S.img.name, width: S.img.width, height: S.img.height,
          dataUrl: includeImage ? S.img.dataUrl : undefined }
      : null,
    view: { ...S.view },
    trace_frame: clone(S.frame),
    selectedId: S.sel,
    shapes: S.shapes.map((s, i) => enrichShapeForExport(s, i)),
  };
}

export function escapeXml(s: unknown): string {
  return String(s ?? "").replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string);
}

/** Geometrielementet per shape (ssvg, källexakt inkl. measure-dataattribut). */
export function shapeSvgElement(S: TraceState, s: TraceShape): string {
  const W = S.img?.width || 1000, H = S.img?.height || 1000;
  if (s.type === "station") {
    const ori = s.orientation || "vertical";
    return ori === "horizontal"
      ? `<line x1="${s.x1 ?? 0}" y1="${s.y ?? s.y1 ?? 0}" x2="${s.x2 ?? W}" y2="${s.y ?? s.y1 ?? 0}"/>`
      : `<line x1="${s.x}" y1="${s.y1 ?? 0}" x2="${s.x}" y2="${s.y2 ?? H}"/>`;
  }
  if (s.type === "line")
    return `<path d="M ${s.points[0].x} ${s.points[0].y} L ${s.points[1].x} ${s.points[1].y}"/>`;
  if (s.type === "measure")
    return `<line x1="${s.points[0].x}" y1="${s.points[0].y}" x2="${s.points[1].x}" y2="${s.points[1].y}" data-length-px="${s.length_px || measureLen(s)}" data-real-length="${s.real_length || ""}" data-unit="${s.unit || ""}" data-scale-reference="${s.is_scale_reference ? 1 : 0}"/>`;
  if (s.type === "rect") return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"/>`;
  if (s.type === "circle") return `<circle cx="${s.cx}" cy="${s.cy}" r="${Math.abs(s.r)}"/>`;
  if (s.type === "poly" || s.type === "mask" || s.type === "zone") {
    const tag = (s.closed || s.type === "zone") ? "polygon" : "polyline";
    return `<${tag} points="${s.points.map((p) => p.x + "," + p.y).join(" ")}"/>`;
  }
  if (s.type === "path") {
    let d = `M ${s.nodes[0].x} ${s.nodes[0].y}`;
    for (let i = 1; i < s.nodes.length; i++) {
      const a = s.nodes[i - 1], b = s.nodes[i], c1 = a.out || a, c2 = b.in || b;
      d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
    }
    if (s.closed) {
      const a = s.nodes[s.nodes.length - 1], b = s.nodes[0], c1 = a.out || a, c2 = b.in || b;
      d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y} Z`;
    }
    return `<path d="${d}"/>`;
  }
  return "";
}

/** Komplett SVG-overlay (saveSvg): metadata-block, bild (.35), origo-grupp, shape-grupper. */
export function buildSvg(S: TraceState): string {
  const w = S.img?.width || 1000, h = S.img?.height || 700;
  const exported = outObj(S, false);
  const img = S.img
    ? `<image id="trace_reference_image" data-json-path="$.image" href="${S.img.dataUrl}" x="0" y="0" width="${w}" height="${h}" opacity=".35"/>`
    : "";
  const meta = `<metadata id="engrove_trace_json_binding">${escapeXml(JSON.stringify({
    schema_version: S.schema_version,
    trace_meta: S.meta,
    description: exported.description,
    coordinate_space: "image_px_top_left_origin_y_down",
    trace_frame: S.frame,
    shapes: exported.shapes.map((s) => ({
      id: s.id, type: s.type, name: s.name || "", role: s.role || "",
      description: s.description, semantic: s.semantic || {},
      references: s.references || [], svg_binding: s.svg_binding,
      geometry_summary: s.geometry_summary,
    })),
  }, null, 2))}</metadata>`;
  const om = S.frame.origin_metadata || ({} as TraceState["frame"]["origin_metadata"]);
  const origin = S.frame.origin
    ? `<g id="trace_origin" data-type="origin" data-json-path="$.trace_frame.origin" data-name="${escapeXml(om.name || "origin")}" data-location-role="${escapeXml(om.location_role || "unspecified")}" data-description="${escapeXml(om.description || "")}" fill="none" stroke="#ff4d6d"><title>${escapeXml((om.name || "origin") + " — " + (om.description || ""))}</title><circle cx="${S.frame.origin.x}" cy="${S.frame.origin.y}" r="7"/><path d="M ${S.frame.origin.x - 12} ${S.frame.origin.y} L ${S.frame.origin.x + 12} ${S.frame.origin.y} M ${S.frame.origin.x} ${S.frame.origin.y - 12} L ${S.frame.origin.x} ${S.frame.origin.y + 12}"/></g>`
    : "";
  const sh = S.shapes.map((s, i) => {
    const b = svgBindingForShape(s, i) as { json_path: string; rendered_svg_element: string };
    return `<g id="${escapeXml(s.id)}" data-json-id="${escapeXml(s.id)}" data-json-path="${escapeXml(b.json_path)}" data-shape-index="${i}" data-type="${escapeXml(s.type)}" data-role="${escapeXml(s.role || "")}" data-name="${escapeXml(s.name || "")}" data-description="${escapeXml(s.description || "")}" data-feature-kind="${escapeXml(s.semantic?.feature_kind || "")}" data-reference-count="${(s.references || []).length}" data-rendered-element="${escapeXml(b.rendered_svg_element)}" fill="${escapeXml(s.type === "zone" ? (s.style?.fill || C.zone) : "none")}" fill-opacity="${s.type === "zone" ? (s.style?.fill_alpha ?? 0.18) : 0}" stroke="${escapeXml(s.style?.stroke || C[s.type] || C.path)}" stroke-opacity="${s.type === "zone" ? (s.style?.stroke_alpha ?? 0.95) : 1}" stroke-width="${s.style?.width || 1.4}" data-zone="${s.type === "zone" ? 1 : 0}" data-station-index="${(s as { station_index?: number }).station_index ?? ""}"><title>${escapeXml((s.name || s.id) + " — " + (s.description || ""))}</title>${shapeSvgElement(S, s)}</g>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${meta}${img}${origin}${sh}</svg>`;
}

/** Import (apply/loadJ-semantik): shapes + frame + sel + trace_meta; view importeras ALDRIG (Q4). */
export function applyImportedTrace(S: TraceState, o: Record<string, unknown>): { imageDataUrl: string | null; imageName: string | null; brokenRefs: string[] } {
  S.shapes = (o.shapes as TraceShape[]) || [];
  S.frame = (o.trace_frame as TraceState["frame"]) || (o.frame as TraceState["frame"]) || S.frame;
  S.sel = (o.selectedId as string) || null;
  if (o.trace_meta && typeof o.trace_meta === "object") {
    S.meta = { ...S.meta, ...(o.trace_meta as Partial<TraceMeta>) };
  }
  ensureAllMeta(S);
  // Q12: flagga trasiga referens-mål vid import.
  const validTargets = new Set<string>([
    "trace_frame.origin", "trace_frame.axes", "image",
    ...S.shapes.map((s) => s.id),
  ]);
  const broken: string[] = [];
  const scanRefs = (owner: string, refs?: { target: string }[]): void => {
    for (const r of refs || []) {
      if (r.target && !validTargets.has(r.target)) broken.push(`${owner} → ${r.target}`);
    }
  };
  scanRefs("trace_frame.origin", S.frame.origin_metadata?.references);
  S.shapes.forEach((s) => scanRefs(s.name || s.id, s.references));
  const image = o.image as { dataUrl?: string; name?: string } | undefined;
  return {
    imageDataUrl: image?.dataUrl || null,
    imageName: image?.name || null,
    brokenRefs: broken,
  };
}
