// SPDX-License-Identifier: 0BSD
// AI-CODING NOTE: Technical reports are read-only snapshots of an explicit active design and its canonical render/export/session source audit.
// Copyright (C) 2026 Engrove

/**
 * js/report-exporter.js
 * Markdown report exporter for TonearmDesigner.
 *
 * The report is intentionally read-only. It samples the same runtime state,
 * geometry cache and Physics panel values that the UI uses, then downloads a
 * clean Markdown document suitable for review, archival and diffing.
 */
(function(root) {
    'use strict';

    const REPORT_SCHEMA = 'tonearm-designer-markdown-report-v1';

    function nowIso() {
        return new Date().toISOString();
    }

    function currentState() {
        return (typeof state !== 'undefined') ? state : (root.state || {});
    }

    function deepClone(value) {
        if (value === null || value === undefined) return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (err) {
            if (Array.isArray(value)) return value.slice();
            if (typeof value === 'object') return Object.assign({}, value);
            return value;
        }
    }

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function buildStateFromSessionSnapshot(snapshot, fallbackState) {
        const st = deepClone(fallbackState || currentState()) || {};
        const snap = isObject(snapshot) ? snapshot : {};

        if (isObject(snap.inputs)) {
            Object.keys(snap.inputs).forEach(function(id) {
                st[id] = snap.inputs[id];
            });
        }

        if (isObject(snap.selects)) {
            Object.keys(snap.selects).forEach(function(id) {
                st[id] = snap.selects[id];
            });
        }

        if (isObject(snap.checkboxes)) {
            Object.keys(snap.checkboxes).forEach(function(id) {
                st[id] = snap.checkboxes[id];
            });
        }

        if (isObject(snap.flags) && isObject(snap.flags.selectedCartridge)) {
            const sc = snap.flags.selectedCartridge;
            st.selectedCartridgeId = sc.id || st.selectedCartridgeId;
            st.selectedCartridgeName = sc.name || [sc.manufacturer, sc.model].filter(Boolean).join(' ') || st.selectedCartridgeName;
            st.selectedCartridgeManufacturer = sc.manufacturer || st.selectedCartridgeManufacturer;
            st.selectedCartridgeModel = sc.model || st.selectedCartridgeModel;
            st.selectedCartridgeType = sc.type || st.selectedCartridgeType;
            st.selectedCartridgeMassG = Number(sc.mass_g);
            st.selectedCartridgeCompliance10HzCu = Number(sc.compliance_10hz_cu);
            st.selectedCartridgeComplianceEstimated = !!sc.compliance_10hz_estimated;
            st.cartridgeComplianceEstimated = !!sc.compliance_10hz_estimated;
            const tf = sc.tracking_force_g || {};
            st.selectedCartridgeTrackingForceMinG = Number(tf.min);
            st.selectedCartridgeTrackingForceMaxG = Number(tf.max);
            st.selectedCartridgeTrackingForceRecommendedG = Number(tf.recommended);
            st.selectedCartridgeStylus = sc.stylus || '';
            st.selectedCartridgeCantilever = sc.cantilever || '';
            st.selectedCartridgeOutputMv = Number(sc.output_mv);
        }

        if (isObject(snap.cobraArchitecture)) {
            st.cobraArchitecture = deepClone(snap.cobraArchitecture);
        } else if (isObject(st.cobraArchitecture)) {
            st.cobraArchitecture = deepClone(st.cobraArchitecture);
        } else {
            st.cobraArchitecture = { enabled: false };
        }

        [
            'geometryMode',
            'freeformLoft',
            'freeformLoftActive',
            'freeformLoftPreview',
            'freeformLoftRejected',
            'freeformApplyState',
            'freeformLastAnalysis',
            'freeformLastAcceptedAnalysis',
            'freeformLastPreviewAnalysis',
            'geometryModeAudit'
        ].forEach(function(key) {
            if (snap[key] !== undefined) st[key] = deepClone(snap[key]);
        });

        return st;
    }

    function currentRings() {
        return (typeof GLOBAL_RINGSCache !== 'undefined' && Array.isArray(GLOBAL_RINGSCache))
            ? GLOBAL_RINGSCache
            : [];
    }

    function safeCall(label, fn, fallback) {
        try {
            return fn();
        } catch (err) {
            return fallback !== undefined ? fallback : {
                error: label + ' failed',
                message: err && err.message ? err.message : String(err)
            };
        }
    }

    function isFiniteNumber(v) {
        return typeof v === 'number' && Number.isFinite(v);
    }

    function fmt(v, digits, unit) {
        if (v === null || v === undefined) return '—';
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (typeof v === 'string') return v;
        if (isFiniteNumber(v)) {
            const n = v.toFixed(digits === undefined ? 3 : digits);
            return unit ? n + ' ' + unit : n;
        }
        return String(v);
    }

    function fmtCompact(v) {
        if (v === null || v === undefined) return '—';
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (isFiniteNumber(v)) {
            if (Number.isInteger(v)) return String(v);
            return String(Number(v.toFixed(6)));
        }
        return String(v);
    }

    function mdEscape(value) {
        return String(value === undefined || value === null ? '—' : value)
            .replace(/\r?\n/g, '<br>')
            .replace(/\|/g, '\\|');
    }

    function code(value) {
        return '`' + String(value).replace(/`/g, '\\`') + '`';
    }

    function table(headers, rows) {
        const out = [];
        out.push('| ' + headers.map(mdEscape).join(' | ') + ' |');
        out.push('| ' + headers.map(() => '---').join(' | ') + ' |');
        rows.forEach(row => {
            out.push('| ' + row.map(mdEscape).join(' | ') + ' |');
        });
        return out.join('\n');
    }

    function pointText(p, digits) {
        if (!p) return '—';
        return [
            'x=' + fmt(p.x, digits === undefined ? 3 : digits),
            'y=' + fmt(p.y, digits === undefined ? 3 : digits),
            'z=' + fmt(p.z, digits === undefined ? 3 : digits)
        ].join(', ');
    }

    function metricText(m, digits) {
        if (!m) return '—';
        return [
            'd=' + fmt(m.d, digits === undefined ? 3 : digits),
            'Δx=' + fmt(m.dx, digits === undefined ? 3 : digits),
            'Δy=' + fmt(m.dy, digits === undefined ? 3 : digits),
            'Δz=' + fmt(m.dz, digits === undefined ? 3 : digits)
        ].join(', ');
    }

    function flattenObject(value, prefix, rows, maxDepth) {
        const depth = prefix ? prefix.split('.').length : 0;
        if (depth > (maxDepth || 6)) {
            rows.push([prefix, '[depth limit]']);
            return;
        }
        if (value === null || value === undefined || typeof value !== 'object') {
            rows.push([prefix || '(value)', fmtCompact(value)]);
            return;
        }
        if (Array.isArray(value)) {
            rows.push([prefix + '.length', value.length]);
            value.slice(0, 40).forEach((item, i) => {
                if (item && typeof item === 'object') {
                    flattenObject(item, prefix + '[' + i + ']', rows, maxDepth);
                } else {
                    rows.push([prefix + '[' + i + ']', fmtCompact(item)]);
                }
            });
            if (value.length > 40) rows.push([prefix + '[...]', 'truncated after 40 items for readability']);
            return;
        }
        Object.keys(value).sort().forEach(k => {
            const next = prefix ? prefix + '.' + k : k;
            const v = value[k];
            if (v && typeof v === 'object') {
                flattenObject(v, next, rows, maxDepth);
            } else {
                rows.push([next, fmtCompact(v)]);
            }
        });
    }

    function getByPath(source, path, fallback) {
        const parts = String(path || '').split('.');
        let current = source;
        for (let i = 0; i < parts.length; i += 1) {
            if (!current || !Object.prototype.hasOwnProperty.call(current, parts[i])) return fallback;
            current = current[parts[i]];
        }
        return current === undefined ? fallback : current;
    }

    function firstFinite(source, paths, fallback) {
        for (let i = 0; i < paths.length; i += 1) {
            const value = getByPath(source, paths[i], undefined);
            const n = Number(value);
            if (Number.isFinite(n)) return n;
        }
        return fallback;
    }

    function buildExecutiveSummaryRows(st, phys, mode, rings) {
        const resonanceHz = firstFinite(phys, [
            'resonance.frequencyHz',
            'resonanceHz',
            'systemResonanceHz',
            'cartridge.resonanceHz'
        ], null);
        const systemMass = firstFinite(phys, [
            'c_total.mass',
            'totalMassG',
            'mass.totalG',
            'massG'
        ], null);
        return [
            ['System mass', Number.isFinite(systemMass) ? fmt(systemMass, 3, 'g') : '—'],
            ['System resonance', Number.isFinite(resonanceHz) ? fmt(resonanceHz, 3, 'Hz') : '—'],
            ['Effective length', phys && typeof Physics !== 'undefined' ? fmt(Physics.getEffectiveLength(st, mode), 3, 'mm') : '—'],
            ['Static imbalance', phys && phys.staticImbalance ? fmt(phys.staticImbalance.gf, 3, 'g-eq') : '—'],
            ['Static imbalance moment', phys && phys.staticImbalance ? fmt(phys.staticImbalance.totalMomentGmm, 3, 'g·mm') : '—'],
            ['First bending mode', phys && phys.structural ? fmt(phys.structural.firstBendingHz, 3, 'Hz') : '—'],
            ['First torsion mode', phys && phys.structural ? fmt(phys.structural.firstTorsionHz, 3, 'Hz') : '—'],
            ['Bending status', phys && phys.structural ? phys.structural.bendingStatus : '—'],
            ['Torsion status', phys && phys.structural ? phys.structural.torsionStatus : '—'],
            ['Ring count', rings.length],
            ['Structural ring count', phys && phys.structural && Number.isFinite(Number(phys.structural.structuralRingCount)) ? Number(phys.structural.structuralRingCount) : '—'],
            ['Excluded cap/sliver rings', phys && phys.structural && Number.isFinite(Number(phys.structural.excludedCapOrSliverCount)) ? Number(phys.structural.excludedCapOrSliverCount) : '—']
        ];
    }

    function collectPanelReadouts(st, phys) {
        const lpTopZ = Number(st && Number.isFinite(Number(st.lpTopZ)) ? st.lpTopZ : 0);
        const stylusZ = phys && phys.stylus ? Number(phys.stylus.z) : NaN;
        const pivotZ = phys && phys.pivot ? Number(phys.pivot.z) : NaN;
        const cTotal = getByPath(phys, 'c_total', null);
        const cRear = getByPath(phys, 'c_rear', null);
        const cRearWeights = getByPath(phys, 'c_rear_weights', null);
        return [
            ['LP top plane', fmt(lpTopZ, 3, 'mm')],
            ['Pivot above LP', fmt(st && st.verticalPivotHeightAboveLP !== undefined ? st.verticalPivotHeightAboveLP : 0, 3, 'mm')],
            ['Stylus tip Z', Number.isFinite(stylusZ) ? fmt(stylusZ, 6, 'mm') : '—'],
            ['Stylus → LP ΔZ', Number.isFinite(stylusZ) ? fmt(stylusZ - lpTopZ, 6, 'mm') : '—'],
            ['Stylus LP status', Number.isFinite(stylusZ) && Math.abs(stylusZ - lpTopZ) <= 0.001 ? 'on LP plane' : 'snapshot-derived'],
            ['Pivot–stylus ΔZ', Number.isFinite(pivotZ) && Number.isFinite(stylusZ) ? fmt(pivotZ - stylusZ, 6, 'mm') : '—'],
            ['Body envelope datum', fmt(st && st.armBodyDatumOffsetZ !== undefined ? st.armBodyDatumOffsetZ : 0, 3, 'mm')],
            ['Pivot', phys ? pointText(phys.pivot) : '—'],
            ['Stylus', phys ? pointText(phys.stylus) : '—'],
            ['Total COM', cTotal ? pointText(cTotal) : '—'],
            ['Rear COM', cRear ? pointText(cRear) : '—'],
            ['Counterweight COM', cRearWeights && cRearWeights.com ? pointText(cRearWeights.com) : (cRearWeights ? pointText(cRearWeights) : '—')],
            ['Stylus → Pivot', metricText(getByPath(phys, 'distances.stylus_pivot', null))],
            ['Pivot → Total COM', metricText(getByPath(phys, 'distances.pivot_totalCOM', null))],
            ['Pivot → Rear COM', metricText(getByPath(phys, 'distances.pivot_rearCOM', null))],
            ['Pivot → Counterweight COM', metricText(getByPath(phys, 'distances.pivot_counterweightCOM', null))],
            ['Total COM → Counterweight COM', metricText(getByPath(phys, 'distances.totalCOM_counterweightCOM', null))],
            ['Stylus → Total COM', metricText(getByPath(phys, 'distances.stylus_totalCOM', null))],
            ['Static imbalance at stylus tip', phys && phys.staticImbalance ? fmt(phys.staticImbalance.gf, 3, 'g-eq') : '—'],
            ['Moment about pivot', phys && phys.staticImbalance ? fmt(phys.staticImbalance.totalMomentGmm, 3, 'g·mm') : '—'],
            ['Static imbalance gauge', phys && phys.staticImbalance ? 'snapshot-derived' : '—'],
            ['Static imbalance gauge hint', 'derived from immutable report snapshot, not live DOM readouts'],
            ['I_vertical', fmt(firstFinite(phys, ['inertia.Izz', 'Izz'], null), 6)],
            ['I_horizontal', fmt(firstFinite(phys, ['inertia.Iyy', 'Iyy'], null), 6)],
            ['Radius of gyration vertical', fmt(firstFinite(phys, ['inertia.kzz', 'kzz'], null), 6)],
            ['Total ring count', phys && phys.structural && Number.isFinite(Number(phys.structural.totalRingCount)) ? Number(phys.structural.totalRingCount) : '—'],
            ['Structural ring count', phys && phys.structural && Number.isFinite(Number(phys.structural.structuralRingCount)) ? Number(phys.structural.structuralRingCount) : '—'],
            ['Excluded cap/sliver rings', phys && phys.structural && Number.isFinite(Number(phys.structural.excludedCapOrSliverCount)) ? Number(phys.structural.excludedCapOrSliverCount) : '—'],
            ['EI_min', phys && phys.structural ? fmt(phys.structural.EI_min_Nm2 !== undefined ? phys.structural.EI_min_Nm2 : phys.structural.EI_min, 6, 'N·m²') : '—'],
            ['EI@apex', phys && phys.structural ? fmt(phys.structural.EI_apex_Nm2 !== undefined ? phys.structural.EI_apex_Nm2 : phys.structural.EI_apex, 6, 'N·m²') : '—'],
            ['GJ_min', phys && phys.structural ? fmt(phys.structural.GJ_min_Nm2 !== undefined ? phys.structural.GJ_min_Nm2 : phys.structural.GJ_min, 6, 'N·m²') : '—'],
            ['First bending mode', phys && phys.structural ? fmt(phys.structural.firstBendingHz, 3, 'Hz') : '—'],
            ['First torsion mode', phys && phys.structural ? fmt(phys.structural.firstTorsionHz, 3, 'Hz') : '—'],
            ['Structural status', phys && phys.structural ? [phys.structural.bendingStatus, phys.structural.torsionStatus].filter(Boolean).join(' / ') : '—']
        ];
    }

    function collectAllControls(reportState) {
        const rows = [];
        const seen = Object.create(null);

        function add(kind, id, value, label, unit, extra) {
            if (!id || seen[kind + ':' + id]) return;
            seen[kind + ':' + id] = true;
            rows.push([kind, id, label || id, fmtCompact(value), unit || '', extra || '']);
        }

        const st = reportState || currentState();
        const metaApi = root.ParameterMetadata || (typeof ParameterMetadata !== 'undefined' ? ParameterMetadata : null);

        const numericIds = [];
        if (typeof inputs !== 'undefined' && Array.isArray(inputs)) numericIds.push.apply(numericIds, inputs);
        if (root.Session && Array.isArray(root.Session.EXTRA_INPUT_IDS)) {
            root.Session.EXTRA_INPUT_IDS.forEach(id => { if (numericIds.indexOf(id) === -1) numericIds.push(id); });
        }

        numericIds.forEach(id => {
            const el = document.getElementById(id);
            const meta = metaApi && typeof metaApi.get === 'function' ? metaApi.get(id) : null;
            const value = st[id] !== undefined ? st[id] : (el ? parseFloat(el.value) : undefined);
            add('input', id, value, meta ? meta.label : '', meta ? meta.unit : '', meta ? meta.category : '');
        });

        const selectIds = root.Session && Array.isArray(root.Session.SELECT_IDS)
            ? root.Session.SELECT_IDS
            : ['exportType', 'exportFormat', 'rearMode', 'material', 'cartMode', 'alignmentPreset', 'renderMode'];
        selectIds.forEach(id => {
            const el = document.getElementById(id);
            add('select', id, st[id] !== undefined ? st[id] : (el ? el.value : undefined), '', '', '');
        });

        const checkIds = root.Session && Array.isArray(root.Session.CHECKBOX_IDS)
            ? root.Session.CHECKBOX_IDS
            : [];
        checkIds.forEach(id => {
            const el = document.getElementById(id);
            add('checkbox', id, st[id] !== undefined ? st[id] : (el ? !!el.checked : undefined), '', '', '');
        });

        document.querySelectorAll('input, select').forEach(el => {
            if (!el.id) return;
            if (el.type === 'checkbox') add('checkbox', el.id, !!el.checked, '', '', 'DOM extra');
            else if (el.tagName.toLowerCase() === 'select') add('select', el.id, el.value, '', '', 'DOM extra');
            else add('input', el.id, el.value, '', '', 'DOM extra');
        });

        return rows;
    }

    function buildRingStats(rings, reportState) {
        if (!rings.length) return { rows: [], stationRows: [] };
        const st = reportState || currentState();
        const material = (typeof MATERIAL_LIB !== 'undefined' && MATERIAL_LIB[st.material]) ? MATERIAL_LIB[st.material] : null;
        const densityGPerMm3 = material ? material.density / 1000 : 0;

        const values = {
            x: [], z: [], width: [], height: [], outerArea: [], innerArea: [], shellArea: [], massPerMm: []
        };

        rings.forEach(r => {
            const outerArea = r.outGeo ? r.outGeo.area : NaN;
            const innerArea = r.inGeo ? r.inGeo.area : NaN;
            const shellArea = Number.isFinite(outerArea) && Number.isFinite(innerArea) ? Math.max(0, outerArea - innerArea) : NaN;
            values.x.push(r.center.x);
            values.z.push(r.center.z);
            values.width.push(r.p && r.p.width);
            values.height.push(r.p && r.p.height);
            values.outerArea.push(outerArea);
            values.innerArea.push(innerArea);
            values.shellArea.push(shellArea);
            values.massPerMm.push(shellArea * densityGPerMm3);
        });

        function minMax(arr) {
            const nums = arr.filter(Number.isFinite);
            if (!nums.length) return ['—', '—'];
            return [Math.min.apply(null, nums), Math.max.apply(null, nums)];
        }

        const statRows = [
            ['Ring count', rings.length],
            ['X range', minMax(values.x).map(v => fmt(v, 3, 'mm')).join(' → ')],
            ['Center Z range', minMax(values.z).map(v => fmt(v, 3, 'mm')).join(' → ')],
            ['Width range', minMax(values.width).map(v => fmt(v, 3, 'mm')).join(' → ')],
            ['Height range', minMax(values.height).map(v => fmt(v, 3, 'mm')).join(' → ')],
            ['Outer section area range', minMax(values.outerArea).map(v => fmt(v, 3, 'mm²')).join(' → ')],
            ['Inner section area range', minMax(values.innerArea).map(v => fmt(v, 3, 'mm²')).join(' → ')],
            ['Shell section area range', minMax(values.shellArea).map(v => fmt(v, 3, 'mm²')).join(' → ')],
            ['Approx. mass/mm range', minMax(values.massPerMm).map(v => fmt(v, 5, 'g/mm')).join(' → ')]
        ];

        const stationRows = rings.map((r, i) => {
            const outerArea = r.outGeo ? r.outGeo.area : NaN;
            const innerArea = r.inGeo ? r.inGeo.area : NaN;
            const shellArea = Number.isFinite(outerArea) && Number.isFinite(innerArea) ? Math.max(0, outerArea - innerArea) : NaN;
            return [
                i,
                fmt(r.virtualX, 3),
                fmt(r.center.x, 3),
                fmt(r.center.y, 3),
                fmt(r.center.z, 3),
                fmt(r.p && r.p.width, 3),
                fmt(r.p && r.p.height, 3),
                fmt(outerArea, 3),
                fmt(innerArea, 3),
                fmt(shellArea, 3),
                r.isValid ? 'yes' : 'no'
            ];
        });

        return { rows: statRows, stationRows };
    }

    function buildKinematicRows(st, phys) {
        return safeCall('kinematics', function() {
            const preset = (typeof KINEMATICS_PRESETS !== 'undefined' && KINEMATICS_PRESETS[st.alignmentPreset])
                ? KINEMATICS_PRESETS[st.alignmentPreset]
                : null;
            const target = preset && typeof Kinematics !== 'undefined'
                ? Kinematics.calculateAlignment(st.pivotSpindle, preset.n1, preset.n2)
                : null;
            const actualLeff = (typeof Physics !== 'undefined') ? Physics.getEffectiveLength(st, st.cartMode) : NaN;
            return [
                ['Alignment preset', st.alignmentPreset],
                ['Pivot-to-spindle', fmt(st.pivotSpindle, 3, 'mm')],
                ['Target effective length', target ? fmt(target.Leff, 3, 'mm') : '—'],
                ['Actual effective length', fmt(actualLeff, 3, 'mm')],
                ['Effective length error', target ? fmt(actualLeff - target.Leff, 3, 'mm') : '—'],
                ['Target overhang', target ? fmt(target.overhang, 3, 'mm') : '—'],
                ['Target offset angle', target ? fmt(target.offsetDeg, 3, 'deg') : '—'],
                ['Stylus point', phys ? pointText(phys.stylus) : '—'],
                ['Pivot point', phys ? pointText(phys.pivot) : '—']
            ];
        }, [['Kinematics', 'not available']]);
    }

    function buildExportRows(st, exportValidation) {
        return safeCall('export validation', function() {
            if (typeof validateExportGeometry !== 'function' && !exportValidation) {
                return [['Export validation', 'validateExportGeometry unavailable']];
            }
            const val = exportValidation || validateExportGeometry(st.exportType, st);
            const rows = [
                ['Export type', st.exportType],
                ['Export format', st.exportFormat],
                ['Validation status', val && val.isValid ? 'PASS' : 'FAIL'],
                ['Export geometry source', (val && (val.exportGeometrySource || (val.metrics && val.metrics.exportGeometrySource))) || 'legacy fallback'],
                ['Message', (val && val.errorMsg) || '—']
            ];
            if (val && val.geometry && val.geometry.userData) {
                Object.keys(val.geometry.userData).sort().forEach(k => {
                    rows.push(['geometry.userData.' + k, fmtCompact(val.geometry.userData[k])]);
                });
            }
            return rows;
        }, [['Export validation', 'error']]);
    }

    function buildCobraRows(st) {
        const rows = [];
        const manifest = safeCall('getCobraCapabilityManifest', function() {
            if (typeof root.getCobraCapabilityManifest === 'function') return root.getCobraCapabilityManifest();
            if (root.CobraArchitecture && typeof root.CobraArchitecture.getCobraCapabilityManifest === 'function') {
                return root.CobraArchitecture.getCobraCapabilityManifest();
            }
            return null;
        }, null);

        if (manifest) {
            Object.keys(manifest).forEach(key => rows.push([key, manifest[key]]));
        } else {
            rows.push(['Cobra capability manifest', 'missing']);
        }

        const cobraApi = root.CobraControls || (typeof CobraControls !== 'undefined' ? CobraControls : null);
        if (cobraApi) {
            const block = safeCall('CobraControls.toStateBlock', () => cobraApi.toStateBlock(st), null);
            const featureManifest = safeCall('CobraControls.getFeatureManifest', () => (
                typeof cobraApi.getFeatureManifest === 'function' ? cobraApi.getFeatureManifest(st) : null
            ), null);
            rows.push(['CobraControls detail', 'loaded']);
            if (block) {
                rows.push(['cobraControls schema', block.schema]);
                rows.push(['cobraControls enabled', block.enabled]);
                rows.push(['cobraControls specRegime', block.specRegime]);
                rows.push(['cobraControls N1-P2', Number.isFinite(Number(block.n1p2Mm)) ? fmt(Number(block.n1p2Mm), 2, 'mm') : '—']);
                rows.push(['cobraControls counterweight variant', block.counterweightVariant]);
                rows.push(['cobraControls counterweight use rear-disc proxy', block.counterweightUseRearDiscProxy === true]);
                rows.push(['cobraControls armwand variant', block.armwandVariant]);
                rows.push(['cobraControls armwand station count', block.armwandStationCount]);
                rows.push(['cobraControls mechanical variant', block.mechanicalVariant || '—']);
                rows.push(['cobraControls mechanical enabled', block.mechanicalEnabled === true]);
                rows.push(['cobraControls mechanical bearing type', block.mechanicalBearingType || '—']);
                rows.push(['cobraControls mechanical VTA type', block.mechanicalVtaType || '—']);
                rows.push(['cobraControls headshell slots enabled', block.headshellSlotsEnabled === true]);
                rows.push(['cobraControls headshell slots variant', block.headshellSlotsVariant || '—']);
                rows.push(['cobraControls headshell slot count', Number.isFinite(Number(block.headshellSlotsSlotCount)) ? Number(block.headshellSlotsSlotCount) : '—']);
                rows.push(['cobraControls headshell boolean cut status', block.headshellSlotsBooleanCutStatus || '—']);
            }
            if (featureManifest) {
                rows.push(['cobraControls featureCount', featureManifest.featureCount]);
            }
        } else {
            rows.push(['CobraControls detail', 'not loaded']);
        }

        [
            ['CobraDiscCounterweightAssembly', root.CobraDiscCounterweightAssembly],
            ['CobraEggshellWand', root.CobraEggshellWand || root.StationBasedEggshellWand],
            ['StructuralStationFilter', root.StructuralStationFilter],
            ['CobraMechanicalAssembly', root.CobraMechanicalAssembly],
            ['HeadshellSlots', root.HeadshellSlots],
            ['CobraAcceptance', root.CobraAcceptance]
        ].forEach(pair => {
            const name = pair[0];
            const api = pair[1];
            if (!api || typeof api.getFeatureManifest !== 'function') {
                rows.push([name, 'not loaded']);
                return;
            }
            const featureManifest = safeCall(name + '.getFeatureManifest', () => api.getFeatureManifest(st), null);
            rows.push([name, featureManifest ? 'loaded; features=' + featureManifest.featureCount : 'error']);
            if (featureManifest && Array.isArray(featureManifest.features)) {
                featureManifest.features.forEach(f => rows.push([name + '.' + f.id, f.role || JSON.stringify(f)]));
            }
        });

        return rows;
    }

    function buildCobraArchitectureValidationRows(st, validation) {
        const arch = (root.CobraArchitecture && typeof root.CobraArchitecture.getCobraArchitecture === 'function')
            ? root.CobraArchitecture.getCobraArchitecture(st)
            : ((st && st.cobraArchitecture) || { enabled: false });
        const measured = validation && validation.measured ? validation.measured : {};
        const missing = validation && Array.isArray(validation.missingCapabilities) ? validation.missingCapabilities : [];
        const contextDetected = validation && typeof validation.cobraContextDetected === 'boolean'
            ? validation.cobraContextDetected
            : !!(root.CobraArchitecture &&
                typeof root.CobraArchitecture.isCobraArchitectureContext === 'function' &&
                root.CobraArchitecture.isCobraArchitectureContext(st).detected);
        const gateActive = validation && typeof validation.architectureGateActive === 'boolean'
            ? validation.architectureGateActive
            : !!arch.enabled;
        const activationReason = validation && validation.gateActivationReason ? validation.gateActivationReason : (gateActive ? 'cobraArchitecture.enabled' : 'none');
        return [
            ['Cobra context detected', contextDetected],
            ['Architecture gate active', gateActive],
            ['Gate activation reason', activationReason],
            ['Cobra architecture enabled', !!arch.enabled],
            ['Spec regime', arch.specRegime || '—'],
            ['N1-P2 target', Number.isFinite(Number(arch.n1p2Mm)) ? fmt(Number(arch.n1p2Mm), 2, 'mm') : '—'],
            ['N1-P2 measured', Number.isFinite(Number(measured.n1p2Mm)) ? fmt(Number(measured.n1p2Mm), 3, 'mm') : '—'],
            ['Counterweight variant', arch.counterweight ? arch.counterweight.variant : '—'],
            ['cobraDiscCounterweightAssembly', measured.discCounterweightAssembly || 'missing'],
            ['Disc counterweight enabled', measured.discCounterweightEnabled === true],
            ['Disc count', Number.isFinite(Number(measured.discCount)) ? Number(measured.discCount) : '—'],
            ['Disc mass each', Number.isFinite(Number(measured.discMassEachG)) ? fmt(Number(measured.discMassEachG), 3, 'g') : '—'],
            ['Total disc mass', Number.isFinite(Number(measured.discCounterweightMassG)) ? fmt(Number(measured.discCounterweightMassG), 3, 'g') : '—'],
            ['Disc counterweight COM X/Y/Z', measured.discCounterweightCOM ?
                [fmt(Number(measured.discCounterweightCOM.x), 3), fmt(Number(measured.discCounterweightCOM.y), 3), fmt(Number(measured.discCounterweightCOM.z), 3)].join(', ') : '—'],
            ['stationBasedEggshellWand', measured.stationBasedEggshellWand || 'missing'],
            ['structuralStationFilter', measured.structuralStationFilter || 'missing'],
            ['cobraMechanicalAssembly', measured.cobraMechanicalAssembly || 'missing'],
            ['headshellSlots', measured.headshellSlots || 'missing'],
            ['Headshell slots enabled', measured.headshellSlotsEnabled === true],
            ['Headshell slots validation status', measured.headshellSlotsValidationStatus || '—'],
            ['Mechanical enabled', measured.mechanicalEnabled === true],
            ['Mechanical validation status', measured.mechanicalValidationStatus || '—'],
            ['Mechanical mass component count', Number.isFinite(Number(measured.mechanicalMassComponentCount)) ? Number(measured.mechanicalMassComponentCount) : '—'],
            ['Eggshell validation status', measured.eggshellValidationStatus || '—'],
            ['Counterweight COM source', measured.counterweightCOMSource || 'none'],
            ['Rear disc proxy used', false],
            ['Rear disc stack role', 'canonical, not proxy'],
            ['Total COM Z target', '<= ' + fmt(Number(arch.constraints && arch.constraints.totalCOMZMaxMm !== undefined ? arch.constraints.totalCOMZMaxMm : 0), 2, 'mm')],
            ['Total COM Z measured', Number.isFinite(Number(measured.totalCOMZMm)) ? fmt(Number(measured.totalCOMZMm), 3, 'mm') : '—'],
            ['Total COM Z blocker', Number.isFinite(Number(measured.totalCOMZMm)) ? Number(measured.totalCOMZMm) > 0 : '—'],
            ['Counterweight COM Z target', '<= ' + fmt(Number(arch.constraints && arch.constraints.counterweightCOMZMaxMm !== undefined ? arch.constraints.counterweightCOMZMaxMm : 0), 2, 'mm')],
            ['Counterweight COM Z measured', Number.isFinite(Number(measured.counterweightCOMZMm)) ? fmt(Number(measured.counterweightCOMZMm), 3, 'mm') : '—'],
            ['EI_min requirement', arch.constraints && arch.constraints.eiMinMustBePositive ? '> 0' : 'not required'],
            ['EI_min measured', Number.isFinite(Number(measured.eiMinNm2)) ? fmt(Number(measured.eiMinNm2), 3, 'N·m²') : '—'],
            ['First bending requirement', arch.constraints && arch.constraints.firstBendingHzMustBePositive ? '> 0' : 'not required'],
            ['First bending measured', Number.isFinite(Number(measured.firstBendingHz)) ? fmt(Number(measured.firstBendingHz), 3, 'Hz') : '—'],
            ['Export validation', measured.exportValidation || '—'],
            ['Cobra validation status', validation ? validation.status : '—'],
            ['Missing modules', missing.length ? missing.join(', ') : '—'],
            ['Errors', validation && validation.errors && validation.errors.length ? validation.errors.join('<br>') : '—'],
            ['Warnings', validation && validation.warnings && validation.warnings.length ? validation.warnings.join('<br>') : '—']
        ];
    }


    function buildCobraDiscCounterweightRows(st) {
        const api = root.CobraDiscCounterweightAssembly;
        if (!api || typeof api.validateCounterweight !== 'function') {
            return [
                ['Counterweight implementation', 'configurable_disc_stack'],
                ['Disc counterweight capability', 'missing'],
                ['Counterweight validation status', 'missing']
            ];
        }
        const validation = safeCall('CobraDiscCounterweightAssembly.validateCounterweight', () => api.validateCounterweight(st), null);
        const measured = validation && validation.measured ? validation.measured : {};
        return [
            ['Counterweight implementation', 'configurable_disc_stack'],
            ['Disc counterweight capability', 'loaded'],
            ['Disc count', Number.isFinite(Number(measured.discCount)) ? Number(measured.discCount) : '—'],
            ['Disc diameter', Number.isFinite(Number(measured.discDiameterMm)) ? fmt(Number(measured.discDiameterMm), 3, 'mm') : '—'],
            ['Disc thickness', Number.isFinite(Number(measured.discThicknessMm)) ? fmt(Number(measured.discThicknessMm), 3, 'mm') : '—'],
            ['Disc mass each', Number.isFinite(Number(measured.discMassEachG)) ? fmt(Number(measured.discMassEachG), 3, 'g') : '—'],
            ['Total disc mass', Number.isFinite(Number(measured.totalDiscMassG)) ? fmt(Number(measured.totalDiscMassG), 3, 'g') : '—'],
            ['Fine trim mass equivalent', Number.isFinite(Number(measured.fineTrimMassEquivalentG)) ? fmt(Number(measured.fineTrimMassEquivalentG), 3, 'g') : '—'],
            ['Counterweight COM source', measured.counterweightCOMSource || 'rearWeightDiscStack'],
            ['Counterweight COM X/Y/Z', measured.counterweightCOM ?
                [fmt(Number(measured.counterweightCOM.x), 3), fmt(Number(measured.counterweightCOM.y), 3), fmt(Number(measured.counterweightCOM.z), 3)].join(', ') : '—'],
            ['Counterweight COM Z target', '<= 0.00 mm'],
            ['Counterweight validation status', validation ? validation.status : '—'],
            ['Errors', validation && validation.errors && validation.errors.length ? validation.errors.join('<br>') : '—'],
            ['Warnings', validation && validation.warnings && validation.warnings.length ? validation.warnings.join('<br>') : '—']
        ];
    }

    function buildCobraEggshellRows(st) {
        const api = root.CobraEggshellWand || root.StationBasedEggshellWand;
        if (!api || typeof api.buildStations !== 'function' || typeof api.validateStations !== 'function') {
            return [
                ['Eggshell wand enabled', false],
                ['Station-based wand', 'missing'],
                ['Eggshell validation status', 'missing']
            ];
        }
        const enabled = !!(api.isEnabled && api.isEnabled(st));
        const stations = safeCall('CobraEggshellWand.buildStations', () => api.buildStations(st), []);
        const validation = safeCall('CobraEggshellWand.validateStations', () => api.validateStations(stations), null);
        return [
            ['Eggshell wand enabled', enabled],
            ['Station-based wand', 'loaded'],
            ['Station count', validation ? validation.stationCount : stations.length],
            ['Structural station count', validation ? validation.structuralStationCount : '—'],
            ['Min station width', validation && Number.isFinite(Number(validation.minStationWidthMm)) ? fmt(Number(validation.minStationWidthMm), 3, 'mm') : '—'],
            ['Min station height', validation && Number.isFinite(Number(validation.minStationHeightMm)) ? fmt(Number(validation.minStationHeightMm), 3, 'mm') : '—'],
            ['Min section area proxy', validation && Number.isFinite(Number(validation.minSectionAreaProxyMm2)) ? fmt(Number(validation.minSectionAreaProxyMm2), 3, 'mm²') : '—'],
            ['Min EI proxy', validation && Number.isFinite(Number(validation.minEIProxy)) ? fmt(Number(validation.minEIProxy), 3) : '—'],
            ['Constant section detected', validation ? validation.constantSectionDetected === true : '—'],
            ['Circular tube detected', validation ? validation.circularTubeDetected === true : '—'],
            ['Monotonic taper valid', validation ? validation.monotonicTaperValid === true : '—'],
            ['Eggshell validation status', validation ? validation.status : '—'],
            ['Errors', validation && validation.errors && validation.errors.length ? validation.errors.join('<br>') : '—'],
            ['Warnings', validation && validation.warnings && validation.warnings.length ? validation.warnings.join('<br>') : '—']
        ];
    }

    function buildCobraMechanicalRows(st) {
        const api = root.CobraMechanicalAssembly;
        if (!api || typeof api.toReportBlock !== 'function' || typeof api.validateAssembly !== 'function') {
            return [
                ['Mechanical assembly', 'missing'],
                ['Mechanical enabled', false],
                ['Validation status', 'missing']
            ];
        }
        const block = safeCall('CobraMechanicalAssembly.toReportBlock', () => api.toReportBlock(st), null);
        const validation = safeCall('CobraMechanicalAssembly.validateAssembly', () => api.validateAssembly(st), null);
        if (!block) {
            return [
                ['Mechanical assembly', 'loaded'],
                ['Mechanical enabled', '—'],
                ['Validation status', validation ? validation.status : 'error']
            ];
        }
        return [
            ['Mechanical assembly', 'loaded'],
            ['Mechanical enabled', block.enabled === true],
            ['Variant', block.variant || '—'],
            ['Pivot type', block.pivotType || '—'],
            ['Pivot X/Y/Z', block.pivot ? [fmt(Number(block.pivot.x), 3), fmt(Number(block.pivot.y), 3), fmt(Number(block.pivot.z), 3)].join(', ') : '—'],
            ['Tower enabled', block.towerEnabled === true],
            ['Tower diameter', Number.isFinite(Number(block.towerDiameterMm)) ? fmt(Number(block.towerDiameterMm), 3, 'mm') : '—'],
            ['Tower height', Number.isFinite(Number(block.towerHeightMm)) ? fmt(Number(block.towerHeightMm), 3, 'mm') : '—'],
            ['Tower mass', Number.isFinite(Number(block.towerMassG)) ? fmt(Number(block.towerMassG), 3, 'g') : '—'],
            ['Bearing type', block.bearingType || '—'],
            ['VTA type', block.vtaType || '—'],
            ['VTA ring mass', Number.isFinite(Number(block.vtaRingMassG)) ? fmt(Number(block.vtaRingMassG), 3, 'g') : '—'],
            ['Mass component count', Number.isFinite(Number(block.massComponentCount)) ? block.massComponentCount : '—'],
            ['Total COM integration', block.totalCOMIntegrationStatus || '—'],
            ['Validation status', block.validationStatus || (validation ? validation.status : '—')],
            ['Errors', block.errors && block.errors.length ? block.errors.join('<br>') : '—'],
            ['Warnings', block.warnings && block.warnings.length ? block.warnings.join('<br>') : '—']
        ];
    }


    function buildCobraHeadshellRows(st) {
        const api = root.HeadshellSlots;
        if (!api || typeof api.toReportBlock !== 'function' || typeof api.validateSpec !== 'function') {
            return [
                ['Headshell slots', 'missing'],
                ['Headshell slots enabled', false],
                ['Validation status', 'missing']
            ];
        }
        const block = safeCall('HeadshellSlots.toReportBlock', () => api.toReportBlock(st), null);
        const validation = safeCall('HeadshellSlots.validateSpec', () => api.validateSpec(st), null);
        if (!block) {
            return [
                ['Headshell slots', 'loaded'],
                ['Headshell slots enabled', '—'],
                ['Validation status', validation ? validation.status : 'error']
            ];
        }
        return [
            ['Headshell slots', 'loaded'],
            ['Headshell slots enabled', block.enabled === true],
            ['Variant', block.variant || '—'],
            ['Screw standard', block.screwStandard || '—'],
            ['Through hole', block.throughHole === true],
            ['Slot count', Number.isFinite(Number(block.slotCount)) ? block.slotCount : '—'],
            ['Slot length min', Number.isFinite(Number(block.slotLengthMinMm)) ? fmt(Number(block.slotLengthMinMm), 3, 'mm') : '—'],
            ['Slot width min', Number.isFinite(Number(block.slotWidthMinMm)) ? fmt(Number(block.slotWidthMinMm), 3, 'mm') : '—'],
            ['Slot symmetry error', Number.isFinite(Number(block.slotSymmetryErrorMm)) ? fmt(Number(block.slotSymmetryErrorMm), 3, 'mm') : '—'],
            ['Plate length', Number.isFinite(Number(block.plateLengthMm)) ? fmt(Number(block.plateLengthMm), 3, 'mm') : '—'],
            ['Plate width', Number.isFinite(Number(block.plateWidthMm)) ? fmt(Number(block.plateWidthMm), 3, 'mm') : '—'],
            ['Boolean cut status', block.booleanCutStatus || 'full_csg'],
            ['Validation status', block.validationStatus || (validation ? validation.status : '—')],
            ['Errors', block.errors && block.errors.length ? block.errors.join('<br>') : '—'],
            ['Warnings', block.warnings && block.warnings.length ? block.warnings.join('<br>') : '—']
        ];
    }




    function buildRuntimeStateSyncRows(st) {
        const api = root.CobraAcceptance;
        if (!api || typeof api.auditRuntimeStateSync !== 'function') {
            return [
                ['Runtime state sync audit', 'missing'],
                ['State sync status', 'missing'],
                ['DOM/session/state apex', '—'],
                ['DOM/session/state cartX', '—'],
                ['DOM/session/state rearMode', '—'],
                ['Sync errors', 'CobraAcceptance.auditRuntimeStateSync missing']
            ];
        }
        const audit = safeCall('CobraAcceptance.auditRuntimeStateSync', () => api.auditRuntimeStateSync(st), null);
        if (!audit) {
            return [
                ['Runtime state sync audit', 'loaded'],
                ['State sync status', 'error'],
                ['DOM/session/state apex', '—'],
                ['DOM/session/state cartX', '—'],
                ['DOM/session/state rearMode', '—'],
                ['Sync errors', 'audit failed']
            ];
        }
        const sourceTriplet = function(field, sessionKey) {
            return [
                'state=' + fmtCompact(audit.state ? audit.state[field] : undefined),
                'DOM=' + fmtCompact(audit.dom ? audit.dom[field] : undefined),
                'session=' + fmtCompact(audit.session ? audit.session[sessionKey] : undefined)
            ].join(' / ');
        };
        return [
            ['Runtime state sync audit', 'loaded'],
            ['State sync status', audit.status],
            ['DOM/session/state apex', sourceTriplet('apex', 'inputs.apex')],
            ['DOM/session/state cartX', sourceTriplet('cartX', 'inputs.cartX')],
            ['DOM/session/state rearMode', sourceTriplet('rearMode', 'selects.rearMode')],
            ['N1-P2 measured', Number.isFinite(Number(audit.n1p2Mm)) ? fmt(Number(audit.n1p2Mm), 3, 'mm') : '—'],
            ['Sync errors', audit.syncErrors && audit.syncErrors.length ? audit.syncErrors.join('<br>') : '—'],
            ['Warnings', audit.warnings && audit.warnings.length ? audit.warnings.join('<br>') : '—']
        ];
    }


    function buildCobraRuntimeGeometryRows(st, exportValidation) {
        const api = root.CobraAcceptance;
        if (!api || typeof api.auditRuntimeGeometry !== 'function') {
            return [
                ['Cobra 3D render path', 'unavailable'],
                ['Cobra 3D render status', 'FAIL'],
                ['Render vertex count', '—'],
                ['Render index count', '—'],
                ['Render group count', '—'],
                ['Render material mode', 'unavailable'],
                ['Export geometry source', 'unavailable'],
                ['Export validation', 'FAIL'],
                ['N1-P2 precision status', 'FAIL'],
                ['DOM cartX precision', '—'],
                ['Session cartX precision', '—']
            ];
        }
        const audit = safeCall('CobraAcceptance.auditRuntimeGeometry', () => api.auditRuntimeGeometry(st, { exportResult: exportValidation }), null);
        if (!audit) {
            return [
                ['Cobra 3D render path', 'unavailable'],
                ['Cobra 3D render status', 'FAIL'],
                ['Render vertex count', '—'],
                ['Render index count', '—'],
                ['Render group count', '—'],
                ['Render material mode', 'unavailable'],
                ['Export geometry source', 'unavailable'],
                ['Export validation', 'FAIL'],
                ['N1-P2 precision status', 'FAIL'],
                ['DOM cartX precision', '—'],
                ['Session cartX precision', '—']
            ];
        }
        return [
            ['Cobra 3D render path', audit.renderPath || 'unavailable'],
            ['Cobra 3D render status', audit.renderStatus || audit.status || 'FAIL'],
            ['Render vertex count', Number.isFinite(Number(audit.vertexCount)) ? Number(audit.vertexCount) : '—'],
            ['Render index count', Number.isFinite(Number(audit.indexCount)) ? Number(audit.indexCount) : '—'],
            ['Render group count', Number.isFinite(Number(audit.groupCount)) ? Number(audit.groupCount) : '—'],
            ['Render material mode', audit.renderMaterialMode || 'unavailable'],
            ['Export geometry source', audit.exportGeometrySource || 'unavailable'],
            ['Export validation', audit.exportValidation || 'FAIL'],
            ['N1-P2 precision status', audit.n1p2PrecisionStatus || 'FAIL'],
            ['DOM cartX precision', audit.domCartXPrecision !== undefined ? audit.domCartXPrecision : '—'],
            ['Session cartX precision', audit.sessionCartXPrecision !== undefined ? audit.sessionCartXPrecision : '—'],
            ['Errors', audit.errors && audit.errors.length ? audit.errors.join('<br>') : '—'],
            ['Warnings', audit.warnings && audit.warnings.length ? audit.warnings.join('<br>') : '—']
        ];
    }

    function buildCobraAcceptanceRows(st) {
        const api = root.CobraAcceptance;
        if (!api || typeof api.toReportBlock !== 'function') {
            return [
                ['Canonical Cobra preset', 'missing'],
                ['Acceptance status', 'missing'],
                ['Static known-good acceptance', 'missing'],
                ['Runtime measured acceptance', 'missing'],
                ['Runtime acceptance mode', 'runtime_measured'],
                ['Capability complete', false],
                ['Missing capabilities', 'CobraAcceptance module missing'],
                ['Runtime physics source', 'unavailable'],
                ['Runtime export source', 'unavailable']
            ];
        }
        const block = safeCall('CobraAcceptance.toReportBlock', () => api.toReportBlock({ state: deepClone(st), skipPresetApply: true, readOnly: true }), null);
        if (block && Array.isArray(block.rows)) return block.rows;
        return [
            ['Canonical Cobra preset', 'loaded'],
            ['Acceptance status', 'error'],
            ['Static known-good acceptance', 'error'],
            ['Runtime measured acceptance', 'error'],
            ['Runtime acceptance mode', 'runtime_measured'],
            ['Capability complete', false],
            ['Missing capabilities', 'unknown'],
            ['Runtime physics source', 'unavailable'],
            ['Runtime export source', 'unavailable']
        ];
    }


    function buildCobraManualVerificationRows(st) {
        const api = root.CobraManualVerification;
        if (!api || typeof api.toReportBlock !== 'function') {
            return [
                ['Manual verification package', 'missing'],
                ['Verification status', 'missing'],
                ['Automatic status', 'missing'],
                ['Manual visual status', 'REQUIRED'],
                ['N1-P2 measured', '—'],
                ['Counterweight COM Z', '—'],
                ['Legacy proxy mutation', '—'],
                ['Not tube form', 'manual required'],
                ['Eggshell taper', 'manual required'],
                ['Configurable disc counterweight visible', 'manual required'],
                ['Browser/visual verification by Jan-Eric', 'required']
            ];
        }
        const block = safeCall('CobraManualVerification.toReportBlock', () => api.toReportBlock({ targetState: deepClone(st), applyPreset: false, readOnly: true }), null);
        if (block && Array.isArray(block.rows)) return block.rows;
        return [
            ['Manual verification package', 'loaded'],
            ['Verification status', 'error'],
            ['Automatic status', 'error'],
            ['Manual visual status', 'REQUIRED'],
            ['N1-P2 measured', '—'],
            ['Counterweight COM Z', '—'],
            ['Legacy proxy mutation', '—'],
            ['Not tube form', 'manual required'],
            ['Eggshell taper', 'manual required'],
            ['Configurable disc counterweight visible', 'manual required'],
            ['Browser/visual verification by Jan-Eric', 'required']
        ];
    }


    function buildCobraReleaseReadinessRows(st) {
        const api = root.CobraManualVerification;
        if (!api || typeof api.toReleaseReadinessReportBlock !== 'function') {
            return [
                ['Release readiness', 'HOLD'],
                ['Known-good acceptance', 'missing'],
                ['Runtime measured acceptance', 'INDETERMINATE'],
                ['Manual visual verification', 'REQUIRED'],
                ['Visual evidence required', true],
                ['Visual evidence supplied', false],
                ['Browser run ID', '—'],
                ['Screenshot refs', '—'],
                ['Report ref', '—'],
                ['Release blockers', 'CobraManualVerification module missing']
            ];
        }
        const block = safeCall('CobraManualVerification.toReleaseReadinessReportBlock', () => api.toReleaseReadinessReportBlock({ targetState: deepClone(st), applyPreset: false, readOnly: true }), null);
        if (block && Array.isArray(block.rows)) return block.rows;
        return [
            ['Release readiness', 'HOLD'],
            ['Known-good acceptance', 'error'],
            ['Runtime measured acceptance', 'INDETERMINATE'],
            ['Manual visual verification', 'REQUIRED'],
            ['Visual evidence required', true],
            ['Visual evidence supplied', false],
            ['Browser run ID', '—'],
            ['Screenshot refs', '—'],
            ['Report ref', '—'],
            ['Release blockers', 'release readiness report generation failed']
        ];
    }


function buildFreeformApplyAuditRows(st) {
        const apply = st.freeformApplyState || {};
        const active = st.freeformLoftActive || {};
        const preview = st.freeformLoftPreview || {};
        const rejected = st.freeformLoftRejected || {};
        const hasAcceptedActive = !!(active && active.revision);
        const lastPreview = st.freeformLastPreviewAnalysis || {};
        const lastAccepted = st.freeformLastAcceptedAnalysis || st.freeformLastAnalysis || {};
        const subject = hasAcceptedActive ? 'accepted active freeform' : (preview && preview.revision ? 'preview/quarantine freeform' : 'parametric');
        const analysisBundle = hasAcceptedActive ? lastAccepted : (preview && preview.revision ? lastPreview : {});
        const analysis = analysisBundle.analysis || analysisBundle.deterministicAnalysis || analysisBundle || {};
        const sessionAudit = st.geometryModeAudit || {};
        const modeAudit = sessionAudit.renderGeometrySource ? sessionAudit : (analysis.geometryModeAudit || analysisBundle.geometryModeAudit || {
            stateGeometryMode: st.geometryMode,
            renderGeometrySource: st.geometryMode === 'freeform' && hasAcceptedActive ? 'freeformLoftKernel' : 'parametricRuntime',
            exportGeometrySource: st.geometryMode === 'freeform' && hasAcceptedActive ? 'freeformLoftKernel' : 'parametricRuntime',
            reportGeometrySource: st.geometryMode === 'freeform' && hasAcceptedActive ? 'freeformPhysicalAnalysis' : 'parametricPhysics',
            stlSource: st.geometryMode === 'freeform' && hasAcceptedActive ? 'freeformLoftKernel' : 'parametricRuntime',
            modeMismatch: !(st.geometryMode === 'freeform' && hasAcceptedActive),
            status: st.geometryMode === 'freeform' && hasAcceptedActive ? 'PASS_WITH_SCOPE' : 'BLOCKER'
        });
        const target = analysis.targetCompliance || analysisBundle.targetCompliance || {};
        const cobra = analysis.cobraFidelity || analysisBundle.cobraFidelity || {};
        const feasibility = analysis.freeformFeasibility || analysisBundle.freeformFeasibility || {};
        const acceptance = analysis.freeformAcceptance || analysisBundle.freeformAcceptance || {};
        const cobraWeak = (cobra.blockers || cobra.reasons || []).filter(Boolean).join('; ') || '—';
        const targetBlockers = (target.blockers || target.warnings || []).filter(Boolean).join('; ') || '—';
        return [
            ['TD053F apply phase', apply.phase || 'EMPTY'],
            ['Report subject', subject],
            ['freeformLoftActive', hasAcceptedActive ? 'present' : 'missing'],
            ['Active design revision', active.revision || st.freeformAcceptedActiveRevision || '—'],
            ['Preview design revision', preview.revision || apply.previewRevision || '—'],
            ['Last rejected payload', rejected.payloadSummary || rejected.revision || '—'],
            ['geometryMode', st.geometryMode || '—'],
            ['apply phase', apply.phase || 'EMPTY'],
            ['renderGeometrySource', modeAudit.renderGeometrySource || '—'],
            ['exportGeometrySource', modeAudit.exportGeometrySource || '—'],
            ['reportGeometrySource', modeAudit.reportGeometrySource || '—'],
            ['stlSource', modeAudit.stlSource || modeAudit.exportGeometrySource || '—'],
            ['modeMismatch', !!modeAudit.modeMismatch],
            ['silentFallbackDetected', !!modeAudit.silentFallbackDetected],
            ['fallbackReason', modeAudit.fallbackReason || '—'],
            ['geometryModeAudit.status', modeAudit.status || '—'],
            ['targetCompliance status', target.status || target.overall || 'NOT_RUN'],
            ['targetCompliance.status', target.status || target.overall || 'NOT_RUN'],
            ['targetCompliance.blockers', targetBlockers],
            ['cobraFidelity status', cobra.status || 'NOT_RUN'],
            ['cobraFidelity.status', cobra.status || 'NOT_RUN'],
            ['cobraFidelity weak score reasons', cobraWeak],
            ['feasibility status', feasibility.status || feasibility.classification || 'NOT_RUN'],
            ['feasibility.status', feasibility.status || feasibility.classification || 'NOT_RUN'],
            ['repairHints', (feasibility.repairHints || analysis.repairHints || []).map(function(h) { return h.metric + ':' + h.direction + ':' + h.severity; }).join('; ') || '—'],
            ['acceptedActiveAllowed', acceptance.acceptedActiveAllowed === false ? false : (apply.operatorOverrideRequired ? false : 'unknown')],
            ['Claim boundary', 'local source/package/browser-state-binding candidate; browser manual validation required; not CAD/FEA/manufacturing/deployment verified']
        ];
    }

function buildPhysicsObjectRows(phys) {
        const rows = [];
        flattenObject(phys || {}, 'physics', rows, 5);
        return rows;
    }

    function buildMarkdownReport(nameHint) {
        if (typeof state === 'undefined' || state.designLoaded !== true) {
            throw new Error('Report export blocked: no active design exists in the empty session.');
        }
        const liveSessionBefore = safeCall('Session.collect report_preflight_snapshot', function() {
            return root.Session && typeof root.Session.collect === 'function'
                ? root.Session.collect('report_preflight_snapshot')
                : null;
        }, null);
        const reportState = buildStateFromSessionSnapshot(liveSessionBefore, currentState());
        const st = deepClone(reportState);

        const rings = currentRings();
        const mode = st.cartMode;
        const phys = safeCall('Physics.getComprehensiveAnalysis', function() {
            if (typeof Physics === 'undefined') return null;
            return Physics.getComprehensiveAnalysis(deepClone(st), mode, rings);
        }, null);
        const session = deepClone(liveSessionBefore) || null;
        if (session && typeof nameHint === 'string') session.name = nameHint;
        const ringStats = buildRingStats(rings, st);
        const reportName = (nameHint || (session && session.name) || 'TonearmDesigner technical report').trim();
        const exportValidation = safeCall('validateExportGeometry', function() {
            return (typeof validateExportGeometry === 'function') ? validateExportGeometry(st.exportType, st) : null;
        }, null);
        const cobraCapabilities = safeCall('getCobraCapabilityManifest', function() {
            if (typeof root.getCobraCapabilityManifest === 'function') return root.getCobraCapabilityManifest();
            if (root.CobraArchitecture && typeof root.CobraArchitecture.getCobraCapabilityManifest === 'function') {
                return root.CobraArchitecture.getCobraCapabilityManifest();
            }
            return null;
        }, null);
        const cobraArchitectureValidation = safeCall('validateCobraArchitecture', function() {
            if (typeof root.validateCobraArchitecture === 'function') {
                return root.validateCobraArchitecture(st, phys, { exportValidation }, cobraCapabilities);
            }
            if (root.CobraArchitecture && typeof root.CobraArchitecture.validateCobraArchitecture === 'function') {
                return root.CobraArchitecture.validateCobraArchitecture(st, phys, { exportValidation }, cobraCapabilities);
            }
            return null;
        }, null);

        root.__TonearmDesignerLatestReportContext = {
            state: deepClone(st),
            physics: phys,
            exportValidation: exportValidation,
            session: session,
            cobraArchitectureValidation: cobraArchitectureValidation,
            generatedAt: nowIso()
        };
        root.__TonearmLatestReportContext = root.__TonearmDesignerLatestReportContext;

        const lines = [];
        lines.push('# TonearmDesigner Technical Report');
        lines.push('');
        lines.push('> Clean engineering report generated from the live TonearmDesigner runtime state. Units are millimetres, grams, degrees and SI-derived engineering units unless stated otherwise.');
        lines.push('');
        lines.push('## 1. Report identity');
        lines.push('');
        lines.push(table(['Field', 'Value'], [
            ['Report schema', REPORT_SCHEMA],
            ['Report name', reportName || '—'],
            ['Generated UTC', nowIso()],
            ['Application version', root.Session ? root.Session.APP_VERSION : (session && session.app) || '—'],
            ['Session schema', session ? session.schema + ' v' + session.version : '—'],
            ['Rear mode', st.rearMode],
            ['Cartridge mode', st.cartMode],
            ['Selected cartridge', st.selectedCartridgeName || '—'],
            ['Selected cartridge type', st.selectedCartridgeType || '—'],
            ['Selected cartridge mass', fmt(st.selectedCartridgeMassG, 3, 'g')],
            ['Selected cartridge compliance C10', fmt(st.selectedCartridgeCompliance10HzCu, 3, 'cu') + (st.selectedCartridgeComplianceEstimated ? ' (estimated)' : '')],
            ['Selected tracking force', fmt(st.selectedCartridgeTrackingForceRecommendedG, 3, 'g')],
            ['Material', st.material],
            ['Render mode', st.renderMode]
        ]));

        lines.push('');
        lines.push('## 2. Executive summary');
        lines.push('');
        lines.push(table(['Metric', 'Value'], buildExecutiveSummaryRows(st, phys, mode, rings)));

        lines.push('');
        lines.push('## 3. Reference frame and playback datum');
        lines.push('');
        lines.push(table(['Readout', 'Value'], [
            ['LP top plane', fmt(st.lpTopZ || 0, 3, 'mm')],
            ['Stylus point', phys ? pointText(phys.stylus) : '—'],
            ['Pivot point', phys ? pointText(phys.pivot) : '—'],
            ['Pivot above LP', fmt(st.verticalPivotHeightAboveLP || 0, 3, 'mm')],
            ['Body envelope datum', fmt(st.armBodyDatumOffsetZ || 0, 3, 'mm')],
            ['Stylus locked to LP', !!st.stylusLockedToLP],
            ['Stylus → LP ΔZ', phys ? fmt(phys.stylus.z - (st.lpTopZ || 0), 6, 'mm') : '—'],
            ['Pivot → Stylus ΔZ', phys ? fmt(phys.pivot.z - phys.stylus.z, 6, 'mm') : '—']
        ]));

        lines.push('');
        lines.push('## 4. Physics panel readouts');
        lines.push('');
        lines.push(table(['Physics panel field', 'Snapshot-derived value'], collectPanelReadouts(st, phys)));

        lines.push('');
        lines.push('## 5. Comprehensive physics object');
        lines.push('');
        lines.push(table(['Path', 'Value'], buildPhysicsObjectRows(phys)));

        lines.push('');
        lines.push('## 6. Kinematics and alignment');
        lines.push('');
        lines.push(table(['Metric', 'Value'], buildKinematicRows(st, phys)));

        lines.push('');
        lines.push('## 7. Geometry and ring cache');
        lines.push('');
        lines.push(table(['Metric', 'Value'], ringStats.rows));
        lines.push('');
        lines.push('### 7.1 Complete ring station table');
        lines.push('');
        lines.push(table(
            ['#', 'virtualX', 'center.x', 'center.y', 'center.z', 'width', 'height', 'outerArea', 'innerArea', 'shellArea', 'valid'],
            ringStats.stationRows
        ));

        lines.push('');
        lines.push('## 8. Export readiness');
        lines.push('');
        lines.push(table(['Metric', 'Value'], buildExportRows(st, exportValidation)));

        lines.push('');
        lines.push('## 9. Cobra-class feature state');
        lines.push('');
        lines.push(table(['Feature / field', 'Value'], buildCobraRows(st)));

        lines.push('');
        lines.push('## 10. Cobra Architecture Validation');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildCobraArchitectureValidationRows(st, cobraArchitectureValidation)));

        lines.push('');
        lines.push('## 11. Cobra Disc Counterweight Validation');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildCobraDiscCounterweightRows(st)));

        lines.push('');
        lines.push('## 12. Cobra Eggshell Armwand Validation');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildCobraEggshellRows(st)));

        lines.push('');
        lines.push('## 13. Cobra Mechanical Assembly Validation');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildCobraMechanicalRows(st)));

        lines.push('');
        lines.push('## 14. Cobra Headshell Slots Validation');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildCobraHeadshellRows(st)));

        lines.push('');
        lines.push('## 15. Cobra End-to-End Acceptance');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildCobraAcceptanceRows(st)));

        lines.push('');
        lines.push('## 16. Runtime State Sync Audit');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildRuntimeStateSyncRows(st)));

        lines.push('');
        lines.push('## 17. Cobra Runtime Geometry / Render Audit');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildCobraRuntimeGeometryRows(st, exportValidation)));

        lines.push('');
        lines.push('## 18. Cobra Manual Visual Verification');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildCobraManualVerificationRows(st)));

        lines.push('');
        lines.push('## 19. Cobra Release Readiness');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildCobraReleaseReadinessRows(st)));

        lines.push('');
        lines.push('## 20. TD053F Freeform Browser State / Render-Export Audit');
        lines.push('');
        lines.push('TD053E Freeform Apply State / Report-Export Audit compatibility marker: accepted active design from preview/quarantine remains explicitly reported.');
        lines.push('');
        lines.push(table(['Field', 'Value'], buildFreeformApplyAuditRows(st)));

        lines.push('');
        lines.push('## 21. Complete UI control snapshot');
        lines.push('');
        lines.push(table(['Kind', 'ID', 'Label', 'Value', 'Unit', 'Category / note'], collectAllControls(st)));

        lines.push('');
        lines.push('## 22. Session JSON snapshot');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(session, null, 2));
        lines.push('```');

        lines.push('');
        lines.push('## 23. Notes and audit limitations');
        lines.push('');
        lines.push('- This report is generated from the current browser runtime, not from an external solver.');
        lines.push('- Static imbalance is a load-equivalent moment indicator, not a direct VTF setting.');
        lines.push('- Cartridge picker compliance values marked estimated are dataset estimates and should not be treated as exact laboratory measurements.');
        lines.push('- Export readiness is reported using the in-app validation path available at report time.');
        lines.push('- If optional TD046 modules are not loaded by `index.html`, their feature manifests are reported as not loaded rather than inferred.');
        lines.push('- Cobra rearMode/model-family context with `cobraArchitecture.enabled=false` is reported as `INACTIVE_COBRA_CONTEXT`, not as a Cobra validation PASS.');
        lines.push('- Phase 3 station-based eggshell validation is a station/geometry proxy, not a full FEA or production CAD certificate.');
        lines.push('- Phase 6 headshell slot validation reports `partial_csg` unless the slotted export mesh audit verifies closed-manifold local CSG; do not infer full integrated arm-body booleans from metadata alone.');
        lines.push('- Phase 8 Cobra acceptance separates capability completion, static known-good acceptance and runtime measured acceptance; runtime unavailable must not be read as visual/browser verification.');
        lines.push('- Phase 10 manual verification separates automatic checks from Jan-Eric browser/visual verification; `HOLD` is not a release PASS when manual visual verification is missing.');
        lines.push('- Phase 12 runtime state sync audit detects stale DOM/session/export state and prevents known-good PASS from hiding live measured FAIL.');
        lines.push('- Phase 13 runtime geometry/render audit requires Cobra eggshell mesh renderability and preserves 0.01 mm canonical N1-P2 precision in state/DOM/session.');
        lines.push('- Phase 14.2 report export is read-only: it builds report/audit blocks from a Session snapshot clone, derives summary/readout sections from that same snapshot, and does not apply Cobra presets or dispatch UI events.');
        lines.push('- TD053F Freeform audit binds report output to the same canonical browser state used by session save, render and export; accepted active freeform must not silently fall back to parametric sources.');
        lines.push('');
        lines.push('---');
        lines.push('Generated by TonearmDesigner report exporter.');

        return lines.join('\n');
    }

    function safeFilename(name) {
        const base = (name || 'tonearm_report')
            .trim()
            .replace(/[^a-z0-9._-]+/gi, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 80) || 'tonearm_report';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        return base + '_' + stamp + '.md';
    }

    function downloadText(filename, text) {
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function setStatus(kind, text) {
        const el = document.getElementById('sessionStatus');
        if (!el) return;
        el.className = 'session-status ' + (kind || '');
        el.textContent = text || '';
    }

    function handleSaveReport() {
        try {
            const nameInput = document.getElementById('sessionName');
            const nameHint = nameInput && nameInput.value ? nameInput.value : 'tonearm_technical_report';
            const md = buildMarkdownReport(nameHint);
            const filename = safeFilename(nameHint);
            downloadText(filename, md);
            setStatus('success', 'Saved report: ' + filename);
        } catch (err) {
            setStatus('error', 'Report failed: ' + (err && err.message ? err.message : String(err)));
        }
    }

    function wire() {
        const btn = document.getElementById('saveReportBtn');
        if (btn) btn.addEventListener('click', handleSaveReport);
    }

    root.TonearmReportExporter = Object.freeze({
        schema: REPORT_SCHEMA,
        buildMarkdownReport,
        save: handleSaveReport
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
