// The night sky behind Andromeda: one big hand-drawn sky that the camera pans across.
// Each view sits over its own constellation. Lines trace in once the camera arrives.
(function () {
  'use strict';

  // ---------- small helpers ----------
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = (r) => (r() + r() + r() + r() - 2) / 2; // roughly normal, -1..1
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // ---------- the sky's layout (world units = screen pixels at rest) ----------
  // The sky wraps around left to right like the real one: x0 and x1 are the same place.
  const WORLD = { x0: -1500, y0: -1600, x1: 6700, y1: 4600 };
  const PERIOD = WORLD.x1 - WORLD.x0;
  const wrapX = (x) => x - PERIOD * Math.floor((x - WORLD.x0) / PERIOD);
  // The stars first painted between these heights; the strips above and below were added later.
  const CORE_Y = [-900, 3900];

  // Centre line of the Milky Way around the sky: one long, gentle wave, highest by Ursa Major and
  // lowest by Ursa Minor (Catmull-Rom through these points). The last point is the first one again,
  // a full turn later, so the band joins up with itself.
  const BAND = Array.from({ length: 11 }, (_, i) => {
    const x = -1500 + i * 820;
    return [x, Math.round(1575 - 775 * Math.cos(2 * Math.PI * (x - 1300) / 8200))];
  });
  const CORE = [260, 1400]; // where the band glows gold, like the galactic core

  // Constellations: points are [x, y, brightness]; edges join point indexes in tracing order.
  // Shapes follow the real star patterns, placed by hand.
  const CONSTELLATIONS = {
    ursaMajor: {
      name: 'Ursa Major',
      pts: [[1060, 150, 1.3], [1050, 232, 1.2], [1160, 262, 1.1], [1182, 192, 1], [1262, 182, 1.2], [1332, 170, 1.2], [1410, 212, 1.2], [1206, 382, 0.9], [1234, 470, 0.9], [962, 330, 0.9], [932, 420, 0.9]],
      edges: [[6, 5], [5, 4], [4, 3], [3, 0], [0, 1], [1, 2], [2, 3], [2, 7], [7, 8], [1, 9], [9, 10]],
      at: [0, 760],
    },
    ursaMinor: {
      name: 'Ursa Minor',
      pts: [[1250, 150, 1.7], [1196, 214, 0.9], [1150, 270, 0.9], [1118, 330, 0.9], [1166, 398, 1.3], [1100, 436, 1.1], [1070, 370, 0.85]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
      at: [4340, 1857], // far side of the sky from Ursa Major, so Settings feels like its own place
    },
    orion: {
      name: 'Orion',
      pts: [[1150, 166, 1], [1084, 236, 1.9], [1232, 256, 1.3], [1130, 420, 1.2], [1162, 410, 1.2], [1194, 400, 1.2], [1102, 606, 1.2], [1250, 596, 1.9]],
      edges: [[0, 1], [0, 2], [1, 3], [3, 4], [4, 5], [2, 5], [3, 6], [5, 7]],
      at: [2800, 1500],
    },
  };

  // Each view looks at one constellation. The constellation sits up and to the right, like the mockups.
  const VIEWS = { courses: 'ursaMajor', guides: 'orion', settings: 'ursaMinor' };

  // Each course's constellation, from the shared list, drawn 3x larger in the sky.
  const SHARED = (window.AndromedaConstellations && window.AndromedaConstellations.COURSE) || {};
  // They're spread evenly along the Milky Way, alternating above and below it, each in the dark sky
  // just beside the glow: every star stays at least CLEAR px from the band's centre line, so the stars
  // and lines read clearly, with the band running close by. Each takes the nearest free spot to its
  // share of the band where its outline, plus a margin, touches no other constellation.
  {
    const keys = Object.keys(SHARED), line = bandSamples(20), N = line.length;
    const M = 90; // room around each one, so outlines stay at least 180px apart
    const CLEAR = 360; // the glow fades out about 300px from the band's centre
    const span = (pts) => {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    const placed = Object.values(CONSTELLATIONS).map((c) => {
      const s = span(c.pts);
      return [s.x0 + c.at[0] - M, s.y0 + c.at[1] - M, s.x1 + c.at[0] + M, s.y1 + c.at[1] + M];
    });
    const hits = (b) => placed.some((p) => [-PERIOD, 0, PERIOD].some((sh) => b[0] + sh < p[2] && b[2] + sh > p[0] && b[1] < p[3] && b[3] > p[1]));
    // How far a point is from the band's centre line, wherever it is round the sky.
    const bandDist = (x, y) => {
      let best = Infinity;
      for (const [bx, by] of line) {
        let dx = Math.abs(x - bx) % PERIOD; dx = Math.min(dx, PERIOD - dx);
        if (dx < best) best = Math.min(best, Math.hypot(dx, y - by));
      }
      return best;
    };
    const OFFSETS = [];
    for (let o = 300; o <= 1300; o += 50) OFFSETS.push(o);
    keys.forEach((key, k) => {
      const c = SHARED[key];
      const pts = c.p.map(([x, y, m]) => [x * 3, y * 3, (m || 1) * 1.05]);
      const s = span(pts), w = s.x1 - s.x0, h = s.y1 - s.y0, mx = (s.x0 + s.x1) / 2, my = (s.y0 + s.y1) / 2;
      const ideal = ((k + 0.5) / keys.length) * N, pref = k % 2 ? 1 : -1;
      let best = null;
      // Search outward from its share of the band; stop once nothing further along can do better.
      for (let step = 0; step <= N / 2; step++) {
        if (best && step > best.score) break;
        for (const i of step ? [Math.round(ideal) + step, Math.round(ideal) - step] : [Math.round(ideal)]) {
          const [bx, by] = line[((i % N) + N) % N];
          for (const side of [pref, -pref]) {
            for (const off of OFFSETS) {
              const cx = bx, cy = by + side * off;
              const b = [cx - w / 2 - M, cy - h / 2 - M, cx + w / 2 + M, cy + h / 2 + M];
              if (hits(b)) continue;
              const near = Math.min(...pts.map(([x, y]) => bandDist(x - mx + cx, y - my + cy)));
              if (near < CLEAR) continue;
              const score = step + (near - CLEAR) / 25 + (side === pref ? 0 : 6);
              if (!best || score < best.score) best = { score, cx, cy, b };
              break; // further out on this side would only be further from the band
            }
          }
        }
      }
      if (!best) { // no free spot left: sit beside its share of the band anyway
        const [cx, by] = line[Math.floor(ideal) % N], cy = by + pref * (CLEAR + h / 2);
        best = { cx, cy, b: [cx - w / 2 - M, cy - h / 2 - M, cx + w / 2 + M, cy + h / 2 + M] };
      }
      placed.push(best.b);
      CONSTELLATIONS['con:' + key] = { name: c.name, pts, edges: c.e, at: [best.cx - mx, best.cy - my], course: true };
    });
  }
  // A view id ('courses'), or a course constellation ('con:lyra').
  const conOf = (id) => (CONSTELLATIONS[id] ? id : VIEWS[id]);

  // Place constellation points in world space.
  for (const c of Object.values(CONSTELLATIONS)) {
    c.world = c.pts.map(([x, y, m]) => [x + c.at[0], y + c.at[1], m]);
    const xs = c.world.map((p) => p[0]), ys = c.world.map((p) => p[1]);
    c.center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    c.seed = [...c.name].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) % 100000;
    c.len = c.edges.reduce((s, [a, b]) => s + Math.hypot(c.world[b][0] - c.world[a][0], c.world[b][1] - c.world[a][1]), 0);
    c.hw = (Math.max(...xs) - Math.min(...xs)) / 2; c.hh = (Math.max(...ys) - Math.min(...ys)) / 2;
  }

  // Sky darkness, 0 (city) to 1 (dark sky). The app's sky before the slider sits at about 0.8.
  // Like real light pollution: the faintest stars go first, the Milky Way fades, and a grey-orange
  // glow rises from the horizon.
  const glowShare = (d) => 0.1 + 0.9 * Math.pow(d, 1.5);
  const faintShare = (d) => 0.08 + 1.375 * Math.pow(d, 1.8); // 1 is every star the sky had before
  const brightShare = (d) => 0.25 + 0.75 * clamp(d / 0.45, 0, 1);
  const OTHER_LINES = 0.4; // other constellations in view get faint lines; the main one traces in at full

  // Sample the band's centre line.
  function bandSamples(step) {
    const out = [];
    const n = BAND.length - 1;
    // Control point i, carried round the sky as many turns as needed.
    const at = (i) => { const k = ((i % n) + n) % n, turns = Math.floor(i / n); return [BAND[k][0] + turns * PERIOD, BAND[k][1]]; };
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(2, Math.ceil(segLen / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    return out;
  }

  // ---------- build the sky once ----------
  function buildStars() {
    const r = rng(20261122);
    const W = PERIOD, H = CORE_Y[1] - CORE_Y[0];
    const faint = [], bright = [];
    // Even field of faint stars.
    for (let i = 0; i < 4800; i++) {
      faint.push({ x: WORLD.x0 + r() * W, y: CORE_Y[0] + r() * H, r: 0.35 + r() * 0.6, a: 0.3 + r() * 0.5, c: r() < 0.15 ? 1 : r() < 0.25 ? 2 : 0 });
    }
    // Thick star clouds along the Milky Way.
    const line = bandSamples(12);
    for (let i = 0; i < 4200; i++) {
      const [bx, by] = line[Math.floor(r() * line.length)];
      const spread = 150 * (0.6 + r() * 0.8);
      faint.push({ x: wrapX(bx + gauss(r) * spread * 0.6), y: by + gauss(r) * spread, r: 0.3 + r() * 0.5, a: 0.25 + r() * 0.5, c: r() < 0.2 ? 1 : 0 });
    }
    // Scattered bright stars that twinkle.
    for (let i = 0; i < 300; i++) {
      bright.push({ x: WORLD.x0 + r() * W, y: CORE_Y[0] + r() * H, r: 0.9 + r() * 0.9, a: 0.7 + r() * 0.3, seed: 1000 + i, c: r() < 0.2 ? 1 : r() < 0.3 ? 2 : 0 });
    }
    // The same field carried on above and below, at the same density, for tall windows.
    // (A second seed, so the stars above stay exactly where they were.)
    const r2 = rng(20261123);
    for (const [y0, y1] of [[WORLD.y0, CORE_Y[0]], [CORE_Y[1], WORLD.y1]]) {
      const h = y1 - y0, k = h / H;
      for (let i = 0; i < Math.round(4800 * k); i++) {
        faint.push({ x: WORLD.x0 + r2() * W, y: y0 + r2() * h, r: 0.35 + r2() * 0.6, a: 0.3 + r2() * 0.5, c: r2() < 0.15 ? 1 : r2() < 0.25 ? 2 : 0 });
      }
      for (let i = 0; i < Math.round(300 * k); i++) {
        bright.push({ x: WORLD.x0 + r2() * W, y: y0 + r2() * h, r: 0.9 + r2() * 0.9, a: 0.7 + r2() * 0.3, seed: 5000 + bright.length, c: r2() < 0.2 ? 1 : r2() < 0.3 ? 2 : 0 });
      }
    }
    // Rank every star brightest first, so a brighter sky loses its faintest stars first.
    const glow = (s) => s.a * s.r;
    for (const list of [faint, bright]) [...list].sort((p, q) => glow(q) - glow(p)).forEach((s, i, all) => { s.rank = i / all.length; });
    // Extra faint stars that only a darker sky than before shows, thickest along the Milky Way.
    const r3 = rng(99), extra = Math.round(faint.length * 0.6);
    for (let i = 0; i < extra; i++) {
      let x, y;
      if (r3() < 0.45) { const [bx, by] = line[Math.floor(r3() * line.length)]; x = wrapX(bx + gauss(r3) * 110); y = by + gauss(r3) * 190; }
      else { x = WORLD.x0 + r3() * W; y = WORLD.y0 + r3() * (WORLD.y1 - WORLD.y0); }
      faint.push({ x, y, r: 0.28 + r3() * 0.35, a: 0.18 + r3() * 0.32, c: r3() < 0.15 ? 1 : 0, rank: 1 + 0.6 * r3() });
    }
    return { faint, bright };
  }

  // The Milky Way glow, painted small and soft, then scaled up when drawn.
  function buildBand() {
    const S = 0.2;
    // One full turn of the sky is BW pixels wide. The raw painting gets a margin on both sides,
    // filled with glow from the other end, so the blur has the right neighbours at the join.
    const BW = Math.round(PERIOD * S), PAD = 40;
    const W = BW + PAD * 2, H = Math.ceil((WORLD.y1 - WORLD.y0) * S);
    const raw = document.createElement('canvas'); raw.width = W; raw.height = H;
    const g = raw.getContext('2d');
    const r = rng(7);
    const to = (x, y) => [(x - WORLD.x0) * S + PAD, (y - WORLD.y0) * S];
    const blob = (x, y, rad, color, alpha) => {
      const [x0, cy] = to(x, y), R = rad * S;
      for (const cx of [x0 - BW, x0, x0 + BW]) {
        if (cx + R < 0 || cx - R > W) continue;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
        gr.addColorStop(0, `rgba(${color},${alpha})`);
        gr.addColorStop(1, `rgba(${color},0)`);
        g.fillStyle = gr;
        g.fillRect(cx - R, cy - R, R * 2, R * 2);
      }
    };
    const line = bandSamples(26);
    g.globalCompositeOperation = 'lighter';
    for (const [x, y] of line) {
      const core = Math.exp(-Math.pow(Math.hypot(x - CORE[0], y - CORE[1]) / 900, 2));
      const wob = 0.7 + r() * 0.6;
      blob(x + gauss(r) * 40, y + gauss(r) * 60, 300 * wob, '75,58,120', 0.038);
      blob(x + gauss(r) * 30, y + gauss(r) * 40, 170 * wob, '196,106,143', 0.015 + core * 0.016);
      blob(x + gauss(r) * 20, y + gauss(r) * 30, 120 * wob, '232,201,160', 0.01 + core * 0.05);
      if (r() < 0.35) blob(x + gauss(r) * 120, y + gauss(r) * 160, 90, '47,127,134', 0.03);
    }
    // Dark dust lanes along the band.
    g.globalCompositeOperation = 'source-over';
    for (const [x, y] of line) {
      if (r() < 0.55) blob(x + 18 + gauss(r) * 14, y + 26 + gauss(r) * 18, 34 + r() * 30, '10,8,16', 0.32);
    }
    // The finished glow is one turn plus a second copy after it, so any window's worth of sky
    // can be cut out in one piece, wherever the camera is.
    const soft = document.createElement('canvas'); soft.width = BW * 2; soft.height = H;
    const s = soft.getContext('2d');
    s.filter = 'blur(5px)';
    s.drawImage(raw, -PAD, 0);
    s.filter = 'none';
    s.clearRect(BW, 0, BW, H);
    s.drawImage(soft, 0, 0, BW, H, BW, 0, BW, H);
    return { canvas: soft, scale: S, turn: BW };
  }

  // Galaxies far behind the stars. None sit in the Milky Way's path: in the real sky its dust hides
  // whatever lies behind it. Andromeda's galaxy sits beside the Andromeda constellation, as it really does.
  const GALAXIES = [];
  {
    const r = rng(4242), line = bandSamples(30);
    const bandDist = (x, y) => { let best = Infinity; for (const [bx, by] of line) { let dx = Math.abs(x - bx) % PERIOD; dx = Math.min(dx, PERIOD - dx); if (dx < best) best = Math.min(best, Math.hypot(dx, y - by)); } return best; };
    const boxes = Object.values(CONSTELLATIONS).map((c) => { const xs = c.world.map((p) => p[0]), ys = c.world.map((p) => p[1]); return [Math.min(...xs) - 60, Math.min(...ys) - 60, Math.max(...xs) + 60, Math.max(...ys) + 60]; });
    const inBox = (x, y, s) => boxes.some((b) => [-PERIOD, 0, PERIOD].some((sh) => x + s > b[0] + sh && x - s < b[2] + sh && y + s > b[1] && y - s < b[3]));
    const far = (x, y, d) => GALAXIES.every((g) => { let dx = Math.abs(g.x - x) % PERIOD; dx = Math.min(dx, PERIOD - dx); return Math.hypot(dx, g.y - y) > d; });
    const A = CONSTELLATIONS['con:andromeda'];
    if (A) {
      const xs = A.world.map((p) => p[0]), ys = A.world.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const up = bandDist(cx, Math.min(...ys) - 200) > bandDist(cx, Math.max(...ys) + 200);
      GALAXIES.push({ type: 'andromeda', seed: 31, x: cx + 60, y: up ? Math.min(...ys) - 150 : Math.max(...ys) + 150, size: 100, pa: 145, incl: 77 });
    }
    // Ursa Major's part of the real sky is full of galaxies: Bode's Galaxy (M81) with the Cigar (M82)
    // beside it, and the Pinwheel (M101) by the end of the Big Dipper's handle.
    if (CONSTELLATIONS.ursaMajor) {
      GALAXIES.push({ type: 'tight', seed: 81, x: 1000, y: 1420, size: 26, pa: 150, incl: 58 });
      GALAXIES.push({ type: 'edgeon', seed: 82, x: 1075, y: 1370, size: 16, pa: 30, incl: 82 });
      GALAXIES.push({ type: 'spiral', seed: 101, x: 1370, y: 1430, size: 24, pa: 10, incl: 15 });
    }
    const TYPES = ['spiral', 'elliptical', 'edgeon', 'lenticular', 'irregular', 'tight', 'elliptical', 'spiral', 'sombrero', 'pair', 'edgeon', 'elliptical', 'spiral', 'irregular', 'tight', 'lenticular'];
    // Mostly in the dark sky within reach of the views (up to about 1100px from the band).
    for (let tries = 0; GALAXIES.length < 52 && tries < 20000; tries++) {
      const [bx, by] = line[Math.floor(r() * line.length)];
      const x = bx + (r() - 0.5) * 300, y = by + (r() < 0.5 ? -1 : 1) * (380 + r() * 760);
      const k = r(), size = k < 0.6 ? 8 + r() * 9 : k < 0.9 ? 17 + r() * 13 : 32 + r() * 22;
      if (bandDist(x, y) < 380 + size || inBox(x, y, size) || !far(x, y, 380)) continue;
      const n = GALAXIES.length;
      GALAXIES.push({ type: TYPES[n % TYPES.length], seed: 100 + n, x, y, size, pa: Math.round(r() * 180), incl: null });
    }
  }

  // ---------- the sky object ----------
  function createSky(canvas, opts) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const reduce = opts.reduceMotion;
    // How much bright stars dim and brighten: 0 is still, 0.9 is the most the slider allows.
    const twinkleAmount = () => (opts.twinkle ? opts.twinkle() : 0.06);
    const darkness = () => clamp(opts.darkness ? opts.darkness() : 0.8, 0, 1);
    const stars = buildStars();
    const band = buildBand();
    const COLORS = ['#DCE2F2', '#F3E6D2', '#CFE0FF'];

    let W = 0, H = 0, dpr = 1, base = null;
    let view = null;
    let cam = [0, 0];
    let pan = null; // { from, to, start, dur, resolve }
    let lines = { id: null, p: 1, out: null };
    let mouse = [0, 0], mouseT = [0, 0];
    let alpha = 1, fade = null;
    let last = 0, dirty = true;
    let still = null, stillKey = '';

    function camFor(id) {
      const k = CONSTELLATIONS[conOf(id)], c = k.center;
      // Tab constellations sit up and to the right; a course's sits lower, in the open space under its page.
      const fx = k.course ? 0.7 : W < 1100 ? 0.74 : 0.8, fy = k.course ? 0.7 : 0.3;
      return [c[0] - (fx - 0.5) * W, c[1] - (fy - 0.5) * H];
    }
    // The same spot, a whole number of turns round so it's the nearest one: pans take the short way.
    const nearest = (t) => [t[0] + PERIOD * Math.round((cam[0] - t[0]) / PERIOD), t[1]];

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      base = document.createElement('canvas');
      base.width = canvas.width; base.height = canvas.height;
      const b = base.getContext('2d');
      b.scale(dpr, dpr);
      const R = Math.max(W, H) * 1.25;
      const rg = b.createRadialGradient(W * 0.7, 0, 0, W * 0.7, 0, R);
      rg.addColorStop(0, '#0B1026'); rg.addColorStop(0.5, '#080B1E'); rg.addColorStop(1, '#05060F');
      b.fillStyle = rg; b.fillRect(0, 0, W, H);
      const tw = b.createLinearGradient(0, 0, 0, H * 0.45);
      tw.addColorStop(0, 'rgba(26,27,75,0.35)'); tw.addColorStop(1, 'rgba(26,27,75,0)');
      b.fillStyle = tw; b.fillRect(0, 0, W, H * 0.45);
      const ag = b.createLinearGradient(0, H, 0, H * 0.66);
      ag.addColorStop(0, 'rgba(47,127,134,0.12)'); ag.addColorStop(1, 'rgba(47,127,134,0)');
      b.fillStyle = ag; b.fillRect(0, H * 0.66, W, H * 0.34);
      if (view && !pan) cam = nearest(camFor(view));
      dirty = true;
    }

    // Layer cameras: deeper layers lag slightly mid-pan, which gives depth. All agree at rest.
    function layerCam(depth) {
      if (!pan) return cam;
      const t = clamp((performance.now() - pan.start) / pan.dur, 0, 1);
      const e = Math.pow(easeInOut(t), 1 + (1 - depth) * 3);
      return [lerp(pan.from[0], pan.to[0], e), lerp(pan.from[1], pan.to[1], e)];
    }

    // ---------- twinkling, modelled on real scintillation ----------
    // Turbulent air makes a star's light flicker irregularly, changing many times a second (not a slow
    // pulse). Bright stars show it most, stars low in the sky twinkle far more than high ones, and the
    // brightest low stars flash faint colours. The bottom of the window counts as "low in the sky".
    const hash = (n) => {
      n |= 0;
      n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
      n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const noise = (seed, x) => {
      const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
      const a = hash(seed * 7919 + i), b = hash(seed * 7919 + i + 1);
      return (a + (b - a) * u) * 2 - 1;
    };
    const lowness = (y) => 0.55 + 0.9 * clamp(y / H, 0, 1);
    function scint(seed, t, y, mag, amt) {
      const k = amt * lowness(y) * mag;
      let v = 1 + k * (0.65 * noise(seed, t * 11) + 0.35 * noise(seed + 17, t * 23));
      const wink = noise(seed + 51, t * 2.5); // now and then a brief, deeper dip
      if (wink > 0.8) v -= k * 1.5 * (wink - 0.8) / 0.2;
      return clamp(v, 0.15, 1.7);
    }

    function drawStars(g, list, camL, depth, now, amt, share, dim) {
      const ox = W / 2 - camL[0] + mouse[0] * 14 * depth, oy = H / 2 - camL[1] + mouse[1] * 10 * depth;
      const t = now / 1000;
      for (let c = 0; c < 3; c++) {
        g.fillStyle = COLORS[c];
        for (const s of list) {
          if (s.c !== c || s.rank >= share) continue;
          let x = s.x + ox;
          x -= PERIOD * Math.floor((x + 4) / PERIOD); // round the sky to the copy on screen
          const y = s.y + oy;
          if (y < -4 || x > W + 4 || y > H + 4) continue;
          let a = s.a * dim, r = s.r;
          if (amt) {
            const v = scint(s.seed, t, y, 0.6 + 0.4 * s.r, amt);
            a *= Math.min(v, 1.25);
            r *= 0.88 + 0.12 * v;
          }
          g.globalAlpha = Math.min(1, a * alpha);
          if (r < 0.9) g.fillRect(x - r, y - r, r * 2, r * 2);
          else { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
        }
      }
      g.globalAlpha = 1;
    }

    // passes: [[how far traced 0..1, strength 0..1], ...], drawn in order.
    function drawConstellation(c, camL, passes, now, amt) {
      let ox = W / 2 - camL[0] + mouse[0] * 14;
      const oy = H / 2 - camL[1] + mouse[1] * 10;
      ox -= PERIOD * Math.round((c.center[0] + ox - W / 2) / PERIOD); // the copy nearest the window
      const cx = c.center[0] + ox, cy = c.center[1] + oy;
      if (cx + c.hw < -40 || cx - c.hw > W + 40 || cy + c.hh < -40 || cy - c.hh > H + 40) return;
      const P = c.world.map(([x, y, m]) => [x + ox, y + oy, m]);
      // Lines, traced star to star.
      for (const [lineP, lineA] of passes) {
        if (lineP <= 0 || lineA <= 0) continue;
        ctx.strokeStyle = `rgba(233,236,245,${0.24 * lineA * alpha})`;
        ctx.lineWidth = 1;
        let left = lineP * c.len;
        ctx.beginPath();
        for (const [a, b] of c.edges) {
          if (left <= 0) break;
          const A = P[a], B = P[b], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
          const gap = 7 / L, f = Math.min(1, left / L);
          const sx = lerp(A[0], B[0], gap), sy = lerp(A[1], B[1], gap);
          const ef = Math.max(gap, Math.min(f, 1 - gap));
          if (f > gap) { ctx.moveTo(sx, sy); ctx.lineTo(lerp(A[0], B[0], ef), lerp(A[1], B[1], ef)); }
          left -= L;
        }
        ctx.stroke();
      }
      // Stars with a soft glow. These are the brightest stars, so they twinkle the most.
      const t = now / 1000;
      P.forEach(([x, y, m], i) => {
        if (x < -30 || y < -30 || x > W + 30 || y > H + 30) return;
        const seed = c.seed + i * 131;
        const v = amt ? scint(seed, t, y, 0.55 + 0.35 * m, amt) : 1;
        // Colour flashes: only bright stars, and mostly when low in the sky.
        let cr = 246, cg = 240, cb = 228;
        if (amt && m >= 1.2) {
          const w = clamp(amt * 1.6 * (lowness(y) - 0.8), 0, 0.45) * noise(seed + 99, t * 7);
          if (w > 0) { cr += (200 - cr) * w; cg += (222 - cg) * w; cb += (255 - cb) * w; }
          else { cr += (255 - cr) * -w; cg += (196 - cg) * -w; cb += (178 - cb) * -w; }
        }
        const R = 2.2 * m * (0.9 + 0.1 * v), A = Math.min(1, v);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, R * 4);
        gr.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},${0.22 * A * alpha})`); gr.addColorStop(1, 'rgba(243,235,221,0)');
        ctx.fillStyle = gr; ctx.fillRect(x - R * 4, y - R * 4, R * 8, R * 8);
        ctx.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${0.95 * A * alpha})`;
        ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.fill();
      });
    }

    // Galaxies: small, faint and far behind everything, drawn once each and reused. They don't twinkle,
    // and they're the first thing a brighter sky hides.
    function drawGalaxies(g, camL, d) {
      if (!window.AndromedaGalaxies) return;
      const share = Math.pow(clamp((d - 0.3) / 0.5, 0, 1), 1.3);
      if (share <= 0) return;
      const ox = W / 2 - camL[0] + mouse[0] * 5, oy = H / 2 - camL[1] + mouse[1] * 4;
      g.globalAlpha = alpha * share * 0.65;
      for (const gx of GALAXIES) {
        const s = gx.size;
        let x = gx.x + ox; x -= PERIOD * Math.floor((x + s) / PERIOD);
        const y = gx.y + oy;
        if (x - s > W || y + s < 0 || y - s > H) continue;
        g.drawImage(window.AndromedaGalaxies.sprite(gx, s * 2 * dpr), x - s, y - s, s * 2, s * 2);
      }
      g.globalAlpha = 1;
    }

    function frame(now) {
      requestAnimationFrame(frame);
      const rm = reduce();
      const moving = pan || fade || lines.p < 1 || lines.out;
      // A resting sky only redraws for the twinkle, about 30 times a second.
      if (!moving && !dirty) {
        if (rm || !twinkleAmount()) return;
        if (now - last < 33) return;
      }
      last = now; dirty = false;

      // Mouse drift, smoothed.
      if (!rm) { mouse[0] += (mouseT[0] - mouse[0]) * 0.05; mouse[1] += (mouseT[1] - mouse[1]) * 0.05; }
      else { mouse = [0, 0]; }
      if (Math.abs(mouseT[0] - mouse[0]) > 0.002 || Math.abs(mouseT[1] - mouse[1]) > 0.002) dirty = true;

      // Advance the pan.
      if (pan) {
        const t = clamp((now - pan.start) / pan.dur, 0, 1);
        const e = easeInOut(t);
        cam = [lerp(pan.from[0], pan.to[0], e), lerp(pan.from[1], pan.to[1], e)];
        if (t >= 1) { const done = pan.resolve; pan = null; lines = { id: conOf(view), p: 0, start: now, out: null }; done && done(); }
      }
      if (fade) {
        const t = clamp((now - fade.start) / fade.dur, 0, 1);
        alpha = fade.from + (fade.to - fade.from) * t;
        if (t >= 1) { const f = fade; fade = null; f.resolve && f.resolve(); }
      }
      if (lines.id && lines.p < 1) {
        lines.p = rm ? 1 : easeOut(clamp((now - lines.start) / 900, 0, 1));
      }
      let outA = 0;
      if (lines.out) {
        outA = 1 - clamp((now - lines.out.start) / 260, 0, 1);
        if (outA <= 0) lines.out = null;
      }

      // The still part of the sky (background, Milky Way, faint stars) is painted once and reused
      // until the camera, the mouse drift or the fade changes it.
      const cB = layerCam(0.88), cF = layerCam(0.92), d = darkness();
      const key = [cB[0], cB[1], cF[0], cF[1], mouse[0], mouse[1], alpha, W, H, d].map((v) => Math.round(v * 1000)).join();
      if (key !== stillKey || !still) {
        stillKey = key;
        if (!still || still.width !== canvas.width || still.height !== canvas.height) {
          still = document.createElement('canvas'); still.width = canvas.width; still.height = canvas.height;
        }
        const g = still.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(base, 0, 0);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Light pollution lifts the whole sky, most of all near the horizon.
        const k = Math.pow(1 - d, 1.5);
        if (k > 0.01) {
          g.fillStyle = `rgba(44,42,54,${0.30 * k * alpha})`; g.fillRect(0, 0, W, H);
          const lg = g.createLinearGradient(0, H, 0, H * 0.3);
          lg.addColorStop(0, `rgba(150,108,78,${0.26 * k * alpha})`); lg.addColorStop(1, 'rgba(150,108,78,0)');
          g.fillStyle = lg; g.fillRect(0, H * 0.3, W, H * 0.7);
        }
        const bx = W / 2 - cB[0] + mouse[0] * 5, by = H / 2 - cB[1] + mouse[1] * 4;
        g.globalAlpha = alpha * glowShare(d);
        const S = band.scale, T = band.turn;
        let sx = ((-bx - WORLD.x0) * S) % T;
        if (sx < 0) sx += T;
        g.drawImage(band.canvas, sx, (-by - WORLD.y0) * S, W * S, H * S, 0, 0, W, H);
        g.globalAlpha = 1;
        drawGalaxies(g, cB, d);
        drawStars(g, stars.faint, cF, 0.55, now, 0, faintShare(d), 1);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(still, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const amt = rm ? 0 : twinkleAmount();
      drawStars(ctx, stars.bright, layerCam(1), 1, now, amt, brightShare(d), 0.6 + 0.4 * d);
      // Every constellation in view gets faint lines; the one this view is named after traces in on top.
      for (const [name, c] of Object.entries(CONSTELLATIONS)) {
        const passes = [[1, OTHER_LINES]];
        if (lines.id === name) passes.push([lines.p, 1 - OTHER_LINES]);
        else if (lines.out && lines.out.id === name) passes[0][1] = Math.max(OTHER_LINES, outA);
        drawConstellation(c, layerCam(1), passes, now, amt);
      }
    }

    function goTo(id, { instant = false } = {}) {
      return new Promise((resolve) => {
        const target = nearest(camFor(id));
        const prev = view;
        view = id;
        if (instant || !prev) {
          cam = target; pan = null;
          lines = { id: conOf(id), p: instant ? 1 : 0, start: performance.now(), out: null };
          dirty = true; resolve({ dx: 0, dy: 0 }); return;
        }
        const dx = cam[0] - target[0], dy = cam[1] - target[1];
        const dist = Math.hypot(dx, dy) || 1;
        const dir = { dx: dx / dist, dy: dy / dist }; // which way the stars slide on screen
        const leaving = lines.id;
        lines = { id: null, p: 1, out: leaving ? { id: leaving, start: performance.now() } : null };
        if (reduce()) {
          // Reduced motion: a quiet crossfade instead of a pan.
          fade = { from: alpha, to: 0, start: performance.now(), dur: 160, resolve: () => {
            cam = target; lines = { id: conOf(id), p: 1, out: null };
            fade = { from: 0, to: 1, start: performance.now(), dur: 220, resolve: () => resolve(dir) };
          } };
          return;
        }
        // About a second; longer journeys across the sky take a little longer.
        const dur = clamp(750 + dist * 0.16, 850, 1300);
        pan = { from: cam.slice(), to: target, start: performance.now(), dur, resolve: () => resolve(dir) };
      });
    }

    // Where the stars will slide, and for how long, if we go to this view now.
    function plan(id) {
      const t = nearest(camFor(id)), dx = cam[0] - t[0], dy = cam[1] - t[1], d = Math.hypot(dx, dy) || 1;
      return { dx: dx / d, dy: dy / d, dur: clamp(750 + d * 0.16, 850, 1300) };
    }

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => {
      mouseT = [(e.clientX / W - 0.5) * 2, (e.clientY / H - 0.5) * 2];
    }, { passive: true });
    resize();
    requestAnimationFrame(frame);

    return { goTo, plan, constellationName: (id) => CONSTELLATIONS[conOf(id)].name, redraw: () => { dirty = true; } };
  }

  window.AndromedaSky = { createSky };
})();
