// Engångsberäkning av Engrove Alien LT-defaulttabeller ur slutrapportens data.
// Källor (Verified ur Engrove_Alien_LT_3D_object_slutrapport §7, §8, §10, §11):
//   zTop/L, zBottom/L-splines; W/L-spline; nTop/nBottom-tabell;
//   svanhals: z = pivot_center_z − swan_drop·smootherstep((u−1)/0.25), swan_drop 0.055–0.075L.
// Assumed: swan_drop = 0.065L (mittband), terminal lob-höjd 0.030L vid u=1.25.
// Formmappning (invers av section.ts): crown=1, corner=(nTop−2)/3, belly=(nBottom/nTop−1)/1.5.

function naturalCubic(xs, ys) {
  const n = xs.length;
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const a = new Array(n).fill(0), b = new Array(n).fill(0), c = new Array(n).fill(0), d = new Array(n).fill(0);
  b[0] = 1; b[n - 1] = 1;
  for (let i = 1; i < n - 1; i++) {
    a[i] = h[i - 1]; b[i] = 2 * (h[i - 1] + h[i]); c[i] = h[i];
    d[i] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
  }
  const cp = [], dp = [];
  cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    cp[i] = c[i] / m; dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
  }
  const M = new Array(n);
  M[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) M[i] = dp[i] - cp[i] * M[i + 1];
  return (x) => {
    if (x <= xs[0]) {
      const t0 = (ys[1] - ys[0]) / h[0] - (h[0] / 6) * (2 * M[0] + M[1]);
      return ys[0] + t0 * (x - xs[0]);
    }
    if (x >= xs[n - 1]) {
      const tn = (ys[n - 1] - ys[n - 2]) / h[n - 2] + (h[n - 2] / 6) * (M[n - 2] + 2 * M[n - 1]);
      return ys[n - 1] + tn * (x - xs[n - 1]);
    }
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = x - xs[i], hi = h[i];
    return (M[i] * (xs[i + 1] - x) ** 3) / (6 * hi) + (M[i + 1] * t ** 3) / (6 * hi) +
      (ys[i] / hi - (M[i] * hi) / 6) * (xs[i + 1] - x) + (ys[i + 1] / hi - (M[i + 1] * hi) / 6) * t;
  };
}
const smootherstep = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * x * (x * (x * 6 - 15) + 10); };

// --- Verified källtabeller (relativa L) ---
const ZTOP = [[-0.05, 0.018], [0.00, 0.026], [0.04, 0.036], [0.10, 0.046], [0.25, 0.056], [0.45, 0.060], [0.65, 0.057], [0.85, 0.050], [1.00, 0.044]];
const ZBOT = [[-0.05, 0.004], [0.00, -0.006], [0.04, -0.020], [0.10, -0.004], [0.25, 0.000], [0.45, 0.001], [0.65, 0.001], [0.85, 0.000], [1.00, -0.002]];
const WIDTH = [[-0.05, 0.038], [0.00, 0.050], [0.08, 0.065], [0.20, 0.080], [0.38, 0.090], [0.55, 0.088], [0.72, 0.078], [0.88, 0.058], [1.00, 0.040], [1.10, 0.065], [1.18, 0.088], [1.25, 0.060]];
const NTOP = [[0.05, 2.6], [0.45, 2.8], [0.88, 3.0], [1.08, 3.0], [1.18, 3.2]];
const NBOT = [[0.05, 5.2], [0.45, 6.0], [0.88, 6.2], [1.08, 5.0], [1.18, 3.8]];
const SECTION_H = [[0.05, 0.054], [0.45, 0.060], [0.88, 0.050], [1.08, 0.058], [1.18, 0.072]]; // H/L ur §10
const L = 237.1;          // Verified: L2N ur TD028-modal
const SWAN_DROP = 0.065;  // Assumed: mittband 0.055–0.075
const H_1_25 = 0.030;     // Assumed: rundad lobe-closure

const zTop = naturalCubic(ZTOP.map(p => p[0]), ZTOP.map(p => p[1]));
const zBot = naturalCubic(ZBOT.map(p => p[0]), ZBOT.map(p => p[1]));
const nTopF = naturalCubic(NTOP.map(p => p[0]), NTOP.map(p => p[1]));
const nBotF = naturalCubic(NBOT.map(p => p[0]), NBOT.map(p => p[1]));
const hRear = naturalCubic(SECTION_H.map(p => p[0]), SECTION_H.map(p => p[1]));

const pivotCenter = (zTop(1.0) + zBot(1.0)) / 2;
console.log(`pivot_center_z/L = ${pivotCenter.toFixed(5)}`);

// Spine: fram t.o.m. u=1.00 direkt ur källtabellerna; bakom pivoten härledd:
// center(u) = pivotCenter − SWAN_DROP·S((u−1)/0.25); H(u) ur §10-tabellen (1.25: Assumed).
const rearU = [1.08, 1.18, 1.25];
const spine = { dorsal: [], ventral: [] };
for (const [u, z] of ZTOP) spine.dorsal.push([u, +(z * L).toFixed(3)]);
for (const [u, z] of ZBOT) spine.ventral.push([u, +(z * L).toFixed(3)]);
for (const u of rearU) {
  const c = pivotCenter - SWAN_DROP * smootherstep((u - 1.0) / 0.25);
  const H = u === 1.25 ? H_1_25 : hRear(u);
  spine.dorsal.push([u, +((c + H / 2) * L).toFixed(3)]);
  spine.ventral.push([u, +((c - H / 2) * L).toFixed(3)]);
}
console.log("dorsal:", JSON.stringify(spine.dorsal));
console.log("ventral:", JSON.stringify(spine.ventral));

// Stationer vid bredd-knutarna: width_mm exakt; height = spine-höjd där (seed);
// corner/belly ur inverterad mappning av interpolerade nTop/nBottom (clamp till schema).
const dorsalF = naturalCubic(spine.dorsal.map(p => p[0]), spine.dorsal.map(p => p[1]));
const ventralF = naturalCubic(spine.ventral.map(p => p[0]), spine.ventral.map(p => p[1]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const stations = WIDTH.map(([u, w]) => {
  const nT = clamp(nTopF(u), 2.0, 5.0);   // schema: corner ⇒ nBase ∈ [2,5]
  const nB = clamp(nBotF(u), nT, 12);
  const corner = +(((nT - 2) / 3)).toFixed(4);
  const belly = +clamp((nB / nT - 1) / 1.5, 0, 1).toFixed(4);
  const h = +(dorsalF(u) - ventralF(u)).toFixed(3);
  return { x_norm: u, width_mm: +(w * L).toFixed(3), height_mm: h, crownFactor: 1.0, bellyRelief: belly, cornerFairness: corner };
});
console.log("stations:", JSON.stringify(stations, null, 1));

// Sanity: verifiera nUpper/nLower-återgivning vid §10-knutarna via mappningen
for (const [u, nt] of NTOP) {
  const st = { c: clamp(nTopF(u), 2, 5), b: clamp((clamp(nBotF(u), 2, 12) / clamp(nTopF(u), 2, 5) - 1) / 1.5, 0, 1) };
  const nBase = st.c; // corner ⇒ nBase = nT; crown=1 ⇒ nUpper = nBase
  const nLower = nBase * (1 + 1.5 * st.b);
  console.log(`u=${u}: nUpper=${nBase.toFixed(2)} (mål ${nt}), nLower=${nLower.toFixed(2)} (mål ${nBotF(u).toFixed(2)})`);
}
console.log(`H_max/L kontroll: max=${Math.max(...ZTOP.map(([u]) => zTop(u) - zBot(u))).toFixed(4)} (avvisa > 0.070)`);
console.log(`bbox X: ${(-0.05 * L).toFixed(1)} .. ${(1.25 * L).toFixed(1)} mm (fysisk längd ${(1.30 * L).toFixed(1)} mm)`);
