/* Character-field scenes. Every cell of one fixed glyph grid samples a procedural scene, so shading, depth and
   motion all come from characters and tiles, as in the reference video. Wrapped so nothing leaks into preload scope. */
const drawAsciiScene = (() => {
  'use strict';
  // 0..11 is a density ramp; 12+ are special glyphs scenes pick directly.
  const CH = ' .:-=+*tx%S#v^~o|/\\@\',';
  const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y) => noise(x, y) * .57 + noise(x * 2.03 + 17.1, y * 2.03 + 9.7) * .29 + noise(x * 4.07 + 3.3, y * 4.07 + 41.9) * .14;
  const tri = x => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);
  const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const sm = (a, b, v) => { v = sat((v - a) / (b - a)); return v * v * (3 - 2 * v); };
  const wrap = (v, m) => ((v % m) + m) % m;
  const grad = (g, w, h, stops) => { const s = g.createLinearGradient(0, 0, 0, h); stops.forEach(([p, c]) => s.addColorStop(p, c)); g.fillStyle = s; g.fillRect(0, 0, w, h); };
  const glow = (g, x, y, r, color) => { const s = g.createRadialGradient(x, y, 0, x, y, r); s.addColorStop(0, color); s.addColorStop(1, color.slice(0, 7) + '00'); g.fillStyle = s; g.fillRect(0, 0, g.canvas.width, g.canvas.height); };

  // Layouts: x values are fractions of the scene width; y and sizes are fractions of its height.
  const KOI = [[.83, .3, .1, .09, .11, 0, .3, 0], [.86, .72, .08, .07, -.09, 2, .24, 1], [.13, .5, .06, .16, .08, 4, .27, 2]];
  const KOIP = [[1, 3], [2, 1], [4, 2]];
  const LILY = [[.05, .16, .1, 1, 0], [.95, .1, .085, 4, 1], [.93, .9, .11, 2, 0], [.08, .87, .09, 5, 1], [.035, .52, .06, .5, 0], [.97, .52, .055, 3, 0]];
  const JELLY = [[.12, .25, .3, 0], [.87, .6, .26, 2], [.2, 1.05, .2, 1], [.8, 1.3, .18, 0]];
  const BOATS = [[.08, .2, .24, .008, -.5], [.88, .16, .2, .006, .4], [.82, .64, .23, .007, -.3], [.1, .7, .26, .009, .55], [.45, .4, .14, .005, .15]];
  const FTREES = [[.02, -.05, .24], [.98, 0, .22], [.13, .2, .15], [.88, .28, .13]];
  const PINES = [[.06, .95, .5], [.33, .97, .26], [-.07, .94, .56], [-.22, .98, .36], [-.01, .9, .28]];
  // Dune layers near→far: base y, crest height, frequency, phase, silhouette colour. Crests are sharp with a short slip face.
  const DUNES = [[.94, .13, .42, .3, '#7a3a34', '#c46a40'], [.8, .11, .62, .75, '#5e2e3e', '#9a4c44'], [.69, .09, .95, .1, '#442240', '#743448']];
  let DP = 0;
  function duneY(x, L) {
    const D = DUNES[L], q = x * D[2] + D[3], p = q - Math.floor(q); DP = p;
    return D[0] - D[1] * (p < .72 ? Math.pow(p / .72, 1.6) : Math.pow((1 - p) / .28, .9)) - .012 * noise(x * 4 + L * 5, L);
  }
  // Height of the sunlit slip face below the crest: a crescent that thins out at both ends.
  const slip = (p, L) => { const q = (p - .72) / .28; return q > 0 ? DUNES[L][1] * 2.2 * Math.sqrt(q) * (1 - q) : 0; };
  const meadowY = (x, L) => L ? .76 - .06 * Math.sin(x * 2.6 + 1) - .03 * noise(x * 3, 7) : .88 - .06 * Math.sin(x * 1.6 - .4) - .02 * noise(x * 4, 3);
  // Bamboo stalks, near first: x (negative = from the right edge), depth, half-width.
  const STALKS = [[.05, 1, .022], [-.06, 1, .024], [.2, .85, .018], [-.21, .9, .019], [.12, .62, .014], [-.13, .7, .016], [.3, .42, .01], [-.31, .45, .011], [.4, .28, .008], [-.42, .3, .008]];
  const MAPLES = [[.14, .5, .26], [-.13, .46, .29], [.36, .66, .1]];
  // Mountain ranges far→near: base y, height, frequency, phase, colour.
  const ALPS = [[.62, .2, 2.1, .3, '#e3d6ee'], [.7, .22, 1.5, .8, '#cdbfe4'], [.8, .2, 1.1, .1, '#b3a5d6'], [.9, .14, .8, .55, '#9a8dc8']];
  const alpY = (x, L) => { const D = ALPS[L]; return D[0] - D[1] * (Math.pow(tri(x * D[2] + D[3]), 1.8) * .75 + .25 * tri(x * D[2] * 2.7 + D[3] * 3)) - .015 * fbm(x * 9, L); };
  const retroY = (x, A) => .6 - (.05 + .13 * tri(x * 2.3 + .2) ** 2 + .02 * noise(x * 8, 4)) * sm(A * .12, A * .38, Math.abs(x - A / 2));
  const AUR = [[-.05, .62, .4, 1], [.42, .66, .32, .95], [.2, .6, .22, .7]];
  const CLOUDS = [[.04, .16, .15, .02], [.3, .1, .09, .03], [.62, .2, .1, .025], [.9, .14, .17, .018], [.16, .45, .12, .022], [.82, .48, .13, .02], [.47, .36, .07, .035], [.06, .78, .13, .02], [.93, .82, .15, .017], [.62, .7, .08, .03]];
  const BUMPS = [[-.55, -.18, .34], [-.15, -.4, .44], [.3, -.32, .38], [.66, -.14, .26]];
  // A flat-bottomed cloud: a base lozenge plus four bumps whose sizes vary per cloud.
  function cumulus(u, v, k) {
    if (v > 0) return false;
    if ((u / 1) ** 2 + (v / .3) ** 2 < 1) return true;
    for (let b = 0; b < 4; b++) { const B = BUMPS[b], r = B[2] * (.8 + .4 * hash(k, b)), du = u - B[0], dv = v - B[1] * (.85 + .3 * hash(b, k)); if (du * du + dv * dv < r * r) return true; }
    return false;
  }
  // Per-frame particle positions, filled by each scene's pre() so cells only compare numbers.
  const PX = new Float64Array(64), PY = new Float64Array(64), PZ = new Float64Array(64);

  function turtle(x, y, cx, cy, ang, s, t, seed, o) {
    const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > s * s * .75) return false;
    const ca = Math.cos(ang), sa = Math.sin(ang), u = (dx * ca + dy * sa) / s, v = (-dx * sa + dy * ca) / s;
    const e = (u / .55) ** 2 + (v / .42) ** 2;
    if (e < 1) { o.t = 1; o.c = e > .72 ? 2 : Math.sin(u * 13) + Math.sin(v * 13 + u * 6) > .9 ? 2 : e < .25 && u > -.1 ? 8 : 1; return true; }
    if (((u - .68) / .17) ** 2 + (v / .12) ** 2 < 1) { o.t = 1; o.c = 3; return true; }
    const flap = Math.sin(t * 1.5 + seed) * .45;
    for (let k = -1; k <= 1; k += 2) for (let f = 0; f < 2; f++) {
      const pu = f ? -.38 : .22, pv = k * (f ? .28 : .34), th = k * (f ? 2.6 + flap * .3 : 2.1 + flap), len = f ? .24 : .5, wd = f ? .08 : .12;
      const a = (u - pu) * Math.cos(th) + (v - pv) * Math.sin(th), p = -(u - pu) * Math.sin(th) + (v - pv) * Math.cos(th);
      if (a > 0 && a < len && Math.abs(p) < wd * (1 - a / len * .8)) { o.t = 1; o.c = 3; return true; }
    }
    return false;
  }
  function branch(x, y, t, A, o, right) {
    const s = right ? A - x : x, span = right ? .85 : .55; if (s < -.04 || s > span + .06) return false;
    const by = b => .02 + (right ? .3 : .22) * Math.pow(Math.max(0, b) / span, 1.5), sway = .006 * Math.sin(t * .6 + s * 3);
    // Individual five-petal flowers clustered along the branch, each with a deep pink centre.
    for (let k = 0; k < 26; k++) {
      const bs = span * (.04 + .037 * k); if (bs > span) break;
      const seed = k + (right ? 0 : 40), r = .026 + .016 * hash(seed, 9);
      const ds = s - bs - (hash(seed, 8) - .5) * .05, dy = y - by(bs) - (hash(seed, 7) - .5) * .11 - sway, d = Math.hypot(ds, dy);
      if (d > r) continue;
      const a = Math.atan2(dy, ds) + seed + Math.sin(t * .4 + k) * .2, petal = r * (.62 + .38 * Math.abs(Math.cos(a * 2.5)));
      if (d < petal) { o.t = 1; o.c = d < r * .24 ? 2 : d > petal * .75 ? 1 : 0; return true; }
    }
    if (s >= 0 && s <= span && Math.abs(y - by(s) - sway) < .02 * (1 - s / span) + .005) { o.t = 1; o.c = 3; return true; }
    // A twig off the main branch
    if (s > span * .3 && s < span * .62) { const q = (s - span * .3) / (span * .32); if (Math.abs(y - by(span * .3) - q * .12 - sway) < .008 + .006 * (1 - q)) { o.t = 1; o.c = 3; return true; } }
    return false;
  }

  const SCENES = {
    clouds: { pal: ['#ffffff', '#f4f9fd', '#cfe1ee', '#ffffff', '#4b7592', '#ecf8ff'], ink: '#8aa8bd', inkA: .42,
      bg(g, w, h) { grad(g, w, h, [[0, '#5aaee6'], [.6, '#a6d6f3'], [1, '#d3eefb']]); glow(g, w * .86, h * .04, h * .8, '#fff6dcd0'); },
      pre(t, A) {
        for (let b = 0; b < 6; b++) { PX[b] = wrap(t * .035 + b * .045 + (b % 2) * .02, A + .6) - .3; PY[b] = .3 + .025 * Math.sin(b * 2.3) + .006 * Math.sin(t * 2 + b); PZ[b] = Math.sin(t * 6 + b * 1.7) > 0 ? 12 : 13; }
        for (let k = 0; k < CLOUDS.length; k++) { const C = CLOUDS[k]; PX[10 + k] = wrap(A * C[0] + t * C[3], A + .8) - .4; PY[10 + k] = C[1] + .006 * Math.sin(t * .3 + k); }
      },
      f(x, y, t, A, o, i, j) {
        for (let b = 0; b < 6; b++) if (Math.abs(x - PX[b]) < o.cw * .5 && Math.abs(y - PY[b]) < o.ch * .5) { o.g = PZ[b]; o.c = 4; o.v = 1; return; }
        // Flat-bottomed cumulus built from bumps; top rim white, underside shaded, like the reference.
        for (let k = 0; k < CLOUDS.length; k++) {
          const s = CLOUDS[k][2], u = (x - PX[10 + k]) / s, v = (y - PY[10 + k]) / s; if (u < -1.15 || u > 1.15 || v < -1 || v > .05) continue;
          if (cumulus(u, v, k)) { o.t = 1; o.c = v > -.12 ? 2 : !cumulus(u, v - .1, k) ? 0 : 1; return; }
          if (cumulus(u * .94, v * .9 - .02, k) && hash(i, j) > .55) { o.v = .55; o.c = 3; o.g = 1; return; }
        }
        const h = hash(i, j); if (h > .986) { o.v = .3 + .15 * Math.sin(t * 1.5 + h * 40); o.c = 5; o.g = 1; }
      } },
    aurora: { pal: ['#c9ffe4', '#62f0aa', '#2fc0a8', '#a27cff', '#ff86cc', '#1c3450', '#0d1a29', '#d3e3f3', '#e8f0ff', '#2a6f72'], ink: '#0a1622',
      bg(g, w, h) { grad(g, w, h, [[0, '#030915'], [.55, '#0a1d2e'], [.8, '#10354a'], [1, '#081828']]); glow(g, w * .5, h * .45, h * .9, '#22c49a24'); },
      f(x, y, t, A, o, i, j) {
        const far = .66 - .15 * tri(x * 1.3 + .2) - .06 * tri(x * 3.1 + .6) - .02 * noise(x * 9, 1), near = .79 - .07 * tri(x * 2.2 + .5) - .03 * noise(x * 12, 2), lake = .87;
        let yy = y, refl = 1;
        if (y > lake) { yy = 2 * lake - y + .01 * Math.sin(y * 160 + t * 2); refl = .38; }
        else if (y > near) { o.t = 1; o.c = 6; return; }
        else if (y > far) { o.t = 1; o.c = y < far + .03 && noise(x * 36, y * 36) > .35 ? 7 : 5; return; }
        // Curtains: a bright, sharply defined lower hem that folds across the sky, with soft rays rising from it.
        let v = 0, c = 1;
        for (let L = 0; L < 3; L++) {
          const C = AUR[L], s = (x - A * C[0]) / (A * C[1]); if (s < 0 || s > 1) continue;
          const env = sm(0, .18, s) * sm(0, .18, 1 - s);
          const hem = C[2] + .07 * Math.sin(s * 5.2 + t * .09 + L * 2) + .035 * Math.sin(s * 13 - t * .15 + L), d = hem - yy;
          if (d < -.02) continue;
          const rise = d < 0 ? 1 + d * 50 : Math.exp(-d * (2.6 + L * .8)), ray = .45 + .55 * noise(s * 60 + L * 9, t * .18 + L);
          const pulse = .7 + .3 * Math.sin(s * 7 - t * .35 + L * 1.7), I = env * rise * ray * pulse * C[3];
          if (I > v) { v = I; c = d < .025 ? 0 : d < .08 ? 1 : d < .17 ? 2 : L === 1 ? 4 : 3; }
        }
        v *= refl;
        if (v > .08) { o.v = Math.min(1, v); o.c = c; if (v > .78 && refl === 1 && c === 0) o.t = 1; else if (refl < 1) o.g = v > .25 ? 14 : -1; return; }
        if (y > lake) { if (noise(x * 14, y * 60 + t * .4) > .74) { o.v = .25; o.c = 9; o.g = 14; } return; }
        const h = hash(i, j); if (h > .985) { o.v = (h > .997 ? .9 : .35) * (.6 + .4 * Math.sin(t * 2 + h * 90)); o.c = 8; o.g = h > .997 ? 6 : 1; }
      } },
    lagoon: { pal: ['#b4f5ec', '#cdb75a', '#7f8c3c', '#e0cb72', '#43a693', '#e9fffb', '#e2617f', '#f3e7c9', '#e7d58a', '#d9c99a'], ink: '#2f4a3a',
      bg(g, w, h) { grad(g, w, h, [[0, '#3a9290'], [.45, '#196a73'], [1, '#063f55']]); for (let k = 0; k < 4; k++) { const x = w * (.1 + k * .27), s = g.createLinearGradient(x, 0, x + w * .12, h); s.addColorStop(0, '#9ff5ea30'); s.addColorStop(1, '#9ff5ea00'); g.fillStyle = s; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w * .06, 0); g.lineTo(x + w * .2, h); g.lineTo(x + w * .08, h); g.fill(); } },
      pre(t, A) { for (let k = 0; k < 9; k++) { PX[k] = hash(k, 1) * A + .012 * Math.sin(t * 1.3 + k); PY[k] = 1.05 - wrap(t * .05 * (1 + hash(k, 2)) + hash(k, 4), 1.3); } },
      f(x, y, t, A, o, i, j) {
        for (let k = 0; k < 9; k++) if (Math.abs(x - PX[k]) < o.cw * .5 && Math.abs(y - PY[k]) < o.ch * .5) { o.g = 15; o.c = 5; o.v = .85; return; }
        if (turtle(x, y, A * .8 + .09 * Math.sin(t * .06), .3 + .08 * Math.sin(t * .09), Math.atan2(.0072 * Math.cos(t * .09), .0054 * Math.cos(t * .06)), .27, t, 0, o)) return;
        if (turtle(x, y, A * .15 + .07 * Math.cos(t * .05), .62 + .06 * Math.sin(t * .07), Math.atan2(.0042 * Math.cos(t * .07), -.0035 * Math.sin(t * .05)), .19, t, 2, o)) return;
        { const dx = x - A * .92, dy = y - .95; if ((dx / .13) ** 2 + (dy / .17) ** 2 < 1 && noise(x * 20, y * 20) > .4) { o.t = 1; o.c = 6; return; } }
        { const dx = x - A * .06, dy = y - .9, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + t * .05; if (r < .055 * (.45 + .55 * Math.abs(Math.cos(a * 2.5)))) { o.t = 1; o.c = 7; return; } }
        if (y > .62) for (let k = 0; k < 11; k++) {
          const sx = hash(k, 7) * A, h = .14 + .22 * hash(k, 3); if (y < 1 - h) continue;
          const q = (1 - y) / h, ph = q * 5 - t * 1.1 + k, sway = Math.sin(ph) * .03 * q;
          if (Math.abs(x - sx - sway) < o.cw * .7) { const s = Math.cos(ph); o.g = s > .35 ? 17 : s < -.35 ? 18 : 16; o.c = 4; o.v = .9; return; }
        }
        if (y > .955 + .02 * Math.sin(x * 5)) { o.t = 1; o.c = 9; return; }
        const n1 = noise(x * 6 + t * .13, y * 6 - t * .09), n2 = noise(x * 6 - t * .1 + 9.3, y * 6 + t * .07 + 4.1), w = 1 - Math.abs(n1 - n2) * 7;
        if (w > .45) { o.v = (w - .45) * 1.6 * (1.1 - y * .6); o.c = 0; }
      } },
    koi: { pal: ['#8fe3c0', '#f6f3e8', '#ef7d3a', '#cf3d2e', '#1b2621', '#78b858', '#4a8a3c', '#f7b9cd', '#5aa489'], ink: '#2a3b2f',
      bg(g, w, h) { grad(g, w, h, [[0, '#3c6f5f'], [.5, '#27594b'], [1, '#183f35']]); glow(g, w * .5, h * .5, h * .9, '#000c0820'); },
      f(x, y, t, A, o, i, j) {
        for (let k = 0; k < 3; k++) {
          const F = KOI[k], a = t * F[4] + F[5], cx = A * F[0] + F[2] * Math.cos(a), cy = F[1] + F[3] * Math.sin(a), dx = x - cx, dy = y - cy, L = F[6];
          if (dx * dx + dy * dy > L * L * .36) continue;
          const ang = Math.atan2(F[3] * Math.cos(a) * F[4], -F[2] * Math.sin(a) * F[4]), ca = Math.cos(ang), sa = Math.sin(ang);
          const u = (dx * ca + dy * sa) / (L * .5); let v = (-dx * sa + dy * ca) / (L * .5);
          v -= Math.sin(u * 2.4 + t * 4.2 + k) * .065 * (1 - u);
          if (u > -.72 && u < 1) {
            const q = (u - .18) / .86, w = .32 * Math.pow(Math.max(0, 1 - q * q), .6);
            if (Math.abs(v) < w) { o.t = 1; o.c = KOIP[F[7]][noise(u * 2.6 + k * 9, v * 5 + k * 3) > .56 ? 1 : 0]; return; }
            if (u > .2 && u < .5 && Math.abs(v) < w + .12) { o.v = .6; o.c = KOIP[F[7]][0]; return; }
          }
          if (u <= -.6 && u > -1.2 && Math.abs(v) < .04 + (-.6 - u) * .6) { o.v = .8; o.c = KOIP[F[7]][0]; return; }
          if (Math.abs(v) < .5 && u < 1.1) { o.v = .12; o.c = 8; }
        }
        for (let k = 0; k < LILY.length; k++) {
          const P = LILY[k], dx = x - A * P[0], dy = y - P[1] - .004 * Math.sin(t * .5 + k), r = P[2], d = Math.hypot(dx, dy); if (d > r) continue;
          const aa = wrap(Math.atan2(dy, dx) - P[3], Math.PI * 2); if (aa < .5 && d > r * .15) continue;
          if (P[4] && d < r * .34) { o.t = 1; o.c = 7; return; }
          o.t = 1; o.c = d > r * .82 || Math.abs(Math.sin(aa * 4)) < .08 ? 6 : 5; return;
        }
        for (let k = 0; k < 4; k++) {
          const cyc = t * .16 + k * .27, p = wrap(cyc, 1), n = Math.floor(cyc), d = Math.hypot(x - A * hash(k, n + 11), (y - .15 - .7 * hash(k, n + 12)) * 1.8);
          if (Math.abs(d - p * .2) < .008) { o.v = (1 - p) * .9; o.c = 0; return; }
        }
        const wn = noise(x * 2.6 + t * .04, y * 5.5 - t * .02) * 7, wl = Math.abs(wn - Math.round(wn));
        if (wl < .04 && hash(i, j >> 1) > .5) { o.g = 14; o.c = 8; o.v = .45; }
      } },
    jelly: { pal: ['#f5a8d9', '#c79ff5', '#f8c8a4', '#fff0fa', '#a5c8f2', '#5a7fc4', '#8e6bd0'], ink: '#3a2346',
      bg(g, w, h) { grad(g, w, h, [[0, '#14466a'], [.4, '#0b2741'], [1, '#040b18']]); glow(g, w * .5, 0, h * .9, '#4fa0e030'); },
      f(x, y, t, A, o, i, j) {
        for (let k = 0; k < 4; k++) {
          const J = JELLY[k], s = J[2], cx = A * J[0] + .03 * Math.sin(t * .17 + k * 2), cy = wrap(J[1] - t * .011 * (1 + k * .15), 1.6) - .25;
          const dx = x - cx; if (Math.abs(dx) > s * .75) continue; const dy = y - cy; if (dy < -s * .6 || dy > s * 1.9) continue;
          const u = dx / s, v = dy / s, p = .5 + .5 * Math.sin(t * 1.7 + k * 2.3), rx = .48 * (1 + .1 * p), ry = .52 * (1 - .12 * p);
          if (v < .06) {
            const e = (u / rx) ** 2 + ((v - .06) / ry) ** 2;
            if (e < 1) { o.t = 1; o.c = e < .28 ? 3 : J[3]; return; }
            if (e < 1.7) { o.v = (1.7 - e) * .7; o.c = J[3]; return; }
            continue;
          }
          if (v < .14 && Math.abs(u) < rx * (1 - (v - .06) * 2)) { o.v = .9; o.c = J[3]; o.g = 12; return; }
          const arm = Math.sin(v * 6 - t * 1.6 + k) * .05; if (v < .85 && Math.abs(u - arm) < .07 * (1 - v) + o.cw / s * .4) { o.v = .9 - .5 * v; o.c = 3; return; }
          for (let n = 0; n < 6; n++) {
            const u0 = -.4 + n * .16, len = 1.2 + .5 * hash(k, n); if (v > len) continue;
            const w = Math.sin(v * 8 - t * 2.1 + n * 1.3 + k) * .08 * v;
            if (Math.abs(u - u0 - w) < o.cw / s * .55) { o.v = (1 - v / len) * .85 + .15; o.c = J[3]; o.g = hash(n, j) > .55 ? 16 : -1; return; }
          }
        }
        const jj = j - Math.floor(t * (.8 + hash(i, 0) * 1.4) + hash(i, 1) * 40);
        if (hash(i, jj) > .98) { o.v = .35; o.c = 4; o.g = 1; } else if (hash(i, j) > .994) { o.v = .2; o.c = 5; }
      } },
    boats: { pal: ['#ffffff', '#e3eeeb', '#5f9c94', '#ffffff', '#7fb0a8', '#e8a85a', '#bcd6d0'], ink: '#86a49c', inkA: .36,
      bg(g, w, h) { grad(g, w, h, [[0, '#8fc9c1'], [.5, '#b0dbd3'], [1, '#cfe9e1']]); },
      f(x, y, t, A, o, i, j) {
        // Side-view paper boats: folded hull, centre sail split into lit and shaded faces, rippled reflection below.
        for (let k = 0; k < 5; k++) {
          const B = BOATS[k], s = B[2] * 1.15, cx = wrap(A * B[0] + t * B[3], A + .6) - .3, cy = B[1] + .01 * Math.sin(t * .9 + k * 2);
          const dx = x - cx, dy = y - cy; if (dx < -s * .75 || dx > s * .75 || dy < -s * .65 || dy > s * .6) continue;
          const tilt = .06 * Math.sin(t * .8 + k * 1.3), u = (dx - dy * tilt) / s, v = (dy + dx * tilt) / s, au = Math.abs(u);
          if (v >= 0 && v < .2 && au < .62 - v * 1.15) { o.t = 1; o.c = v < .07 ? 0 : au > .5 - v * 1.15 ? 6 : 1; return; }
          if (v < 0 && v > -.55 && au < .3 * (1 + v / .55)) { o.t = 1; o.c = u < 0 ? 0 : 6; return; }
          if (v > .24 && v < .5) { const m = .5 - (v - .24) * .8; if (au < m && hash(i, j + Math.floor(t * 3)) > .45) { o.g = 14; o.c = 4; o.v = .75 - (v - .24) * 1.6; return; } }
        }
        // Water as drifting contour lines of a slow noise field, broken up so it never reads as ruled paper.
        const wn = noise(x * 3.2 + t * .05, y * 7 - t * .03) * 8 + noise(x * 9 - t * .04, y * 16) * .8, wl = Math.abs(wn - Math.round(wn));
        if (wl < .06 && hash(i >> 1, j) > .3) { o.g = 14; o.c = 2; o.v = .7; return; }
        const h = hash(i, j); if (h > .988) { o.v = .45 * (.5 + .5 * Math.sin(t * 2 + h * 70)); o.c = 3; o.g = 1; }
      } },
    sakura: { pal: ['#f59cbc', '#fdd3e2', '#c9446f', '#5a3a40', '#ec8fb0', '#f4d4df', '#ffffff', '#ecbccd'], ink: '#a65a74', inkA: .34,
      bg(g, w, h) { grad(g, w, h, [[0, '#f7c9d8'], [.6, '#fbe3eb'], [1, '#fdf1f5']]); glow(g, w * .5, h * .78, h * .5, '#fff4e6c0'); },
      pre(t, A) { for (let k = 0; k < 44; k++) { PX[k] = wrap(hash(k, 1) * (A + .4) + t * .035 * (.6 + hash(k, 2)), A + .4) - .2 + .02 * Math.sin(t * 1.2 + k); PY[k] = wrap(hash(k, 3) * 1.1 + t * .045 * (.6 + hash(k, 4)), 1.1) - .05; PZ[k] = hash(k, 5) > .55 ? -1 : Math.sin(t * 3 + k) > 0 ? 6 : 15; } },
      f(x, y, t, A, o, i, j) {
        for (let k = 0; k < 44; k++) if (Math.abs(x - PX[k]) < o.cw * .5 && Math.abs(y - PY[k]) < o.ch * .5) { if (PZ[k] < 0) { o.t = 1; o.c = 1; } else { o.g = PZ[k]; o.c = 4; o.v = 1; } return; }
        if (branch(x, y, t, A, o, true) || branch(x, y, t, A, o, false)) return;
        const near = .87 + .04 * Math.sin(x * 3.4 + 2) + .02 * noise(x * 6, 4), far = .78 + .06 * Math.sin(x * 2.1 + 1) + .04 * noise(x * 4, 3);
        if (y > near) { o.t = 1; o.c = 7; return; }
        if (y > far) { o.t = 1; o.c = 5; return; }
        if (hash(i, j) > .992) { o.v = .4; o.c = 6; o.g = 1; }
      } },
    fireflies: { pal: ['#fbffb8', '#d8ef6f', '#7f9e3c', '#04100b', '#0a1d15', '#4f8a55', '#123224'], ink: '#020906',
      bg(g, w, h) { grad(g, w, h, [[0, '#0b2a26'], [.6, '#16392f'], [1, '#1e4433']]); glow(g, w * .5, h * .7, h * .8, '#9cd07a22'); },
      pre(t, A) { for (let k = 0; k < 30; k++) { PX[k] = hash(k, 1) * A + .06 * Math.sin(t * .27 * (1 + hash(k, 3)) + k); PY[k] = .1 + .74 * hash(k, 2) + .05 * Math.cos(t * .23 * (1 + hash(k, 5)) + k * 1.7); PZ[k] = Math.pow(.5 + .5 * Math.sin(t * (.7 + hash(k, 4) * .8) + k * 3), 3); } },
      f(x, y, t, A, o, i, j) {
        let best = 0;
        for (let k = 0; k < 30; k++) {
          const dx = x - PX[k]; if (dx > .08 || dx < -.08) continue; const dy = y - PY[k]; if (dy > .08 || dy < -.08) continue;
          const gl = PZ[k]; if (gl < .04) continue; const d = Math.hypot(dx, dy);
          if (d < o.ch * .5) { o.t = gl > .3 ? 1 : 0; o.c = 0; o.v = gl; o.g = o.t ? -1 : 19; return; }
          if (d < .075) best = Math.max(best, gl * (1 - d / .075) ** 2);
        }
        if (best > .05) { o.v = Math.min(.55, best * 1.2); o.c = best > .3 ? 1 : 2; o.g = best > .3 ? -1 : hash(i, j) > .5 ? 1 : 2; return; }
        for (let k = 0; k < FTREES.length; k++) {
          const T = FTREES[k], dx = x - A * T[0], r = T[2]; if (Math.abs(dx) > r * 1.1) continue;
          if (Math.abs(dx) < r * .1 && y > T[1] + r) { o.t = 1; o.c = 3; return; }
          const e = (dx / r) ** 2 + ((y - T[1] - r * .6) / (r * 1.7)) ** 2; if (e < 1 && fbm(x * 8 + k, y * 8) > .3 + e * .25) { o.t = 1; o.c = e > .6 ? 4 : 3; return; }
        }
        const hill = .82 - .08 * fbm(x * 3.5, 2.3);
        if (y > hill) {
          if (y < hill + .035) { const h = hash(i, j), lean = Math.sin(t * .8 + x * 6); if (h < .35) return; o.v = .75; o.c = 5; o.g = h > .8 ? 20 : lean > .3 ? 17 : lean < -.3 ? 18 : 16; return; }
          o.t = 1; o.c = y > .93 ? 3 : 4; return;
        }
        if (y > .45 && noise(x * 3 + t * .03, y * 4) > .7) { o.v = .2; o.c = 6; }
      } },
    moon: { pal: ['#f6f0cf', '#d6cfa6', '#e2e9ff', '#8a9be0', '#5b6fb4', '#a9b8ea', '#fff6d8', '#34478e', '#f6f0cf'], ink: '#6a6650',
      bg(g, w, h) { grad(g, w, h, [[0, '#060a1a'], [.6, '#16225a'], [.86, '#25387a'], [1, '#0d1638']]); glow(g, w * .8, h * .2, h * .5, '#a3b2f048'); },
      f(x, y, t, A, o, i, j) {
        const sea = .86;
        if (y > sea) {
          const col = Math.abs(x - A * .8) < .05 + (y - sea) * .5 && noise(x * 30, y * 70 + t * .6) > .42;
          if (col) { o.v = .85 - (y - sea) * 3; o.c = 8; o.g = 14; return; }
          if (Math.sin(y * 120 + noise(x * 3 + t * .1, y * 9) * 6 + x * 2 - t * .8) > .7) { o.v = .45; o.c = 7; o.g = 14; }
          return;
        }
        const c = fbm(x * 1.6 - t * .014, y * 7 + 2) + .32 * Math.sin(y * 12.5 - 4.05) - .68;
        if (c > .03) { o.t = 1; o.c = c > .1 ? 3 : 4; return; } if (c > -.01) { o.v = .5; o.c = 4; return; }
        const dx = x - A * .8, dy = y - .2, r = .11, d = Math.hypot(dx, dy);
        if (d < r) { o.t = 1; o.c = noise(dx * 22 + 3, dy * 22 + 7) > .62 || dx + dy * .3 < -r * .7 ? 1 : 0; return; }
        if (d < r * 2.4 && hash(i, j) > .3) { const h = 1 - (d - r) / (r * 1.4); if (h > 0) { o.v = h * h * .7; o.c = 5; return; } }
        const cyc = t % 11;
        if (cyc < 1.1) {
          const p = cyc / 1.1, px = x - A * (.18 + .3 * p), py = y - .06 - .16 * p, along = -(px * .88 + py * .47);
          if (along > 0 && along < .16 && Math.abs(px * .47 - py * .88) < o.ch * .4) { o.v = (1 - along / .16) * (1 - p * .3); o.c = 6; o.g = 18; return; }
        }
        const h = hash(i, j); if (h > .986) { o.v = (h > .997 ? .9 : .35) * (.55 + .45 * Math.sin(t * 1.7 + h * 100)); o.c = 2; o.g = h > .997 ? 6 : 1; }
      } },
    dunes: { pal: ['#ffe7b0', '#ff9d5c', '#ffd08c', '#e98f58', '#a4523f', '#5e2e4c', '#f6dcc0', '#2c1428', '#ffb070', '#ffc98a', '#8a4150'], ink: '#6a3424', inkA: .3,
      bg(g, w, h) {
        grad(g, w, h, [[0, '#140a24'], [.38, '#4a1d42'], [.64, '#d4643c'], [.75, '#f08a4a'], [1, '#5a2a2a']]); glow(g, w - h * .36, h * .6, h * .75, '#ffb36080');
        // The dunes never move, so their silhouettes live in the cached background and the glyph field only adds light and ripples.
        for (let L = 2; L >= 0; L--) {
          const D = DUNES[L]; g.fillStyle = D[4]; g.beginPath(); g.moveTo(0, h);
          for (let px = 0; px <= w + 4; px += 4) g.lineTo(px, duneY(px / h, L) * h);
          g.lineTo(w, h); g.fill(); g.fillStyle = D[5];
          for (let px = 0; px <= w; px += 2) { const y = duneY(px / h, L) * h; g.fillRect(px, y, 2, h * slip(DP, L)); }
        }
      },
      f(x, y, t, A, o, i, j) {
        const nY = duneY(x, 0), nP = DP, mY = duneY(x, 1), mP = DP, fY = duneY(x, 2), fP = DP;
        const L = y > nY ? 0 : y > mY ? 1 : y > fY ? 2 : -1;
        if (L >= 0) {
          const top = L === 0 ? nY : L === 1 ? mY : fY, p = L === 0 ? nP : L === 1 ? mP : fP, depth = y - top;
          const lit = depth < slip(p, L), k = L === 0 ? 1 : L === 1 ? .75 : .5;
          if (depth < o.ch * .9) { o.g = 3; o.c = lit ? 0 : L === 2 ? 10 : 2; o.v = k; return; }
          if (L === 0 && hash(i + Math.floor(t * 7), j) > .99) { o.g = 1; o.c = 2; o.v = .9; return; }
          // Wind ripples: thin wavy bands that follow the slope, brighter on the sunlit slip face.
          const rip = Math.sin(x * 38 + depth * (lit ? 120 : 160) + 2 * noise(x * 6, y * 6 + L));
          if (rip > .55) { o.g = 14; o.c = lit ? 2 : 3; o.v = (lit ? .7 : .4) * k * (rip - .4); }
          return;
        }
        const dx = x - (A - .36), dy = y - .6, r = .2, d = Math.hypot(dx, dy);
        if (d < r) { o.t = 1; o.c = dy < -.1 ? 0 : dy < .03 ? 9 : 1; return; }
        if (d < r * 1.9 && hash(i, j) > .25) { const hh = 1 - (d - r) / (r * .9); o.v = hh * hh * .75; o.c = 8; return; }
        const h = hash(i, j); if (y < .4 && h > .986) { o.v = (h > .997 ? .9 : .4) * (1 - y * 1.6) * (.6 + .4 * Math.sin(t * 1.5 + h * 60)); o.c = 6; o.g = h > .997 ? 6 : 1; }
      } },
    rain: { pal: ['#8fb0e6', '#1c2742', '#26345a', '#ffd27a', '#ff9f5a', '#5d7cb5', '#cfe0ff', '#9fd0ff', '#ff5fa2'], ink: '#0b1220',
      bg(g, w, h) { grad(g, w, h, [[0, '#070c18'], [.6, '#101a30'], [.9, '#1a2848'], [1, '#0b1222']]); glow(g, w * .5, h * .92, h * .6, '#ff9f5a1c'); },
      f(x, y, t, A, o, i, j) {
        if (hash(i, 9) > .42) for (let k = 0; k < 2; k++) {
          const d = wrap(t * (.9 + .5 * hash(i, k + 2)) + hash(i, k + 4) * 3, 1.35) - .15 - y;
          if (d > 0 && d < .08) { o.v = .3 + .55 * (1 - d / .08); o.c = 0; o.g = d < .025 ? 16 : -1; return; }
        }
        if (y > .9) {
          for (let k = 0; k < 4; k++) {
            const cyc = t * .7 + k * .25, p = wrap(cyc, 1), d = Math.hypot(x - A * hash(k, Math.floor(cyc)), (y - .95) * 4);
            if (Math.abs(d - p * .09) < .009) { o.v = (1 - p) * .85; o.c = 5; o.g = 14; return; }
          }
          const b = Math.floor(x / .085); if (hash(b, 3) > .45 && noise(x * 30, y * 20 + t) > .58) { o.v = .45; o.c = hash(b, 4) > .5 ? 3 : 4; o.g = 16; }
          return;
        }
        const b = Math.floor(x / .085), top = .9 - (.14 + .46 * hash(b, 1)) * (.3 + .7 * Math.min(1, Math.abs(x - A / 2) / (A * .5)));
        if (y > top) {
          o.t = 1; o.c = b % 2 ? 1 : 2;
          // Neon sign on one tall building per side
          if (hash(b, 5) > .82 && y > top + .05 && y < top + .2 && Math.abs((x / .085 - b) - .5) < .22) { o.c = Math.sin(t * 9) > -.8 ? 8 : 2; return; }
          if (i % 3 === 1 && j % 2 === 0 && y > top + .03 && hash(i, j) > .45) o.c = hash(i, j + Math.floor(t * .15)) > .93 ? 2 : hash(i, 7) > .66 ? 7 : hash(i, 7) > .33 ? 3 : 4;
          return;
        }
        if (hash(i, j) > .993) { o.v = .25; o.c = 6; o.g = 1; }
      } },
    snow: { pal: ['#ffffff', '#20443a', '#2e5e4d', '#f7fbff', '#ffffff', '#dbe7f0', '#b3c8da', '#6b4b36', '#ffd27a', '#f4f8fc'], ink: '#6f8ba1', inkA: .36,
      bg(g, w, h) { grad(g, w, h, [[0, '#9fbbd6'], [.55, '#c4d7e8'], [1, '#e9f1f8']]); },
      pre(t, A) { for (let k = 0; k < 64; k++) { const z = hash(k, 9); PX[k] = hash(k, 1) * A + .03 * Math.sin(t * (.5 + z) + k); PY[k] = wrap(hash(k, 2) + t * (.025 + .05 * z), 1.1) - .05; PZ[k] = z; } },
      f(x, y, t, A, o, i, j) {
        for (let k = 0; k < 64; k++) if (Math.abs(x - PX[k]) < o.cw * .55 && Math.abs(y - PY[k]) < o.ch * .5) { const z = PZ[k]; if (z > .62) { o.t = 1; o.c = 0; } else { o.g = z > .4 ? 6 : 1; o.c = 0; o.v = 1; } return; }
        for (let k = 0; k < PINES.length; k++) {
          const P = PINES[k], h = P[2], q = (y - P[1] + h) / h; if (q < 0 || q > 1) continue;
          const dx = x - (P[0] < 0 ? A + P[0] : P[0]);
          if (q > .86) { if (Math.abs(dx) < h * .045) { o.t = 1; o.c = 7; return; } continue; }
          const tier = (q * 4.2) % 1, hw = h * .36 * (q * .75 + .25) * (.62 + .38 * tier);
          if (Math.abs(dx) < hw) { o.t = 1; o.c = tier < .2 || Math.abs(dx) > hw - .01 && tier < .4 ? 3 : dx < 0 ? 2 : 1; return; }
        }
        // Cabin with a warm window
        { const cx = .21, dx = x - cx, base = .935; if (Math.abs(dx) < .07 && y < base && y > base - .1) { const ry = base - .065 - (.07 - Math.abs(dx)) * .5; if (y < ry) { if (y > ry - .03) { o.t = 1; o.c = 3; return; } } else { o.t = 1; o.c = Math.abs(dx - .025) < .012 && y > base - .055 && y < base - .025 ? 8 : 7; return; } } }
        if (y > .93 + .015 * Math.sin(x * 3)) { o.t = 1; o.c = noise(x * 20, y * 20) > .6 ? 5 : 4; return; }
        const m = .7 - .2 * tri(x * 1.1 + .35) - .08 * tri(x * 2.9 + .1) - .02 * fbm(x * 8, 1);
        if (y > m) { o.t = 1; o.c = y < m + .05 + .03 * noise(x * 20, 3) ? 9 : 6; return; }
      } },
    lanterns: { pal: ['#ffe2a0', '#d9532f', '#ff9a4e', '#ffb46a', '#191736', '#4a5ca0', '#c9d2ff', '#ff8a45'], ink: '#5a1f14', inkA: .3,
      bg(g, w, h) { grad(g, w, h, [[0, '#070b22'], [.5, '#171c48'], [.67, '#3d2c5a'], [.69, '#121838'], [1, '#060918']]); glow(g, w * .5, h * .68, h * .7, '#ff9a5a26');
        g.fillStyle = '#16142f'; g.beginPath(); g.moveTo(0, h * .68); for (let px = 0; px <= w + 4; px += 4) { const x = px / h; g.lineTo(px, (.678 - (.02 + .06 * fbm(x * 3, 1.3)) * sm(w / h * .2, w / h * .45, Math.abs(x - w / h / 2))) * h); } g.lineTo(w, h * .68); g.fill(); },
      pre(t, A) { for (let k = 0; k < 26; k++) { const z = hash(k, 9); PZ[k] = z; PX[k] = hash(k, 1) * A + .025 * Math.sin(t * .3 + k); PY[k] = .66 - wrap(hash(k, 2) * .8 + t * (.006 + .012 * z), .8); } },
      f(x, y, t, A, o, i, j) {
        const H = .68; let best = 0;
        for (let k = 0; k < 26; k++) {
          const z = PZ[k], s = .01 + .028 * z, dx = x - PX[k]; if (dx > s * 3 || dx < -s * 3) continue;
          const dy = y - PY[k];
          if (z > .4 ? Math.abs(dx) < s * .7 && Math.abs(dy) < s : Math.abs(dx) < o.cw * .5 && Math.abs(dy) < o.ch * .5) { if (z > .4) { o.t = 1; o.c = dy < -s * .55 ? 1 : Math.abs(dx) < s * .35 ? 0 : 2; } else { o.g = 19; o.c = 0; o.v = .85 + .15 * Math.sin(t * 7 + k * 3); } return; }
          const d = Math.hypot(dx, dy) / s; if (d < 3) best = Math.max(best, (1 - d / 3) ** 2 * (.4 + .6 * z));
          // Each lantern leaves a broken, shimmering reflection on the lake.
          if (y > H && Math.abs(y - (2 * H - PY[k])) < s * 1.6 && Math.abs(dx) < s * .7) { const sh = Math.sin(y * 300 + t * 3 + k); if (sh > -.2) { o.g = 3; o.c = 7; o.v = .35 + .4 * z * (sh + .2); return; } }
        }
        if (best > .08) { o.v = best * .6; o.c = 3; o.g = hash(i, j) > .5 ? 1 : 2; return; }
        if (y > H) { if (hash(i, j) > .8 && Math.sin(x * 40 + y * 200 - t * .8) > .6) { o.g = 3; o.c = 5; o.v = .3 + .3 * (y - H) / (1 - H); } return; }
        const h = hash(i, j); if (y < .5 && h > .988) { o.v = .5 * (.6 + .4 * Math.sin(t * 1.3 + h * 50)); o.c = 6; o.g = 1; }
      } },
    meadow: { pal: ['#ffffff', '#8cbc6a', '#4f8a3e', '#7cb653', '#f2c94c', '#e8698a', '#f08a3c', '#5a7fd8', '#3f7a3a', '#74b04e', '#6b4a2e'], ink: '#2f5a2a', inkA: .3,
      bg(g, w, h) {
        grad(g, w, h, [[0, '#a9d6f0'], [.55, '#def0f2'], [1, '#e9f4e2']]); glow(g, w * .2, h * .1, h * .5, '#fff8d880');
        for (let L = 1; L >= 0; L--) { g.fillStyle = L ? '#b7d79c' : '#9ccb7c'; g.beginPath(); g.moveTo(0, h); for (let px = 0; px <= w + 4; px += 4) g.lineTo(px, meadowY(px / h, L) * h); g.lineTo(w, h); g.fill(); }
      },
      pre(t, A) { for (let k = 0; k < 6; k++) { PX[k] = wrap(hash(k, 1) * A + t * .015 + .05 * Math.sin(t * .6 + k), A + .2) - .1; PY[k] = .5 + .25 * hash(k, 2) + .04 * Math.sin(t * 1.1 + k * 2); } },
      f(x, y, t, A, o, i, j) {
        for (let k = 0; k < 6; k++) if (Math.abs(x - PX[k]) < o.cw * .6 && Math.abs(y - PY[k]) < o.ch * .5) { o.g = Math.sin(t * 14 + k) > 0 ? 8 : 16; o.c = k % 2 ? 7 : 6; o.v = 1; return; }
        const n = meadowY(x, 0), f = meadowY(x, 1), dx = x - (A - .3);
        // A lone oak on the far hill
        if (Math.abs(dx) < .2 && y < f + .01) {
          if (Math.abs(dx) < .012 + Math.max(0, y - .6) * .06 && y > .5) { o.t = 1; o.c = 10; return; }
          const e = (dx / .19) ** 2 + ((y - .44) / .17) ** 2;
          if (e < 1 && fbm(x * 9, y * 9 + .3 * Math.sin(t * .8)) > .28 + e * .3) { o.t = 1; o.c = fbm(x * 5 + 3, y * 5) - (y - .44) * 1.5 > .5 ? 9 : 8; return; }
        }
        // Gusts roll across the grass as a travelling wave of leaning blades.
        const gust = Math.sin(t * 1.4 - x * 4 + noise(x * 2, t * .2) * 2), blade = gust > .3 ? 17 : gust < -.5 ? 18 : 16;
        if (y > n) {
          const d = y - n, h = hash(i, j);
          if (d < .05) { if (h < .3) return; o.g = blade; o.c = gust > .3 ? 3 : 2; o.v = .85; return; }
          if (h > .965) { o.g = 6; o.c = h > .983 ? 4 : 5; o.v = 1; return; }
          if (h > .55) { o.g = gust > .3 ? 20 : 21; o.c = 2; o.v = .55; }
          return;
        }
        if (y > f) { const h = hash(i, j); if (y - f < .03 && h > .4) { o.g = blade; o.c = 1; o.v = .6; return; } if (h > .97) { o.g = 6; o.c = 4; o.v = .6; } return; }
      } },
    galaxy: { pal: ['#fff4dc', '#f4a6d8', '#8fb8ff', '#b8a8ff', '#c45ab0', '#3fb8c0', '#e8ecff', '#ffe9a8'], ink: '#0a0718',
      bg(g, w, h) { grad(g, w, h, [[0, '#04030e'], [.6, '#0a0820'], [1, '#110a26']]); glow(g, w - h * .42, h * .42, h * .6, '#6a4ab030'); glow(g, h * .3, h * .8, h * .6, '#2a8a9a1c'); },
      f(x, y, t, A, o, i, j) {
        // A shooting star every seven seconds
        const cyc = Math.floor(t / 7), p = (t / 7 - cyc) * 2.5;
        if (p < 1) { const sx = hash(cyc, 1) * A * .8, sy = .05 + .2 * hash(cyc, 2), hx = sx + p * .6, back = hx - x;
          if (x > sx && back > 0 && back < .18 && Math.abs(y - sy - (x - sx) * .5) < o.ch * .5) { o.v = 1 - back / .18; o.c = 6; o.g = back < o.cw ? 5 : 18; return; } }
        // Spiral seen at a tilt: rotate into the galaxy plane, then undo the foreshortening.
        const dx = x - (A - .36), dy = y - .42, rx = dx * .94 + dy * .34, ry = (dy * .94 - dx * .34) * 2.6, r = Math.hypot(rx, ry);
        if (r < .5) {
          const arm = .5 + .5 * Math.cos(2 * (Math.atan2(ry, rx) - Math.log(r + .01) * 2.6 - t * .04)), core = Math.exp(-r / .05);
          if (core > .5) { o.t = 1; o.c = 0; return; }
          const v = core * 1.6 + arm ** 2.5 * Math.exp(-r / .26) * (.9 + 1.2 * fbm(x * 14, y * 14));
          if (v > .1) { o.v = Math.min(1, v); o.c = core > .15 ? 7 : r < .12 || hash(i, j) > .8 ? 1 : 2; return; }
        }
        { const m = fbm(x * 2.4 + t * .006, y * 2.4) - .36 - .3 * Math.hypot(x / (A * .4), (1 - y) / .6); if (m > 0) { o.v = Math.min(.4, m * 2); o.c = noise(x * 3, y * 3) > .5 ? 4 : 5; o.g = m > .12 ? 2 : 1; return; } }
        const fd = Math.hypot((x - .25) / .06, (y - .2) / .02); if (fd < 1) { o.v = (1 - fd) * .6; o.c = 3; return; }
        const h = hash(i, j); if (h > .985) { o.v = h > .997 ? .9 : .3 + .2 * Math.sin(t * (1 + h * 3) + h * 90) + .2; o.c = h > .993 ? 7 : 6; o.g = h > .997 ? 5 : 1; }
      } },
    bamboo: { pal: ['#4f8a3c', '#8cc66a', '#b4d3a8', '#5d9c45', '#c9d46a', '#ffffff', '#7a9a5a', '#2f5a26', '#9fc28e'], ink: '#2c4f24', inkA: .28,
      bg(g, w, h) { grad(g, w, h, [[0, '#d8ead6'], [.6, '#eef5e6'], [1, '#d4e4c8']]); glow(g, w * .5, h * .2, h * .8, '#ffffffa0'); },
      pre(t, A) { for (let k = 0; k < 14; k++) { PX[k] = wrap(hash(k, 1) * A - t * .02 + .04 * Math.sin(t * .8 + k), A + .1) - .05; PY[k] = wrap(hash(k, 2) + t * (.03 + .03 * hash(k, 3)), 1.1) - .05; PZ[k] = Math.floor(t * 3 + k) % 4; } },
      f(x, y, t, A, o, i, j) {
        for (let k = 0; k < 14; k++) if (Math.abs(x - PX[k]) < o.cw * .55 && Math.abs(y - PY[k]) < o.ch * .5) { o.g = [17, 3, 18, 16][PZ[k]]; o.c = k % 3 ? 3 : 4; o.v = 1; return; }
        for (let s = 0; s < STALKS.length; s++) {
          const S = STALKS[s], z = S[1], w = S[2], dx = x - (S[0] < 0 ? A + S[0] : S[0]) - .02 * z * (1 - y) ** 2 * Math.sin(t * .5 + s * 1.7);
          if (Math.abs(dx) < w && y < .95) { o.t = 1; o.c = z < .5 ? 2 : wrap(y + hash(s, 1), .14) < .012 ? 7 : dx < -w * .3 ? 1 : 0; return; }
          // Leaves droop outward from a few nodes
          for (let l = 0; l < 3; l++) {
            const side = hash(s, l + 7) > .5 ? 1 : -1, L = .05 + .07 * z, u = (dx * side - w) / L; if (u < 0 || u > 1) continue;
            const py = .1 + .55 * hash(s, l + 3) + .05 * u * u + .006 * Math.sin(t * 1.3 + s + l), th = (.004 + .01 * z) * (1 - (2 * u - 1) ** 2) + o.ch * .3;
            if (Math.abs(y - py) < th) { o.g = side > 0 ? 18 : 17; o.c = z < .5 ? 8 : 3; o.v = 1; return; }
          }
        }
        if (y > .93) { const h = hash(i, j); if (h > .4) { o.g = h > .8 ? 20 : 21; o.c = 6; o.v = .7; } return; }
        if (y > .55) { const m = noise(x * 2 + t * .02, y * 4); if (m > .62) { o.v = (m - .62) * 2.5; o.c = 5; o.g = 3; } }
      } },
    code: { pal: ['#eaffef', '#5dff8a', '#22c25e', '#0f5a2c'], ink: '#001a08',
      bg(g, w, h) { grad(g, w, h, [[0, '#010805'], [1, '#03140a']]); glow(g, w * .5, h * .5, h * .9, '#0a4a2030'); },
      f(x, y, t, A, o, i, j) {
        if (hash(i, 9) > .3) for (let k = 0; k < 2; k++) {
          const len = .25 + .35 * hash(i, k + 5), d = wrap(t * (.12 + .22 * hash(i, k + 2)) + hash(i, k + 4) * 3, 1.6) - .3 - y;
          if (d > 0 && d < len) { const q = d / len; o.v = 1 - q * .85; o.c = d < o.ch ? 0 : q < .3 ? 1 : 2; o.g = 3 + Math.floor(hash(i, j + Math.floor(t * (2 + 6 * hash(j, i)))) * 19); return; }
        }
        if (hash(i, j) > .975) { o.v = .2; o.c = 3; o.g = 3 + Math.floor(hash(j, i) * 19); }
      } },
    tide: { pal: ['#fff3c4', '#ffc58a', '#ffffff', '#ffffff', '#f2dcb6', '#dcc092', '#4a5a6e', '#fffaf2', '#5aa4b8', '#ffe2a8'], ink: '#a88a60', inkA: .3,
      bg(g, w, h) { grad(g, w, h, [[0, '#f9d6c4'], [.47, '#ffe7cf'], [.48, '#bfe0e6'], [.75, '#9ccfdb'], [1, '#86c2d0']]); glow(g, w - h * .45, h * .46, h * .5, '#fff3c890'); },
      f(x, y, t, A, o, i, j) {
        const H = .48, sx = A - .3;
        for (let b = 0; b < 3; b++) { const bx = wrap(t * .02 + b * .09 + .3, A + .3) - .15, by = .18 + .05 * b + .01 * Math.sin(t * .7 + b); if (Math.abs(x - bx) < o.cw * .5 && Math.abs(y - by) < o.ch * .5) { o.g = Math.sin(t * 4 + b * 2) > 0 ? 12 : 13; o.c = 6; o.v = .9; return; } }
        if (y < H) {
          const d = Math.hypot(x - sx, y - H);
          if (d < .1) { o.t = 1; o.c = d < .075 ? 0 : 1; return; }
          if (d < .16 && hash(i, j) > .4) { o.v = (1 - (d - .1) / .06) * .6; o.c = 9; o.g = 1; return; }
          if (y < .4 && noise(x * 1.4 - t * .006, y * 14) > .7) { o.v = .55; o.c = 7; o.g = 3; }
          return;
        }
        const shore = .9 + .025 * Math.sin(t * .5) + .015 * Math.sin(x * 3.1 + t * .3);
        if (y > shore) { o.t = 1; o.c = y < shore + .012 ? 3 : y < shore + .04 ? 5 : 4; return; }
        const z = (y - H) / (1 - H);
        if (Math.abs(x - sx) < .03 + z * .25 && hash(i, j + Math.floor(t * 4)) > .6 - z * .2) { o.g = 3; o.c = 9; o.v = .8 - z * .5; return; }
        // Swell lines in perspective, rolling toward the shore
        const band = wrap(1.2 / (z + .08) + t * .18 + .15 * Math.sin(x * 3 + z * 4), 1);
        if (band < .1 + z * .1) { o.g = 14; o.c = band < .04 ? 2 : 8; o.v = .4 + .5 * z; }
      } },
    autumn: { pal: ['#d9482f', '#ee8a2e', '#f4c04a', '#b8532a', '#a8361f', '#6a4530', '#d9a066'], ink: '#7a3a1a', inkA: .3,
      bg(g, w, h) { grad(g, w, h, [[0, '#f7e2c4'], [.7, '#f4dcbc'], [1, '#ecc8a0']]); glow(g, w * .5, h * .35, h * .7, '#fff2d880'); },
      pre(t, A) { for (let k = 0; k < 40; k++) { const z = hash(k, 9); PX[k] = wrap(hash(k, 1) * A + t * (.015 + .02 * z) + .05 * Math.sin(t * (.6 + z) + k), A + .1) - .05; PY[k] = wrap(hash(k, 2) + t * (.025 + .035 * z), 1.1) - .05; PZ[k] = z; } },
      f(x, y, t, A, o, i, j) {
        for (let k = 0; k < 40; k++) if (Math.abs(x - PX[k]) < o.cw * .55 && Math.abs(y - PY[k]) < o.ch * .5) { const z = PZ[k]; if (z > .8) { o.t = 1; o.c = k % 3; } else { o.g = [17, 3, 18, 16][Math.floor(t * (2 + 3 * z) + k) % 4]; o.c = k % 4; o.v = 1; } return; }
        for (let k = 0; k < MAPLES.length; k++) {
          const T = MAPLES[k], r = T[2], dx = x - (T[0] < 0 ? A + T[0] : T[0]); if (Math.abs(dx) > r * 1.15) continue;
          if (y > T[1] + r * .5 && y < .92 && Math.abs(dx) < r * .09 + Math.max(0, y - .82) * .15) { o.t = 1; o.c = 5; return; }
          const e = (dx / r) ** 2 + ((y - T[1]) / (r * .8)) ** 2;
          if (e < 1 && fbm(x * 7 + k * 3, y * 7 + .2 * Math.sin(t * .7)) > .3 + e * .28) { const n = fbm(x * 4 + 9, y * 4); o.t = 1; o.c = e > .75 && y > T[1] ? 4 : n > .58 ? 0 : n > .44 ? 1 : 2; return; }
        }
        if (y > .92 + .01 * Math.sin(x * 4)) { const h = hash(i, j); o.t = 1; o.c = h > .8 ? 1 : h > .6 ? 0 : h > .4 ? 2 : 6; }
      } },
    alpine: { pal: ['#ffffff', '#fff7f4', '#fff6e0', '#4a4670', '#6e6aa0', '#efe6f6', '#c9bce2', '#ffbf8a', '#857ab8'], ink: '#8a80b4', inkA: .34,
      bg(g, w, h) {
        grad(g, w, h, [[0, '#c7c3ea'], [.35, '#efd2dc'], [.6, '#ffe2c8'], [1, '#f6dccb']]); glow(g, w - h * .6, h * .5, h * .5, '#fff1d0a0');
        for (let L = 0; L < 4; L++) { g.fillStyle = ALPS[L][4]; g.beginPath(); g.moveTo(0, h); for (let px = 0; px <= w + 4; px += 4) g.lineTo(px, alpY(px / h, L) * h); g.lineTo(w, h); g.fill(); }
      },
      f(x, y, t, A, o, i, j) {
        // A V of geese crossing slowly
        for (let b = 0; b < 5; b++) { const s = b - 2, bx = wrap(t * .018, A + .5) - .25 - Math.abs(s) * .03, by = .22 + s * .018 + .005 * Math.sin(t * 2 + b); if (Math.abs(x - bx) < o.cw * .5 && Math.abs(y - by) < o.ch * .5) { o.g = Math.sin(t * 5 + b) > 0 ? 12 : 13; o.c = 3; o.v = .9; return; } }
        for (let L = 3; L >= 0; L--) {
          const top = alpY(x, L); if (y < top) continue;
          const d = y - top, lit = alpY(x + .01, L) > top;
          if (L >= 1 && d < .07 && y < .56 + .02 * noise(x * 12, L)) { o.t = 1; o.c = d < o.ch ? 0 : 5; return; }
          if (d < o.ch * .8) { o.g = 3; o.c = lit ? 1 : 6; o.v = .6 + .1 * L; return; }
          if (L < 3) { const m = fbm(x * 1.6 - t * .012, y * 6 + L) - .55; if (m > 0 && d > .02) { o.v = Math.min(.7, m * 4); o.c = 1; o.g = m > .08 ? 4 : 3; return; } }
          if (L < 3 && hash(i, j) > .7 + .08 * L && Math.sin((x * 30 + d * 60) * (lit ? 1 : -1)) > .4) { o.g = lit ? 18 : 17; o.c = lit ? 5 : 8; o.v = .3 + .1 * L; }
          return;
        }
        const d = Math.hypot(x - (A - .32), y - .36);
        if (d < .07) { o.t = 1; o.c = 2; return; }
        if (d < .15 && hash(i, j) > .3) { o.v = (1 - (d - .07) / .08) * .9; o.c = 7; o.g = d < .1 ? 2 : 1; }
      } },
    retro: { pal: ['#ffe066', '#ff8a3d', '#ff2d8a', '#24093f', '#ff5ad8', '#ff4fd8', '#6ad8ff', '#f2e6ff'], ink: '#3a0820', inkA: .3,
      bg(g, w, h) { grad(g, w, h, [[0, '#0b021d'], [.4, '#25093f'], [.6, '#6a1b5a'], [.601, '#12042a'], [1, '#1c0638']]); glow(g, w - h * .5, h * .5, h * .6, '#ff3d8a38'); },
      f(x, y, t, A, o, i, j) {
        if (y > .6) {
          // Neon floor grid running to a vanishing point on the horizon
          const z = (y - .6) / .4, vp = A / 2, n = Math.round((x - vp) / (z + .03) * 1.5);
          if (Math.abs(x - vp - n / 1.5 * (z + .03)) < o.cw * .55) { o.g = n < 0 ? 17 : n > 0 ? 18 : 16; o.c = 6; o.v = .25 + .6 * z; return; }
          const dz = o.ch / .8; if (z > .04 && Math.floor(4 / (z - dz + .12) + t * .6) !== Math.floor(4 / (z + dz + .12) + t * .6)) { o.g = 3; o.c = 5; o.v = .15 + .85 * z; }
          return;
        }
        const ridge = retroY(x, A);
        if (y > ridge) { if (y - ridge < o.ch) { const s = retroY(x + .01, A) - ridge; o.g = Math.abs(s) < .002 ? 3 : s < 0 ? 17 : 18; o.c = 4; o.v = 1; } else { o.t = 1; o.c = 3; } return; }
        const d = Math.hypot(x - (A - .3), y - .44);
        if (d < .16) { const q = (y - .28) / .32; if (!(q > .45 && Math.sin(y * 120 + t * 1.5) > 1.4 - q * 2)) { o.t = 1; o.c = q < .35 ? 0 : q < .65 ? 1 : 2; return; } }
        const h = hash(i, j); if (y < .45 && h > .988) { o.v = .5 + .3 * Math.sin(t * 1.7 + h * 40); o.c = 7; o.g = 1; }
      } },
    lava: { pal: ['#ffe27a', '#ff9a3c', '#ff4a5a', '#ff7a4a', '#ffb0d0'], ink: '#6a1020', inkA: .32,
      bg(g, w, h) { grad(g, w, h, [[0, '#14051f'], [.6, '#250929'], [1, '#3a0d22']]); glow(g, w * .5, h * 1.05, h * .7, '#ff6a2a40'); },
      pre(t, A) { for (let k = 0; k < 9; k++) { PX[k] = A / 2 + (k % 2 ? 1 : -1) * A * (.3 + .17 * hash(k, 1)) + .04 * Math.sin(t * .13 + k); PY[k] = .5 + .42 * Math.sin(t * (.05 + .05 * hash(k, 2)) + k * 2.1); PZ[k] = (.035 + .045 * hash(k, 3)) ** 2; } },
      f(x, y, t, A, o, i, j) {
        // Metaballs: blobs merge and split where their summed field crosses 1.
        let F = y > .95 + .015 * Math.sin(x * 5 + t * .4) ? 1.6 : 0;
        for (let k = 0; k < 9; k++) { const dx = x - PX[k], dy = (y - PY[k]) * .8; F += PZ[k] / (dx * dx + dy * dy + 1e-4); }
        if (F > 1) { o.t = 1; o.c = F > 2.6 ? 0 : F > 1.5 ? 1 : 2; return; }
        if (F > .7) { o.v = (F - .7) * 1.4; o.c = 3; o.g = hash(i, j) > .5 ? 1 : 2; return; }
        if (hash(i, 5) > .93 && Math.abs(y - 1 + wrap(t * .05 * (1 + hash(i, 2)) + hash(i, 3), 1.1)) < o.ch * .5) { o.g = 15; o.c = 4; o.v = .6; }
      } }
  };

  const cache = new WeakMap(), atlases = new Map(), o = { v: 0, c: 0, t: 0, g: -1, cw: 0, ch: 0 }, ALPHA = [.45, .65, .85, 1], TG = [2, 2, 7, 7, 9, 10, 1, 8];
  function atlasFor(id, sc, theme, aw, ah) {
    const key = id + '|' + aw + '|' + ah; let a = atlases.get(key); if (a) return a;
    a = document.createElement('canvas'); a.width = CH.length * aw; a.height = (sc.pal.length + 1) * ah;
    const g = a.getContext('2d'); g.font = `${Math.max(4, Math.round(ah * .74))}px Consolas, "Cascadia Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...sc.pal, sc.ink || theme.glyph].forEach((color, r) => { g.fillStyle = color; for (let c = 1; c < CH.length; c++) g.fillText(CH[c], c * aw + aw / 2, r * ah + ah * .54); });
    atlases.set(key, a); return a;
  }
  function background(w, h, theme, sc, k, cw, ch) {
    const c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
    const g = c.getContext('2d'); g.scale(k, k);
    if (sc.bg) sc.bg(g, w, h, theme); else grad(g, w, h, [[0, theme.sky], [1, theme.floor]]);
    // Side light bands from the reference, then its faint character grid, stronger toward the edges.
    const beam = (x, bw, a) => { const b = g.createLinearGradient(x, 0, x + bw, 0), hex = Math.round(a * 255).toString(16).padStart(2, '0'); b.addColorStop(0, theme.beam + '00'); b.addColorStop(.4, theme.beam + hex); b.addColorStop(.6, theme.beam + hex); b.addColorStop(1, theme.beam + '00'); g.fillStyle = b; g.fillRect(x, 0, bw, h); };
    const a = theme.light ? .3 : .16; beam(-w * .1, w * .28, a); beam(w * .82, w * .28, a);
    if (ch >= 8) {
      g.strokeStyle = theme.light ? '#ffffff' : theme.beam; g.lineWidth = 1 / k;
      for (let x = 0; x < w; x += cw) { g.globalAlpha = .025 + .06 * Math.min(1, Math.abs(x - w / 2) / (w / 2)) ** 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.globalAlpha = .022; for (let y = 0; y < h; y += ch) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    }
    return c;
  }
  // Cells are whole device pixels and live on a persistent layer; only cells whose glyph, colour or tile changed are repainted.
  // calm: optional {l, r} in CSS px, the live conversation column; without it the centre third is kept calm.
  return function draw(ctx, width, height, theme, seconds, strength = 1, calm) {
    if (!(width > 0 && height > 0)) return;
    const sc = SCENES[theme.id] || SCENES.clouds, k = ctx.getTransform().a || 1, base = height > 220 ? 14 : Math.max(3.5, height / 24);
    const ah = Math.max(3, Math.round(base * k)), aw = Math.max(2, Math.round(base * .66 * k)), cw = aw / k, ch = ah / k;
    const cols = Math.ceil(width / cw), rows = Math.ceil(height / ch), n = cols * rows, A = width / height, half = A / 2, gap = aw >= 6 ? 1 : 0;
    let st = cache.get(ctx); if (!st) { st = {}; cache.set(ctx, st); }
    const key = width + '|' + height + '|' + theme.id + '|' + k;
    if (st.key !== key) {
      st.key = key; st.bg = background(width, height, theme, sc, k, cw, ch); st.K = new Int32Array(n).fill(-1);
      st.layer = document.createElement('canvas'); st.layer.width = cols * aw; st.layer.height = rows * ah; st.lg = st.layer.getContext('2d'); st.atlas = atlasFor(theme.id, sc, theme, aw, ah);
    }
    const K = st.K, lg = st.lg, atlas = st.atlas, pal = sc.pal, inkRow = pal.length, phase = Math.floor(seconds * 2.2);
    o.cw = cw / height; o.ch = ch / height; sc.pre?.(seconds, A);
    const cl = calm ? calm.l / height : -1, cr = calm ? calm.r / height : -1;
    for (let j = 0, p = 0; j < rows; j++) {
      const y = (j + .5) * ch / height;
      for (let i = 0; i < cols; i++, p++) {
        const x = (i + .5) * cw / height;
        o.v = 0; o.c = 0; o.t = 0; o.g = -1; sc.f(x, y, seconds, A, o, i, j);
        // Keep the conversation column calm: subjects pass behind it as faint characters, never solid tiles.
        const e = cl < 0 ? sm(A * .17, A * .33, Math.abs(x - half)) : sm(-.01, .08, Math.max(cl - x, x - cr));
        let tile = o.t, g, b = 3;
        // Solid subjects dissolve (dithered, no hard edge) into a light stipple as they cross the centre.
        if (tile && hash(i * 3 + 1, j * 5 + 2) > e * 1.8) { tile = 0; o.v = .5; o.g = hash(i, j) > .45 ? 2 : 1; }
        if (tile) g = o.g >= 0 ? o.g : TG[Math.floor(hash(i + (hash(i, j + phase * 31) > .88 ? phase : 0), j) * TG.length)];
        else { const v = o.v * (.45 + .55 * e); g = v < .06 ? 0 : o.g >= 0 ? (v > .12 ? o.g : 0) : Math.min(11, 1 + Math.floor(v * 11)); b = v > .7 ? 3 : v > .45 ? 2 : v > .25 ? 1 : 0; }
        const shade = tile && ((p * 2654435761) >>> 0) % 3 === 0 ? 1 : 0;
        const kk = g ? g | o.c << 5 | tile << 9 | b << 10 | shade << 12 : 0;
        if (kk === K[p]) continue; K[p] = kk;
        const X = i * aw, Y = j * ah; lg.clearRect(X, Y, aw, ah); if (!g) continue;
        if (tile) { lg.globalAlpha = shade ? .78 : .94; lg.fillStyle = pal[o.c]; lg.fillRect(X + gap, Y + gap, aw - gap, ah - gap); lg.globalAlpha = sc.inkA || .5; lg.drawImage(atlas, g * aw, inkRow * ah, aw, ah, X, Y, aw, ah); }
        else { lg.globalAlpha = ALPHA[b]; lg.drawImage(atlas, g * aw, o.c * ah, aw, ah, X, Y, aw, ah); }
      }
    }
    ctx.save(); ctx.globalAlpha = 1; ctx.drawImage(st.bg, 0, 0, width, height);
    ctx.globalAlpha = strength; ctx.drawImage(st.layer, 0, 0, cols * cw, rows * ch); ctx.restore();
  };
})();
