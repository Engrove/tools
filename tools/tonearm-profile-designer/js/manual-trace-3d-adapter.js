// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Validate Engrove Manual Trace artifacts and deterministically convert calibrated top/side contours into a Freeform loft state.
 * Inputs: Untrusted Manual Trace JSON/project objects or inert SVG text plus explicit plane overrides.
 * Outputs: Sanitized trace descriptors and a source-provenanced centerline/ring state; no DOM mutation.
 * Safe edits: Schema validation, finite geometry limits, coordinate transforms, contour sampling, and explicit failure diagnostics.
 * Do not: Execute SVG content, infer missing scale/origin, silently clamp dimensions, or treat SVG as stronger than paired JSON.
 * Verification: test/manual-trace-adapter.test.cjs and browser import smoke tests.
 */
(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ManualTrace3DAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
    'use strict';

    const MAX_FILE_BYTES = 5 * 1024 * 1024;
    const MAX_SHAPES = 512;
    const MAX_POINTS_PER_SHAPE = 4096;
    const MAX_TOTAL_POINTS = 200000;
    const SUPPORTED_SCHEMA_PREFIX = 'engrove_manual_trace_v';
    const PROJECT_SCHEMA = 'engrove_trace_project_v2';
    const PLANES = Object.freeze(['top', 'side', 'front']);
    const AXIS_BASES = Object.freeze(['image_x', 'image_y', 'screen_z']);
    const DIMENSION_LIMITS = Object.freeze({ width: [3, 45], height: [2, 35], length: [10, 280] });

    function fail(code, message, detail) {
        const error = new Error(message);
        error.code = code;
        if (detail !== undefined) error.detail = detail;
        throw error;
    }

    function finite(value, label) {
        const number = Number(value);
        if (!Number.isFinite(number)) fail('TRACE_NON_FINITE', label + ' must be a finite number.');
        return number;
    }

    function round(value, digits) {
        const factor = Math.pow(10, digits === undefined ? 6 : digits);
        return Math.round(Number(value) * factor) / factor;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function axisBase(value) {
        const text = String(value || '');
        if (text.includes('image_x')) return 'image_x';
        if (text.includes('image_y')) return 'image_y';
        if (text.includes('out_of_screen') || text.includes('into_screen')) return 'screen_z';
        fail('TRACE_AXIS_INVALID', 'Unsupported Manual Trace axis value: ' + text);
    }

    function axisSign(value) {
        return String(value || '').startsWith('-') ? -1 : 1;
    }

    function validateAxes(axes) {
        const source = axes && typeof axes === 'object' ? axes : {};
        const normalized = {};
        ['x', 'y', 'z'].forEach(logical => {
            const raw = source[logical];
            normalized[logical] = { raw: String(raw || ''), base: axisBase(raw), sign: axisSign(raw) };
        });
        const unique = new Set(Object.values(normalized).map(item => item.base));
        if (unique.size !== 3 || AXIS_BASES.some(base => !unique.has(base))) {
            fail('TRACE_AXES_AMBIGUOUS', 'trace_frame.axes must map X, Y and Z to three unique image/screen axes.');
        }
        return normalized;
    }

    function detectPlane(axes) {
        const normalized = validateAxes(axes);
        const outAxis = ['x', 'y', 'z'].find(logical => normalized[logical].base === 'screen_z');
        if (outAxis === 'z') return 'top';
        if (outAxis === 'y') return 'side';
        if (outAxis === 'x') return 'front';
        fail('TRACE_PLANE_UNKNOWN', 'Unable to classify the orthographic trace plane.');
    }

    function extractProjectPayload(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail('TRACE_OBJECT_REQUIRED', 'Manual Trace payload must be a JSON object.');
        if (value.package_type === 'engrove_trace_project' || value.schema_version === PROJECT_SCHEMA) {
            const workspace = value.workspace && typeof value.workspace === 'object' ? value.workspace : {};
            return {
                schemaVersion: String(value.source_app && value.source_app.geometry_schema || SUPPORTED_SCHEMA_PREFIX + '16'),
                producer: value.source_app || null,
                project: value.project || null,
                image: value.image || null,
                traceFrame: workspace.trace_frame || workspace.frame || null,
                shapes: workspace.shapes,
                packageType: 'engrove_trace_project'
            };
        }
        return {
            schemaVersion: String(value.schema_version || ''),
            producer: value.producer || null,
            project: null,
            image: value.image || null,
            traceFrame: value.trace_frame || value.frame || null,
            shapes: value.shapes,
            packageType: 'engrove_manual_trace_json'
        };
    }

    function validateScale(frame) {
        const scale = frame && frame.scale && typeof frame.scale === 'object' ? frame.scale : {};
        let unitPerPixel = Number(scale.unit_per_px);
        if (!Number.isFinite(unitPerPixel) || unitPerPixel <= 0) {
            const pixelsPerUnit = Number(scale.px_per_unit);
            if (Number.isFinite(pixelsPerUnit) && pixelsPerUnit > 0) unitPerPixel = 1 / pixelsPerUnit;
        }
        if (!Number.isFinite(unitPerPixel) || unitPerPixel <= 0) {
            fail('TRACE_SCALE_REQUIRED', 'A finite positive Manual Trace scale is required. Calibrate a measurement before 3D import.');
        }
        const unit = String(scale.unit || 'mm').trim().toLowerCase();
        if (unit !== 'mm' && unit !== 'millimeter' && unit !== 'millimetre') {
            fail('TRACE_SCALE_UNIT', 'Manual Trace scale unit must be millimetres; received ' + unit + '.');
        }
        return unitPerPixel;
    }

    function validateOrigin(frame) {
        if (!frame || !frame.origin || typeof frame.origin !== 'object') {
            fail('TRACE_ORIGIN_REQUIRED', 'trace_frame.origin is required for deterministic 3D import.');
        }
        return { x: finite(frame.origin.x, 'trace_frame.origin.x'), y: finite(frame.origin.y, 'trace_frame.origin.y') };
    }

    function point2(value, label) {
        if (!value || typeof value !== 'object') fail('TRACE_POINT_INVALID', label + ' must be an object.');
        return { x: finite(value.x, label + '.x'), y: finite(value.y, label + '.y') };
    }

    function cubicPoint(a, c1, c2, b, t) {
        const m = 1 - t;
        return {
            x: m*m*m*a.x + 3*m*m*t*c1.x + 3*m*t*t*c2.x + t*t*t*b.x,
            y: m*m*m*a.y + 3*m*m*t*c1.y + 3*m*t*t*c2.y + t*t*t*b.y
        };
    }

    function sampleNodes(nodes, closed, targetCount) {
        if (!Array.isArray(nodes) || nodes.length < 2) return [];
        const safeNodes = nodes.map((node, index) => {
            const center = point2(node, 'nodes[' + index + ']');
            return {
                x: center.x,
                y: center.y,
                in: node.in ? point2(node.in, 'nodes[' + index + '].in') : center,
                out: node.out ? point2(node.out, 'nodes[' + index + '].out') : center
            };
        });
        const segments = safeNodes.length - 1 + (closed ? 1 : 0);
        const count = Math.max(8, Math.min(256, targetCount || 64));
        const output = [];
        for (let index = 0; index < count; index++) {
            const denominator = closed ? count : count - 1;
            const u = index * segments / denominator;
            const segment = Math.min(segments - 1, Math.floor(u));
            const t = Math.min(1, u - segment);
            const a = safeNodes[segment];
            const b = safeNodes[(segment + 1) % safeNodes.length];
            output.push(cubicPoint(a, a.out || a, b.in || b, b, t));
        }
        return output;
    }

    function circlePoints(shape) {
        const cx = finite(shape.cx, 'circle.cx');
        const cy = finite(shape.cy, 'circle.cy');
        const radius = Math.abs(finite(shape.r, 'circle.r'));
        if (radius <= 0) return [];
        return Array.from({ length: 64 }, (_, index) => {
            const angle = index * Math.PI * 2 / 64;
            return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
        });
    }

    function rectanglePoints(shape) {
        const x = finite(shape.x, 'rect.x');
        const y = finite(shape.y, 'rect.y');
        const width = finite(shape.w, 'rect.w');
        const height = finite(shape.h, 'rect.h');
        return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
    }

    function shapePoints(shape) {
        if (!shape || typeof shape !== 'object') return [];
        if (Array.isArray(shape.sampled_polyline_64) && shape.sampled_polyline_64.length >= 2) {
            return shape.sampled_polyline_64.map((point, index) => point2(point, 'sampled_polyline_64[' + index + ']'));
        }
        if (shape.type === 'path') return sampleNodes(shape.nodes, !!shape.closed, 64);
        if (shape.type === 'poly' || shape.type === 'line') {
            return Array.isArray(shape.points) ? shape.points.map((point, index) => point2(point, 'points[' + index + ']')) : [];
        }
        if (shape.type === 'rect') return rectanglePoints(shape);
        if (shape.type === 'circle') return circlePoints(shape);
        return [];
    }

    function isContourShape(shape) {
        if (!shape || ['mask', 'zone', 'measure', 'station'].includes(shape.type)) return false;
        const kind = String(shape.semantic && shape.semantic.feature_kind || shape.kind || '').toLowerCase();
        const role = String(shape.role || '').toLowerCase();
        if (['outer_contour', 'top_edge', 'bottom_edge', 'surface_zone', 'slot', 'other'].includes(kind)) return true;
        return role === 'trace' || role === 'contour' || role === 'outline';
    }

    function pixelToLogical(point, origin, axes, unitPerPixel) {
        const delta = { image_x: point.x - origin.x, image_y: point.y - origin.y, screen_z: 0 };
        const output = {};
        ['x', 'y', 'z'].forEach(logical => {
            output[logical] = round(delta[axes[logical].base] * axes[logical].sign * unitPerPixel, 6);
        });
        return output;
    }

    function normalizeShapes(shapes, origin, axes, unitPerPixel) {
        if (!Array.isArray(shapes)) fail('TRACE_SHAPES_REQUIRED', 'Manual Trace payload must contain shapes[].');
        if (shapes.length > MAX_SHAPES) fail('TRACE_SHAPE_LIMIT', 'Manual Trace shape count exceeds ' + MAX_SHAPES + '.');
        let totalPoints = 0;
        const contours = [];
        const stationX = [];
        shapes.forEach((shape, shapeIndex) => {
            if (!shape || typeof shape !== 'object') return;
            if (shape.type === 'station') {
                const midpoint = {
                    x: Number.isFinite(Number(shape.x)) ? Number(shape.x) : (Number(shape.x1) + Number(shape.x2)) / 2,
                    y: Number.isFinite(Number(shape.y)) ? Number(shape.y) : (Number(shape.y1) + Number(shape.y2)) / 2
                };
                if (Number.isFinite(midpoint.x) && Number.isFinite(midpoint.y)) stationX.push(pixelToLogical(midpoint, origin, axes, unitPerPixel).x);
                return;
            }
            if (!isContourShape(shape)) return;
            const pixels = shapePoints(shape);
            if (pixels.length < 2) return;
            if (pixels.length > MAX_POINTS_PER_SHAPE) fail('TRACE_POINT_LIMIT', 'Shape ' + shapeIndex + ' exceeds the point limit.');
            totalPoints += pixels.length;
            if (totalPoints > MAX_TOTAL_POINTS) fail('TRACE_TOTAL_POINT_LIMIT', 'Manual Trace total point count exceeds ' + MAX_TOTAL_POINTS + '.');
            contours.push({
                id: String(shape.id || 'shape_' + shapeIndex),
                name: String(shape.name || shape.id || 'shape_' + shapeIndex),
                kind: String(shape.semantic && shape.semantic.feature_kind || shape.kind || ''),
                closed: !!shape.closed || ['rect', 'circle'].includes(shape.type),
                points: pixels.map(point => pixelToLogical(point, origin, axes, unitPerPixel))
            });
        });
        if (!contours.length) fail('TRACE_CONTOUR_REQUIRED', 'No supported Manual Trace contour geometry was found.');
        return { contours, stationX: stationX.filter(Number.isFinite).map(value => round(value, 6)) };
    }

    function normalizeTrace(value, fileName, options) {
        const payload = extractProjectPayload(value);
        if (!payload.schemaVersion.startsWith(SUPPORTED_SCHEMA_PREFIX)) {
            fail('TRACE_SCHEMA_UNSUPPORTED', 'Unsupported Manual Trace geometry schema: ' + payload.schemaVersion);
        }
        const frame = payload.traceFrame;
        if (!frame || typeof frame !== 'object') fail('TRACE_FRAME_REQUIRED', 'trace_frame is required.');
        const axes = validateAxes(frame.axes);
        const origin = validateOrigin(frame);
        const unitPerPixel = validateScale(frame);
        const geometry = normalizeShapes(payload.shapes, origin, axes, unitPerPixel);
        const detectedPlane = detectPlane(frame.axes);
        const override = options && options.planeOverride;
        const plane = PLANES.includes(override) ? override : detectedPlane;
        return {
            schema: 'engrove-manual-trace-3d-input-v1',
            fileName: String(fileName || 'manual-trace.json').slice(0, 180),
            packageType: payload.packageType,
            geometrySchema: payload.schemaVersion,
            projectName: String(payload.project && payload.project.name || ''),
            detectedPlane,
            plane,
            planeOverride: PLANES.includes(override) ? override : null,
            axes: clone(frame.axes),
            origin: clone(origin),
            originRole: String(frame.origin_metadata && frame.origin_metadata.location_role || 'unspecified'),
            unit: 'mm',
            unitPerPixel: round(unitPerPixel, 9),
            contourCount: geometry.contours.length,
            contours: geometry.contours,
            stationX: geometry.stationX,
            image: payload.image ? { name: String(payload.image.name || ''), width: Number(payload.image.width) || null, height: Number(payload.image.height) || null } : null
        };
    }

    function parseJsonText(text, fileName, options) {
        const raw = String(text || '');
        if (!raw.trim()) fail('TRACE_FILE_EMPTY', 'Manual Trace file is empty.');
        if (new TextEncoder().encode(raw).byteLength > MAX_FILE_BYTES) fail('TRACE_FILE_TOO_LARGE', 'Manual Trace file exceeds 5 MiB.');
        let value;
        try { value = JSON.parse(raw); }
        catch (error) { fail('TRACE_JSON_INVALID', 'Manual Trace JSON parse failed: ' + error.message); }
        return normalizeTrace(value, fileName, options);
    }

    function parseSvgPathData(data) {
        const tokens = String(data || '').match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
        const nodes = [];
        let index = 0;
        let command = '';
        let closed = false;
        while (index < tokens.length) {
            if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
            if (command === 'M') {
                const x = finite(tokens[index++], 'SVG path M.x');
                const y = finite(tokens[index++], 'SVG path M.y');
                nodes.push({ x, y, in: { x, y }, out: { x, y } });
                command = 'C';
            } else if (command === 'C') {
                if (index + 5 >= tokens.length) break;
                const c1 = { x: finite(tokens[index++], 'SVG path C1.x'), y: finite(tokens[index++], 'SVG path C1.y') };
                const c2 = { x: finite(tokens[index++], 'SVG path C2.x'), y: finite(tokens[index++], 'SVG path C2.y') };
                const end = { x: finite(tokens[index++], 'SVG path end.x'), y: finite(tokens[index++], 'SVG path end.y') };
                if (nodes.length) nodes[nodes.length - 1].out = c1;
                nodes.push({ x: end.x, y: end.y, in: c2, out: { x: end.x, y: end.y } });
            } else if (command === 'L') {
                const x = finite(tokens[index++], 'SVG path L.x');
                const y = finite(tokens[index++], 'SVG path L.y');
                nodes.push({ x, y, in: { x, y }, out: { x, y } });
            } else if (command === 'Z' || command === 'z') {
                closed = true;
                command = '';
            } else {
                fail('TRACE_SVG_PATH_UNSUPPORTED', 'Manual Trace SVG path contains unsupported command: ' + command);
            }
        }
        return { type: 'path', nodes, closed };
    }

    function parsePointsAttribute(value) {
        const numbers = String(value || '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
        if (numbers.length % 2 !== 0) fail('TRACE_SVG_POINTS_INVALID', 'SVG points attribute contains an unmatched coordinate.');
        const points = [];
        for (let index = 0; index < numbers.length; index += 2) points.push({ x: finite(numbers[index], 'SVG point.x'), y: finite(numbers[index + 1], 'SVG point.y') });
        return points;
    }

    function geometryFromSvgElement(element) {
        const tag = String(element && element.localName || '').toLowerCase();
        if (tag === 'path') return parseSvgPathData(element.getAttribute('d'));
        if (tag === 'polyline' || tag === 'polygon') return { type: 'poly', points: parsePointsAttribute(element.getAttribute('points')), closed: tag === 'polygon' };
        if (tag === 'line') return { type: 'line', points: [{ x: finite(element.getAttribute('x1'), 'line.x1'), y: finite(element.getAttribute('y1'), 'line.y1') }, { x: finite(element.getAttribute('x2'), 'line.x2'), y: finite(element.getAttribute('y2'), 'line.y2') }] };
        if (tag === 'rect') return { type: 'rect', x: finite(element.getAttribute('x'), 'rect.x'), y: finite(element.getAttribute('y'), 'rect.y'), w: finite(element.getAttribute('width'), 'rect.width'), h: finite(element.getAttribute('height'), 'rect.height'), closed: true };
        if (tag === 'circle') return { type: 'circle', cx: finite(element.getAttribute('cx'), 'circle.cx'), cy: finite(element.getAttribute('cy'), 'circle.cy'), r: finite(element.getAttribute('r'), 'circle.r'), closed: true };
        return null;
    }

    function validateInertSvg(document) {
        const forbidden = document.querySelector('script,foreignObject,iframe,object,embed,use');
        if (forbidden) fail('TRACE_SVG_ACTIVE_CONTENT', 'Manual Trace SVG contains forbidden active content: ' + forbidden.localName);
        Array.from(document.querySelectorAll('*')).forEach(element => {
            Array.from(element.attributes || []).forEach(attribute => {
                const name = String(attribute.name || '').toLowerCase();
                const value = String(attribute.value || '').trim();
                if (name.startsWith('on')) fail('TRACE_SVG_EVENT_HANDLER', 'Manual Trace SVG contains an event-handler attribute.');
                if ((name === 'href' || name === 'xlink:href') && value && !value.startsWith('#') && !value.startsWith('data:image/')) {
                    fail('TRACE_SVG_EXTERNAL_REFERENCE', 'Manual Trace SVG contains an external reference.');
                }
                if (/url\s*\(/i.test(value) && !/url\s*\(\s*#[^)]+\)/i.test(value)) {
                    fail('TRACE_SVG_EXTERNAL_URL', 'Manual Trace SVG contains a non-local url() reference.');
                }
            });
        });
    }

    function parseSvgText(text, fileName, parserConstructor, options) {
        const raw = String(text || '');
        if (!raw.trim()) fail('TRACE_FILE_EMPTY', 'Manual Trace SVG is empty.');
        if (new TextEncoder().encode(raw).byteLength > MAX_FILE_BYTES) fail('TRACE_FILE_TOO_LARGE', 'Manual Trace SVG exceeds 5 MiB.');
        if (typeof parserConstructor !== 'function') fail('TRACE_SVG_PARSER_UNAVAILABLE', 'DOMParser is unavailable.');
        const document = new parserConstructor().parseFromString(raw, 'image/svg+xml');
        if (document.querySelector('parsererror')) fail('TRACE_SVG_INVALID', 'Manual Trace SVG is not well-formed XML.');
        validateInertSvg(document);
        const metadata = document.getElementById('engrove_trace_json_binding');
        if (!metadata) fail('TRACE_SVG_METADATA_REQUIRED', 'SVG does not contain Engrove Manual Trace binding metadata.');
        let value;
        try { value = JSON.parse(metadata.textContent || ''); }
        catch (error) { fail('TRACE_SVG_METADATA_INVALID', 'Manual Trace SVG metadata JSON parse failed: ' + error.message); }
        const metadataShapes = Array.isArray(value.shapes) ? value.shapes : [];
        value.shapes = metadataShapes.map((shape, index) => {
            const id = String(shape.id || 'shape_' + index);
            const group = Array.from(document.querySelectorAll('g[data-json-id]')).find(item => item.getAttribute('data-json-id') === id);
            if (!group) return shape;
            const geometryElement = group.querySelector('path,polyline,polygon,line,rect,circle');
            const geometry = geometryFromSvgElement(geometryElement);
            return geometry ? Object.assign({}, shape, geometry, { id }) : shape;
        });
        return normalizeTrace(value, fileName, options);
    }

    function contourExtent(trace) {
        const xs = trace.contours.flatMap(contour => contour.points.map(point => point.x));
        return { min: Math.min.apply(null, xs), max: Math.max.apply(null, xs) };
    }

    function intersectionsAtX(trace, x) {
        const transverse = trace.plane === 'top' ? 'y' : trace.plane === 'side' ? 'z' : null;
        if (!transverse) return [];
        const output = [];
        trace.contours.forEach(contour => {
            const points = contour.points;
            const segmentCount = points.length - 1 + (contour.closed ? 1 : 0);
            for (let index = 0; index < segmentCount; index++) {
                const a = points[index];
                const b = points[(index + 1) % points.length];
                const minX = Math.min(a.x, b.x);
                const maxX = Math.max(a.x, b.x);
                if (x < minX - 1e-7 || x > maxX + 1e-7) continue;
                if (Math.abs(b.x - a.x) < 1e-9) {
                    output.push(a[transverse], b[transverse]);
                } else {
                    const t = (x - a.x) / (b.x - a.x);
                    if (t >= -1e-7 && t <= 1 + 1e-7) output.push(a[transverse] + (b[transverse] - a[transverse]) * t);
                }
            }
        });
        return output.filter(Number.isFinite);
    }

    function boundsAtX(traces, x) {
        const values = traces.flatMap(trace => intersectionsAtX(trace, x));
        if (values.length < 2) return null;
        return { min: Math.min.apply(null, values), max: Math.max.apply(null, values) };
    }

    function uniqueSorted(values) {
        const result = [];
        values.filter(Number.isFinite).sort((a, b) => a - b).forEach(value => {
            if (!result.length || Math.abs(result[result.length - 1] - value) > 1e-5) result.push(value);
        });
        return result;
    }

    function buildStations(top, side, minX, maxX, count) {
        const explicit = uniqueSorted(top.concat(side).flatMap(trace => trace.stationX).filter(value => value >= minX && value <= maxX));
        const desired = Math.max(6, Math.min(24, Number(count) || 14));
        const uniform = Array.from({ length: desired }, (_, index) => minX + (maxX - minX) * index / (desired - 1));
        const candidates = explicit.length >= 4 ? uniqueSorted([minX, ...explicit, maxX]) : uniform;
        return candidates.length > 24 ? candidates.filter((_, index) => index === 0 || index === candidates.length - 1 || index % Math.ceil(candidates.length / 22) === 0) : candidates;
    }

    function buildFreeformState(traces, options) {
        const list = Array.isArray(traces) ? traces : [];
        const top = list.filter(trace => trace && trace.plane === 'top');
        const side = list.filter(trace => trace && trace.plane === 'side');
        if (!top.length || !side.length) fail('TRACE_TOP_SIDE_REQUIRED', 'At least one valid top trace and one valid side trace are required.');
        const topExtents = top.map(contourExtent);
        const sideExtents = side.map(contourExtent);
        const minX = Math.max(Math.min.apply(null, topExtents.map(value => value.min)), Math.min.apply(null, sideExtents.map(value => value.min)));
        const maxX = Math.min(Math.max.apply(null, topExtents.map(value => value.max)), Math.max.apply(null, sideExtents.map(value => value.max)));
        const length = maxX - minX;
        if (!Number.isFinite(length) || length < DIMENSION_LIMITS.length[0] || length > DIMENSION_LIMITS.length[1]) {
            fail('TRACE_LENGTH_LIMIT', 'Common trace length ' + round(length, 3) + ' mm is outside ' + DIMENSION_LIMITS.length.join('–') + ' mm.');
        }
        const stations = buildStations(top, side, minX, maxX, options && options.stationCount);
        const samples = stations.map(x => {
            const topBounds = boundsAtX(top, x);
            const sideBounds = boundsAtX(side, x);
            if (!topBounds || !sideBounds) return null;
            const width = topBounds.max - topBounds.min;
            const height = sideBounds.max - sideBounds.min;
            if (width < DIMENSION_LIMITS.width[0] || width > DIMENSION_LIMITS.width[1]) {
                fail('TRACE_WIDTH_LIMIT', 'Trace width ' + round(width, 3) + ' mm at X=' + round(x, 3) + ' is outside ' + DIMENSION_LIMITS.width.join('–') + ' mm.');
            }
            if (height < DIMENSION_LIMITS.height[0] || height > DIMENSION_LIMITS.height[1]) {
                fail('TRACE_HEIGHT_LIMIT', 'Trace height ' + round(height, 3) + ' mm at X=' + round(x, 3) + ' is outside ' + DIMENSION_LIMITS.height.join('–') + ' mm.');
            }
            return {
                sourceX: x,
                x: x - minX,
                s: (x - minX) / length,
                y: (topBounds.min + topBounds.max) / 2,
                z: (sideBounds.min + sideBounds.max) / 2,
                width,
                height
            };
        }).filter(Boolean);
        if (samples.length < 4) fail('TRACE_STATION_COVERAGE', 'Fewer than four common top/side stations could be resolved.');
        const first = samples[0];
        const last = samples[samples.length - 1];
        const centerlinePoints = samples.map((sample, index) => ({
            id: index === 0 ? 'stylus_front' : index === samples.length - 1 ? 'pivot_reference' : 'trace_station_' + String(index).padStart(2, '0'),
            s: round(sample.s, 6),
            x: round(sample.x, 6),
            y: round(sample.y - first.y, 6),
            z: round(sample.z - first.z, 6),
            locked: index === 0 || index === samples.length - 1
        }));
        const rings = samples.map((sample, index) => {
            const minimum = Math.min(sample.width, sample.height);
            return {
                id: 'trace_ring_' + String(index).padStart(2, '0'),
                s: round(sample.s, 6),
                shapeFamily: 'superellipse',
                widthMm: round(sample.width, 6),
                heightMm: round(sample.height, 6),
                wallThicknessMm: round(Math.max(0.6, Math.min(1.5, minimum * 0.18)), 6),
                rotationDeg: 0,
                tiltDeg: 0,
                cornerSharpness: 0.35,
                superellipseExponent: 2.6,
                asymmetryY: 0,
                asymmetryZ: 0,
                topRidgeHeightMm: 0,
                bottomFlatness: index < Math.ceil(samples.length * 0.18) ? 0.65 : 0.1,
                crescentCutDepth: 0,
                controlPoints: []
            };
        });
        const base = options && options.baseState ? clone(options.baseState) : {};
        return Object.assign({}, base, {
            schema: 'tonearm-designer-freeform-loft-state-v1',
            preset: 'engrove_manual_trace_import',
            designIntent: 'Reconstruct the calibrated Engrove Manual Trace top and side silhouette bounds without silent dimensional fallback.',
            centerline: {
                schema: 'tonearm-designer-freeform-centerline-v1',
                curveType: 'catmull_rom',
                datumPolicy: 'operator_validated_manual_trace',
                protectedDatums: ['stylus_front', 'pivot_reference'],
                points: centerlinePoints
            },
            rings,
            sourceProvenance: {
                schema: 'engrove-manual-trace-loft-provenance-v1',
                sourceKind: 'engrove_manual_trace',
                files: list.map(trace => ({ fileName: trace.fileName, packageType: trace.packageType, geometrySchema: trace.geometrySchema, plane: trace.plane, detectedPlane: trace.detectedPlane, contourCount: trace.contourCount, unitPerPixel: trace.unitPerPixel, originRole: trace.originRole })),
                commonLongitudinalSourceRangeMm: { min: round(minX, 6), max: round(maxX, 6), translatedLength: round(length, 6) },
                stationCount: samples.length,
                sectionAssumption: 'superellipse_2_6_from_orthographic_width_height_bounds',
                svgRole: 'visual_pair_and_geometry_carrier_when_json_is_absent; JSON remains authoritative when paired'
            },
            assumptions: [
                'Top-view silhouette bounds define center Y and width at each common station.',
                'Side-view silhouette bounds define center Z and height at each common station.',
                'Cross-sections use a deterministic superellipse exponent 2.6 because two orthographic silhouettes do not uniquely determine the full section surface.'
            ]
        });
    }

    return Object.freeze({
        limits: Object.freeze({ maxFileBytes: MAX_FILE_BYTES, maxShapes: MAX_SHAPES, maxPointsPerShape: MAX_POINTS_PER_SHAPE, maxTotalPoints: MAX_TOTAL_POINTS, dimensions: DIMENSION_LIMITS }),
        detectPlane,
        normalizeTrace,
        parseJsonText,
        parseSvgText,
        buildFreeformState
    });
});
