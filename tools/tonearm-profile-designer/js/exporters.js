// SPDX-License-Identifier: 0BSD
// AI-CODING NOTE: Export only the explicit active geometry source; empty sessions and Freeform/parametric source mismatches remain blocking.
// Copyright (C) 2026 Engrove


// Export variants whose geometry comes from the parametric ring cache and therefore cannot be produced
// from a freeform/trace loft.
const FREEFORM_UNSUPPORTED_EXPORT_TYPES = ['hollow', 'split_vertical', 'split_horizontal'];

// Last mould-release verdict, so the technical report can state what the operator actually saw.
let LAST_PLUG_MOULD_AUDIT = null;

function getCobraEggshellExportGeometry() {
    if (typeof isCobraEggshellRuntimeGeometryDebugEnabled !== 'function' ||
        !isCobraEggshellRuntimeGeometryDebugEnabled(state)) {
        return null;
    }
    if (!window.CobraEggshellWand ||
        typeof window.CobraEggshellWand.isEnabled !== 'function' ||
        typeof window.CobraEggshellWand.buildExportGeometry !== 'function') {
        return null;
    }
    if (!window.CobraEggshellWand.isEnabled(state)) return null;

    const result = window.CobraEggshellWand.buildExportGeometry(state, {
        segments: Math.min(36, Math.max(18, typeof getMeshSegments === 'function' ? getMeshSegments() : 24))
    });
    const validation = result && result.validation;
    if (!validation || validation.status !== 'PASS') {
        console.warn('Cobra eggshell export fallback: render/export validation failed', validation);
        return null;
    }
    const geo = result.geometry;
    if (geo && geo.userData) {
        geo.userData.cobraEggshellExportPath = true;
        geo.userData.exportGeometrySource = 'cobraEggshellWand';
        geo.userData.stationCount = validation.stationValidation ? validation.stationValidation.stationCount : null;
        geo.userData.structuralStationCount = validation.stationValidation ? validation.stationValidation.structuralStationCount : null;
        geo.userData.minEIProxy = validation.stationValidation ? validation.stationValidation.minEIProxy : null;
    }
    return geo;
}

function getPrimaryArmwandGeometry(fallbackGeometryFactory) {
    const cobraGeo = getCobraEggshellExportGeometry();
    if (cobraGeo) return cobraGeo;
    const geo = fallbackGeometryFactory();
    if (geo && geo.userData) {
        geo.userData.exportGeometrySource = (typeof UNIFIED_GEOMETRY_SOURCE_ID !== 'undefined') ? UNIFIED_GEOMETRY_SOURCE_ID : 'td026_full_ring_geometry';
        geo.userData.primaryGeometrySource = geo.userData.exportGeometrySource;
        geo.userData.rearTerminal = (typeof getUnifiedRearTerminal === 'function') ? getUnifiedRearTerminal(state) : null;
    }
    return geo;
}


// Backward-compatible marker for TD052B acceptance: TD052B freeform export blocker.
/**
 * Resolves the casting-pattern cross-section scale for this export. The Onshape 1:1 export declares an
 * exact reference with no shrinkage compensation, so a pattern allowance is refused there rather than
 * quietly written into a mesh whose own sidecar states that no compensation was applied.
 */
function resolvePlugCrossSectionScale() {
    const percent = Number(state && state.plugCrossSectionScalePercent);
    if (!Number.isFinite(percent) || percent === 0) return { factor: 1, percent: 0 };
    if (state.exportType === EXPORT_TYPES.ONSHAPE_1TO1 || state.exportType === 'onshape_1to1') {
        return { factor: 1, percent: 0, refusedReason: 'onshape_1to1_is_an_exact_reference' };
    }
    return { factor: 1 + percent / 100, percent };
}

/**
 * Builds the freeform state exactly as an export would, allowance included, so anything measured on it
 * describes the pattern that will actually be written rather than the unscaled design.
 */
function resolvePlugPatternState() {
    if (!state || state.geometryMode !== 'freeform') return { error: 'Switch geometryMode to freeform: this applies to trace-derived patterns.' };
    if (!state.freeformLoftActive) return { error: 'No accepted active freeform geometry exists yet. Build a loft first.' };
    if (!window.FreeformLoftKernel || typeof window.FreeformLoftKernel.buildFreeformGeometry !== 'function') {
        return { error: 'FreeformLoftKernel is unavailable.' };
    }
    const plugScale = resolvePlugCrossSectionScale();
    let patternState = state.freeformLoftActive;
    if (plugScale.factor !== 1 && typeof window.FreeformLoftKernel.scaleCrossSection === 'function') {
        try {
            patternState = window.FreeformLoftKernel.scaleCrossSection(state.freeformLoftActive, plugScale.factor);
        } catch (error) {
            return { error: error && error.message ? error.message : String(error) };
        }
    }
    return { patternState, appliedScale: plugScale.factor };
}

/**
 * Runs the two-part mould release audit from the export panel and renders the verdict. The audit is
 * read-only: it never alters geometry, it only reports whether the pattern can leave the mould.
 */
function runPlugMouldReleaseAudit() {
    const target = document.getElementById('plugMouldAuditResult');
    const render = (text, cls) => {
        if (!target) return;
        target.textContent = text;
        target.className = 'manual-trace-status ' + cls;
    };
    if (!window.FreeformPlugMouldAudit || typeof window.FreeformPlugMouldAudit.auditDemouldability !== 'function') {
        render('FreeformPlugMouldAudit is unavailable.', 'error');
        return;
    }
    const resolved = resolvePlugPatternState();
    if (resolved.error) { render(resolved.error, 'error'); return; }

    const pullAxis = (document.getElementById('plugMouldPullAxis') || {}).value || 'Z';
    const segments = typeof getMeshSegments === 'function' ? Math.min(64, Math.max(24, Math.round(getMeshSegments() / 2))) : 48;
    const geometry = window.FreeformLoftKernel.buildFreeformGeometry(resolved.patternState, { stationCount: 24, segmentCount: segments });
    const audit = window.FreeformPlugMouldAudit.auditDemouldability(geometry.mesh, { pullAxis });
    const line = typeof window.FreeformPlugMouldAudit.partingLine === 'function'
        ? window.FreeformPlugMouldAudit.partingLine(geometry.mesh, { pullAxis, stations: 24 })
        : [];
    LAST_PLUG_MOULD_AUDIT = Object.assign({}, audit, {
        partingLineStations: line.length,
        appliedCrossSectionScale: resolved.appliedScale
    });

    const scaleNote = resolved.appliedScale === 1 ? 'no allowance' : 'allowance ' + ((resolved.appliedScale - 1) * 100).toFixed(2) + '%';
    if (audit.status === 'BLOCKER') {
        render('Does NOT release along ' + pullAxis + ': ' + audit.undercutRayCount + ' undercut sample(s), up to '
            + audit.maxSurfaceCrossings + ' surface crossings. The mould would lock. (' + scaleNote + ')', 'error');
        return;
    }
    const draft = (audit.lowDraftAreaFraction * 100).toFixed(2);
    render('Releases from a two-part mould along ' + pullAxis + '. Parting line: ' + line.length
        + ' stations. Near-vertical surface: ' + draft + '% of area'
        + (audit.findings.length ? ' (' + audit.findings.join(', ') + ')' : '') + '. (' + scaleNote + ')',
        audit.findings.length ? 'warn' : 'ok');
}

function getFreeformLoftExportGeometry() {
    if (!state || state.geometryMode !== 'freeform') return null;
    if (!state.freeformLoftActive) return { error: 'EXPORT_BLOCKED: geometryMode=freeform but freeformLoftActive is missing; silent parametric fallback is forbidden.' };
    if (!window.FreeformRuntimeIntegration ||
        typeof window.FreeformRuntimeIntegration.exportFreeformMeshGeometry !== 'function') {
        return { error: 'TD053F freeform export/source-audit blocker: FreeformRuntimeIntegration unavailable.' };
    }
    const plugScale = resolvePlugCrossSectionScale();
    if (plugScale.refusedReason) {
        return { error: 'Export blocked: a casting-pattern cross-section scale of ' + state.plugCrossSectionScalePercent + '% is set, but the Onshape 1:1 export is defined as an exact reference with no shrinkage compensation. Set the scale to 0, or choose another export type.' };
    }
    let exportState = state;
    if (plugScale.factor !== 1) {
        if (!window.FreeformLoftKernel || typeof window.FreeformLoftKernel.scaleCrossSection !== 'function') {
            return { error: 'Export blocked: the casting-pattern scale needs FreeformLoftKernel.scaleCrossSection, which is unavailable.' };
        }
        try {
            const scaled = window.FreeformLoftKernel.scaleCrossSection(state.freeformLoftActive, plugScale.factor);
            exportState = Object.assign({}, state, { freeformLoftActive: scaled });
        } catch (error) {
            return { error: 'Export blocked: ' + (error && error.message ? error.message : String(error)) };
        }
    }
    const result = window.FreeformRuntimeIntegration.exportFreeformMeshGeometry(THREE, exportState, {
        stationCount: 24,
        segmentCount: Math.min(64, Math.max(24, typeof getMeshSegments === 'function' ? Math.round(getMeshSegments() / 2) : 32))
    });
    if (!result || result.ok !== true || !result.geometry) {
        return { error: 'TD053F freeform export/source-audit blocker: ' + (result && result.error ? result.error : 'missing freeform mesh') };
    }
    const geo = result.geometry;
    if (geo && geo.userData) {
        geo.userData.geometryMode = 'freeform';
        geo.userData.exportGeometrySource = 'freeformLoftKernel';
        geo.userData.reportGeometrySource = 'freeformPhysicalAnalysis';
        geo.userData.sourceState = 'state.freeformLoftActive';
        geo.userData.noParametricFallback = true;
        geo.userData.source = 'freeformLoftActive';
        geo.userData.stlSource = 'freeformLoftKernel';
        geo.userData.silentFallbackDetected = false;
        geo.userData.plugCrossSectionScale = plugScale.factor;
        geo.userData.plugCrossSectionScalePercent = plugScale.percent;
        geo.userData.exactOneToOne = plugScale.factor === 1;
    }
    return geo;
}


/**
 * Cuts the freeform pattern into two printable halves across its length. Each half is checked for closure
 * independently before it is handed on: a cut that left a face open would otherwise reach the STL writer
 * as a shell that no slicer can fill.
 */
function getFreeformPatternSplitGeometries(sourceGeometry) {
    if (!window.FreeformPatternSplit || typeof window.FreeformPatternSplit.splitPattern !== 'function') {
        return { error: 'Export blocked: the pattern split needs FreeformPatternSplit, which is unavailable.' };
    }
    const mesh = sourceGeometry && sourceGeometry.userData ? sourceGeometry.userData.sourceMesh : null;
    if (!mesh) return { error: 'Export blocked: the freeform export did not carry a source mesh to split.' };
    // The cut position is given as a percentage of the pattern's own length so the control stays valid
    // whatever the traced arm measures; the splitter itself takes an absolute coordinate.
    let minX = Infinity, maxX = -Infinity;
    (mesh.vertices || []).forEach(vertex => { minX = Math.min(minX, vertex.x); maxX = Math.max(maxX, vertex.x); });
    const positionPercent = Number(state.plugSplitPositionPercent);
    const fraction = Number.isFinite(positionPercent) ? Math.min(95, Math.max(5, positionPercent)) / 100 : 0.5;
    const result = window.FreeformPatternSplit.splitPattern(mesh, {
        axis: 'X',
        at: minX + (maxX - minX) * fraction,
        clearanceMm: Number(state.splitClearance) || 0
    });
    if (!result.ok) return { error: 'Export blocked: ' + result.error };
    const parts = {};
    for (const [key, half] of [['partA', result.partA], ['partB', result.partB]]) {
        const closure = window.FreeformPatternSplit.meshClosure(half);
        if (!closure.closed) {
            return { error: 'Export blocked: pattern split half ' + key + ' is not closed (boundary=' + closure.boundaryEdgeCount + ', nonManifold=' + closure.nonManifoldEdgeCount + ').' };
        }
        const positions = [];
        half.faces.forEach(face => face.forEach(index => {
            const vertex = half.vertices[index];
            positions.push(vertex.x, vertex.y, vertex.z);
        }));
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        geometry.userData = Object.assign({}, sourceGeometry.userData || {}, {
            patternSplitAxis: result.axis,
            patternSplitAtMm: result.atMm,
            patternSplitClearanceMm: result.clearanceMm,
            patternSplitHalf: key,
            patternSplitPositionPercent: Math.round(fraction * 10000) / 100
        });
        parts[key] = geometry;
    }
    return parts;
}

function getHeadshellSlotsExportGeometry() {
    if (!window.HeadshellSlots ||
        typeof window.HeadshellSlots.validateSpec !== 'function' ||
        typeof window.HeadshellSlots.buildSlottedReferencePlateGeometry !== 'function') {
        return null;
    }
    const arch = (window.CobraArchitecture && typeof window.CobraArchitecture.getCobraArchitecture === 'function')
        ? window.CobraArchitecture.getCobraArchitecture(state)
        : (state && state.cobraArchitecture ? state.cobraArchitecture : null);
    if (!arch || arch.enabled !== true || !arch.headshellSlots || arch.headshellSlots.enabled === false) return null;
    const validation = window.HeadshellSlots.validateSpec(state);
    if (!validation || validation.status !== 'PASS') {
        console.warn('Headshell slots export fallback: validation failed', validation);
        return null;
    }
    const geo = window.HeadshellSlots.buildSlottedReferencePlateGeometry({ cobraArchitecture: { headshellSlots: arch.headshellSlots } });
    if (geo && geo.attributes && geo.attributes.position && geo.attributes.position.count > 0) {
        geo.userData = Object.assign({}, geo.userData || {}, {
            headshellSlotsExportPath: true,
            slotCount: validation.measured ? validation.measured.slotCount : null,
            booleanCutStatus: arch.headshellSlots.integration ? arch.headshellSlots.integration.booleanCutStatus : 'full_csg'
        });
        return geo;
    }
    return null;
}


function getTitaniumMountPlateExportGeometry() {
    if (!window.TitaniumMountPlate ||
        typeof window.TitaniumMountPlate.buildGeometry !== 'function' ||
        typeof window.TitaniumMountPlate.resolveTitaniumMountPlatePose !== 'function') {
        return null;
    }
    const pose = window.TitaniumMountPlate.resolveTitaniumMountPlatePose(state);
    if (!pose || pose.enabled !== true) return null;
    const geo = window.TitaniumMountPlate.buildGeometry(state);
    if (geo && geo.attributes && geo.attributes.position && geo.attributes.position.count > 0) {
        geo.userData = Object.assign({}, geo.userData || {}, {
            featureId: 'titaniumMountPlate',
            semanticType: 'structural_laminated_interface_plate',
            titaniumMountPlateExportPath: true,
            pose: pose
        });
        return geo;
    }
    return null;
}


function getRearDiscStackExportGeometry() {
    if (!window.CobraDiscCounterweightAssembly ||
        typeof window.CobraDiscCounterweightAssembly.getDiscStackState !== 'function' ||
        !state.includeRearWeightDiscsInExport) {
        return null;
    }
    const d = window.CobraDiscCounterweightAssembly.getDiscStackState(state);
    if (!d || !d.enabled || d.count <= 0 || d.diameterMm <= 0 || d.thicknessMm <= 0 ||
        !Number.isFinite(Number(d.xMm)) || !Number.isFinite(Number(d.stackCOMZ))) {
        return null;
    }
    const totalThickness = d.count * d.thicknessMm;
    const parts = [];

    const stackGeo = new THREE.CylinderGeometry(d.diameterMm / 2, d.diameterMm / 2, totalThickness, 48);
    stackGeo.rotateX(Math.PI / 2);
    stackGeo.translate(Number(d.xMm), Number(d.yMm || 0), Number(d.stackCOMZ));
    stackGeo.userData = Object.assign({}, stackGeo.userData || {}, {
        counterweightImplementation: 'single_manifold_disc_stack_export_cylinder',
        counterweightCOMSource: 'rearWeightDiscStack',
        stackingMode: d.stackingMode || 'terminal_support_bridge_downward',
        discCount: d.count,
        discDiameterMm: d.diameterMm,
        discThicknessMm: d.thicknessMm,
        stackTopZ: d.stackTopZ,
        stackBottomZ: d.stackBottomZ,
        stackCOMZ: d.stackCOMZ,
        anchorZ: d.anchorZ,
        discMountSource: d.mountSource || 'unifiedRearTerminalCapContact',
        geometrySource: d.geometrySource || 'td026_full_ring_geometry',
        exportTopologyStrategy: 'disc_stack_with_explicit_support_bridge'
    });
    parts.push(stackGeo);

    const bridge = d.supportBridge || {};
    if (bridge.enabled === true &&
        Number.isFinite(Number(bridge.radiusMm)) &&
        Number.isFinite(Number(bridge.topZ)) &&
        Number.isFinite(Number(bridge.bottomZ)) &&
        Number(bridge.topZ) > Number(bridge.bottomZ)) {
        const bridgeHeight = Number(bridge.topZ) - Number(bridge.bottomZ);
        const bridgeGeo = new THREE.CylinderGeometry(Number(bridge.radiusMm), Number(bridge.radiusMm), bridgeHeight, 24);
        bridgeGeo.rotateX(Math.PI / 2);
        bridgeGeo.translate(Number(d.xMm), Number(d.yMm || 0), (Number(bridge.topZ) + Number(bridge.bottomZ)) / 2);
        bridgeGeo.userData = Object.assign({}, bridgeGeo.userData || {}, {
            counterweightImplementation: 'rear_terminal_support_bridge',
            supportBridge: true,
            supportBridgeRole: bridge.role || 'rear_terminal_to_disc_stack_support_boss',
            supportBridgeTopZ: bridge.topZ,
            supportBridgeBottomZ: bridge.bottomZ,
            supportBridgeOverlapMm: bridge.overlapMm,
            supportBridgeRadiusMm: bridge.radiusMm,
            exportTopologyStrategy: 'overlap_no_tangent_contact'
        });
        parts.push(bridgeGeo);
    }

    const geo = parts.length > 1 && typeof mergeBufferGeometries === 'function'
        ? mergeBufferGeometries(parts)
        : parts[0];
    geo.userData = Object.assign({}, geo.userData || {}, {
        counterweightImplementation: 'disc_stack_with_support_bridge',
        counterweightCOMSource: 'rearWeightDiscStack',
        stackingMode: d.stackingMode || 'terminal_support_bridge_downward',
        discCount: d.count,
        discDiameterMm: d.diameterMm,
        discThicknessMm: d.thicknessMm,
        stackTopZ: d.stackTopZ,
        stackBottomZ: d.stackBottomZ,
        stackCOMZ: d.stackCOMZ,
        anchorZ: d.anchorZ,
        supportBridge: d.supportBridge || null,
        discMountSource: d.mountSource || 'unifiedRearTerminalCapContact',
        geometrySource: d.geometrySource || 'td026_full_ring_geometry',
        exportTopologyStrategy: 'closed_shells_with_overlapping_support_bridge_no_exact_contact'
    });
    if (typeof finalizeWeldedGeometry === 'function') {
        return finalizeWeldedGeometry(geo, { toleranceMm: 1e-5, computeNormals: true, ensurePositiveVolume: true });
    }
    geo.computeVertexNormals();
    return geo;
}

function getFineTrimExportGeometry() {
    if (!state.showFineTrimScrew || !(state.rearFineTrimScrewLength > 0)) return null;
    const fineTrim = Physics.getFineTrimCOM(state);
    if (!fineTrim || fineTrim.mass <= 0 || !Number.isFinite(Number(fineTrim.x)) || !Number.isFinite(Number(fineTrim.z))) return null;
    const geo = new THREE.CylinderGeometry(2, 2, state.rearFineTrimScrewLength, 16);
    geo.rotateZ(Math.PI / 2);
    geo.translate(fineTrim.x, 0, fineTrim.z);
    geo.userData = Object.assign({}, geo.userData || {}, {
        featureId: 'rear_fine_trim_screw',
        exportTopologyStrategy: 'separate_closed_shell'
    });
    if (typeof finalizeWeldedGeometry === 'function') {
        return finalizeWeldedGeometry(geo, { toleranceMm: 1e-5, computeNormals: true, ensurePositiveVolume: true });
    }
    geo.computeVertexNormals();
    return geo;
}


function getExportGeometryWithAccessories(baseGeometry) {
    if (state.rearMode !== REAR_MODES.COBRA_GOOSE) return baseGeometry;

    const parts = [baseGeometry];
    const headshellGeo = getHeadshellSlotsExportGeometry();
    if (headshellGeo && headshellGeo.attributes && headshellGeo.attributes.position && headshellGeo.attributes.position.count > 0) {
        parts.push(headshellGeo);
    }
    const titaniumGeo = getTitaniumMountPlateExportGeometry();
    if (titaniumGeo && titaniumGeo.attributes && titaniumGeo.attributes.position && titaniumGeo.attributes.position.count > 0) {
        parts.push(titaniumGeo);
    }
    const rearDiscGeo = getRearDiscStackExportGeometry();
    if (rearDiscGeo && rearDiscGeo.attributes && rearDiscGeo.attributes.position && rearDiscGeo.attributes.position.count > 0) {
        parts.push(rearDiscGeo);
    }
    const fineTrimGeo = getFineTrimExportGeometry();
    if (fineTrimGeo && fineTrimGeo.attributes && fineTrimGeo.attributes.position && fineTrimGeo.attributes.position.count > 0) {
        parts.push(fineTrimGeo);
    }
    const merged = mergeBufferGeometries(parts);
    if (merged && merged.userData) {
        merged.userData.finalExportIncludesAccessories = parts.length > 1;
        merged.userData.accessoryExportStrategy = 'closed_shells_support_bridge_no_tangent_contact';
    }
    return merged;
}


function exportOnshapeSidecarJSON(validation, filenameStem) {
    if (typeof state !== 'undefined' && state.onshapeMetadataSidecar === false) return;
    const payload = {
        schema: 'tonearm-designer-onshape-1to1-sidecar-v1',
        app: (window.Session && window.Session.APP_VERSION) ? window.Session.APP_VERSION : 'V28.7.0-Fas19-AIModalOnshapeHandoff',
        fileStem: filenameStem,
        units: 'mm',
        scale: 1,
        exportIntent: 'onshape_1to1_exact_reference_mesh',
        exactOneToOne: true,
        noMouldOffset: true,
        noShrinkageCompensation: true,
        noDraftModification: true,
        note: 'This is a 1:1 mesh reference for Onshape downstream modelling. It is not STEP/BREP and is not a parametric Onshape feature tree.',
        exportType: state.exportType,
        exportFormat: state.exportFormat,
        session: (window.Session && typeof window.Session.collect === 'function') ? window.Session.collect('onshape_1to1_export') : null,
        validation: validation || (typeof LAST_EXPORT_VALIDATION !== 'undefined' ? LAST_EXPORT_VALIDATION : null),
        generatedUtc: new Date().toISOString()
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filenameStem + '.onshape-sidecar.json');
}

function getOnshapeExactExportGeometry() {
    const geo = getExportGeometryWithAccessories(getPrimaryArmwandGeometry(() => generateOuterShellGeometry()));
    if (geo && geo.userData) {
        geo.userData.onshapeOneToOne = true;
        geo.userData.units = 'mm';
        geo.userData.scale = 1;
        geo.userData.noMouldOffset = true;
        geo.userData.noShrinkageCompensation = true;
        geo.userData.noDraftModification = true;
        geo.userData.exportIntent = 'onshape_1to1_exact_reference_mesh';
    }
    return geo;
}

function exportSelectedGeometry() {
    if (!state || state.designLoaded !== true) {
        alert('Export blocked: no active design exists. Import/open/create a design first.');
        return;
    }
    const { exportType, exportFormat } = state;
    const geometries = [];
    const filenames = [];

    if (state && state.geometryMode === 'freeform') {
        // Hollow and split variants are derived from the parametric ring cache, which freeform/trace
        // geometry never populates. Silently exporting a solid instead would hand the operator a plug
        // that is not the part they asked for, so an unsupported selection is refused by name.
        if (FREEFORM_UNSUPPORTED_EXPORT_TYPES.indexOf(exportType) >= 0) {
            alert('Export blocked: export type "' + exportType + '" is generated from the parametric ring cache and is not available for freeform/trace geometry. Choose the solid plug export instead.');
            return;
        }
        const freeformGeo = getFreeformLoftExportGeometry();
        if (!freeformGeo || freeformGeo.error) {
            alert((freeformGeo && freeformGeo.error) ? freeformGeo.error : 'TD053F freeform export blocker: missing freeform geometry.');
            return;
        }
        if (exportType === 'split_pattern_length') {
            const halves = getFreeformPatternSplitGeometries(freeformGeo);
            if (halves.error) { alert(halves.error); return; }
            geometries.push(halves.partA, halves.partB);
            filenames.push('tonearm_pattern_split_A', 'tonearm_pattern_split_B');
        } else {
            geometries.push(freeformGeo);
            filenames.push('tonearm_td052b_freeform_loft');
        }
    } else {
        const val = validateExportGeometry(state.exportType, state);
        if (!val.isValid) {
            alert(`Export aborted: Geometry error (${val.errorMsg})`);
            return;
        }

    if (exportType === EXPORT_TYPES.HOLLOW) {
        geometries.push(getExportGeometryWithAccessories(getPrimaryArmwandGeometry(() => generateHollowGeometry(getHollowExportRings()))));
        filenames.push('tonearm_hollow');
    } else if (exportType === EXPORT_TYPES.ONSHAPE_1TO1 || exportType === 'onshape_1to1') {
        geometries.push(getOnshapeExactExportGeometry());
        filenames.push('tonearm_onshape_1to1_mm');
    } else if (exportType === EXPORT_TYPES.SOLID) {
        geometries.push(getExportGeometryWithAccessories(getPrimaryArmwandGeometry(() => generateOuterShellGeometry())));
        filenames.push('tonearm_solid_reference_body');
    } else if (exportType === EXPORT_TYPES.SPLIT_VERTICAL) {
        const parts = generateSplitGeometry({ splitMode: 'vertical', clearance: state.splitClearance });
        geometries.push(getExportGeometryWithAccessories(parts.partA), getExportGeometryWithAccessories(parts.partB));
        filenames.push('tonearm_split_vertical_A', 'tonearm_split_vertical_B');
    } else if (exportType === EXPORT_TYPES.SPLIT_HORIZONTAL) {
        const parts = generateSplitGeometry({ splitMode: 'horizontal', clearance: state.splitClearance });
        geometries.push(getExportGeometryWithAccessories(parts.partA), getExportGeometryWithAccessories(parts.partB));
        filenames.push('tonearm_split_horizontal_A', 'tonearm_split_horizontal_B');
    } else {
        // Without this the button would do nothing at all: an unmatched export type leaves the geometry
        // list empty and the writer loop simply has nothing to iterate.
        alert(exportType === 'split_pattern_length'
            ? 'Export blocked: the pattern split across length is produced from a freeform/trace loft. Switch geometryMode to freeform, or choose a parametric export type.'
            : 'Export blocked: export type "' + exportType + '" is not produced by the parametric geometry path.');
        return;
    }
    }

    geometries.forEach((geo, index) => {
        const fname = filenames[index] + (exportFormat === 'stl_binary' ? '.stl' : '.asc.stl');
        let lastAudit = null;
        if (typeof validateFinalExportMeshTopology === 'function') {
            const audit = validateFinalExportMeshTopology(geo, {
                mode: fname,
                allowMultipleClosedShells: true
            });
            if (!audit || audit.isValid !== true) {
                alert('Export aborted: Geometry error (' + (audit && audit.errorMsg ? audit.errorMsg : 'final export mesh audit failed') + ')');
                return;
            }
            lastAudit = audit;
            if (geo && geo.userData) {
                geo.userData = Object.assign({}, geo.userData || {}, audit.metrics || {});
            }
        }
        if (exportFormat === 'stl_binary') exportGeometryAsBinarySTL(geo, fname);
        else exportGeometryAsAsciiSTL(geo, fname);
        if (exportType === EXPORT_TYPES.ONSHAPE_1TO1 || exportType === 'onshape_1to1') {
            // LAST_EXPORT_VALIDATION is only written by the parametric path. In freeform mode it still
            // holds whatever a previous parametric export validated, so the sidecar would describe a
            // different mesh than the STL beside it. Report the audit of the mesh actually written.
            const sidecarValidation = (state && state.geometryMode === 'freeform')
                ? {
                    exportType,
                    geometryMode: 'freeform',
                    exportGeometrySource: 'freeformLoftKernel',
                    isValid: !!(lastAudit && lastAudit.isValid),
                    metrics: lastAudit ? lastAudit.metrics : null
                }
                : LAST_EXPORT_VALIDATION;
            exportOnshapeSidecarJSON(sidecarValidation, filenames[index]);
        }
    });
}

function exportGeometryAsBinarySTL(geometry, filename) {
    const flatGeo = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = flatGeo.attributes.position.array;
    const triCount = pos.length / 9;

    const buffer = new ArrayBuffer(84 + (50 * triCount));
    const view = new DataView(buffer);

    const headerStr = 'TonearmDesigner Binary STL Export Engrove V28.7.0';
    for (let i = 0; i < 80; i++) {
        view.setUint8(i, i < headerStr.length ? headerStr.charCodeAt(i) : 0);
    }
    view.setUint32(80, triCount, true);

    let offset = 84;
    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();

    for (let i = 0; i < triCount; i++) {
        const i1 = i * 9;
        const i2 = i * 9 + 3;
        const i3 = i * 9 + 6;

        const vA = new THREE.Vector3(pos[i1], pos[i1 + 1], pos[i1 + 2]);
        const vB = new THREE.Vector3(pos[i2], pos[i2 + 1], pos[i2 + 2]);
        const vC = new THREE.Vector3(pos[i3], pos[i3 + 1], pos[i3 + 2]);

        cb.subVectors(vC, vB);
        ab.subVectors(vA, vB);
        cb.cross(ab).normalize();

        [cb.x, cb.y, cb.z, vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z].forEach(val => {
            view.setFloat32(offset, val, true);
            offset += 4;
        });
        view.setUint16(offset, 0, true);
        offset += 2;
    }

    downloadBlob(new Blob([buffer], { type: 'application/octet-stream' }), filename);
}

function exportGeometryAsAsciiSTL(geometry, filename) {
    const flatGeo = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = flatGeo.attributes.position.array;
    const triCount = pos.length / 9;
    let stl = 'solid Tonearm_V28_7_0\n';

    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();

    for (let i = 0; i < triCount; i++) {
        const i1 = i * 9;
        const i2 = i * 9 + 3;
        const i3 = i * 9 + 6;

        const vA = new THREE.Vector3(pos[i1], pos[i1 + 1], pos[i1 + 2]);
        const vB = new THREE.Vector3(pos[i2], pos[i2 + 1], pos[i2 + 2]);
        const vC = new THREE.Vector3(pos[i3], pos[i3 + 1], pos[i3 + 2]);

        cb.subVectors(vC, vB);
        ab.subVectors(vA, vB);
        cb.cross(ab).normalize();

        stl += ` facet normal ${cb.x.toExponential(4)} ${cb.y.toExponential(4)} ${cb.z.toExponential(4)}\n`;
        stl += '  outer loop\n';
        stl += `   vertex ${vA.x.toFixed(4)} ${vA.y.toFixed(4)} ${vA.z.toFixed(4)}\n`;
        stl += `   vertex ${vB.x.toFixed(4)} ${vB.y.toFixed(4)} ${vB.z.toFixed(4)}\n`;
        stl += `   vertex ${vC.x.toFixed(4)} ${vC.y.toFixed(4)} ${vC.z.toFixed(4)}\n`;
        stl += '  endloop\n';
        stl += ' endfacet\n';
    }

    stl += 'endsolid Tonearm_V28_7_0\n';
    downloadBlob(new Blob([stl], { type: 'text/plain' }), filename);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
