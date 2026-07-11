/**
 * Deterministisk interpolationsmatematik. Ingen OCCT-koppling — ren, testbar TS.
 *
 * 1) Naturlig kubisk spline (C2) för styrkurvor och stationsparametrar längs x.
 * 2) Cyklisk tridiagonal lösare: exakta poler för en UNIFORM PERIODISK kubisk B-spline
 *    som INTERPOLERAR givna punkter. Uniform periodisk kubik uppfyller
 *    C(knot_i) = (P_{i-1} + 4·P_i + P_{i+1}) / 6  ⇒  lös cykliskt system för P.
 *    Detta ger dimensionsexakta sektioner (bredd/höjd träffas exakt vid axlarna).
 * 3) smootherstep (C2-kontinuerlig ramp) för offsetböj och förstärkningszoner.
 */

export interface CubicSpline {
  at(x: number): number;
}

/** Naturlig kubisk spline genom (xs, ys). xs strikt stigande. Utanför intervallet: linjär extrapolation av ändtangent. */
export function naturalCubic(xs: number[], ys: number[]): CubicSpline {
  const n = xs.length;
  if (n !== ys.length || n < 2) throw new Error(`naturalCubic: kräver n≥2 lika långa vektorer (fick ${n}/${ys.length})`);
  for (let i = 1; i < n; i++) if (!(xs[i] > xs[i - 1])) throw new Error(`naturalCubic: xs ej strikt stigande vid index ${i}`);
  if (n === 2) {
    const k = (ys[1] - ys[0]) / (xs[1] - xs[0]);
    return { at: (x) => ys[0] + k * (x - xs[0]) };
  }
  // Andraderivator M via tridiagonalt system (Thomas), naturliga randvillkor M0=Mn-1=0.
  const h = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i++) h[i] = xs[i + 1] - xs[i];
  const a = new Array<number>(n).fill(0);
  const b = new Array<number>(n).fill(0);
  const c = new Array<number>(n).fill(0);
  const d = new Array<number>(n).fill(0);
  b[0] = 1; b[n - 1] = 1;
  for (let i = 1; i < n - 1; i++) {
    a[i] = h[i - 1];
    b[i] = 2 * (h[i - 1] + h[i]);
    c[i] = h[i];
    d[i] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
  }
  const M = thomas(a, b, c, d);
  return {
    at(x: number): number {
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
      const t = x - xs[i];
      const hi = h[i];
      return (
        (M[i] * Math.pow(xs[i + 1] - x, 3)) / (6 * hi) +
        (M[i + 1] * Math.pow(t, 3)) / (6 * hi) +
        (ys[i] / hi - (M[i] * hi) / 6) * (xs[i + 1] - x) +
        (ys[i + 1] / hi - (M[i + 1] * hi) / 6) * t
      );
    },
  };
}

/** Thomas-algoritm för tridiagonalt system a·x_{i-1}+b·x_i+c·x_{i+1}=d. */
function thomas(a: number[], b: number[], c: number[], d: number[]): number[] {
  const n = b.length;
  const cp = new Array<number>(n);
  const dp = new Array<number>(n);
  cp[0] = c[0] / b[0];
  dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    cp[i] = c[i] / m;
    dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
  }
  const x = new Array<number>(n);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

/**
 * Cyklisk tridiagonal lösning (Sherman–Morrison) av (1/6)(P_{i-1}+4P_i+P_{i+1}) = Q_i.
 * Systemet är strikt diagonaldominant (4 > 1+1) ⇒ välkonditionerat och entydigt.
 * Returnerar poler P (samma längd som Q) för exakt interpolation.
 */
export function periodicCubicPoles(q: number[]): number[] {
  const n = q.length;
  if (n < 3) throw new Error(`periodicCubicPoles: kräver n≥3 (fick ${n})`);
  const rhs = q.map((v) => 6 * v);
  // Cykliskt system: diag=4, off=1, hörn=1. Sherman–Morrison med u=(γ,0,…,0,α), v=(1,0,…,0,β/γ? )
  // Standardform: A' = A − u·vᵀ där A' är rent tridiagonal.
  const alpha = 1, beta = 1; // hörnelement A[0][n-1]=beta, A[n-1][0]=alpha
  const gamma = -4; // fritt val ≠ 0
  const b = new Array<number>(n).fill(4);
  b[0] = 4 - gamma;
  b[n - 1] = 4 - (alpha * beta) / gamma;
  const a = new Array<number>(n).fill(1);
  const c = new Array<number>(n).fill(1);
  a[0] = 0;
  c[n - 1] = 0;
  const y = thomas(a.slice(), b.slice(), c.slice(), rhs.slice());
  const u = new Array<number>(n).fill(0);
  u[0] = gamma;
  u[n - 1] = alpha;
  const z = thomas(a.slice(), b.slice(), c.slice(), u);
  const vy = y[0] + (beta / gamma) * y[n - 1];
  const vz = z[0] + (beta / gamma) * z[n - 1];
  const f = vy / (1 + vz);
  const p = new Array<number>(n);
  for (let i = 0; i < n; i++) p[i] = y[i] - f * z[i];
  return p;
}

/** C2-kontinuerlig ramp: 0→1 över [0,1] (6t⁵−15t⁴+10t³). */
export function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Ramp mellan x0..x1 med smootherstep; utanför: 0 resp. 1. */
export function rampBetween(x: number, x0: number, x1: number): number {
  if (x1 <= x0) return x >= x1 ? 1 : 0;
  return smootherstep((x - x0) / (x1 - x0));
}
