/**
 * Three.js-viewport (CP8). Renderar preview-mesharna från geometrimotorn.
 * Vylägen: del (features skurna), plugg (OML+boss), skal-snitt (klippplan i X),
 * trådnät. Stationsmarkörer ritas ur samma sektionsmatematik som motorn
 * (sectionPoints3D) — samma sanningskälla, ingen OCCT-koppling i UI-lagret.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CobraParams, TriMesh } from "../core/types.js";
import { SectionField, sectionPoints3D } from "../core/geometry/section.js";

export type ViewMode = "part" | "plug" | "shell" | "wire";

export class Viewport {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private partMesh: THREE.Mesh | null = null;
  private plugMesh: THREE.Mesh | null = null;
  private shellMesh: THREE.Mesh | null = null;
  private stationGroup = new THREE.Group();
  private clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 120);
  private mode: ViewMode = "part";
  private stationsVisible = true;
  private clipX = 0.6;
  /** Fysisk främre X (mm) — noseExtent·L; uppdateras i setStations. */
  private noseX = -11.9;
  /** Fysisk bakre X (mm) — rearExtent·L. */
  private rearX = 296.4;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0x14181c, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);
    this.camera.position.set(230, -330, 210);
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(140, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;

    const hemi = new THREE.HemisphereLight(0xcfd8e0, 0x22282e, 0.9);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(180, -240, 320);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x58a6c8, 0.35);
    rim.position.set(-160, 200, -80);
    this.scene.add(rim);

    const grid = new THREE.GridHelper(600, 30, 0x2a333c, 0x1e252c);
    grid.rotation.x = Math.PI / 2; // XY-plan, Z upp
    grid.position.set(140, 0, -35);
    this.scene.add(grid);
    const axes = new THREE.AxesHelper(30);
    axes.position.set(-20, -35, -35);
    this.scene.add(axes);

    this.scene.add(this.stationGroup);

    const resize = (): void => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      // updateStyle=true (default): sätter BÅDE canvas.style.width/height (CSS-
      // layoutstorlek = containerns storlek) OCH pixelbufferten (skalad med
      // devicePixelRatio för skärpa). Att skicka false här (tidigare bugg) gjorde
      // att canvasen föll tillbaka på sina width/height-ATTRIBUT som layoutstorlek
      // — dvs devicePixelRatio gånger för stor på all skalad Windows-skärm — och
      // målade sig över högerpanelen. Bekräftat empiriskt: vid DPR 1.5 blev
      // canvasen 630 px bredare än sin container.
      this.renderer.setSize(w, h);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(container);
    resize();

    const loop = (): void => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  private toGeometry(mesh: TriMesh): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeVertexNormals();
    return g;
  }

  private disposeMesh(m: THREE.Mesh | null): void {
    if (!m) return;
    this.scene.remove(m);
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }

  setMeshes(part: TriMesh, plug: TriMesh, shell: TriMesh | null): void {
    this.disposeMesh(this.partMesh);
    this.disposeMesh(this.plugMesh);
    this.disposeMesh(this.shellMesh);

    const solidMat = (): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color: 0xb9c4cc, metalness: 0.15, roughness: 0.55, side: THREE.DoubleSide });

    this.partMesh = new THREE.Mesh(this.toGeometry(part), solidMat());
    this.plugMesh = new THREE.Mesh(this.toGeometry(plug), solidMat());
    this.shellMesh = shell
      ? new THREE.Mesh(
          this.toGeometry(shell),
          new THREE.MeshStandardMaterial({
            color: 0x9fb6c4,
            metalness: 0.1,
            roughness: 0.5,
            side: THREE.DoubleSide,
            clippingPlanes: [this.clipPlane],
          }),
        )
      : null;

    this.scene.add(this.partMesh, this.plugMesh);
    if (this.shellMesh) this.scene.add(this.shellMesh);
    this.applyMode();
  }

  /** Tomt startläge: dölj all geometri (ingen defaultform visas). */
  clear(): void {
    this.disposeMesh(this.partMesh);
    this.disposeMesh(this.plugMesh);
    this.disposeMesh(this.shellMesh);
    this.partMesh = this.plugMesh = this.shellMesh = null;
    for (const child of this.stationGroup.children) (child as THREE.LineLoop).geometry.dispose();
    this.stationGroup.clear();
  }

  setStations(params: CobraParams): void {
    const L = params.globalDimensions.functionalLength_mm;
    this.noseX = params.globalDimensions.noseExtent_norm * L;
    this.rearX = params.globalDimensions.rearExtent_norm * L;
    for (const child of this.stationGroup.children) {
      (child as THREE.LineLoop).geometry.dispose();
    }
    this.stationGroup.clear();
    const field = new SectionField(params);
    const mat = new THREE.LineBasicMaterial({ color: 0x58a6c8, transparent: true, opacity: 0.85 });
    for (const st of params.stations) {
      const pts = sectionPoints3D(field.sampleAt(st.x_norm), 64);
      if (!pts) continue;
      const g = new THREE.BufferGeometry().setFromPoints(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      this.stationGroup.add(new THREE.LineLoop(g, mat));
    }
    this.stationGroup.visible = this.stationsVisible;
    this.updateClip();
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.applyMode();
  }

  setStationsVisible(v: boolean): void {
    this.stationsVisible = v;
    this.stationGroup.visible = v;
  }

  setClipFraction(f: number): void {
    this.clipX = f;
    this.updateClip();
  }

  private updateClip(): void {
    // Plan: n=(−1,0,0), konstant = cutX ⇒ behåller x ≤ cutX. Interpolera över
    // det fysiska X-spannet [noseX, rearX] (Alien LT: ca −11.9 … 296.4 mm).
    this.clipPlane.constant = this.noseX + this.clipX * (this.rearX - this.noseX);
  }

  private applyMode(): void {
    const wire = this.mode === "wire";
    if (this.partMesh) {
      this.partMesh.visible = this.mode === "part" || wire;
      (this.partMesh.material as THREE.MeshStandardMaterial).wireframe = wire;
    }
    if (this.plugMesh) this.plugMesh.visible = this.mode === "plug";
    if (this.shellMesh) this.shellMesh.visible = this.mode === "shell";
  }
}
