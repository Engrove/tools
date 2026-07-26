// SPDX-License-Identifier: 0BSD
/**
 * AI-CODING NOTE:
 * Responsibility: Show the pattern mesh, the pull direction and the parting line in one orbiting 3D view.
 * Inputs: A kernel mesh, the release audit result, and the chosen pull axis.
 * Outputs: Rendered canvas only; it never derives or alters geometry.
 * Safe edits: Materials, lighting, camera framing and overlays.
 * Do not: Compute pattern geometry here, or export from a renderer object rather than the kernel mesh.
 * Verification: test/workflow-browser-smoke.mjs
 */
(function(root) {
    'use strict';

    const AXIS_DIRECTION = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

    function createViewer(container) {
        if (!root.THREE) throw new Error('Three.js is unavailable; the 3D view cannot start.');
        const THREE = root.THREE;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x14171c);

        const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 4000);
        camera.up.set(0, 0, 1);

        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
        container.appendChild(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        scene.add(new THREE.HemisphereLight(0xffffff, 0x30343c, 0.85));
        const key = new THREE.DirectionalLight(0xffffff, 0.65);
        key.position.set(120, 140, 220);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x9fc4ff, 0.4);
        fill.position.set(-140, -90, -60);
        scene.add(fill);

        const patternMaterial = new THREE.MeshStandardMaterial({ color: 0xc8d4e4, roughness: 0.55, metalness: 0.05, flatShading: false });
        const group = new THREE.Group();
        scene.add(group);

        let disposables = [];
        let framedRadius = 100;
        let framedCenter = new THREE.Vector3();

        function clearGroup() {
            disposables.forEach(item => item.dispose());
            disposables = [];
            group.clear();
        }

        function bufferFrom(mesh) {
            const positions = new Float32Array(mesh.faces.length * 9);
            let cursor = 0;
            for (let index = 0; index < mesh.faces.length; index++) {
                const face = mesh.faces[index];
                for (let corner = 0; corner < 3; corner++) {
                    const vertex = mesh.vertices[face[corner]];
                    positions[cursor++] = vertex.x;
                    positions[cursor++] = vertex.y;
                    positions[cursor++] = vertex.z;
                }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.computeVertexNormals();
            geometry.computeBoundingSphere();
            disposables.push(geometry);
            return geometry;
        }

        /**
         * The release audit reports the parting line as station/width/pull triples plus the axis each of
         * those refers to. Both silhouette edges are drawn, because a two-part mould's parting board has to
         * reach every one of these points on both sides of the pattern.
         */
        function addPartingLine(stations, color) {
            if (!Array.isArray(stations) || stations.length < 2) return;
            const place = (station, widthValue, pullValue) => {
                const point = new THREE.Vector3();
                point[station.stationAxis] = station.stationMm;
                point[station.widthAxis] = widthValue;
                point[station.pullAxis] = pullValue;
                return point;
            };
            const material = new THREE.LineBasicMaterial({ color });
            disposables.push(material);
            [
                stations.map(station => place(station, station.minMm, station.pullAtMinMm)),
                stations.map(station => place(station, station.maxMm, station.pullAtMaxMm))
            ].forEach(points => {
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                disposables.push(geometry);
                group.add(new THREE.Line(geometry, material));
            });
        }

        function addPullArrow(axis, radius) {
            const direction = AXIS_DIRECTION[axis] || AXIS_DIRECTION.Z;
            const vector = new THREE.Vector3(direction[0], direction[1], direction[2]);
            const origin = framedCenter.clone().addScaledVector(vector, radius * 0.9);
            const arrow = new THREE.ArrowHelper(vector, origin, radius * 0.55, 0x4fd1a5, radius * 0.12, radius * 0.06);
            group.add(arrow);
        }

        /**
         * Marks the sampled rays where the release audit found the pattern locking the mould. The audit
         * reports ray positions, not face indices, so these are drawn as markers spanning the pull axis
         * rather than as a recoloured surface: claiming to highlight the offending face would overstate
         * what the check actually measured.
         */
        function addUndercutMarkers(samples, axis, radius) {
            if (!Array.isArray(samples) || !samples.length) return;
            const keys = { X: ['y', 'z', 'x'], Y: ['x', 'z', 'y'], Z: ['x', 'y', 'z'] }[axis] || ['x', 'y', 'z'];
            const material = new THREE.LineBasicMaterial({ color: 0xff6b6b });
            disposables.push(material);
            samples.forEach(sample => {
                const low = new THREE.Vector3(), high = new THREE.Vector3();
                low[keys[0]] = high[keys[0]] = Number(sample[keys[0]]);
                low[keys[1]] = high[keys[1]] = Number(sample[keys[1]]);
                low[keys[2]] = framedCenter[keys[2]] - radius;
                high[keys[2]] = framedCenter[keys[2]] + radius;
                if (!Number.isFinite(low[keys[0]]) || !Number.isFinite(low[keys[1]])) return;
                const geometry = new THREE.BufferGeometry().setFromPoints([low, high]);
                disposables.push(geometry);
                group.add(new THREE.Line(geometry, material));
            });
        }

        /** Draws the pattern exactly as the exporter will write it, plus the release overlays. */
        function show(mesh, options) {
            const settings = options || {};
            clearGroup();
            if (!mesh || !mesh.faces || !mesh.faces.length) {
                render();
                return;
            }
            group.add(new THREE.Mesh(bufferFrom(mesh), patternMaterial));

            const box = new THREE.Box3().setFromObject(group);
            framedCenter = box.getCenter(new THREE.Vector3());
            framedRadius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 1);

            if (settings.partingLine) addPartingLine(settings.partingLine, 0xffd166);
            if (settings.pullAxis) {
                addPullArrow(settings.pullAxis, framedRadius);
                addUndercutMarkers(settings.undercutSamples, settings.pullAxis, framedRadius);
            }
            if (settings.frame !== false) frame('iso');
            render();
        }

        function frame(view) {
            const distance = framedRadius * 2.6;
            const positions = {
                iso: [0.85, -0.9, 0.6],
                top: [0, 0, 1],
                side: [0, -1, 0],
                front: [1, 0, 0]
            };
            const chosen = positions[view] || positions.iso;
            const offset = new THREE.Vector3(chosen[0], chosen[1], chosen[2]).normalize().multiplyScalar(distance);
            camera.position.copy(framedCenter).add(offset);
            // A camera looking straight down its own up vector has no defined orientation, so the top view
            // is given an explicit one rather than being left to a degenerate cross product.
            camera.up.set(view === 'top' ? 1 : 0, 0, view === 'top' ? 0 : 1);
            controls.target.copy(framedCenter);
            controls.update();
            render();
        }

        function resize() {
            const width = container.clientWidth || 1;
            const height = container.clientHeight || 1;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            render();
        }

        function render() {
            renderer.render(scene, camera);
        }

        controls.addEventListener('change', render);
        resize();
        (function loop() {
            root.requestAnimationFrame(loop);
            if (controls.enableDamping) {
                controls.update();
                render();
            }
        })();

        return { show, frame, resize, render, domElement: renderer.domElement };
    }

    root.PatternViewer = Object.freeze({ createViewer, AXIS_DIRECTION });
})(typeof globalThis !== 'undefined' ? globalThis : window);
