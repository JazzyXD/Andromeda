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
  const WORLD = { x0: -900, y0: -500, x1: 6100, y1: 3100 };

  // Centre line of the Milky Way across the world (Catmull-Rom through these points).
  const BAND = [[-900, 1950], [-300, 1650], [300, 1380], [1300, 720], [2300, 1250], [3500, 1900], [4700, 2250], [6100, 2600]];
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
      at: [250, 150],
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

  // Place constellation points in world space.
  for (const c of Object.values(CONSTELLATIONS)) {
    c.world = c.pts.map(([x, y, m]) => [x + c.at[0], y + c.at[1], m]);
    const xs = c.world.map((p) => p[0]), ys = c.world.map((p) => p[1]);
    c.center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    c.len = c.edges.reduce((s, [a, b]) => s + Math.hypot(c.world[b][0] - c.world[a][0], c.world[b][1] - c.world[a][1]), 0);
  }

  // Sample the band's centre line.
  function bandSamples(step) {
    const out = [];
    const P = BAND;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
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
    const W = WORLD.x1 - WORLD.x0, H = WORLD.y1 - WORLD.y0;
    const faint = [], bright = [];
    // Even field of faint stars.
    for (let i = 0; i < 3200; i++) {
      faint.push({ x: WORLD.x0 + r() * W, y: WORLD.y0 + r() * H, r: 0.35 + r() * 0.6, a: 0.3 + r() * 0.5, c: r() < 0.15 ? 1 : r() < 0.25 ? 2 : 0 });
    }
    // Thick star clouds along the Milky Way.
    const line = bandSamples(12);
    for (let i = 0; i < 4200; i++) {
      const [bx, by] = line[Math.floor(r() * line.length)];
      const spread = 150 * (0.6 + r() * 0.8);
      faint.push({ x: bx + gauss(r) * spread * 0.6, y: by + gauss(r) * spread, r: 0.3 + r() * 0.5, a: 0.25 + r() * 0.5, c: r() < 0.2 ? 1 : 0 });
    }
    // Scattered bright stars that twinkle.
    for (let i = 0; i < 210; i++) {
      bright.push({ x: WORLD.x0 + r() * W, y: WORLD.y0 + r() * H, r: 0.9 + r() * 0.9, a: 0.7 + r() * 0.3, ph: r() * 6.28, sp: 0.6 + r() * 1.4, c: r() < 0.2 ? 1 : r() < 0.3 ? 2 : 0 });
    }
    return { faint, bright };
  }

  // The Milky Way glow, painted small and soft, then scaled up when drawn.
  function buildBand() {
    const S = 0.2;
    const W = Math.ceil((WORLD.x1 - WORLD.x0) * S), H = Math.ceil((WORLD.y1 - WORLD.y0) * S);
    const raw = document.createElement('canvas'); raw.width = W; raw.height = H;
    const g = raw.getContext('2d');
    const r = rng(7);
    const to = (x, y) => [(x - WORLD.x0) * S, (y - WORLD.y0) * S];
    const blob = (x, y, rad, color, alpha) => {
      const [cx, cy] = to(x, y), R = rad * S;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, `rgba(${color},${alpha})`);
      gr.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = gr;
      g.fillRect(cx - R, cy - R, R * 2, R * 2);
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
    const soft = document.createElement('canvas'); soft.width = W; soft.height = H;
    const s = soft.getContext('2d');
    s.filter = 'blur(5px)';
    s.drawImage(raw, 0, 0);
    return { canvas: soft, scale: S };
  }

  // ---------- the sky object ----------
  function createSky(canvas, opts) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const reduce = opts.reduceMotion;
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

    function camFor(id) {
      const c = CONSTELLATIONS[VIEWS[id]].center;
      const fx = W < 1100 ? 0.74 : 0.8;
      return [c[0] - (fx - 0.5) * W, c[1] - (0.3 - 0.5) * H];
    }

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
      if (view && !pan) cam = camFor(view);
      dirty = true;
    }

    // Layer cameras: deeper layers lag slightly mid-pan, which gives depth. All agree at rest.
    function layerCam(depth) {
      if (!pan) return cam;
      const t = clamp((performance.now() - pan.start) / pan.dur, 0, 1);
      const e = Math.pow(easeInOut(t), 1 + (1 - depth) * 3);
      return [lerp(pan.from[0], pan.to[0], e), lerp(pan.from[1], pan.to[1], e)];
    }

    function drawStars(list, camL, depth, now, twinkle) {
      const ox = W / 2 - camL[0] + mouse[0] * 14 * depth, oy = H / 2 - camL[1] + mouse[1] * 10 * depth;
      for (let c = 0; c < 3; c++) {
        ctx.fillStyle = COLORS[c];
        for (const s of list) {
          if (s.c !== c) continue;
          const x = s.x + ox, y = s.y + oy;
          if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
          let a = s.a;
          if (twinkle) a *= 0.72 + 0.28 * Math.sin(now * 0.001 * s.sp + s.ph);
          ctx.globalAlpha = a * alpha;
          if (s.r < 0.9) ctx.fillRect(x - s.r, y - s.r, s.r * 2, s.r * 2);
          else { ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.2832); ctx.fill(); }
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawConstellation(c, camL, lineP, lineA) {
      const ox = W / 2 - camL[0] + mouse[0] * 14, oy = H / 2 - camL[1] + mouse[1] * 10;
      const P = c.world.map(([x, y, m]) => [x + ox, y + oy, m]);
      // Lines, traced star to star.
      if (lineP > 0 && lineA > 0) {
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
      // Stars with a soft glow.
      for (const [x, y, m] of P) {
        if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
        const R = 2.2 * m;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, R * 4);
        gr.addColorStop(0, `rgba(243,235,221,${0.22 * alpha})`); gr.addColorStop(1, 'rgba(243,235,221,0)');
        ctx.fillStyle = gr; ctx.fillRect(x - R * 4, y - R * 4, R * 8, R * 8);
        ctx.fillStyle = `rgba(246,240,228,${0.95 * alpha})`;
        ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.fill();
      }
    }

    function frame(now) {
      requestAnimationFrame(frame);
      const rm = reduce();
      const moving = pan || fade || lines.p < 1 || lines.out;
      // Idle sky only needs a gentle twinkle: redraw about 24 times a second.
      if (!moving && !dirty) {
        if (rm) return;
        if (now - last < 42) return;
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
        if (t >= 1) { const done = pan.resolve; pan = null; lines = { id: VIEWS[view], p: 0, start: now, out: null }; done && done(); }
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

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Milky Way (deepest layer).
      const cB = layerCam(0.88);
      const bx = W / 2 - cB[0] + mouse[0] * 5, by = H / 2 - cB[1] + mouse[1] * 4;
      ctx.globalAlpha = alpha;
      const S = band.scale;
      const sx = (-bx - WORLD.x0) * S, sy = (-by - WORLD.y0) * S;
      ctx.drawImage(band.canvas, sx, sy, W * S, H * S, 0, 0, W, H);
      ctx.globalAlpha = 1;

      drawStars(stars.faint, layerCam(0.92), 0.55, now, false);
      drawStars(stars.bright, layerCam(1), 1, now, !rm);

      for (const [key, c] of Object.entries(CONSTELLATIONS)) {
        let p = 0, a = 0;
        if (lines.id === key) { p = lines.p; a = 1; }
        else if (lines.out && lines.out.id === key) { p = 1; a = outA; }
        drawConstellation(c, layerCam(1), p, a);
      }
    }

    function goTo(id, { instant = false } = {}) {
      return new Promise((resolve) => {
        const target = camFor(id);
        const prev = view;
        view = id;
        if (instant || !prev) {
          cam = target; pan = null;
          lines = { id: VIEWS[id], p: instant ? 1 : 0, start: performance.now(), out: null };
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
            cam = target; lines = { id: VIEWS[id], p: 1, out: null };
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
      const t = camFor(id), dx = cam[0] - t[0], dy = cam[1] - t[1], d = Math.hypot(dx, dy) || 1;
      return { dx: dx / d, dy: dy / d, dur: clamp(750 + d * 0.16, 850, 1300) };
    }

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => {
      mouseT = [(e.clientX / W - 0.5) * 2, (e.clientY / H - 0.5) * 2];
    }, { passive: true });
    resize();
    requestAnimationFrame(frame);

    return { goTo, plan, constellationName: (id) => CONSTELLATIONS[VIEWS[id]].name, redraw: () => { dirty = true; } };
  }

  window.AndromedaSky = { createSky };
})();
