// SPDX-License-Identifier: 0BSD
// Copyright (C) 2026 Engrove

/**
 * AI-CODING NOTE:
 * Responsibility: Render only the explicitly active parametric or accepted-active Freeform design and produce read-only PNG output.
 * Inputs: Canonical state, geometry caches, Three.js, and explicit camera/export actions.
 * Outputs: WebGL scene objects and PNG data without creating startup geometry.
 * Safe edits: Source selection, scene cleanup, camera framing, and explicit empty-state guards.
 * Do not: Render a default object for an empty session or silently fall back from accepted Freeform to parametric geometry.
 * Verification: empty-session contract, TD053F source tests, and desktop browser smoke test.
 *
 * js/render3d.js
 * 3D rendering with full compatibility for pre-calculated mesh,
 * selective accessory rendering, and physical analysis overlay.
 */

let headshellSlotsGroup = null;
let titaniumMountPlateGroup = null;

function init3D() {
    const container = document.getElementById('container3D');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 1400);
    camera.up.set(0, 0, 1);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(LENGTH * 0.5, 0, 0);
    setCam('iso');

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
    hemiLight.position.set(0, 0, 200);
    scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight1.position.set(100, 100, 200);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xaaccff, 0.5);
    dirLight2.position.set(-100, -100, -50);
    scene.add(dirLight2);

    const insetContainer = document.getElementById('axesInset');
    insetScene = new THREE.Scene();
    insetCamera = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 1000);
    insetCamera.up.set(0, 0, 1);
    insetCamera.position.set(0, 0, 200);

    insetRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    insetRenderer.setSize(insetContainer.clientWidth, insetContainer.clientHeight);
    insetContainer.appendChild(insetRenderer.domElement);

    const origin = new THREE.Vector3(0, 0, 0);
    insetScene.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, 40, 0xff0000, 10, 5));
    insetScene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, 40, 0x00ff00, 10, 5));
    insetScene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, 40, 0x0000ff, 10, 5));

    animate();
}

function setCam(view) {
    if (!camera || !controls) return;
    const renderLen = (GLOBAL_RINGSCache && GLOBAL_RINGSCache.length > 0)
        ? GLOBAL_RINGSCache[GLOBAL_RINGSCache.length - 1].center.x
        : LENGTH;
    camera.up.set(0, 0, 1);

    if (view === 'iso') {
        camera.position.set(-100, -150, 100);
        controls.target.set(renderLen * 0.55, 0, 0);
    }
    if (view === 'side') {
        camera.position.set(renderLen * 0.55, -Math.max(350, renderLen + 60), 0);
        controls.target.set(renderLen * 0.55, 0, 0);
    }
    if (view === 'top') {
        camera.position.set(renderLen * 0.55, 0, Math.max(350, renderLen * 0.9));
        camera.up.set(0, 1, 0);
        controls.target.set(renderLen * 0.55, 0, 0);
    }
    if (view === 'front') {
        camera.position.set(-150, 0, 0);
        controls.target.set(renderLen * 0.55, 0, 0);
    }
    if (view === 'cart') {
        const mode = state.cartMode;
        const stylus = Physics.getStylusPoint(state, mode);
        camera.position.set(stylus.x - 40, -40, stylus.z - 30);
        controls.target.set(stylus.x + 10, 0, stylus.z + 5);
    }
    if (view === 'rear') {
        const tc = Physics.getRearTerminalCenter(state);
        camera.position.set(tc.x - 30, -50, tc.z + 20);
        controls.target.set(tc.x, 0, tc.z);
    }

    controls.update();
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);

    if (insetCamera && insetRenderer && camera && controls) {
        insetCamera.position.copy(camera.position);
        insetCamera.position.sub(controls.target);
        insetCamera.position.setLength(200);
        insetCamera.lookAt(insetScene.position);
        insetCamera.up.copy(camera.up);
        insetRenderer.render(insetScene, insetCamera);
    }
}

const PNG_EXPORT_WIDTH = 800;
const PNG_EXPORT_HEIGHT = 600;
const PNG_EXPORT_FIT_COVERAGE = 0.95;
let LAST_3D_PNG_EXPORT_METADATA = null;

function finiteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clonePlainJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function vectorPlain(v) {
    return {
        x: finiteNumber(v && v.x, 0),
        y: finiteNumber(v && v.y, 0),
        z: finiteNumber(v && v.z, 0)
    };
}

function boundsPlain(min, max) {
    const mn = vectorPlain(min);
    const mx = vectorPlain(max);
    return {
        min: mn,
        max: mx,
        size: {
            x: Math.max(0, mx.x - mn.x),
            y: Math.max(0, mx.y - mn.y),
            z: Math.max(0, mx.z - mn.z)
        },
        center: {
            x: (mn.x + mx.x) / 2,
            y: (mn.y + mx.y) / 2,
            z: (mn.z + mx.z) / 2
        }
    };
}

function runtimeFallback3dBounds() {
    const width = Math.max(1, finiteNumber(state && state.maxW, 34));
    const height = Math.max(1, finiteNumber(state && state.maxH, 24));
    const length = Math.max(1, finiteNumber(state && state.fullLength, typeof LENGTH !== 'undefined' ? LENGTH : 281));
    const datumZ = finiteNumber(state && state.armBodyDatumOffsetZ, 0);
    const min = { x: 0, y: -width / 2, z: datumZ - height / 2 };
    const max = { x: length, y: width / 2, z: datumZ + height / 2 };

    try {
        if (typeof getUnifiedRearTerminal === 'function') {
            const terminal = getUnifiedRearTerminal(state);
            if (terminal && terminal.available === true && Number.isFinite(Number(terminal.x))) {
                max.x = Math.max(max.x, Number(terminal.x));
                min.x = Math.min(min.x, Number(terminal.x));
                if (Number.isFinite(Number(terminal.z))) {
                    min.z = Math.min(min.z, Number(terminal.z));
                    max.z = Math.max(max.z, Number(terminal.z));
                }
            }
        }
    } catch (err) {
        // Read-only fallback only.
    }

    const discCount = Math.max(0, finiteNumber(state && state.rearWeightDiscCount, 0));
    const discDiameter = Math.max(0, finiteNumber(state && state.rearWeightDiscDiameter, 0));
    const discThickness = Math.max(0, finiteNumber(state && state.rearWeightDiscThickness, 0));
    if (discCount > 0 && discDiameter > 0 && discThickness > 0) {
        const discX = max.x;
        const radius = discDiameter / 2;
        min.x = Math.min(min.x, discX - discThickness / 2);
        max.x = Math.max(max.x, discX + discThickness / 2);
        min.y = Math.min(min.y, -radius);
        max.y = Math.max(max.y, radius);
        min.z = Math.min(min.z, datumZ - (discCount * discThickness));
        max.z = Math.max(max.z, datumZ);
    }

    return boundsPlain(min, max);
}

function plainBoundsFromThreeBox(box) {
    if (!box || !box.min || !box.max ||
        !Number.isFinite(Number(box.min.x)) || !Number.isFinite(Number(box.max.x))) {
        return runtimeFallback3dBounds();
    }
    return boundsPlain(box.min, box.max);
}

function computeFitCoverageMetadataFromProjectedExtents(projectedWidth, projectedHeight, imageWidth, imageHeight, fitCoverage) {
    const widthPx = Math.max(1, Math.round(finiteNumber(imageWidth, PNG_EXPORT_WIDTH)));
    const heightPx = Math.max(1, Math.round(finiteNumber(imageHeight, PNG_EXPORT_HEIGHT)));
    const target = Math.max(0.1, Math.min(0.99, finiteNumber(fitCoverage, PNG_EXPORT_FIT_COVERAGE)));
    const aspect = widthPx / heightPx;
    const w = Math.max(0.001, finiteNumber(projectedWidth, 1));
    const h = Math.max(0.001, finiteNumber(projectedHeight, 1));
    let frustumW = Math.max(w / target, (h / target) * aspect);
    let frustumH = frustumW / aspect;
    if (frustumH < h / target) {
        frustumH = h / target;
        frustumW = frustumH * aspect;
    }
    const measuredCoverageX = w / frustumW;
    const measuredCoverageY = h / frustumH;
    return {
        imageWidth: widthPx,
        imageHeight: heightPx,
        fitCoverageTarget: target,
        projectedWidth: w,
        projectedHeight: h,
        frustumWidth: frustumW,
        frustumHeight: frustumH,
        measuredCoverageX: measuredCoverageX,
        measuredCoverageY: measuredCoverageY,
        measuredCoverageMax: Math.max(measuredCoverageX, measuredCoverageY),
        measuredCoverage: Math.max(measuredCoverageX, measuredCoverageY),
        clipping: false
    };
}

function computeFitCoverageMetadataForPlainBounds(objectBounds, imageWidth, imageHeight, fitCoverage) {
    const b = objectBounds || runtimeFallback3dBounds();
    // Conservative no-THREE fallback: use X/Z profile extents for deterministic tests.
    return computeFitCoverageMetadataFromProjectedExtents(
        Math.max(0.001, finiteNumber(b.size && b.size.x, 1)),
        Math.max(0.001, finiteNumber(b.size && b.size.z, 1)),
        imageWidth,
        imageHeight,
        fitCoverage
    );
}

function plainVectorDot(a, b) {
    return finiteNumber(a.x, 0) * finiteNumber(b.x, 0) +
        finiteNumber(a.y, 0) * finiteNumber(b.y, 0) +
        finiteNumber(a.z, 0) * finiteNumber(b.z, 0);
}

function computeProjectedExtentsForBounds(objectBounds, right, up) {
    const b = objectBounds || runtimeFallback3dBounds();
    const corners = [
        { x: b.min.x, y: b.min.y, z: b.min.z },
        { x: b.min.x, y: b.min.y, z: b.max.z },
        { x: b.min.x, y: b.max.y, z: b.min.z },
        { x: b.min.x, y: b.max.y, z: b.max.z },
        { x: b.max.x, y: b.min.y, z: b.min.z },
        { x: b.max.x, y: b.min.y, z: b.max.z },
        { x: b.max.x, y: b.max.y, z: b.min.z },
        { x: b.max.x, y: b.max.y, z: b.max.z }
    ];
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
    corners.forEach(c => {
        const r = plainVectorDot(c, right);
        const u = plainVectorDot(c, up);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
    });
    return {
        projectedWidth: Math.max(0.001, maxR - minR),
        projectedHeight: Math.max(0.001, maxU - minU)
    };
}

function getCurrent3dViewBasis(objectBounds) {
    const fallbackForward = { x: 0.55, y: -0.68, z: 0.48 };
    const fallbackUp = { x: 0, y: 0, z: 1 };
    if (typeof THREE === 'undefined' || !THREE.Vector3) {
        return {
            forward: fallbackForward,
            up: fallbackUp,
            right: { x: 0.78, y: 0.63, z: 0 },
            source: 'fallback_iso_basis'
        };
    }

    const forward = new THREE.Vector3();
    const center = objectBounds && objectBounds.center
        ? new THREE.Vector3(objectBounds.center.x, objectBounds.center.y, objectBounds.center.z)
        : new THREE.Vector3(0, 0, 0);

    try {
        if (camera && typeof camera.getWorldDirection === 'function') {
            camera.getWorldDirection(forward);
        } else if (camera && controls && controls.target) {
            forward.subVectors(controls.target, camera.position).normalize();
        } else {
            forward.set(fallbackForward.x, fallbackForward.y, fallbackForward.z).normalize();
        }
    } catch (err) {
        forward.set(fallbackForward.x, fallbackForward.y, fallbackForward.z).normalize();
    }
    if (!Number.isFinite(forward.lengthSq ? forward.lengthSq() : 1) || (forward.lengthSq && forward.lengthSq() < 1e-9)) {
        forward.set(fallbackForward.x, fallbackForward.y, fallbackForward.z).normalize();
    }

    const up = (camera && camera.up && typeof camera.up.clone === 'function')
        ? camera.up.clone().normalize()
        : new THREE.Vector3(fallbackUp.x, fallbackUp.y, fallbackUp.z);

    let right = new THREE.Vector3().crossVectors(forward, up).normalize();
    if (!Number.isFinite(right.x) || (right.lengthSq && right.lengthSq() < 1e-9)) {
        right = new THREE.Vector3(1, 0, 0);
    }
    const orthoUp = new THREE.Vector3().crossVectors(right, forward).normalize();
    return {
        forward: vectorPlain(forward),
        up: vectorPlain(orthoUp),
        right: vectorPlain(right),
        center: vectorPlain(center),
        source: 'current_live_camera_basis_read_only'
    };
}

function cloneMaterialForExport(material) {
    if (Array.isArray(material)) return material.map(m => (m && typeof m.clone === 'function') ? m.clone() : m);
    return material && typeof material.clone === 'function' ? material.clone() : material;
}

function cloneGeometryForExport(child) {
    if (!child || !child.geometry) return;
    if (typeof child.geometry.clone === 'function') {
        const sourceGeometry = child.geometry;
        const exportGeometry = sourceGeometry.clone();
        exportGeometry.userData = Object.assign({}, sourceGeometry.userData || {}, {
            pngExportClone: true,
            pngExportOwner: 'Tonearm3DPngExporter',
            sourceGeometryUuid: sourceGeometry.uuid || null
        });
        child.geometry = exportGeometry;
        child.userData = Object.assign({}, child.userData || {}, {
            pngExportGeometryOwnership: 'owned_clone'
        });
    } else {
        child.userData = Object.assign({}, child.userData || {}, {
            pngExportGeometryOwnership: 'shared_read_only'
        });
    }
}

function cloneObjectFor3dPngExport(obj) {
    if (!obj || typeof obj.clone !== 'function') return null;
    const clone = obj.clone(true);
    if (clone && typeof clone.traverse === 'function') {
        clone.traverse(child => {
            cloneGeometryForExport(child);
            if (child && child.material) child.material = cloneMaterialForExport(child.material);
        });
    } else if (clone) {
        cloneGeometryForExport(clone);
        if (clone.material) clone.material = cloneMaterialForExport(clone.material);
    }
    return clone;
}

function build3dPngExportRoot() {
    if (typeof THREE === 'undefined' || !THREE.Group) return null;
    const rootGroup = new THREE.Group();
    rootGroup.name = 'tonearm_3d_png_export_root_read_only';
    [
        tonearmMesh,
        headshellSlotsGroup,
        rearAccessoriesGroup,
        cartGroup
    ].forEach(obj => {
        const clone = cloneObjectFor3dPngExport(obj);
        if (clone) rootGroup.add(clone);
    });
    return rootGroup;
}

function dispose3dPngObject(obj) {
    if (!obj) return;
    const ownsExportGeometry = obj.userData && obj.userData.pngExportGeometryOwnership === 'owned_clone';
    const geometryMarkedOwned = obj.geometry && obj.geometry.userData && obj.geometry.userData.pngExportClone === true;
    if (obj.geometry && typeof obj.geometry.dispose === 'function' && (ownsExportGeometry || geometryMarkedOwned)) {
        obj.geometry.dispose();
    }
    if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => { if (m && typeof m.dispose === 'function') m.dispose(); });
        else if (typeof obj.material.dispose === 'function') obj.material.dispose();
    }
    if (obj.children && obj.children.length) obj.children.forEach(dispose3dPngObject);
}

function add3dPngExportLights(exportScene) {
    if (!exportScene || typeof THREE === 'undefined') return;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.72);
    hemi.position.set(0, 0, 200);
    exportScene.add(hemi);
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.62);
    dir1.position.set(120, -120, 220);
    exportScene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xaaccff, 0.42);
    dir2.position.set(-100, 100, -50);
    exportScene.add(dir2);
}

function make3dPngFileName(now) {
    const d = now || new Date();
    return 'tonearm_3d_export_' + d.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-') + '.png';
}

function fallback3dPngDataUrl() {
    // Minimal transparent 1x1 PNG marker for non-browser tests; browser path uses WebGLRenderer.
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
}

function render3dPngOffscreen(width, height, fitCoverage, options) {
    const exportScene = new THREE.Scene();
    exportScene.background = new THREE.Color(0x222222);
    add3dPngExportLights(exportScene);

    const exportRoot = build3dPngExportRoot();
    if (exportRoot && exportRoot.children && exportRoot.children.length) {
        exportScene.add(exportRoot);
    }

    let objectBounds = null;
    if (options && options.objectBounds) {
        objectBounds = boundsPlain(options.objectBounds.min, options.objectBounds.max);
    } else if (exportRoot && exportRoot.children && exportRoot.children.length && THREE.Box3) {
        const box = new THREE.Box3().setFromObject(exportRoot);
        objectBounds = plainBoundsFromThreeBox(box);
    } else {
        objectBounds = runtimeFallback3dBounds();
    }

    const basis = getCurrent3dViewBasis(objectBounds);
    const projected = computeProjectedExtentsForBounds(objectBounds, basis.right, basis.up);
    const fit = computeFitCoverageMetadataFromProjectedExtents(projected.projectedWidth, projected.projectedHeight, width, height, fitCoverage);

    const center = objectBounds.center;
    const diag = Math.max(1, Math.sqrt(
        objectBounds.size.x * objectBounds.size.x +
        objectBounds.size.y * objectBounds.size.y +
        objectBounds.size.z * objectBounds.size.z
    ));
    const distance = diag * 2.25 + 100;
    const exportCamera = new THREE.OrthographicCamera(
        -fit.frustumWidth / 2,
        fit.frustumWidth / 2,
        fit.frustumHeight / 2,
        -fit.frustumHeight / 2,
        0.1,
        distance + diag * 4
    );
    exportCamera.up.set(basis.up.x, basis.up.y, basis.up.z);
    exportCamera.position.set(
        center.x - basis.forward.x * distance,
        center.y - basis.forward.y * distance,
        center.z - basis.forward.z * distance
    );
    exportCamera.lookAt(new THREE.Vector3(center.x, center.y, center.z));
    exportCamera.updateProjectionMatrix();

    const exportRenderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: false
    });
    if (typeof exportRenderer.setPixelRatio === 'function') exportRenderer.setPixelRatio(1);
    exportRenderer.setSize(width, height, false);
    exportRenderer.render(exportScene, exportCamera);
    const dataUrl = exportRenderer.domElement && typeof exportRenderer.domElement.toDataURL === 'function'
        ? exportRenderer.domElement.toDataURL('image/png')
        : fallback3dPngDataUrl();

    if (typeof exportRenderer.dispose === 'function') exportRenderer.dispose();
    if (exportRoot) dispose3dPngObject(exportRoot);

    const metadata = Object.assign({}, fit, {
        objectBounds: objectBounds,
        cameraBasis: basis,
        source: 'current_runtime_scene_snapshot',
        renderer: 'offscreen_webgl_renderer',
        imageWidth: width,
        imageHeight: height
    });

    return { dataUrl, metadata };
}

function export3dPng800x600(options) {
    if (!state || state.designLoaded !== true) {
        throw new Error('PNG export blocked: no active design exists in the empty session.');
    }
    const opts = options || {};
    const width = Math.max(1, Math.round(finiteNumber(opts.width, PNG_EXPORT_WIDTH)));
    const height = Math.max(1, Math.round(finiteNumber(opts.height, PNG_EXPORT_HEIGHT)));
    const fitCoverage = Math.max(0.1, Math.min(0.99, finiteNumber(opts.fitCoverage, PNG_EXPORT_FIT_COVERAGE)));

    let result;
    if (typeof THREE !== 'undefined' &&
        THREE.Scene &&
        THREE.OrthographicCamera &&
        THREE.WebGLRenderer &&
        typeof document !== 'undefined') {
        try {
            result = render3dPngOffscreen(width, height, fitCoverage, opts);
        } catch (err) {
            const objectBounds = opts.objectBounds ? boundsPlain(opts.objectBounds.min, opts.objectBounds.max) : runtimeFallback3dBounds();
            const metadata = computeFitCoverageMetadataForPlainBounds(objectBounds, width, height, fitCoverage);
            result = {
                dataUrl: fallback3dPngDataUrl(),
                metadata: Object.assign({}, metadata, {
                    objectBounds: objectBounds,
                    source: 'current_runtime_scene_snapshot',
                    renderer: 'metadata_fallback_after_offscreen_error',
                    error: err && err.message ? err.message : String(err)
                })
            };
        }
    } else {
        const objectBounds = opts.objectBounds ? boundsPlain(opts.objectBounds.min, opts.objectBounds.max) : runtimeFallback3dBounds();
        const metadata = computeFitCoverageMetadataForPlainBounds(objectBounds, width, height, fitCoverage);
        result = {
            dataUrl: fallback3dPngDataUrl(),
            metadata: Object.assign({}, metadata, {
                objectBounds: objectBounds,
                source: 'current_runtime_scene_snapshot',
                renderer: 'metadata_fallback_no_webgl'
            })
        };
    }

    const output = {
        width: width,
        height: height,
        type: 'image/png',
        mimeType: 'image/png',
        dataUrl: result.dataUrl,
        fileName: make3dPngFileName(opts.now),
        metadata: Object.assign({}, result.metadata, {
            imageWidth: width,
            imageHeight: height,
            fitCoverageTarget: fitCoverage
        })
    };
    LAST_3D_PNG_EXPORT_METADATA = clonePlainJson(output.metadata);
    return output;
}

function getLast3dPngExportMetadata() {
    return LAST_3D_PNG_EXPORT_METADATA ? clonePlainJson(LAST_3D_PNG_EXPORT_METADATA) : null;
}

function download3dPng800x600() {
    const exportResult = export3dPng800x600({
        width: PNG_EXPORT_WIDTH,
        height: PNG_EXPORT_HEIGHT,
        fitCoverage: PNG_EXPORT_FIT_COVERAGE,
        source: 'current_runtime_scene_snapshot'
    });
    if (typeof document === 'undefined' || !document.createElement) return exportResult;
    const link = document.createElement('a');
    link.href = exportResult.dataUrl;
    link.download = exportResult.fileName;
    link.style.display = 'none';
    if (document.body && document.body.appendChild) document.body.appendChild(link);
    if (typeof link.click === 'function') link.click();
    if (document.body && document.body.removeChild) document.body.removeChild(link);
    return exportResult;
}

const Tonearm3DPngExporter = {
    export3dPng800x600,
    download3dPng800x600,
    getLast3dPngExportMetadata,
    _computeFitCoverageMetadataForPlainBounds: computeFitCoverageMetadataForPlainBounds,
    _computeFitCoverageMetadataFromProjectedExtents: computeFitCoverageMetadataFromProjectedExtents
};

if (typeof window !== 'undefined') {
    window.Tonearm3DPngExporter = Tonearm3DPngExporter;
    window.export3dPng800x600 = export3dPng800x600;
    window.download3dPng800x600 = download3dPng800x600;
}


function buildRearAccessoriesGroup(includeWeightDiscs) {
    const group = new THREE.Group();
    group.name = 'cobra_disc_counterweight_and_rear_accessories';
    group.userData = Object.assign({}, group.userData || {}, { counterweightImplementation: 'configurable_disc_stack' });
    const matDisc = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.8 });

    const rearTerminal = (typeof getUnifiedRearTerminal === 'function')
        ? getUnifiedRearTerminal(state)
        : { available: false, source: 'missing_unified_rear_terminal', x: null, y: 0, z: null };
    if (!rearTerminal || rearTerminal.available !== true) return group;
    const discState = (window.CobraDiscCounterweightAssembly && typeof window.CobraDiscCounterweightAssembly.getDiscStackState === 'function')
        ? window.CobraDiscCounterweightAssembly.getDiscStackState(state)
        : null;
    const discCount = discState ? discState.count : state.rearWeightDiscCount;
    const discDiameter = discState ? discState.diameterMm : state.rearWeightDiscDiameter;
    const discThickness = discState ? discState.thicknessMm : state.rearWeightDiscThickness;
    const discMount = (discState && discState.mount && discState.mount.available) ? discState.mount : rearTerminal;
    const discX = discMount.x;
    const anchorZ = discState && Number.isFinite(Number(discState.anchorZ)) ? Number(discState.anchorZ) : Number(discMount.z);
    const discCenterZList = discState && Array.isArray(discState.discCenterZList)
        ? discState.discCenterZList
        : Array.from({ length: Math.max(0, Number(discCount) || 0) }, (_, i) => anchorZ - (discThickness / 2) - (i * discThickness));

    if (includeWeightDiscs && discCount > 0) {
        const bridge = discState && discState.supportBridge ? discState.supportBridge : null;
        if (bridge && bridge.enabled === true &&
            Number.isFinite(Number(bridge.radiusMm)) &&
            Number.isFinite(Number(bridge.topZ)) &&
            Number.isFinite(Number(bridge.bottomZ)) &&
            Number(bridge.topZ) > Number(bridge.bottomZ)) {
            const bridgeHeight = Number(bridge.topZ) - Number(bridge.bottomZ);
            const bridgeGeo = new THREE.CylinderGeometry(
                Number(bridge.radiusMm),
                Number(bridge.radiusMm),
                bridgeHeight,
                24
            );
            bridgeGeo.rotateX(Math.PI / 2);
            const bridgeMesh = new THREE.Mesh(bridgeGeo, matDisc);
            bridgeMesh.position.set(discX, 0, (Number(bridge.topZ) + Number(bridge.bottomZ)) / 2);
            bridgeMesh.name = 'cobra_counterweight_support_bridge';
            bridgeMesh.userData = Object.assign({}, bridgeMesh.userData || {}, {
                counterweightImplementation: 'rear_terminal_support_bridge',
                supportBridge: true,
                supportBridgeRole: bridge.role || 'rear_terminal_to_disc_stack_support_boss',
                supportBridgeTopZ: bridge.topZ,
                supportBridgeBottomZ: bridge.bottomZ,
                supportBridgeOverlapMm: bridge.overlapMm,
                supportBridgeRadiusMm: bridge.radiusMm,
                stackingMode: discState && discState.stackingMode ? discState.stackingMode : 'terminal_support_bridge_downward'
            });
            group.add(bridgeMesh);
        }

        for (let i = 0; i < discCount; i++) {
            const discGeo = new THREE.CylinderGeometry(
                discDiameter / 2,
                discDiameter / 2,
                discThickness,
                32
            );
            discGeo.rotateX(Math.PI / 2);
            const discMesh = new THREE.Mesh(discGeo, matDisc);
            const discCenterZ = Number(discCenterZList[i]);
            discMesh.position.set(discX, 0, discCenterZ);
            discMesh.name = 'cobra_disc_counterweight_' + (i + 1);
            discMesh.userData = Object.assign({}, discMesh.userData || {}, {
                counterweightImplementation: 'configurable_disc_stack',
                counterweightCOMSource: 'rearWeightDiscStack',
                stackingMode: discState && discState.stackingMode ? discState.stackingMode : 'terminal_support_bridge_downward',
                discIndex: i + 1,
                discCount: discCount,
                anchorZ: anchorZ,
                discCenterZ: discCenterZ,
                stackTopZ: discState ? discState.stackTopZ : anchorZ,
                stackBottomZ: discState ? discState.stackBottomZ : anchorZ - (discCount * discThickness),
                stackCOMZ: discState ? discState.stackCOMZ : anchorZ - ((discCount * discThickness) / 2),
                supportBridge: bridge || null,
                rearTerminal: rearTerminal,
                discMount: discMount,
                discMountSource: discMount.source || 'unifiedRearTerminalCapContact',
                geometrySource: discMount.geometrySource || 'td026_full_ring_geometry',
                discMountDeltaMm: Math.abs(Number(discX) - Number(rearTerminal.x))
            });
            group.add(discMesh);
        }
    }

    if (state.showFineTrimScrew && state.rearFineTrimScrewLength > 0) {
        const fineTrim = Physics.getFineTrimCOM(state);
        const screwGeo = new THREE.CylinderGeometry(2, 2, state.rearFineTrimScrewLength, 16);
        screwGeo.rotateZ(Math.PI / 2);
        const screwMesh = new THREE.Mesh(screwGeo, matDisc);
        screwMesh.position.set(fineTrim.x, 0, fineTrim.z);
        group.add(screwMesh);
    }

    if (typeof isMechanicalAssemblyDebugEnabled === 'function' &&
        isMechanicalAssemblyDebugEnabled(state) &&
        window.CobraMechanicalAssembly &&
        typeof window.CobraMechanicalAssembly.buildAssemblyGroup === 'function' &&
        window.CobraMechanicalAssembly.isEnabled(state)) {
        const mechGroup = window.CobraMechanicalAssembly.buildAssemblyGroup(state);
        if (mechGroup) {
            mechGroup.name = 'cobra_mechanical_debug_overlay';
            mechGroup.userData = Object.assign({}, mechGroup.userData || {}, { debugOverlay: true, normalRender: false });
            group.add(mechGroup);
        }
    }

    return group;
}

function addMarker(group, point, radius, color) {
    if (!point || (point.mass !== undefined && point.mass <= 0)) return;
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 16),
        new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.set(point.x, point.y, point.z);
    group.add(mesh);
}

function addAxisLine(group, origin, dir, halfLength, color) {
    if (!dir || halfLength <= 0) return;
    const p1 = new THREE.Vector3(
        origin.x - dir.x * halfLength,
        origin.y - dir.y * halfLength,
        origin.z - dir.z * halfLength
    );
    const p2 = new THREE.Vector3(
        origin.x + dir.x * halfLength,
        origin.y + dir.y * halfLength,
        origin.z + dir.z * halfLength
    );
    const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([p1, p2]),
        new THREE.LineBasicMaterial({ color })
    );
    group.add(line);
}

function buildPhysicsOverlay(mode) {
    const group = new THREE.Group();
    const phys = Physics.getComprehensiveAnalysis(state, mode, GLOBAL_RINGSCache);

    if (state.showVerticalPivot) {
        const cyl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 0.6, 60, 16),
            new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.55 })
        );
        cyl.rotateX(Math.PI / 2);
        cyl.position.set(phys.pivot.x, phys.pivot.y, phys.pivot.z);
        group.add(cyl);
        addMarker(group, { ...phys.pivot, mass: 1 }, 2.2, 0xe74c3c);
    }

    if (state.showTotalCOM) addMarker(group, phys.c_total, 2.6, 0x2ecc71);
    if (state.showRearCOM) addMarker(group, phys.c_rear, 2.2, 0x9b59b6);
    if (state.showCounterweightCOM) addMarker(group, phys.c_rear_weights, 2.0, 0xe67e22);
    if (state.showCartridgeCOM) addMarker(group, phys.c_cart, 1.8, 0xf1c40f);

    if (state.showInertiaAxes) {
        addAxisLine(group, phys.pivot, phys.inertia.principal.axis1.dir, phys.inertia.principal.axis1.k, 0x3498db);
        addAxisLine(group, phys.pivot, phys.inertia.principal.axis2.dir, phys.inertia.principal.axis2.k, 0x1abc9c);
        addAxisLine(group, phys.pivot, phys.inertia.axisY.dir, phys.inertia.axisY.k, 0xe67e22);
    }

    return group;
}


function getCobraEggshellTonearmGeometry() {
    if (typeof isCobraEggshellRuntimeGeometryDebugEnabled !== 'function' ||
        !isCobraEggshellRuntimeGeometryDebugEnabled(state)) {
        return null;
    }
    if (!window.CobraEggshellWand ||
        typeof window.CobraEggshellWand.isEnabled !== 'function' ||
        typeof window.CobraEggshellWand.buildStations !== 'function' ||
        typeof window.CobraEggshellWand.validateStations !== 'function' ||
        typeof window.CobraEggshellWand.buildMesh !== 'function') {
        return null;
    }
    if (!window.CobraEggshellWand.isEnabled(state)) return null;

    const stations = window.CobraEggshellWand.buildStations(state);
    const validation = window.CobraEggshellWand.validateStations(stations);
    if (!validation || validation.status !== 'PASS') {
        console.warn('Cobra eggshell armwand render fallback: station validation failed', validation);
        return null;
    }
    const geo = window.CobraEggshellWand.buildMesh(stations, { segments: Math.min(36, Math.max(18, typeof getMeshSegments === 'function' ? getMeshSegments() : 24)) });
    if (geo && geo.userData) {
        const vertexCount = geo.attributes && geo.attributes.position ? geo.attributes.position.count : 0;
        const indexCount = geo.index && Number.isFinite(Number(geo.index.count)) ? Number(geo.index.count) : 0;
        const groupCount = Array.isArray(geo.groups) ? geo.groups.length : 0;
        geo.userData.cobraEggshellRenderPath = true;
        geo.userData.cobraEggshellValidationStatus = validation.status;
        geo.userData.renderable = vertexCount > 0 && indexCount > 0 && groupCount >= 1;
        geo.userData.vertexCount = vertexCount;
        geo.userData.indexCount = indexCount;
        geo.userData.groupCount = groupCount;
    }
    return geo;
}


function currentCobraArchitectureForRuntime() {
    return (window.CobraArchitecture && typeof window.CobraArchitecture.getCobraArchitecture === 'function')
        ? window.CobraArchitecture.getCobraArchitecture(state)
        : (state && state.cobraArchitecture ? state.cobraArchitecture : null);
}

function isHeadshellSlotsRenderEnabled() {
    const arch = currentCobraArchitectureForRuntime();
    return !!(arch && arch.enabled === true &&
        arch.headshellSlots &&
        arch.headshellSlots.enabled !== false &&
        window.HeadshellSlots &&
        typeof window.HeadshellSlots.buildSlottedReferencePlateGeometry === 'function');
}

function buildHeadshellSlotsRenderGroup() {
    const group = new THREE.Group();
    group.name = 'cobra_headshell_slots_reference_group';
    if (!isHeadshellSlotsRenderEnabled()) return group;
    const arch = currentCobraArchitectureForRuntime();
    const spec = arch.headshellSlots;
    const validation = window.HeadshellSlots.validateSpec ?
        window.HeadshellSlots.validateSpec(state) :
        { status: 'PASS' };
    if (validation && validation.status !== 'PASS') {
        group.userData = { featureId: 'headshellSlots', status: 'validation_failed', validation: validation };
        return group;
    }
    const plateGeo = window.HeadshellSlots.buildSlottedReferencePlateGeometry({ cobraArchitecture: { headshellSlots: spec } });
    if (plateGeo && plateGeo.attributes && plateGeo.attributes.position) {
        const plateMat = new THREE.MeshStandardMaterial({
            color: 0x4055aa,
            roughness: 0.45,
            metalness: 0.15,
            transparent: true,
            opacity: 0.72,
            side: THREE.DoubleSide
        });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.name = 'cobra_headshell_slotted_reference_plate';
        group.add(plate);
    }
    if (typeof window.HeadshellSlots.buildSlotDescriptors === 'function') {
        const descriptors = window.HeadshellSlots.buildSlotDescriptors({ cobraArchitecture: { headshellSlots: spec } });
        group.userData = {
            featureId: 'headshellSlots',
            semanticType: 'integrated_obround_cartridge_slots',
            slotCount: descriptors.length,
            booleanCutStatus: spec.integration ? spec.integration.booleanCutStatus : 'full_csg'
        };
    }
    return group;
}


function isTitaniumMountPlateRenderEnabled() {
    return !!(window.TitaniumMountPlate &&
        typeof window.TitaniumMountPlate.buildGeometry === 'function' &&
        typeof window.TitaniumMountPlate.resolveTitaniumMountPlatePose === 'function' &&
        window.TitaniumMountPlate.resolveTitaniumMountPlatePose(state).enabled === true);
}

function buildTitaniumMountPlateRenderGroup() {
    const group = new THREE.Group();
    group.name = 'td051_titanium_mount_plate_group';
    if (!isTitaniumMountPlateRenderEnabled()) return group;
    const geo = window.TitaniumMountPlate.buildGeometry(state);
    if (geo && geo.attributes && geo.attributes.position) {
        const mat = new THREE.MeshStandardMaterial({
            color: 0x9ba6ad,
            roughness: 0.28,
            metalness: 0.75,
            transparent: false,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'td051_structural_titanium_interface_plate';
        mesh.userData = Object.assign({}, mesh.userData || {}, geo.userData || {}, {
            featureId: 'titaniumMountPlate',
            semanticType: 'structural_laminated_interface_plate',
            renderPath: 'td051_titanium_mount_plate'
        });
        group.add(mesh);
    }
    group.userData = {
        featureId: 'titaniumMountPlate',
        semanticType: 'structural_laminated_interface_plate',
        enabled: true
    };
    return group;
}



function buildInternalWireRouteGroup() {
    const group = new THREE.Group();
    group.name = 'ai_vibe_internal_wire_route_debug';
    if (!state.showInternalWireRoute || !GLOBAL_RINGSCache || GLOBAL_RINGSCache.length < 2) return group;
    const points = [];
    const step = Math.max(1, Math.floor(GLOBAL_RINGSCache.length / 48));
    for (let i = 0; i < GLOBAL_RINGSCache.length; i += step) {
        const r = GLOBAL_RINGSCache[i];
        if (!r || !r.center) continue;
        points.push(new THREE.Vector3(
            r.center.x,
            Number(state.wireRouteYOffset || 0),
            r.center.z + Number(state.wireRouteZOffset || -2)
        ));
    }
    const last = GLOBAL_RINGSCache[GLOBAL_RINGSCache.length - 1];
    if (last && last.center) points.push(new THREE.Vector3(last.center.x, Number(state.wireRouteYOffset || 0), last.center.z + Number(state.wireRouteZOffset || -2)));
    if (points.length < 2) return group;
    const curve = new THREE.CatmullRomCurve3(points);
    const radius = Math.max(0.05, Number(state.wireRouteRadius || 0.65));
    const geo = new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), radius, 8, false);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.55 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'internal_wire_route_clearance_tube';
    mesh.userData = { featureId: 'InternalWireDuct', radiusMm: radius, yOffsetMm: state.wireRouteYOffset, zOffsetMm: state.wireRouteZOffset, debugOnly: true, cutsGeometry: false };
    group.add(mesh);
    return group;
}

function update3DMesh() {
    if (!scene) return;
    if (tonearmMesh) clearObject(tonearmMesh);
    if (rearAccessoriesGroup) clearObject(rearAccessoriesGroup);
    if (cartGroup) clearObject(cartGroup);
    if (physGroupGlobal) clearObject(physGroupGlobal);
    if (headshellSlotsGroup) clearObject(headshellSlotsGroup);
    if (titaniumMountPlateGroup) clearObject(titaniumMountPlateGroup);
    if (window.__aiVibeWireRouteGroup) clearObject(window.__aiVibeWireRouteGroup);

    if (!state || state.designLoaded !== true) {
        tonearmMesh = null;
        rearAccessoriesGroup = null;
        cartGroup = null;
        physGroupGlobal = null;
        headshellSlotsGroup = null;
        titaniumMountPlateGroup = null;
        window.__aiVibeWireRouteGroup = null;
        const stylusInfo = document.getElementById('stylusInfo');
        if (stylusInfo) stylusInfo.textContent = 'No active design';
        return;
    }

    const renderMode = state.renderMode || 'cad';
    let matOuter, matInner, matCap;

    if (renderMode === 'wireframe') {
        matOuter = new THREE.MeshBasicMaterial({ color: 0x00aaff, wireframe: true });
        matInner = new THREE.MeshBasicMaterial({ color: 0xff4444, wireframe: true });
        matCap = new THREE.MeshBasicMaterial({ color: 0x44ff44, wireframe: true });
    } else if (renderMode === 'carbon') {
        matOuter = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.7 });
        matInner = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9, metalness: 0.1 });
        matCap = new THREE.MeshStandardMaterial({ color: 0xe1b12c, roughness: 0.6, metalness: 0.4 });
    } else if (renderMode === 'xray') {
        matOuter = new THREE.MeshPhysicalMaterial({
            color: 0xcccccc, metalness: 0.1, roughness: 0.1, transmission: 0.9,
            thickness: state.thick, transparent: true, depthWrite: false
        });
        matInner = new THREE.MeshStandardMaterial({ color: 0x9b59b6, roughness: 0.8, metalness: 0.1 });
        matCap = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.5, metalness: 0.1 });
    } else {
        matOuter = new THREE.MeshStandardMaterial({ color: 0xb0b5b9, roughness: 0.3, metalness: 0.2 });
        matInner = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.1 });
        matCap = new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.5, metalness: 0.6 });
    }

    matOuter.side = THREE.DoubleSide;
    matInner.side = THREE.DoubleSide;
    matCap.side = THREE.DoubleSide;

    const freeformGeometryMode = !!(window.FreeformRuntimeIntegration &&
        typeof window.FreeformRuntimeIntegration.getGeometryMode === 'function' &&
        window.FreeformRuntimeIntegration.getGeometryMode(state) === 'freeform');

    if (freeformGeometryMode && (!state || !state.freeformLoftActive)) {
        if (window.FreeformModeAudit && typeof window.FreeformModeAudit.auditGeometryMode === 'function') {
            state.geometryModeAudit = window.FreeformModeAudit.auditGeometryMode(state || {}, 'parametricGeometry', 'parametricMesh', 'legacyParametricPhysics', { stlSource: 'parametricMesh' });
        }
        throw new Error('TD053F render blocker: geometryMode=freeform but accepted freeformLoftActive is missing; silent parametric fallback is forbidden.');
    }

    if (freeformGeometryMode) {
        const freeformGeometry = window.FreeformRuntimeIntegration.buildCurrentThreeGeometry(THREE, state, {
            stationCount: Math.max(12, Math.min(64, Math.round((state.freeformLoft && state.freeformLoft.rings ? state.freeformLoft.rings.length * 4 : 18)))),
            segmentCount: Math.min(64, Math.max(24, typeof getMeshSegments === 'function' ? Math.round(getMeshSegments() / 2) : 32))
        });
        freeformGeometry.userData = Object.assign({}, freeformGeometry.userData || {}, {
            geometryMode: 'freeform',
            renderPath: 'td052b_freeform_render3d_branch',
            td053fRenderPath: 'td053f_freeform_active_render_branch',
            geometrySource: 'freeformLoftKernel',
            renderGeometrySource: 'freeformLoftKernel',
            exportGeometrySource: 'freeformLoftKernel',
            reportGeometrySource: 'freeformPhysicalAnalysis',
            stlSource: 'freeformLoftKernel',
            source: 'freeformLoftActive',
            sourceState: 'state.freeformLoftActive',
            acceptedActiveRevision: state.freeformLoftActive && state.freeformLoftActive.revision || null,
            silentFallbackDetected: false
        });
        tonearmMesh = new THREE.Mesh(freeformGeometry, matOuter);
        tonearmMesh.name = 'td053d_freeform_centerline_ring_loft_kernel_mesh';
        tonearmMesh.userData = Object.assign({}, tonearmMesh.userData || {}, {
            geometryMode: 'freeform',
            freeformRenderPath: true,
            renderGeometrySource: 'freeformLoftKernel',
            exportGeometrySource: 'freeformLoftKernel',
            reportGeometrySource: 'freeformPhysicalAnalysis',
            stlSource: 'freeformLoftKernel',
            source: 'freeformLoftActive',
            sourceState: 'state.freeformLoftActive',
            acceptedActiveRevision: state.freeformLoftActive && state.freeformLoftActive.revision || null,
            silentFallbackDetected: false
        });
    } else {
    const cobraEggshellGeometry = getCobraEggshellTonearmGeometry();
    if (cobraEggshellGeometry) {
        const cobraMaterial = matOuter;
        if (cobraEggshellGeometry.userData) {
            cobraEggshellGeometry.userData.cobraEggshellRenderPath = true;
            cobraEggshellGeometry.userData.renderMaterialMode = 'single';
        }
        tonearmMesh = new THREE.Mesh(cobraEggshellGeometry, cobraMaterial);
        tonearmMesh.name = 'cobra_eggshell_armwand_mesh';
        tonearmMesh.userData = Object.assign({}, tonearmMesh.userData || {}, {
            cobraEggshellRenderPath: true,
            renderable: !!(cobraEggshellGeometry.userData && cobraEggshellGeometry.userData.renderable),
            vertexCount: cobraEggshellGeometry.userData ? cobraEggshellGeometry.userData.vertexCount : null,
            indexCount: cobraEggshellGeometry.userData ? cobraEggshellGeometry.userData.indexCount : null,
            groupCount: cobraEggshellGeometry.userData ? cobraEggshellGeometry.userData.groupCount : null
        });
    } else {
        const td026Geometry = generateTonearmGeometry();
        if (td026Geometry && td026Geometry.userData) {
            td026Geometry.userData.geometrySource = (typeof UNIFIED_GEOMETRY_SOURCE_ID !== 'undefined') ? UNIFIED_GEOMETRY_SOURCE_ID : 'td026_full_ring_geometry';
            td026Geometry.userData.primaryGeometrySource = td026Geometry.userData.geometrySource;
            td026Geometry.userData.rearTerminal = (typeof getUnifiedRearTerminal === 'function') ? getUnifiedRearTerminal(state) : null;
        }
        tonearmMesh = new THREE.Mesh(td026Geometry, [matOuter, matInner, matCap]);
        tonearmMesh.name = 'td026_full_ring_arm_body_mesh';
        tonearmMesh.userData = Object.assign({}, tonearmMesh.userData || {}, {
            geometrySource: (typeof UNIFIED_GEOMETRY_SOURCE_ID !== 'undefined') ? UNIFIED_GEOMETRY_SOURCE_ID : 'td026_full_ring_geometry',
            primaryGeometrySource: (typeof UNIFIED_GEOMETRY_SOURCE_ID !== 'undefined') ? UNIFIED_GEOMETRY_SOURCE_ID : 'td026_full_ring_geometry',
            cobraEggshellRenderPath: false
        });
    }
    }
    scene.add(tonearmMesh);

    if (!freeformGeometryMode) {
        headshellSlotsGroup = buildHeadshellSlotsRenderGroup();
        if (headshellSlotsGroup && headshellSlotsGroup.children && headshellSlotsGroup.children.length) {
            scene.add(headshellSlotsGroup);
        }

        titaniumMountPlateGroup = buildTitaniumMountPlateRenderGroup();
        if (titaniumMountPlateGroup && titaniumMountPlateGroup.children && titaniumMountPlateGroup.children.length) {
            scene.add(titaniumMountPlateGroup);
        }

        window.__aiVibeWireRouteGroup = buildInternalWireRouteGroup();
        if (window.__aiVibeWireRouteGroup && window.__aiVibeWireRouteGroup.children && window.__aiVibeWireRouteGroup.children.length) {
            scene.add(window.__aiVibeWireRouteGroup);
        }

        if (state.rearMode === REAR_MODES.COBRA_GOOSE) {
            rearAccessoriesGroup = buildRearAccessoriesGroup(state.showRearWeights);
            scene.add(rearAccessoriesGroup);
        }
    }

    const mode = state.cartMode;
    if (mode === 'g1042') {
        const pZ = getClassicProfileAtX(state.cartX + GOLDRING1042.anchors.tipToMountX).zBot;
        cartGroup = createGoldring10423D(pZ, state.cartX);
        scene.add(cartGroup);
        document.getElementById('stylusInfo').innerHTML = '★ 1042 Profile Active';
    } else if (mode === 'custom' || mode === 'selected') {
        const pZ = getClassicProfileAtX(state.cartX + 9).zBot;
        cartGroup = createGenericCartridge3D(pZ, state.cartX, state.customZ);
        scene.add(cartGroup);
        document.getElementById('stylusInfo').innerHTML = '★ Custom Cartridge';
    } else {
        document.getElementById('stylusInfo').innerHTML = `★ Arm Only | Nominal reference point: ${state.nomStylusX} mm`;
    }

    physGroupGlobal = buildPhysicsOverlay(mode);
    scene.add(physGroupGlobal);
}

function createGenericCartridge3D(padZ, cartX, tipToTop) {
    const group = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7, metalness: 0.3 });
    const offsetZ = padZ - tipToTop;
    const boxGeo = new THREE.BoxGeometry(18, 16, tipToTop - 2);
    const boxMesh = new THREE.Mesh(boxGeo, matBody);
    boxMesh.position.set(cartX + 9, 0, offsetZ + (tipToTop - 2) / 2 + 2);
    group.add(boxMesh);

    const tipGeo = new THREE.ConeGeometry(0.2, 2, 8);
    tipGeo.rotateX(-Math.PI / 2);
    const tipMesh = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    tipMesh.position.set(cartX, 0, offsetZ + 1);
    group.add(tipMesh);
    return group;
}

function createGoldring10423D(padZ, cartX) {
    const group = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0.2 });
    const matPlate = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8, metalness: 0.1 });
    const matGold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 });
    const matSilver = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.4, metalness: 0.8 });

    const stepX = 0.5;
    const bLen = GOLDRING1042.inferred.bodyLength;
    const pts = [], idx = [];
    let rCount = 0;

    for (let lx = 0; lx <= bLen; lx += stepX) {
        const p = getGoldring1042ProfileAtX(lx);
        pts.push(
            new THREE.Vector3(lx, -p.width / 2, p.zTop), new THREE.Vector3(lx, p.width / 2, p.zTop),
            new THREE.Vector3(lx, p.width / 2, p.zBot), new THREE.Vector3(lx, -p.width / 2, p.zBot)
        );
        rCount++;
    }

    for (let r = 0; r < rCount - 1; r++) {
        const r1 = r * 4, r2 = (r + 1) * 4;
        for (let i = 0; i < 4; i++) {
            const nI = (i + 1) % 4;
            idx.push(r1 + i, r2 + i, r1 + nI, r1 + nI, r2 + i, r2 + nI);
        }
    }

    idx.push(0, 1, 2, 0, 2, 3);
    const lR = (rCount - 1) * 4;
    idx.push(lR, lR + 2, lR + 1, lR, lR + 3, lR + 2);

    const posArr = [];
    pts.forEach(v => posArr.push(v.x, v.y, v.z));
    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    bodyGeo.setIndex(idx);
    bodyGeo.computeVertexNormals();

    const bodyMesh = new THREE.Mesh(bodyGeo, matBody);
    const offsetZ = padZ - GOLDRING1042.anchors.tipToTop;
    bodyMesh.position.set(cartX, 0, offsetZ);
    group.add(bodyMesh);

    const pData = GOLDRING1042.plate;
    const pLen = pData.x1 - pData.x0;
    const plateGeo = new THREE.BoxGeometry(pLen, pData.halfWidth * 2, pData.z1 - pData.z0);
    const plateMesh = new THREE.Mesh(plateGeo, matPlate);
    plateMesh.position.set(cartX + pData.x0 + pLen / 2, 0, offsetZ + (pData.z1 + pData.z0) / 2);
    group.add(plateMesh);

    const cantL = 6.0;
    const cantGeo = new THREE.CylinderGeometry(0.15, 0.15, cantL, 8);
    const cantMesh = new THREE.Mesh(cantGeo, matSilver);
    const pTip = new THREE.Vector3(cartX, 0, offsetZ);
    const pRoot = new THREE.Vector3(
        cartX + cantL * Math.cos(GOLDRING1042.anchors.cantileverAngleDeg * Math.PI / 180),
        0,
        offsetZ + cantL * Math.sin(GOLDRING1042.anchors.cantileverAngleDeg * Math.PI / 180)
    );
    cantMesh.position.copy(pTip).lerp(pRoot, 0.5);
    cantMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(pRoot, pTip).normalize());
    group.add(cantMesh);

    const tipGeo = new THREE.ConeGeometry(0.2, 0.6, 8);
    tipGeo.rotateX(-Math.PI / 2);
    const tipMesh = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    tipMesh.position.copy(pTip);
    group.add(tipMesh);

    GOLDRING1042.rearPins.centers.forEach(c => {
        const pinGeo = new THREE.CylinderGeometry(GOLDRING1042.rearPins.radius, GOLDRING1042.rearPins.radius, GOLDRING1042.rearPins.length, 8);
        pinGeo.rotateZ(Math.PI / 2);
        const pin = new THREE.Mesh(pinGeo, matGold);
        pin.position.set(cartX + GOLDRING1042.rearPins.x + GOLDRING1042.rearPins.length / 2, c.y, offsetZ + c.z);
        group.add(pin);
    });

    return group;
}

function clearObject(obj) {
    if (!obj) return;
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
    }
    if (obj.children) obj.children.forEach(c => clearObject(c));
    if (obj.parent) obj.parent.remove(obj);
}
