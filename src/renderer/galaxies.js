// Distant galaxies for the sky, drawn in code. Each one is built face-on (arms, bars, clumps, dust), then tilted and turned,
// with the round parts (bulges, companions) and edge-on dust lanes added after the tilt.
(function () {
  'use strict';
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = (r) => (r() + r() + r() + r() - 2) / 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  // Colours from galaxy photos: yellow old-star cores, blue-white young arms, pink glowing gas.
  const C = { core: [255, 226, 182], old: [255, 240, 214], arm: [190, 206, 255], armW: [230, 236, 255], pink: [255, 128, 176], disk: [172, 180, 230] };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const canvas = (px) => { const c = document.createElement('canvas'); c.width = c.height = px; return c; };
  function dot(g, x, y, r, c, a) {
    g.fillStyle = rgba(c, a);
    if (r < 1.2) g.fillRect(x - r, y - r, r * 2, r * 2);
    else { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  }
  // A soft glow that fades out roughly like starlight in a galaxy (bright middle, long faint edge).
  function glow(g, x, y, R, c, a, sy = 1, rot = 0, sx = 1) {
    if (R <= 0) return;
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(sx, sy);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.18, rgba(c, a * 0.5)); gr.addColorStop(0.45, rgba(c, a * 0.16));
    gr.addColorStop(0.75, rgba(c, a * 0.04)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(-R, -R, R * 2, R * 2); g.restore();
  }

  // How each kind of galaxy is built. Pitch is how open the arms are (small = tightly wound).
  const PRESETS = {
    spiral: (r) => ({ name: 'Spiral', disk: spiralDisk, arms: 2, pitch: 20 + r() * 6, r0: 0.12, bulge: 0.13, bulgeA: 0.7, clumps: 16, hii: 0.09, dust: 0.12, loose: 1.15, armA: 1, incl: 25 + r() * 35 }),
    tight: (r) => ({ name: 'Tightly wound spiral', disk: spiralDisk, arms: 2, pitch: 7 + r() * 3, r0: 0.22, bulge: 0.34, bulgeA: 0.95, clumps: 0, hii: 0.02, dust: 0.4, loose: 0.8, armA: 0.75, incl: 35 + r() * 30 }),
    edgeon: () => ({ name: 'Edge-on spiral', disk: spiralDisk, arms: 2, pitch: 14, r0: 0.16, bulge: 0.17, bulgeA: 0.75, bulgeQ: 0.7, clumps: 4, hii: 0.05, dust: 0.2, loose: 1, armA: 1.1, incl: 87, lane: { len: 0.98, w: 0.045, off: 0.012, a: 0.32 }, sheen: 0.55 }),
    sombrero: () => ({ name: 'Sombrero', disk: spiralDisk, arms: 2, pitch: 6, r0: 0.3, bulge: 0.62, bulgeA: 0.9, bulgeQ: 0.6, clumps: 0, hii: 0, dust: 0.3, loose: 0.7, armA: 0.9, incl: 84, lane: { len: 0.95, w: 0.07, off: 0.035, a: 0.4 }, sheen: 0.5 }),
    lenticular: (r) => ({ name: 'Lenticular', disk: lensDisk, bulge: 0.3, bulgeA: 0.9, incl: 55 + r() * 25 }),
    elliptical: (r) => ({ name: 'Elliptical', elliptical: true, flat: r() * 0.55, incl: 0 }),
    irregular: (r) => ({ name: 'Irregular', disk: irregularDisk, incl: 20 + r() * 30 }),
    pair: () => ({ name: 'Interacting pair', disk: spiralDisk, arms: 2, pitch: 19, r0: 0.12, bulge: 0.12, bulgeA: 0.8, clumps: 18, hii: 0.14, dust: 0.22, loose: 1, armA: 1.05, incl: 22, Rk: 0.33, companion: true }),
    andromeda: () => ({ name: 'Andromeda', disk: spiralDisk, arms: 2, pitch: 9, r0: 0.18, bulge: 0.2, bulgeA: 0.95, bulgeQ: 0.55, clumps: 6, hii: 0.04, dust: 0.55, loose: 0.9, armA: 0.9, incl: 77, Rk: 0.42, m31: true, sheen: 0.18 }),
  };

  // Two layers for every galaxy: a soft haze (blurred a lot, most of the light) and a sparse
  // speckle of stars, clusters and pink gas clouds on top (blurred a little).
  // Arms: logarithmic spirals, broad and brightest near the middle, with dark dust along the inner
  // edge of each arm.
  function spiralDisk(Hc, Tc, px, p, r) {
    const h = Hc.getContext('2d'), t = Tc.getContext('2d'), c = px / 2, R = px * (p.Rk || 0.42), u = px / 240;
    h.globalCompositeOperation = t.globalCompositeOperation = 'lighter';
    glow(h, c, c, R * 1.1, C.disk, 0.3);
    glow(h, c, c, R * 0.6, C.core, 0.2);
    const b = Math.tan(p.pitch * D2R), n = Math.round(clamp(px * px * 0.06, 900, 8000));
    const phase0 = r() * TAU, along = [];
    const at = (k, uu, extra = 0) => {
      const ph = phase0 + k * TAU / p.arms + extra, rr = p.r0 + (1 - p.r0) * uu;
      return [rr, ph + Math.log(rr / p.r0) / b];
    };
    if (p.bar) {
      glow(h, c, c, R * p.bar * 1.2, C.core, 0.7, 0.22, phase0);
      for (let i = 0; i < n * 0.12; i++) {
        const q = r() * 2 - 1, w = gauss(r) * R * 0.05;
        dot(t, c + Math.cos(phase0) * q * p.bar * R - Math.sin(phase0) * w, c + Math.sin(phase0) * q * p.bar * R + Math.cos(phase0) * w, (0.4 + r() * 0.5) * u, C.old, 0.16);
      }
    }
    const arm = (k, uu, extra, weight) => {
      const [rr, th] = at(k, uu, extra);
      const spread = (0.075 + 0.13 * uu) * R * p.loose;
      const x = c + Math.cos(th) * rr * R + gauss(r) * spread, y = c + Math.sin(th) * rr * R + gauss(r) * spread;
      const bright = Math.pow(1 - uu, 0.55) * weight;
      const col = rr < 0.35 ? C.old : r() < 0.5 ? C.arm : C.armW;
      dot(h, x, y, (1.4 + r() * 2) * u, col, 0.03 * bright * p.armA);
      if (r() < 0.3) {
        const x2 = c + Math.cos(th) * rr * R + gauss(r) * spread * 0.6, y2 = c + Math.sin(th) * rr * R + gauss(r) * spread * 0.6;
        dot(t, x2, y2, (0.35 + r() * 0.55) * u, C.armW, (0.07 + 0.15 * r()) * bright * p.armA);
      }
      if (r() < p.hii * bright) { dot(h, x, y, 2.6 * u, C.pink, 0.1); dot(t, x, y, (0.6 + r() * 0.9) * u, C.pink, 0.42); }
      return [x, y];
    };
    for (let i = 0; i < n; i++) { const xy = arm(i % p.arms, Math.pow(r(), 0.85), 0, 1); if (i % 11 === 0) along.push(xy); }
    // Loose spirals branch: short spurs between the main arms.
    if (p.clumps > 8) for (let i = 0; i < n * 0.25; i++) arm(i % p.arms, 0.3 + r() * 0.45, Math.PI / p.arms * 0.9, 0.55);
    for (let i = 0; i < (p.clumps || 0); i++) {
      const [x, y] = along[Math.floor(r() * along.length)];
      dot(h, x, y, 3 * u, C.armW, 0.08);
      for (let j = 0; j < 10; j++) dot(t, x + gauss(r) * 2.6 * u, y + gauss(r) * 2.6 * u, (0.4 + r() * 0.6) * u, C.armW, 0.2);
    }
    if (p.dust) {
      h.globalCompositeOperation = t.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < n * 0.45; i++) {
        const k = i % p.arms, uu = 0.04 + Math.pow(r(), 1.2) * 0.85, [rr, th] = at(k, uu);
        const x = c + Math.cos(th) * rr * 0.92 * R + gauss(r) * 2.2 * u, y = c + Math.sin(th) * rr * 0.92 * R + gauss(r) * 2.2 * u;
        dot(h, x, y, (1.6 + r() * 2) * u, [0, 0, 0], p.dust * 0.2);
        dot(t, x, y, (1.2 + r()) * u, [0, 0, 0], p.dust * 0.3);
      }
    }
    h.globalCompositeOperation = t.globalCompositeOperation = 'lighter';
    if (p.companion) { // a small galaxy at the end of one arm, joined by a faint bridge of stars
      const [rr, th] = at(0, 1.1), [r1, t1] = at(0, 0.85);
      const x = c + Math.cos(th) * rr * R * 1.1, y = c + Math.sin(th) * rr * R * 1.1;
      p.companionAt = [x, y];
      const sx = c + Math.cos(t1) * r1 * R, sy = c + Math.sin(t1) * r1 * R;
      for (let i = 0; i < 260; i++) { const q = r(); dot(h, sx + (x - sx) * q + gauss(r) * 5 * u, sy + (y - sy) * q + gauss(r) * 5 * u, 1.6 * u, C.disk, 0.06); }
    }
  }

  // A lenticular's disk: smooth, with no arms, fading out at a fairly sharp edge.
  function lensDisk(Hc, Tc, px) {
    const g = Hc.getContext('2d'), c = px / 2, R = px * 0.42;
    const gr = g.createRadialGradient(c, c, 0, c, c, R);
    gr.addColorStop(0, rgba(C.old, 0.36)); gr.addColorStop(0.55, rgba(C.old, 0.22)); gr.addColorStop(0.82, rgba(C.disk, 0.08)); gr.addColorStop(1, rgba(C.disk, 0));
    g.fillStyle = gr; g.fillRect(0, 0, px, px);
  }

  // An irregular galaxy, like the Large Magellanic Cloud: lopsided glow, an off-centre bar, clumps of
  // young stars, and one big pink nebula (the Tarantula, in the real one).
  function irregularDisk(Hc, Tc, px, p, r) {
    const h = Hc.getContext('2d'), t = Tc.getContext('2d'), c = px / 2, R = px * 0.4, u = px / 240;
    h.globalCompositeOperation = t.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) glow(h, c + gauss(r) * R * 0.5, c + gauss(r) * R * 0.38, R * (0.4 + r() * 0.45), C.disk, 0.13, 0.6 + r() * 0.4, r() * TAU);
    const ba = r() * TAU, bx = c + R * 0.12, by = c - R * 0.06;
    glow(h, bx, by, R * 0.5, C.old, 0.35, 0.3, ba);
    for (let i = 0; i < 400 * u * u + 120; i++) {
      const q = r() * 2 - 1, w = gauss(r) * R * 0.07;
      dot(t, bx + Math.cos(ba) * q * R * 0.42 - Math.sin(ba) * w, by + Math.sin(ba) * q * R * 0.42 + Math.cos(ba) * w, 0.45 * u, C.old, 0.06);
    }
    for (let k = 0; k < 11; k++) {
      const cx = c + gauss(r) * R * 0.75, cy = c + gauss(r) * R * 0.6, s = R * (0.06 + r() * 0.1);
      glow(h, cx, cy, s * 2.2, C.armW, 0.1);
      for (let j = 0; j < 40 * u + 8; j++) dot(t, cx + gauss(r) * s, cy + gauss(r) * s, (0.35 + r() * 0.55) * u, r() < 0.6 ? C.armW : C.arm, 0.13);
      if (r() < 0.5) { dot(h, cx, cy, 3 * u, C.pink, 0.14); dot(t, cx, cy, 0.9 * u, C.pink, 0.4); }
    }
    const tx = c - R * 0.38, ty = c - R * 0.26;
    glow(h, tx, ty, R * 0.2, C.pink, 0.7);
    dot(t, tx, ty, 1.3 * u, [255, 220, 235], 0.8);
  }

  function render(desc, px) {
    const p = PRESETS[desc.type](rng(desc.seed * 31 + 7)), r = rng(desc.seed * 977 + 13);
    const O = canvas(px), o = O.getContext('2d'), c = px / 2, R = px * (p.Rk || 0.42), u = px / 240;
    const incl = (desc.incl != null ? desc.incl : p.incl) * D2R, pa = (desc.pa != null ? desc.pa : r() * 180) * D2R, q = Math.max(Math.cos(incl), 0.045);
    o.globalCompositeOperation = 'lighter';
    if (p.elliptical) {
      // Smooth and featureless: old yellow-white stars fading out from a bright middle, plus star clusters.
      const flat = 1 - p.flat;
      glow(o, c, c, R * 1.1, C.old, 0.55, flat, pa);
      glow(o, c, c, R * 0.42, C.core, 0.7, flat, pa);
      glow(o, c, c, R * 0.08, [255, 250, 240], 0.95, flat, pa);
      for (let i = 0; i < 34; i++) { const a = r() * TAU, rr = R * (0.3 + r() * 0.75); dot(o, c + Math.cos(a) * rr, c + Math.sin(a) * rr * flat, 0.55 * u, C.old, 0.35); }
      return O;
    }
    const Hc = canvas(px), Tc = canvas(px);
    p.disk(Hc, Tc, px, p, r);
    o.save(); o.translate(c, c); o.rotate(pa); o.scale(1, q); o.translate(-c, -c);
    o.filter = `blur(${Math.max(0.6, u * 2.2)}px)`;
    o.drawImage(Hc, 0, 0);
    o.filter = `blur(${Math.max(0.25, u * 0.4)}px)`;
    o.drawImage(Tc, 0, 0);
    o.restore(); o.filter = 'none';
    if (p.sheen) glow(o, c, c, R, C.disk, p.sheen, Math.max(q * 2, 0.11), pa); // a seen-from-the-side disk glows along its length
    if (p.companionAt) {
      const dx = p.companionAt[0] - c, dy = p.companionAt[1] - c;
      const x = c + Math.cos(pa) * dx - Math.sin(pa) * dy * q, y = c + Math.sin(pa) * dx + Math.cos(pa) * dy * q;
      glow(o, x, y, R * 0.3, C.core, 0.7, 0.8, pa + 0.6);
      glow(o, x, y, R * 0.06, C.old, 0.9);
    }
    if (p.bulge) {
      const bq = Math.max(q, p.bulgeQ || 0.6);
      glow(o, c, c, p.bulge * R * 1.6, C.core, p.bulgeA * 0.7, bq, pa);
      glow(o, c, c, p.bulge * R * 0.45, C.old, p.bulgeA, bq, pa);
      glow(o, c, c, R * 0.035 + u, [255, 252, 244], 0.95);
    }
    if (p.m31) { // Andromeda's two small companions: round M32 by the disk's edge, oval M110 further out
      const m32 = [c + Math.cos(pa + 1.7) * R * 0.3, c + Math.sin(pa + 1.7) * R * 0.3];
      glow(o, m32[0], m32[1], R * 0.11, C.core, 0.85); glow(o, m32[0], m32[1], R * 0.025, C.old, 0.95);
      const m110 = [c + Math.cos(pa - 1.25) * R * 0.62, c + Math.sin(pa - 1.25) * R * 0.62];
      glow(o, m110[0], m110[1], R * 0.2, C.old, 0.45, 0.55, pa + 0.9);
    }
    if (p.lane) { // the dark dust lane across an edge-on disk, slightly off the middle, with ragged edges
      o.globalCompositeOperation = 'destination-out';
      o.save(); o.translate(c, c); o.rotate(pa);
      for (let j = 0; j < 6; j++) {
        o.fillStyle = `rgba(0,0,0,${p.lane.a})`;
        o.beginPath(); o.ellipse(0, p.lane.off * R, p.lane.len * R * (1 - j * 0.05), p.lane.w * R * (1 - j / 7), 0, 0, TAU); o.fill();
      }
      for (let i = 0; i < 160; i++) dot(o, (r() * 2 - 1) * p.lane.len * R * 0.9, p.lane.off * R + gauss(r) * p.lane.w * R * 1.3, (1 + r()) * u, [0, 0, 0], 0.18);
      o.restore();
    }
    o.globalCompositeOperation = 'source-over';
    return O;
  }

  const cache = new Map();
  window.AndromedaGalaxies = {
    PRESETS,
    render,
    // The same galaxy at a given size, drawn once and kept.
    sprite(desc, px) {
      px = Math.max(16, Math.round(px / 8) * 8);
      const key = `${desc.type}:${desc.seed}:${desc.pa}:${desc.incl}:${px}`;
      if (!cache.has(key)) cache.set(key, render(desc, px));
      return cache.get(key);
    },
  };
})();
