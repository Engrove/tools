// SPDX-License-Identifier: 0BSD
// TD052B Freeform Runtime Integration.
// Visible top-level freeform tab + TD053F canonical live-state binding for browser render/export/session/report plus TD053E apply-state bridge.
// AI-CODING NOTE: Preserve accepted-active/preview separation; the port additionally keeps an explicit empty session from materializing a default Freeform object.

(function(root) {
    'use strict';

    const PARAMETRIC = 'parametric';
    const FREEFORM = 'freeform';
    const MODE_VALUES = [PARAMETRIC, FREEFORM];

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function finite(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function ensureState(appState) {
        const s = root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.getCanonicalAppState === 'function'
            ? root.FreeformLiveStateBinding.getCanonicalAppState(appState)
            : (appState || root.state || {});
        if (MODE_VALUES.indexOf(s.geometryMode) === -1) s.geometryMode = PARAMETRIC;
        if (s.designLoaded !== false && !s.freeformLoft && root.FreeformLoftKernel && typeof root.FreeformLoftKernel.defaultState === 'function') {
            s.freeformLoft = root.FreeformLoftKernel.defaultState('long_low_cobra_monocoque');
        }
        if (s.designLoaded !== false && !s.freeformLoftActive && s.freeformLoft) {
            s.freeformLoftActive = clone(s.freeformLoft);
            s.freeformLoftActive.role = 'active';
            s.freeformLoftActive.revision = s.freeformLoftActive.revision || 'active-initial';
        }
        if (!s.freeformLoft && s.freeformLoftActive) {
            s.freeformLoft = clone(s.freeformLoftActive);
        }
        if (!s.freeformLastAnalysis) s.freeformLastAnalysis = null;
        if (!s.freeformLastAcceptedAnalysis) s.freeformLastAcceptedAnalysis = null;
        if (!s.freeformLastPreviewAnalysis) s.freeformLastPreviewAnalysis = null;
        if (root.FreeformApplyStateMachine && typeof root.FreeformApplyStateMachine.ensureState === 'function') {
            root.FreeformApplyStateMachine.ensureState(s);
        }
        if (root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.ensureCanonicalFreeformState === 'function') {
            root.FreeformLiveStateBinding.ensureCanonicalFreeformState(s);
        }
        return s;
    }

    function getGeometryMode(appState) {
        const s = ensureState(appState);
        return s.geometryMode === FREEFORM ? FREEFORM : PARAMETRIC;
    }

    function setGeometryMode(mode, appState) {
        const s = ensureState(appState);
        s.geometryMode = (mode === FREEFORM) ? FREEFORM : PARAMETRIC;
        if (root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.ensureCanonicalFreeformState === 'function') {
            root.FreeformLiveStateBinding.ensureCanonicalFreeformState(s);
        }
        syncTabsFromState(s);
        syncModeIndicator(s);
        return s.geometryMode;
    }

    function getFreeformState(appState) {
        const s = ensureState(appState);
        if (s.designLoaded === false && !s.freeformLoftActive) {
            return root.FreeformLoftKernel && typeof root.FreeformLoftKernel.defaultState === 'function'
                ? root.FreeformLoftKernel.defaultState()
                : {};
        }
        if (!s.freeformLoftActive && s.freeformLoft) {
            s.freeformLoftActive = clone(s.freeformLoft);
            s.freeformLoftActive.role = 'active';
            s.freeformLoftActive.revision = s.freeformLoftActive.revision || 'active-initial';
        }
        if (!s.freeformLoftActive && root.FreeformLoftKernel) {
            s.freeformLoftActive = root.FreeformLoftKernel.defaultState();
            s.freeformLoftActive.role = 'active';
            s.freeformLoftActive.revision = 'active-initial';
        }
        s.freeformLoft = clone(s.freeformLoftActive || {});
        return s.freeformLoftActive || s.freeformLoft;
    }

    function setFreeformState(freeformState, appState) {
        const s = ensureState(appState);
        s.designLoaded = true;
        s.designSource = s.designSource || 'freeform_state';
        if (root.DesignSession && typeof root.DesignSession.activate === 'function') root.DesignSession.activate(s.designSource);
        const sanitized = root.FreeformLoftKernel && typeof root.FreeformLoftKernel.sanitizeState === 'function'
            ? root.FreeformLoftKernel.sanitizeState(freeformState)
            : clone(freeformState || {});
        sanitized.role = 'active';
        sanitized.revision = sanitized.revision || (root.FreeformApplyStateMachine && root.FreeformApplyStateMachine.nowRevision ? root.FreeformApplyStateMachine.nowRevision('active') : 'active-local');
        s.freeformLoftActive = clone(sanitized);
        s.freeformLoft = clone(sanitized);
        s.freeformAcceptedActiveRevision = sanitized.revision;
        root.LAST_FREEFORM_LOFT_STATE = clone(s.freeformLoft);
        renderEditorScaffolds(s);
        return s.freeformLoft;
    }

    function setPreviewFreeformState(freeformState, appState, analysis, audit) {
        const s = ensureState(appState);
        const sanitized = root.FreeformLoftKernel && typeof root.FreeformLoftKernel.sanitizeState === 'function'
            ? root.FreeformLoftKernel.sanitizeState(freeformState)
            : clone(freeformState || {});
        sanitized.role = 'preview';
        sanitized.revision = sanitized.revision || (root.FreeformApplyStateMachine && root.FreeformApplyStateMachine.nowRevision ? root.FreeformApplyStateMachine.nowRevision('preview') : 'preview-local');
        if (root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.setFreeformPreview === 'function') {
            return root.FreeformLiveStateBinding.setFreeformPreview(sanitized, analysis || s.freeformLastPreviewAnalysis || null, audit || s.geometryModeAudit || null, s);
        }
        s.freeformLoftPreview = clone(sanitized);
        root.LAST_FREEFORM_LOFT_PREVIEW_STATE = clone(s.freeformLoftPreview);
        return s.freeformLoftPreview;
    }

    function bboxFromVertices(vertices) {
        const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
        (vertices || []).forEach(v => {
            const x = finite(v.x, 0), y = finite(v.y, 0), z = finite(v.z, 0);
            b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
            b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
            b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z);
        });
        if (!Number.isFinite(b.minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, length: 0, width: 0, height: 0 };
        b.length = b.maxX - b.minX;
        b.width = b.maxY - b.minY;
        b.height = b.maxZ - b.minZ;
        return b;
    }


    function evaluateTd053dState(s, geometryObject, options) {
        const analysis = geometryObject && geometryObject.deterministicAnalysis;
        const freeformState = (options && options.freeformState) || (s && (geometryObject && geometryObject.freeformStateRole === 'preview' ? s.freeformLoftPreview : s.freeformLoftActive || s.freeformLoft)) || (geometryObject && geometryObject.state) || {};
        if (root.FreeformFormFidelity && typeof root.FreeformFormFidelity.analyzeCobraFidelity === 'function') {
            const cobra = root.FreeformFormFidelity.analyzeCobraFidelity(freeformState, geometryObject, freeformState.analysisTargets || {});
            geometryObject.cobraFidelity = cobra;
            if (analysis) {
                analysis.cobraFidelity = cobra;
                analysis.cobraFormFidelityScore = cobra.cobraFormFidelityScore;
                analysis.formIntentStatus = cobra.status;
                if (cobra.status === 'FORM_INTENT_MISMATCH') {
                    analysis.warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
                    (cobra.blockers || cobra.reasons || ['FORM_INTENT_MISMATCH']).forEach(b => analysis.warnings.push('FORM_INTENT_MISMATCH: ' + b));
                }
            }
        }
        if (root.FreeformTargetCompliance && typeof root.FreeformTargetCompliance.evaluateTargetCompliance === 'function') {
            const targetCompliance = root.FreeformTargetCompliance.evaluateTargetCompliance(
                analysis || {},
                freeformState.targets || {},
                freeformState.analysisTargets || {}
            );
            geometryObject.targetCompliance = targetCompliance;
            if (analysis) {
                analysis.targetCompliance = targetCompliance;
                if (targetCompliance.overall === 'BLOCKER') {
                    analysis.status = 'TARGET_FAIL';
                    geometryObject.status = 'TARGET_FAIL';
                    analysis.warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
                    (targetCompliance.blockers || []).forEach(b => analysis.warnings.push('TARGET_FAIL: ' + b));
                }
            }
        }
        if (root.FreeformFeasibilitySolver && typeof root.FreeformFeasibilitySolver.analyzeFeasibility === 'function') {
            const feasibility = root.FreeformFeasibilitySolver.analyzeFeasibility(
                s || {},
                analysis || {},
                freeformState.targets || {},
                freeformState.analysisTargets || {}
            );
            geometryObject.freeformFeasibility = feasibility;
            geometryObject.feasibility = feasibility;
            if (analysis) {
                analysis.freeformFeasibility = feasibility;
                analysis.repairHints = feasibility.repairHints || [];
                if (/^INFEASIBLE/.test(String(feasibility.status))) {
                    analysis.status = 'INFEASIBLE';
                    geometryObject.status = 'INFEASIBLE';
                    analysis.warnings = Array.isArray(analysis.warnings) ? analysis.warnings : [];
                    analysis.warnings.push(feasibility.status + ': ' + feasibility.summary);
                }
            }
        }
        if (root.FreeformAcceptanceGates && typeof root.FreeformAcceptanceGates.evaluateAcceptance === 'function') {
            const acceptance = root.FreeformAcceptanceGates.evaluateAcceptance(geometryObject);
            geometryObject.freeformAcceptance = acceptance;
            if (analysis) analysis.freeformAcceptance = acceptance;
        }
        if (root.FreeformModeAudit && typeof root.FreeformModeAudit.auditGeometryMode === 'function') {
            const stateRole = geometryObject && geometryObject.freeformStateRole || 'active';
            const sourceRole = stateRole === 'preview' ? 'freeformLoftPreview' : 'freeformLoftKernel';
            const audit = root.FreeformModeAudit.auditGeometryMode(s, 'freeformLoftKernel', 'freeformLoftKernel', 'freeformPhysicalAnalysis', {
                stateRole: stateRole,
                stlSource: 'freeformLoftKernel',
                reportSubject: stateRole === 'preview' ? 'preview/quarantine freeform' : 'accepted active freeform'
            });
            audit.stateRole = stateRole;
            audit.stlSource = 'freeformLoftKernel';
            audit.reportSubject = stateRole === 'preview' ? 'preview/quarantine freeform' : 'accepted active freeform';
            audit.sourceState = sourceRole;
            geometryObject.geometryModeAudit = audit;
            s.geometryModeAudit = audit;
            if (analysis) analysis.geometryModeAudit = audit;
        }
        updateWorkbenchAnalysisPreviews(geometryObject);
        if (root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.syncFreeformUiFromCanonicalState === 'function') {
            root.FreeformLiveStateBinding.syncFreeformUiFromCanonicalState(s);
        }
        return geometryObject;
    }

    function updateWorkbenchAnalysisPreviews(geometryObject) {
        const analysisPreview = getAnalysisPreview();
        const cobraPreview = getCobraFidelityPreview();
        const exportPreview = getExportAuditPreview();
        const a = (geometryObject && (geometryObject.deterministicAnalysis || geometryObject.analysisInput && geometryObject.analysisInput.analysis)) || null;
        const cobra = (geometryObject && geometryObject.cobraFidelity) || (a && a.cobraFidelity) || null;
        const audit = (geometryObject && geometryObject.geometryModeAudit) || (a && a.geometryModeAudit) || null;
        const target = (geometryObject && geometryObject.targetCompliance) || (a && a.targetCompliance) || null;
        if (analysisPreview) {
            setTextIfPresent(analysisPreview, JSON.stringify({
                status: a && a.status || 'NO_ANALYSIS',
                massG: a && a.massG,
                bodyMassG: a && a.bodyMassG,
                effectiveMassVerticalG: a && a.effectiveMassVerticalG,
                effectiveMassHorizontalG: a && a.effectiveMassHorizontalG,
                cartridgeArmResonanceVerticalHz: a && a.cartridgeArmResonanceVerticalHz,
                cartridgeArmResonanceHorizontalHz: a && a.cartridgeArmResonanceHorizontalHz,
                COM: a && a.COM,
                COG: a && a.COG,
                inertiaTensorPivotGmm2: a && a.inertiaTensorPivotGmm2,
                counterweightBalanceResidualGmm: a && a.counterweightBalanceResidualGmm,
                targetCompliance: target,
                warnings: a && a.warnings
            }, null, 2));
        }
        if (cobraPreview) {
            setTextIfPresent(cobraPreview, JSON.stringify(cobra || { status: 'NO_COBRA_FIDELITY' }, null, 2));
        }
        if (exportPreview) {
            setTextIfPresent(exportPreview, JSON.stringify(audit || { status: 'NO_MODE_AUDIT' }, null, 2));
        }
    }

    function buildFreeformGeometry(appState, options) {
        const s = ensureState(appState);
        if (!root.FreeformLoftKernel || typeof root.FreeformLoftKernel.buildFreeformGeometry !== 'function') {
            return { ok: false, geometryMode: FREEFORM, error: 'FreeformLoftKernel.buildFreeformGeometry unavailable', warnings: ['freeform kernel unavailable'] };
        }
        const sourceRole = options && options.stateRole === 'preview' ? 'preview' : 'active';
        const freeformSource = (options && options.freeformState) || (sourceRole === 'preview' ? s.freeformLoftPreview : s.freeformLoftActive) || s.freeformLoft;
        if (sourceRole === 'active' && getGeometryMode(s) === FREEFORM && !s.freeformLoftActive) {
            return { ok: false, geometryMode: FREEFORM, error: 'ACCEPT_BLOCKED — reason: geometryMode=freeform but no freeformLoftActive exists.', warnings: ['missing accepted active freeform state'] };
        }
        const geometryObject = root.FreeformLoftKernel.buildFreeformGeometry(freeformSource, options || {});
        geometryObject.geometryMode = FREEFORM;
        geometryObject.freeformStateRole = (freeformSource && freeformSource.role) || (options && options.stateRole) || 'active';
        geometryObject.bbox = geometryObject.bbox || bboxFromVertices(geometryObject.mesh && geometryObject.mesh.vertices);
        if (root.FreeformPhysicalAnalysis && typeof root.FreeformPhysicalAnalysis.analyzeFreeformGeometry === 'function') {
            geometryObject.analysisInput = root.FreeformPhysicalAnalysis.analyzeFreeformGeometry(geometryObject, options || {});
            geometryObject.deterministicAnalysis = geometryObject.analysisInput.analysis;
            if (geometryObject.freeformStateRole === 'preview') s.freeformLastPreviewAnalysis = geometryObject.analysisInput;
            else s.freeformLastAcceptedAnalysis = geometryObject.analysisInput;
            s.freeformLastAnalysis = geometryObject.analysisInput;
        } else if (root.FreeformAnalysisAdapter && typeof root.FreeformAnalysisAdapter.makeAdapterInput === 'function') {
            geometryObject.analysisInput = root.FreeformAnalysisAdapter.makeAdapterInput(geometryObject);
            s.freeformLastAnalysis = geometryObject.analysisInput;
        }
        evaluateTd053dState(s, geometryObject, options || {});
        if (geometryObject.freeformStateRole === 'preview') root.LAST_FREEFORM_LOFT_PREVIEW_GEOMETRY = geometryObject;
        else root.LAST_FREEFORM_LOFT_GEOMETRY = geometryObject;
        syncAnalysisPanel(s);
        return geometryObject;
    }

    function buildPreviewFreeformGeometry(appState, previewState, options) {
        const s = ensureState(appState);
        const opts = Object.assign({}, options || {}, { freeformState: previewState || s.freeformLoftPreview, stateRole: 'preview' });
        return buildFreeformGeometry(s, opts);
    }

    function buildThreeBufferGeometryFromFreeformGeometry(geometryObject, three) {
        const THREE_REF = three || root.THREE;
        if (!THREE_REF || !THREE_REF.BufferGeometry || !THREE_REF.Float32BufferAttribute) {
            throw new Error('THREE.BufferGeometry unavailable for freeform render/export geometry.');
        }
        if (!geometryObject || !geometryObject.mesh || !Array.isArray(geometryObject.mesh.vertices) || !Array.isArray(geometryObject.mesh.faces)) {
            throw new Error('Missing freeform mesh for render/export geometry.');
        }
        const vertices = geometryObject.mesh.vertices;
        const faces = geometryObject.mesh.faces;
        const positions = [];
        faces.forEach(face => {
            const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
            if (!a || !b || !c) return;
            positions.push(finite(a.x, 0), finite(a.y, 0), finite(a.z, 0));
            positions.push(finite(b.x, 0), finite(b.y, 0), finite(b.z, 0));
            positions.push(finite(c.x, 0), finite(c.y, 0), finite(c.z, 0));
        });
        const geo = new THREE_REF.BufferGeometry();
        geo.setAttribute('position', new THREE_REF.Float32BufferAttribute(positions, 3));
        if (typeof geo.computeVertexNormals === 'function') geo.computeVertexNormals();
        geo.userData = Object.assign({}, geo.userData || {}, {
            geometryMode: FREEFORM,
            geometrySource: 'td053_freeform_physical_analysis_model',
            exportGeometrySource: 'td053_freeform_physical_analysis_model',
            renderGeometrySource: 'td053_freeform_physical_analysis_model',
            freeformStateSchema: geometryObject.state && geometryObject.state.schema,
            vertexCount: vertices.length,
            faceCount: faces.length,
            bbox: geometryObject.bbox || bboxFromVertices(vertices),
            freeformWarnings: geometryObject.warnings || []
        });
        return geo;
    }

    function buildCurrentThreeGeometry(three, appState, options) {
        const s = ensureState(appState);
        const opts = Object.assign({}, options || {}, { stateRole: 'active', freeformState: s.freeformLoftActive || (options && options.freeformState) });
        const go = buildFreeformGeometry(s, opts);
        if (go && go.error) throw new Error(go.error);
        const geometry = buildThreeBufferGeometryFromFreeformGeometry(go, three || root.THREE);
        geometry.userData = Object.assign({}, geometry.userData || {}, {
            geometryMode: 'freeform',
            sourceState: 'state.freeformLoftActive',
            source: 'freeformLoftActive',
            renderGeometrySource: 'freeformLoftKernel',
            exportGeometrySource: 'freeformLoftKernel',
            reportGeometrySource: 'freeformPhysicalAnalysis',
            stlSource: 'freeformLoftKernel',
            acceptedActiveRevision: s.freeformLoftActive && s.freeformLoftActive.revision || null
        });
        return geometry;
    }

    function exportFreeformMeshGeometry(three, appState, options) {
        const s = ensureState(appState);
        if (getGeometryMode(s) !== FREEFORM) {
            return { ok: false, error: 'EXPORT_BLOCKED — reason: geometryMode is not freeform; refusing to export freeform mesh.' };
        }
        if (!s.freeformLoftActive) {
            return { ok: false, error: 'EXPORT_BLOCKED — reason: no accepted active freeform geometry exists.' };
        }
        try {
            const geometry = buildCurrentThreeGeometry(three || root.THREE, s, Object.assign({}, options || {}, { stateRole: 'active', freeformState: s.freeformLoftActive }));
            geometry.userData = Object.assign({}, geometry.userData || {}, {
                geometryMode: 'freeform',
                source: 'freeformLoftActive',
                sourceState: 'state.freeformLoftActive',
                exportGeometrySource: 'freeformLoftKernel',
                stlSource: 'freeformLoftKernel',
                noParametricFallback: true,
                silentFallbackDetected: false
            });
            return { ok: true, geometry, source: 'freeformLoftActive', exportGeometrySource: 'freeformLoftKernel', stlSource: 'freeformLoftKernel', geometryMode: FREEFORM };
        } catch (err) {
            return { ok: false, error: err && err.message ? err.message : String(err) };
        }
    }

    function syncModeIndicator(appState) {
        const s = ensureState(appState);
        const el = root.document && root.document.getElementById('freeformGeometryModeIndicator');
        if (el) el.textContent = 'geometryMode: ' + getGeometryMode(s);
        const select = root.document && root.document.getElementById('freeformGeometryModeSelect');
        if (select && select.value !== getGeometryMode(s)) select.value = getGeometryMode(s);
    }

    function syncTabsFromState(appState) {
        if (!root.document) return;
        const s = ensureState(appState);
        const mode = getGeometryMode(s);
        const freeformPanel = root.document.getElementById('freeformLoftMainPanel');
        const freeformTab = root.document.getElementById('tabFreeformLoft');
        const paramTab = root.document.getElementById('tabParametricCobra');
        const analysisTab = root.document.getElementById('tabAnalysisExport');
        if (freeformPanel) freeformPanel.hidden = (mode !== FREEFORM);
        [[freeformTab, mode === FREEFORM], [paramTab, mode === PARAMETRIC], [analysisTab, false]].forEach(pair => {
            const btn = pair[0], active = pair[1];
            if (!btn) return;
            btn.classList.toggle('active', !!active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    function renderCenterlineEditor(s) {
        const host = root.document && root.document.getElementById('freeformCenterlineEditor');
        if (!host) return;
        const fl = getFreeformState(s);
        const points = (fl.centerline && fl.centerline.points) || [];
        const rows = points.map((p, i) => {
            const locked = !!p.locked;
            return '<tr data-centerline-point-id="' + String(p.id).replace(/"/g, '&quot;') + '">' +
                '<td>' + String(p.id || '') + '</td>' +
                '<td><input data-freeform-centerline-field="s" data-freeform-centerline-index="' + i + '" value="' + finite(p.s, 0) + '"' + (locked ? ' readonly aria-readonly="true"' : '') + '></td>' +
                '<td><input data-freeform-centerline-field="x" data-freeform-centerline-index="' + i + '" value="' + finite(p.x, 0) + '"' + (locked ? ' readonly aria-readonly="true"' : '') + '></td>' +
                '<td><input data-freeform-centerline-field="y" data-freeform-centerline-index="' + i + '" value="' + finite(p.y, 0) + '"' + (locked ? ' readonly aria-readonly="true"' : '') + '></td>' +
                '<td><input data-freeform-centerline-field="z" data-freeform-centerline-index="' + i + '" value="' + finite(p.z, 0) + '"' + (locked ? ' readonly aria-readonly="true"' : '') + '></td>' +
                '<td>' + (locked ? 'locked' : 'editable') + '</td></tr>';
        }).join('');
        host.innerHTML = '<table class="freeform-centerline-table"><thead><tr><th>id</th><th>s</th><th>x</th><th>y</th><th>z</th><th>locked</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<button id="freeformAddCenterlineStationBtn" type="button" data-freeform-action="add-centerline-station">Add allowed station</button> ' +
            '<button id="freeformRemoveCenterlineStationBtn" type="button" data-freeform-action="remove-centerline-station">Remove last allowed station</button>';
    }

    function renderRingEditor(s) {
        const host = root.document && root.document.getElementById('freeformRingEditor');
        if (!host) return;
        const fl = getFreeformState(s);
        const rings = fl.rings || [];
        const families = (root.FreeformRings && root.FreeformRings.shapeFamilies) || [];
        const familyOptions = families.map(f => '<option value="' + f + '">' + f + '</option>').join('');
        const rows = rings.map((r, i) => {
            const select = '<select data-freeform-ring-field="shapeFamily" data-freeform-ring-index="' + i + '">' + familyOptions.replace('value="' + r.shapeFamily + '"', 'value="' + r.shapeFamily + '" selected') + '</select>';
            const fields = ['s','widthMm','heightMm','wallThicknessMm','rotationDeg','tiltDeg','cornerSharpness','superellipseExponent','crescentCutDepth','bottomFlatness'];
            return '<tr data-ring-id="' + String(r.id || '').replace(/"/g, '&quot;') + '"><td>' + String(r.id || '') + '</td><td>' + select + '</td>' +
                fields.map(field => '<td><input data-freeform-ring-field="' + field + '" data-freeform-ring-index="' + i + '" value="' + finite(r[field], 0) + '"></td>').join('') + '</tr>';
        }).join('');
        host.innerHTML = '<table class="freeform-ring-table"><thead><tr><th>id</th><th>shapeFamily</th><th>s</th><th>widthMm</th><th>heightMm</th><th>wallThicknessMm</th><th>rotationDeg</th><th>tiltDeg</th><th>cornerSharpness</th><th>superellipseExponent</th><th>crescentCutDepth</th><th>bottomFlatness</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function renderFeatureEditor(s) {
        const host = root.document && root.document.getElementById('freeformFeatureEditor');
        if (!host) return;
        const fl = getFreeformState(s);
        const f = fl.features || {};
        const required = ['integratedHeadshell','sideBentHeadshellMount','titaniumMountPlate','cartridgeSlots','wireDuct','rearTerminal','counterweightStack'];
        host.innerHTML = '<table class="freeform-feature-table"><thead><tr><th>feature</th><th>enabled</th><th>status</th></tr></thead><tbody>' +
            required.map(name => {
                const feature = f[name] || {};
                const enabled = feature.enabled !== false;
                let status = 'metadata/editor scaffold';
                if (name === 'titaniumMountPlate') status = feature.type === 'structural_laminated_interface_plate' && feature.looseUndersidePlate === false ? 'TD051 structural laminated interface plate' : 'BLOCKER: titanium rule';
                if (name === 'counterweightStack') status = feature.separateFeature && !feature.fakeWithRingOrTail ? 'separate rear-terminal assembly' : 'BLOCKER: fake ring/tail relation';
                return '<tr data-feature-name="' + name + '"><td>' + name + '</td><td><input type="checkbox" data-freeform-feature-field="enabled" data-freeform-feature-name="' + name + '"' + (enabled ? ' checked' : '') + '></td><td>' + status + '</td></tr>';
            }).join('') + '</tbody></table>';
    }

    function renderEditorScaffolds(appState) {
        const s = ensureState(appState);
        renderCenterlineEditor(s);
        renderRingEditor(s);
        renderFeatureEditor(s);
    }

    function syncAnalysisPanel(appState) {
        const s = ensureState(appState);
        const el = root.document && root.document.getElementById('freeformAnalysisStatusPanel');
        const a = s.freeformLastAnalysis && (s.freeformLastAnalysis.analysis || s.freeformLastAnalysis);
        if (!a || !s.freeformLastAnalysis || s.freeformLastAnalysis.ok === false) {
            if (el) el.textContent = 'Analysis status: no valid freeform analysis yet.';
            updateWorkbenchAnalysisPreviews({ deterministicAnalysis: a || null });
            return;
        }
        const com = a.COM || {};
        const b = a.geometryFields && a.geometryFields.bounds;
        if (el) {
            el.textContent = 'Analysis status: ' + a.status + ' | mass ' + ((a.mass && a.mass.totalMassG) || a.massG) + ' g | COM x/y/z ' +
                [com.x, com.y, com.z].join('/') + ' mm | bbox x ' + (b ? b.minX + '..' + b.maxX : 'n/a') +
                ' | warnings: ' + ((a.warnings || []).join('; ') || 'none');
        }
        updateWorkbenchAnalysisPreviews({ deterministicAnalysis: a });
    }

    const STATUS_CODES = ['EMPTY','PARSING','PARSE_ERROR','VALIDATING','VALIDATING_SCHEMA','VALIDATION_PASS','VALIDATION_REJECTED','SCHEMA_VALID','APPLYING_PREVIEW','PREVIEW_READY','TARGET_CHECKING','TARGET_FAIL_PREVIEW_ONLY','FORM_INTENT_MISMATCH_PREVIEW_ONLY','ACCEPTED','ACCEPTED_ACTIVE','ACCEPT_BLOCKED','APPLY_PASS','APPLY_BLOCKED','APPLY_FAILED','FORM_INTENT_MISMATCH','TARGET_FAIL','REJECTED','INFEASIBLE','INFO'];

    function normalizeStatus(code) {
        return STATUS_CODES.indexOf(code) === -1 ? 'INFO' : code;
    }

    function setStatus(code, detail, errors) {
        const normalized = normalizeStatus(code);
        const text = detail === undefined ? String(code || '') : normalized + ': ' + String(detail || '');
        const el = root.document && root.document.getElementById('freeformStatusPanel');
        if (el) el.textContent = detail === undefined ? text : text;
        setWorkbenchStatus(normalized, detail === undefined ? text : detail, errors || []);
    }

    function getWorkbenchBackdrop() {
        return root.document && root.document.getElementById('freeformAiWorkbenchBackdrop');
    }

    function openWorkbench() {
        const bd = getWorkbenchBackdrop();
        if (!bd) return;
        bd.hidden = false;
        bd.setAttribute('aria-hidden', 'false');
        populateWorkbenchPrompt(root.state || {}, false);
        renderEditorScaffolds(root.state || {});
        syncAnalysisPanel(root.state || {});
        const prompt = root.document.getElementById('freeformWorkbenchPromptText');
        if (prompt && typeof prompt.focus === 'function') prompt.focus();
        setStatus('INFO', 'Freeform AI Workbench opened with auto-populated TD053D prompt.');
    }

    function closeWorkbench() {
        const bd = getWorkbenchBackdrop();
        if (!bd) return;
        bd.hidden = true;
        bd.setAttribute('aria-hidden', 'true');
        setStatus('INFO', 'Freeform AI Workbench closed.');
    }

    function getResponseEditor() {
        if (!root.document) return null;
        return root.document.getElementById('freeformWorkbenchResponseText') || root.document.getElementById('freeformResponseText');
    }

    function getLegacyResponseEditor() {
        return root.document && root.document.getElementById('freeformResponseText');
    }

    function getPromptEditor() {
        if (!root.document) return null;
        return root.document.getElementById('freeformWorkbenchPromptText') || root.document.getElementById('aiPromptText');
    }

    function getValidationPanel() {
        return root.document && root.document.getElementById('freeformWorkbenchValidationPanel');
    }

    function getAnalysisPreview() {
        return root.document && root.document.getElementById('freeformWorkbenchAnalysisPreview');
    }

    function getCobraFidelityPreview() {
        return root.document && root.document.getElementById('freeformWorkbenchCobraFidelityPreview');
    }

    function getExportAuditPreview() {
        return root.document && root.document.getElementById('freeformWorkbenchExportAuditPreview');
    }

    function setTextIfPresent(el, value) {
        if (el) el.textContent = value;
    }

    function firstErrorPath(errorText) {
        const m = String(errorText || '').match(/(\$[.\[][^\s:]*)/);
        return m ? m[1] : '$';
    }

    function firstErrorConstraint(errorText) {
        const s = String(errorText || '');
        const known = [
            'above schema maximum',
            'below schema minimum',
            'above schema maxLength',
            'below schema minLength',
            'additionalProperties:false',
            'must equal schema const',
            'must be finite number',
            'must be integer',
            'matches forbidden schema branch',
            'must match exactly one schema branch',
            'must be object',
            'must be array'
        ];
        for (let i = 0; i < known.length; i += 1) {
            if (s.indexOf(known[i]) !== -1) return known[i];
        }
        return s;
    }

    function formatValidationErrors(errors) {
        const list = Array.isArray(errors) ? errors : [];
        if (!list.length) return 'Validation passed. Payload may be applied.';
        const lines = ['Validation failed:', 'errorCount: ' + list.length];
        lines.push('firstPath: ' + firstErrorPath(list[0]));
        lines.push('firstConstraint: ' + firstErrorConstraint(list[0]));
        list.forEach((err, idx) => lines.push(String(idx + 1) + '. ' + err));
        lines.push('payload applicerades inte');
        return lines.join('\n');
    }

    function syncApplyStatePanel(appState) {
        if (!root.document) return;
        const s = ensureState(appState || root.state || {});
        const apply = s.freeformApplyState || {};
        const lastPreview = s.freeformLastPreviewAnalysis || {};
        const analysis = lastPreview.analysis || lastPreview.deterministicAnalysis || {};
        const setText = function(selector, text) {
            const el = root.document.querySelector(selector);
            if (el) el.textContent = text;
        };
        setText('[data-freeform-active-revision="true"]', 'Active design revision: ' + (s.freeformLoftActive && s.freeformLoftActive.revision || s.freeformAcceptedActiveRevision || 'none'));
        setText('[data-freeform-preview-revision="true"]', 'Preview design revision: ' + (s.freeformLoftPreview && s.freeformLoftPreview.revision || apply.previewRevision || 'none'));
        setText('[data-freeform-rejected-payload="true"]', 'Last rejected payload: ' + (s.freeformLoftRejected && (s.freeformLoftRejected.payloadSummary || s.freeformLoftRejected.revision) || 'none'));
        setText('[data-freeform-validation-state="true"]', 'Validation state: ' + (apply.schemaValid ? 'SCHEMA_VALID' : (apply.phase || 'EMPTY')));
        setText('[data-freeform-apply-state="true"]', 'Apply state: ' + (apply.phase || 'EMPTY'));
        setText('[data-freeform-target-state="true"]', 'Target compliance: ' + (apply.targetComplianceStatus || (analysis.targetCompliance && analysis.targetCompliance.status) || 'NOT_RUN'));
        setText('[data-freeform-cobra-state="true"]', 'Cobra fidelity: ' + (apply.formFidelityStatus || (analysis.cobraFidelity && analysis.cobraFidelity.status) || 'NOT_RUN'));
        setText('[data-freeform-infeasibility-state="true"]', 'Infeasibility: ' + ((analysis.freeformFeasibility && analysis.freeformFeasibility.status) || 'NOT_RUN'));
    }

    function setWorkbenchStatus(code, detail, errors) {
        if (!root.document) return;
        const normalized = normalizeStatus(code);
        const statusEl = root.document.getElementById('freeformWorkbenchStatus');
        if (statusEl) {
            statusEl.setAttribute('data-status', normalized);
            statusEl.textContent = 'STATUS: ' + normalized + (detail ? ' — ' + String(detail) : '');
        }
        syncApplyStatePanel(root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.getCanonicalAppState === 'function' ? root.FreeformLiveStateBinding.getCanonicalAppState() : (root.state || {}));
        const panel = getValidationPanel();
        if (panel && (normalized === 'VALIDATION_REJECTED' || normalized === 'APPLY_BLOCKED' || normalized === 'APPLY_FAILED' || normalized === 'FORM_INTENT_MISMATCH' || normalized === 'FORM_INTENT_MISMATCH_PREVIEW_ONLY' || normalized === 'TARGET_FAIL' || normalized === 'TARGET_FAIL_PREVIEW_ONLY' || normalized === 'INFEASIBLE' || normalized === 'VALIDATION_PASS' || normalized === 'SCHEMA_VALID' || normalized === 'PREVIEW_READY' || normalized === 'ACCEPTED_ACTIVE')) {
            panel.classList.remove('validation-pass', 'validation-error');
            if (normalized === 'VALIDATION_PASS' || normalized === 'SCHEMA_VALID' || normalized === 'PREVIEW_READY' || normalized === 'ACCEPTED_ACTIVE') {
                panel.classList.add('validation-pass');
                panel.textContent = formatValidationErrors([]);
            } else {
                panel.classList.add('validation-error');
                panel.textContent = formatValidationErrors(errors && errors.length ? errors : [String(detail || normalized)]);
            }
        }
    }

    function parseWorkbenchJson() {
        const editor = getResponseEditor();
        const raw = editor && editor.value ? editor.value : '';
        if (root.FreeformApplyStateMachine) root.FreeformApplyStateMachine.markParsing(root.state || {});
        setStatus('PARSING', 'Parsing Freeform AI response JSON.');
        try {
            return { ok: true, value: JSON.parse(raw || '{}') };
        } catch (err) {
            const errors = ['$.payload JSON parse error: ' + (err && err.message ? err.message : String(err))];
            if (root.FreeformApplyStateMachine) root.FreeformApplyStateMachine.markParseError(root.state || {}, errors);
            return { ok: false, errors };
        }
    }

    function validateWorkbenchJson() {
        const parsed = parseWorkbenchJson();
        if (!parsed.ok) {
            setStatus('APPLY_FAILED', 'Invalid JSON parse result.', parsed.errors);
            return parsed;
        }
        if (root.FreeformApplyStateMachine) root.FreeformApplyStateMachine.markSchemaValidation(root.state || {});
        setStatus('VALIDATING_SCHEMA', 'Validating against runtime JSON schema.');
        const validation = root.FreeformLoftKernel && typeof root.FreeformLoftKernel.validateResponse === 'function'
            ? root.FreeformLoftKernel.validateResponse(parsed.value)
            : { ok: false, errors: ['$.kernel FreeformLoftKernel.validateResponse is unavailable'] };
        if (!validation.ok) {
            if (root.FreeformApplyStateMachine) root.FreeformApplyStateMachine.markSchemaRejected(root.state || {}, parsed.value, validation.errors || []);
            setStatus('VALIDATION_REJECTED', 'Schema validation rejected payload; payload applicerades inte; active state unchanged.', validation.errors || []);
            return { ok: false, value: parsed.value, errors: validation.errors || [] };
        }
        if (root.FreeformApplyStateMachine) root.FreeformApplyStateMachine.markSchemaValid(root.state || {});
        setStatus('SCHEMA_VALID', 'Schema validation accepted payload; preview apply is available.');
        return { ok: true, value: parsed.value, errors: [] };
    }

    function buildTd053dPromptContext(s) {
        const state = ensureState(s);
        const fl = state.freeformLoftPreview || state.freeformLoftActive || getFreeformState(state);
        const base = root.FreeformLoftKernel && typeof root.FreeformLoftKernel.buildFreeformPrompt === 'function'
            ? root.FreeformLoftKernel.buildFreeformPrompt(fl, '')
            : 'FreeformLoftKernel.buildFreeformPrompt unavailable';
        const modeAudit = root.FreeformModeAudit && typeof root.FreeformModeAudit.auditGeometryMode === 'function'
            ? root.FreeformModeAudit.auditGeometryMode(state, 'freeformLoftKernel', 'freeformLoftKernel', 'freeformPhysicalAnalysis')
            : { status: 'NO_MODE_AUDIT' };
        const lastAnalysis = state.freeformLastPreviewAnalysis || state.freeformLastAcceptedAnalysis || state.freeformLastAnalysis || null;
        const lastA = lastAnalysis && (lastAnalysis.analysis || lastAnalysis.deterministicAnalysis) || {};
        const lastTarget = lastA && lastA.targetCompliance || (lastAnalysis && lastAnalysis.targetCompliance) || null;
        const lastCobra = lastA && lastA.cobraFidelity || (lastAnalysis && lastAnalysis.cobraFidelity) || null;
        const lastFeasibility = lastA && lastA.freeformFeasibility || (lastAnalysis && lastAnalysis.freeformFeasibility) || null;
        const repairHints = (lastFeasibility && lastFeasibility.repairHints) || (lastA && lastA.repairHints) || [];
        const promptHeader = {
            td: 'TD053E',
            geometryMode: state.geometryMode,
            activeVsPreviewState: {
                activeRevision: state.freeformLoftActive && state.freeformLoftActive.revision,
                previewRevision: state.freeformLoftPreview && state.freeformLoftPreview.revision,
                lastRejectedPayload: state.freeformLoftRejected && state.freeformLoftRejected.payloadSummary,
                applyPhase: state.freeformApplyState && state.freeformApplyState.phase
            },
            freeformPreset: fl && fl.preset,
            lastValidationStatus: state.freeformApplyState || null,
            lastTargetCompliance: lastTarget,
            lastCobraFidelity: lastCobra,
            lastRepairHints: repairHints,
            lastInfeasibilityClassification: lastFeasibility && (lastFeasibility.status || lastFeasibility.classification),
            material: 'CFRP/epoxy monocoque candidate unless user changes material context',
            cartridge: 'use current cartridge/compliance context from app state when available; otherwise state assumptions explicitly',
            compliance: {
                targetEffectiveMassVerticalG: fl && fl.targets && (fl.targets.effectiveMassVerticalG || fl.targets.effectiveMassG),
                targetEffectiveMassHorizontalG: fl && fl.targets && (fl.targets.effectiveMassHorizontalG || fl.targets.effectiveMassG),
                targetLfResonanceHz: fl && fl.targets && fl.targets.lfResonanceHz
            },
            physicalAnalysisPolicy: 'AI may propose designIntent, targets, assumptions, unsupportedAttributes and aiEstimates. App/kernel computes deterministicAnalysis, targetCompliance, Cobra fidelity, feasibility and export/report audit.',
            modeAudit
        };
        return 'TD053E FREEFORM AI REPAIR PROMPT — auto-populated on workbench open and after failed preview\n' +
            JSON.stringify(promptHeader, null, 2) +
            '\n\n' + base +
            '\n\nTD053D EXTRA CONTRACT / TD053E REPAIR CONTRACT:\n' +
            '- Do not simply produce another large Cobra-looking loft. Use repair hints or state unsupportedAttributes/infeasible.\n' +
            '- If targets are impossible in the writable field set/current solid-proxy kernel, return unsupportedAttributes and infeasible summary instead of bad geometry.\n' +
            '- Do not fabricate deterministicAnalysis, targetCompliance, cobraFidelity or feasibility; app/kernel owns those.\n' +
            '- TD053F live-state repair prompt feedback must include computed mass, effective mass, LF resonance, balance, target compliance and Cobra fidelity from last preview/accepted analysis where present.\n' +
            '- Cobra/CFRP/monocoque/wing-body designIntent must be represented by measurable geometry, especially low-long profile and rear terminal separation.\n' +
            '- Schema-valid payload becomes preview first. Target-failed or form-mismatch preview cannot become accepted active without explicit operator override.\n' +
            '- Keep long technical designIntent/assumptions unrestricted by arbitrary maxLength.\n' +
            '- Do not emit mesh/STL/OBJ/BREP vertices, faces or triangles.\n';
    }

    function populateWorkbenchPrompt(appState, copyToClipboard) {
        const s = ensureState(appState);
        applyCurrentEditorValues(s);
        const text = buildTd053dPromptContext(s);
        const promptEditor = getPromptEditor();
        if (promptEditor) promptEditor.value = text;
        const modalPrompt = root.document && root.document.getElementById('aiPromptText');
        if (modalPrompt) modalPrompt.value = text;
        if (copyToClipboard && root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(text).catch(function(){});
        return text;
    }

    function copyWorkbenchPrompt(appState) {
        const text = populateWorkbenchPrompt(appState, true);
        setStatus('VALIDATION_PASS', 'Copy Freeform AI Prompt: prompt field populated and clipboard copy requested; complete schema/contract embedded; long designIntent/assumptions/aiEstimates text allowed.');
        return text;
    }

    function applyWorkbenchJson(appState) {
        const s = ensureState(appState);
        const validated = validateWorkbenchJson();
        if (!validated.ok) {
            setStatus('APPLY_BLOCKED', 'Apply blocked by validation; payload applicerades inte; active design unchanged.', validated.errors || []);
            return { ok: false, errors: validated.errors || [], activeStateChanged: false };
        }
        try {
            if (root.FreeformApplyStateMachine) root.FreeformApplyStateMachine.beginPreview(s);
            setStatus('APPLYING_PREVIEW', 'Schema valid; applying response to preview/quarantine state only.');
            const activeBase = clone(getFreeformState(s));
            const result = root.FreeformLoftKernel.applyResponse(activeBase, validated.value);
            if (!result.ok) {
                setStatus('APPLY_BLOCKED', 'Preview apply blocked by runtime applyResponse guard; payload applicerades inte; active design unchanged.', result.errors || []);
                return Object.assign({}, result, { activeStateChanged: false });
            }
            const preview = setPreviewFreeformState(result.state, s);
            setGeometryMode(FREEFORM, s);
            const go = buildPreviewFreeformGeometry(s, preview, { stationCount: 18, segmentCount: 32, stateRole: 'preview' });
            updateWorkbenchAnalysisPreviews(go);
            if (root.FreeformApplyStateMachine) {
                root.FreeformApplyStateMachine.markPreview(s, preview, go.analysisInput || go);
                root.FreeformApplyStateMachine.classifyPreview(s, go);
            }
            const decision = root.FreeformAcceptanceGates && typeof root.FreeformAcceptanceGates.evaluateAcceptance === 'function'
                ? root.FreeformAcceptanceGates.evaluateAcceptance(go)
                : { acceptedActiveAllowed: true, blockers: [] };
            s.freeformLastPreviewAnalysis = go.analysisInput || go;
            s.freeformLastPreviewAnalysis.targetCompliance = go.targetCompliance;
            s.freeformLastPreviewAnalysis.cobraFidelity = go.cobraFidelity;
            s.freeformLastPreviewAnalysis.freeformFeasibility = go.freeformFeasibility;
            s.freeformLastPreviewAnalysis.freeformAcceptance = decision;
            const phase = s.freeformApplyState && s.freeformApplyState.phase;
            if (phase === 'TARGET_FAIL_PREVIEW_ONLY' || decision.targetComplianceStatus === 'TARGET_FAIL') {
                setStatus('TARGET_FAIL_PREVIEW_ONLY', 'Preview only — not accepted. Deterministic target compliance is BLOCKER/TARGET_FAIL; active design unchanged.', go.targetCompliance && go.targetCompliance.blockers || decision.blockers || []);
            } else if (phase === 'FORM_INTENT_MISMATCH_PREVIEW_ONLY' || decision.formFidelityStatus === 'FORM_INTENT_MISMATCH') {
                setStatus('FORM_INTENT_MISMATCH_PREVIEW_ONLY', 'Preview only — not accepted. Measured Cobra form fidelity does not match designIntent; active design unchanged.', go.cobraFidelity && (go.cobraFidelity.blockers || go.cobraFidelity.reasons) || decision.blockers || []);
            } else if (phase === 'INFEASIBLE' || /^INFEASIBLE/.test(String(decision.feasibilityStatus))) {
                setStatus('INFEASIBLE', 'Preview only — current targets are infeasible with current kernel/writable fields; active design unchanged.', go.freeformFeasibility && [go.freeformFeasibility.summary] || decision.blockers || []);
            } else {
                setStatus('PREVIEW_READY', 'Preview ready — not accepted active. Use Accept preview as active after reviewing target/form gates.');
            }
            const acceptBtn = root.document && root.document.getElementById('freeformAcceptPreviewBtn');
            if (acceptBtn) acceptBtn.disabled = !decision.acceptedActiveAllowed;
            if (typeof root.rebuild === 'function') root.rebuild();
            return { ok: true, state: preview, previewState: preview, geometryObject: go, activeStateChanged: false, previewStateChanged: true, acceptance: decision };
        } catch (err) {
            const errors = ['$.apply ' + (err && err.message ? err.message : String(err))];
            setStatus('APPLY_FAILED', 'Preview apply failed after validation; payload applicerades inte; active design unchanged.', errors);
            return { ok: false, errors, activeStateChanged: false };
        }
    }

    function acceptPreviewAsActive(appState, override) {
        const s = ensureState(appState);
        const go = s.freeformLastPreviewAnalysis || {};
        const decision = root.FreeformAcceptanceGates && typeof root.FreeformAcceptanceGates.evaluateAcceptance === 'function'
            ? root.FreeformAcceptanceGates.evaluateAcceptance(go)
            : { acceptedActiveAllowed: true, blockers: [] };
        if (root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.acceptFreeformPreviewAsActive === 'function') {
            const bound = root.FreeformLiveStateBinding.acceptFreeformPreviewAsActive({
                state: s,
                decision: decision,
                override: !!override,
                analysis: go
            });
            if (!bound.ok) {
                setStatus('ACCEPT_BLOCKED', bound.reason || 'Accept preview as active blocked; active design unchanged.', bound.errors || decision.blockers || []);
                return bound;
            }
            s.designLoaded = true;
            s.designSource = s.designSource || 'accepted_freeform_preview';
            if (root.DesignSession && typeof root.DesignSession.activate === 'function') root.DesignSession.activate(s.designSource);
            setGeometryMode(FREEFORM, s);
            updateWorkbenchAnalysisPreviews(root.LAST_FREEFORM_LOFT_PREVIEW_GEOMETRY || go);
            setStatus('ACCEPTED_ACTIVE', 'Preview accepted as active design; canonical live state, render/export/session/report sources are freeformLoftActive.');
            if (typeof root.rebuild === 'function') root.rebuild();
            return bound;
        }
        const accepted = root.FreeformApplyStateMachine
            ? root.FreeformApplyStateMachine.acceptPreviewAsActive(s, decision, !!override)
            : { ok: false, errors: ['FreeformApplyStateMachine unavailable'] };
        if (!accepted.ok) {
            setStatus('ACCEPT_BLOCKED', 'Accept preview as active blocked; target/form/feasibility gates require repair or explicit override.', accepted.errors || decision.blockers || []);
            return accepted;
        }
        setGeometryMode(FREEFORM, s);
        updateWorkbenchAnalysisPreviews(root.LAST_FREEFORM_LOFT_PREVIEW_GEOMETRY || go);
        setStatus('ACCEPTED_ACTIVE', 'Preview accepted as active design; geometryMode=freeform and active revision updated.');
        if (typeof root.rebuild === 'function') root.rebuild();
        return accepted;
    }

    function rejectPreview(appState) {
        const s = ensureState(appState);
        const rejected = root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.rejectFreeformPreview === 'function'
            ? root.FreeformLiveStateBinding.rejectFreeformPreview('operator rejected preview', s)
            : (root.FreeformApplyStateMachine ? root.FreeformApplyStateMachine.rejectPreview(s, 'operator rejected preview') : null);
        setStatus('REJECTED', 'Preview rejected; active design unchanged.');
        return rejected;
    }

    function applyCurrentEditorValues(appState) {
        const s = ensureState(appState);
        const fl = clone(getFreeformState(s));
        if (!root.document) return fl;
        Array.from(root.document.querySelectorAll('[data-freeform-centerline-field]')).forEach(input => {
            const idx = Number(input.getAttribute('data-freeform-centerline-index'));
            const field = input.getAttribute('data-freeform-centerline-field');
            const p = fl.centerline && fl.centerline.points && fl.centerline.points[idx];
            if (!p || p.locked) return;
            p[field] = finite(input.value, p[field]);
        });
        Array.from(root.document.querySelectorAll('[data-freeform-ring-field]')).forEach(input => {
            const idx = Number(input.getAttribute('data-freeform-ring-index'));
            const field = input.getAttribute('data-freeform-ring-field');
            const r = fl.rings && fl.rings[idx];
            if (!r) return;
            r[field] = field === 'shapeFamily' ? input.value : finite(input.value, r[field]);
        });
        Array.from(root.document.querySelectorAll('[data-freeform-feature-field="enabled"]')).forEach(input => {
            const name = input.getAttribute('data-freeform-feature-name');
            if (fl.features && fl.features[name]) fl.features[name].enabled = !!input.checked;
        });
        return setFreeformState(fl, s);
    }

    function installUI() {
        if (!root.document) return;
        const s = ensureState(root.FreeformLiveStateBinding && typeof root.FreeformLiveStateBinding.getCanonicalAppState === 'function' ? root.FreeformLiveStateBinding.getCanonicalAppState() : (root.state || {}));
        renderEditorScaffolds(s);
        syncTabsFromState(s);
        syncModeIndicator(s);
        const tabParametric = root.document.getElementById('tabParametricCobra');
        const tabFreeform = root.document.getElementById('tabFreeformLoft');
        const tabAnalysis = root.document.getElementById('tabAnalysisExport');
        const modeSelect = root.document.getElementById('freeformGeometryModeSelect');
        const presetSelect = root.document.getElementById('freeformPresetSelect');

        if (tabParametric) tabParametric.addEventListener('click', function() {
            setGeometryMode(PARAMETRIC, s);
            setStatus('Parametric / Cobra mode active.');
            if (typeof root.rebuild === 'function') root.rebuild();
        });
        if (tabFreeform) tabFreeform.addEventListener('click', function() {
            setGeometryMode(FREEFORM, s);
            renderEditorScaffolds(s);
            buildFreeformGeometry(s, { stationCount: 18, segmentCount: 32 });
            setStatus('AI Vibe 3D Freeform Loft active design mode selected. Freeform mesh export/render defaults to accepted active geometry; failed previews remain quarantined.');
            if (typeof root.rebuild === 'function') root.rebuild();
        });
        if (tabAnalysis) tabAnalysis.addEventListener('click', function() {
            setStatus('Analysis / Export tab selected; existing analysis/export panel remains in main UI. geometryMode=' + getGeometryMode(s));
        });
        if (modeSelect) modeSelect.addEventListener('change', function() {
            setGeometryMode(modeSelect.value, s);
            if (typeof root.rebuild === 'function') root.rebuild();
        });

        const applyPresetBtn = root.document.getElementById('freeformApplyPresetBtn');
        if (applyPresetBtn) applyPresetBtn.addEventListener('click', function() {
            const name = presetSelect ? presetSelect.value : 'long_low_cobra_monocoque';
            const next = root.FreeformLoftKernel.applyPreset(name);
            setFreeformState(next, s);
            setGeometryMode(FREEFORM, s);
            setStatus('Applied freeform preset: ' + name);
            if (typeof root.rebuild === 'function') root.rebuild();
        });

        const previewBtn = root.document.getElementById('freeformPreviewBtn');
        if (previewBtn) previewBtn.addEventListener('click', function() {
            applyCurrentEditorValues(s);
            setGeometryMode(FREEFORM, s);
            const go = buildFreeformGeometry(s, { stationCount: 18, segmentCount: 32 });
            setStatus('Preview built from accepted active freeform geometry: ' + (go.mesh ? go.mesh.vertices.length : 0) + ' vertices / ' + (go.mesh ? go.mesh.faces.length : 0) + ' faces.');
            if (typeof root.rebuild === 'function') root.rebuild();
        });

        const openWorkbenchBtn = root.document.getElementById('freeformOpenWorkbenchBtn');
        if (openWorkbenchBtn) openWorkbenchBtn.addEventListener('click', function() {
            openWorkbench();
        });

        const closeWorkbenchBtn = root.document.getElementById('freeformWorkbenchCloseBtn');
        if (closeWorkbenchBtn) closeWorkbenchBtn.addEventListener('click', function() {
            closeWorkbench();
        });

        const copyPromptBtn = root.document.getElementById('freeformCopyPromptBtn');
        if (copyPromptBtn) copyPromptBtn.addEventListener('click', function() {
            copyWorkbenchPrompt(s);
        });

        const validateResponseBtn = root.document.getElementById('freeformValidateResponseBtn');
        if (validateResponseBtn) validateResponseBtn.addEventListener('click', function() {
            validateWorkbenchJson();
        });

        const applyResponseBtn = root.document.getElementById('freeformApplyResponseBtn');
        if (applyResponseBtn) applyResponseBtn.addEventListener('click', function() {
            applyWorkbenchJson(s);
        });

        const acceptPreviewBtn = root.document.getElementById('freeformAcceptPreviewBtn');
        if (acceptPreviewBtn) acceptPreviewBtn.addEventListener('click', function() {
            acceptPreviewAsActive(s, false);
        });

        const rejectPreviewBtn = root.document.getElementById('freeformRejectPreviewBtn');
        if (rejectPreviewBtn) rejectPreviewBtn.addEventListener('click', function() {
            rejectPreview(s);
        });

        const copyRepairPromptBtn = root.document.getElementById('freeformCopyRepairPromptBtn');
        if (copyRepairPromptBtn) copyRepairPromptBtn.addEventListener('click', function() {
            copyWorkbenchPrompt(s);
        });

        const clearResponseBtn = root.document.getElementById('freeformClearResponseBtn');
        if (clearResponseBtn) clearResponseBtn.addEventListener('click', function() {
            const editor = getResponseEditor();
            const legacy = getLegacyResponseEditor();
            if (editor) editor.value = '';
            if (legacy) legacy.value = '';
            setStatus('INFO', 'Freeform AI response JSON cleared.');
            const panel = getValidationPanel();
            if (panel) {
                panel.classList.remove('validation-pass', 'validation-error');
                panel.textContent = 'No validation run yet.';
            }
        });

        const responseEditor = root.document.getElementById('freeformWorkbenchResponseText');
        const legacyResponseEditor = getLegacyResponseEditor();
        if (responseEditor && legacyResponseEditor && responseEditor !== legacyResponseEditor) {
            responseEditor.addEventListener('input', function() {
                legacyResponseEditor.value = responseEditor.value;
            });
        }
    }

    root.FreeformRuntimeIntegration = Object.freeze({
        geometryModes: MODE_VALUES.slice(),
        ensureState,
        getGeometryMode,
        setGeometryMode,
        getFreeformState,
        setFreeformState,
        setPreviewFreeformState,
        buildFreeformGeometry,
        buildPreviewFreeformGeometry,
        buildThreeBufferGeometryFromFreeformGeometry,
        buildCurrentThreeGeometry,
        exportFreeformMeshGeometry,
        renderEditorScaffolds,
        syncTabsFromState,
        syncModeIndicator,
        syncAnalysisPanel,
        syncApplyStatePanel,
        openWorkbench,
        closeWorkbench,
        validateWorkbenchJson,
        applyWorkbenchJson,
        acceptPreviewAsActive,
        rejectPreview,
        copyWorkbenchPrompt,
        populateWorkbenchPrompt,
        updateWorkbenchAnalysisPreviews,
        setStatus
    });

    if (root.document) {
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', installUI);
        else installUI();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
