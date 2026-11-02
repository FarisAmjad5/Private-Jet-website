// Procedural business-jet family for OBSIDIAN: one parametric airframe in five configurations and
// finishes, a cabin interior, and the night-cloud environment. Shared by the render studio (video
// loops) and the live top-down view in the Charter section. Units are metres; the nose points down
// +X, up is +Y, the right wing is +Z.
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export { THREE };

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mkCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// Cheap seeded lattice hash in [0, 1)
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ================================================================ fleet */
// Fictional concepts. `form` drives the silhouette, `paint` the finish. `flake` is the metallic
// flake strength (normal-map noise under the clearcoat), `brush` the brushed-metal streaking.
export const FLEET = {
  umbra: {
    finish: 'Obsidian black',
    paint: { color: 0x07080a, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, flake: 0.05, env: 1.5 },
    trim: 0xd9a86a,
    form: { length: 30, radius: 1.28, nose: 0.16, sharp: 0.64, tail: 'T', engines: 2, span: 28, sweep: 0.58, winglet: 1, windows: 13 },
  },
  halo: {
    finish: 'Pearl white',
    paint: { color: 0xece7de, metalness: 0.1, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.14, iridescence: 0.07, sheen: 0.35, flake: 0.025, env: 1.25 },
    trim: 0xb7a07e,
    form: { length: 25, radius: 1.12, nose: 0.185, sharp: 0.6, tail: 'T', engines: 2, span: 23.5, sweep: 0.5, winglet: 1.45, windows: 10 },
  },
  argent: {
    finish: 'Brushed silver',
    paint: { color: 0xd6dae0, metalness: 0.9, roughness: 0.3, clearcoat: 0, clearcoatRoughness: 0.3, brush: 1, env: 1.7 },
    trim: 0x2a2c30,
    form: { length: 34, radius: 1.24, nose: 0.16, sharp: 0.72, tail: 'cruciform', engines: 2, span: 28.5, sweep: 0.7, winglet: 0.8, windows: 15 },
  },
  meridian: {
    finish: 'Deep navy',
    paint: { color: 0x1b3d7a, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2, flake: 0.15, env: 1.3,
      // fin and stabiliser: a satin-coated variant so the low amber key and kick only give a soft sheen
      tail: { color: 0x1a3b78, metalness: 0.4, roughness: 0.8, clearcoat: 0, clearcoatRoughness: 1, specular: 0.12, env: 0.3, flake: 0.1 } },
    trim: 0xc9ccd2,
    form: { length: 28, radius: 1.32, nose: 0.165, sharp: 0.63, engines: 3, tail: 'cruciform', span: 26, sweep: 0.62, winglet: 1.1, windows: 12 },
  },
  solstice: {
    finish: 'Champagne bronze',
    paint: { color: 0x9a7248, metalness: 0.92, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.16, flake: 0.17, env: 1.1 },
    trim: 0x1b1612,
    form: { length: 31, radius: 1.12, nose: 0.21, sharp: 0.7, tail: 'T', engines: 2, span: 25, sweep: 0.86, winglet: 1.2, windows: 12 },
  },
};

/* ===================================================== surface texturing */
// One painter makes the four maps a clearcoated metallic skin needs. Everything is drawn into a
// height canvas (panel grooves, rivets), a roughness canvas and a colour canvas; the height field
// is then turned into two normal maps — `panel` (for the clearcoat, so grooves show through the
// gloss) and `full` (panels plus metallic flake, for the base layer).
function paintSkin({ W, H, seed = 1, flake = 0, brush = 0, lw = 2, strength = 5, draw }) {
  const hc = mkCanvas(W, H);
  const rc = mkCanvas(W, H);
  const cc = mkCanvas(W, H);
  const hg = hc.getContext('2d', { willReadFrequently: true });
  const rg = rc.getContext('2d');
  const cg = cc.getContext('2d');
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, W, H);
  rg.fillStyle = '#c4c4c4';
  rg.fillRect(0, 0, W, H);
  cg.fillStyle = '#fbfbfb';
  cg.fillRect(0, 0, W, H);
  const r = rng(seed);
  const K = {
    W,
    H,
    lw,
    r,
    stroke(pathFn, w = lw, depth = 1) {
      const d = Math.round(128 - 66 * depth);
      hg.strokeStyle = `rgb(${d},${d},${d})`;
      hg.lineWidth = w;
      cg.strokeStyle = `rgba(0,0,0,${0.16 * depth})`;
      cg.lineWidth = w * 2.6;
      rg.strokeStyle = 'rgba(255,255,255,0.24)';
      rg.lineWidth = w * 3;
      for (const g of [rg, cg, hg]) {
        g.lineCap = g.lineJoin = 'round';
        g.beginPath();
        pathFn(g);
        g.stroke();
      }
    },
    line(x0, y0, x1, y1, w = lw, depth = 1) {
      K.stroke((g) => (g.moveTo(x0, y0), g.lineTo(x1, y1)), w, depth);
    },
    rrect(x, y, w, h, rad, lwid = lw, depth = 1) {
      K.stroke((g) => {
        const q = Math.min(rad, w / 2, h / 2);
        g.moveTo(x + q, y);
        g.arcTo(x + w, y, x + w, y + h, q);
        g.arcTo(x + w, y + h, x, y + h, q);
        g.arcTo(x, y + h, x, y, q);
        g.arcTo(x, y, x + w, y, q);
        g.closePath();
      }, lwid, depth);
    },
    // Gentle panel-to-panel variation: v > 0 rougher / slightly dirtier, v < 0 cleaner.
    tone(x, y, w, h, v) {
      rg.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      rg.fillRect(x, y, w, h);
      cg.fillStyle = `rgba(0,0,0,${Math.abs(v) * 0.22})`;
      cg.fillRect(x, y, w, h);
    },
    rivets(x0, y0, x1, y1, gap) {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / gap));
      hg.fillStyle = 'rgb(176,176,176)';
      for (let i = 0; i <= n; i++) {
        hg.beginPath();
        hg.arc(lerp(x0, x1, i / n), lerp(y0, y1, i / n), lw * 0.38, 0, TAU);
        hg.fill();
      }
    },
    soot(x, y, w, h, a = 0.14) {
      for (let i = 0; i < 14; i++) {
        const k = i / 13;
        cg.fillStyle = `rgba(36,30,26,${a * 0.22})`;
        cg.beginPath();
        cg.ellipse(x + w * (0.15 + 0.7 * k), y + h * 0.5 + (r() - 0.5) * h * 0.4, w * (0.5 - k * 0.3), h * (0.14 + r() * 0.18), 0, 0, TAU);
        cg.fill();
        rg.fillStyle = `rgba(255,255,255,${a * 0.3})`;
        rg.beginPath();
        rg.ellipse(x + w * (0.15 + 0.7 * k), y + h * 0.5, w * (0.5 - k * 0.3), h * 0.2, 0, 0, TAU);
        rg.fill();
      }
    },
  };
  draw(K);

  // Brushed metal: long fine streaks along the canvas x axis, in roughness and in the height field.
  if (brush) {
    const n = Math.floor((W * H) / 1500);
    for (let i = 0; i < n; i++) {
      const x = r() * W;
      const y = r() * H;
      const len = 70 + r() * 520;
      const v = 130 + r() * 125;
      rg.strokeStyle = `rgba(${v},${v},${v},${0.08 + r() * 0.2})`;
      rg.lineWidth = 0.7 + r() * 1.5;
      rg.beginPath();
      rg.moveTo(x, y);
      rg.lineTo(x + len, y + (r() - 0.5) * 1.4);
      rg.stroke();
      const hv = r() < 0.5 ? 100 : 156;
      hg.strokeStyle = `rgba(${hv},${hv},${hv},${0.05 + r() * 0.1})`;
      hg.lineWidth = 0.7 + r();
      hg.beginPath();
      hg.moveTo(x, y);
      hg.lineTo(x + len, y);
      hg.stroke();
    }
  }

  // Height field -> normal maps.
  const hd = hg.getImageData(0, 0, W, H).data;
  const panel = new ImageData(W, H);
  const full = new ImageData(W, H);
  const fs = W >= 2048 ? 1 : 0; // flake grain: 2 px cells on the big maps
  for (let y = 0; y < H; y++) {
    const ym = ((y - 1 + H) % H) * W;
    const yp = ((y + 1) % H) * W;
    const yy = y * W;
    for (let x = 0; x < W; x++) {
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < W - 1 ? x + 1 : W - 1;
      const dx = (hd[(yy + xp) * 4] - hd[(yy + xm) * 4]) / 255;
      const dy = (hd[(yp + x) * 4] - hd[(ym + x) * 4]) / 255;
      let nx = -dx * strength;
      let ny = dy * strength;
      let inv = 1 / Math.hypot(nx, ny, 1);
      const o = (yy + x) * 4;
      panel.data[o] = (nx * inv * 0.5 + 0.5) * 255;
      panel.data[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      panel.data[o + 2] = (inv * 0.5 + 0.5) * 255;
      panel.data[o + 3] = 255;
      if (flake) {
        nx += (hash2(x >> fs, y >> fs, seed) - 0.5) * 2 * flake;
        ny += (hash2(x >> fs, y >> fs, seed + 7) - 0.5) * 2 * flake;
        inv = 1 / Math.hypot(nx, ny, 1);
      }
      full.data[o] = (nx * inv * 0.5 + 0.5) * 255;
      full.data[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      full.data[o + 2] = (inv * 0.5 + 0.5) * 255;
      full.data[o + 3] = 255;
    }
  }
  const pc = mkCanvas(W, H);
  pc.getContext('2d').putImageData(panel, 0, 0);
  const fc = mkCanvas(W, H);
  fc.getContext('2d').putImageData(full, 0, 0);

  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  return {
    map: tex(cc, true),
    roughnessMap: tex(rc, false),
    normalMap: tex(fc, false),
    clearcoatNormalMap: tex(pc, false),
  };
}

// u = fraction of the body length from the nose, v = angle around (0 at the crown, +Z side first)
function windowU(f) {
  const n = f.windows;
  const [, doorEnd] = doorSpan(f);
  const u0 = Math.max(0.22, doorEnd + 0.03);
  return (i) => lerp(u0, 0.57, n === 1 ? 0.5 : i / (n - 1));
}
function doorSpan(f) {
  const u0 = Math.max(f.nose * 1.04, 0.15) + 0.012;
  return [u0, u0 + 1.05 / f.length];
}

function fuselageSkin(f, spec, hi) {
  const W = hi ? 4096 : 2048;
  const H = W / 4;
  const s = W / 4096;
  const lw = hi ? 2.6 : 1.5;
  const P = spec.paint;
  return paintSkin({
    W,
    H,
    seed: 11 + f.length,
    flake: P.flake ?? 0,
    brush: P.brush ?? 0,
    lw,
    draw(K) {
      const X = (u) => u * W;
      const Y = (a) => (((a % TAU) + TAU) % TAU / TAU) * H;
      const n = f.windows;
      const wu = windowU(f);
      const joints = [f.nose * 0.55, f.nose];
      for (let i = 0; i < n - 1; i += 2) joints.push((wu(i) + wu(i + 1)) / 2);
      joints.push(wu(n - 1) + 0.03, 0.63, 0.715, 0.775, 0.835, 0.89, 0.945);
      joints.sort((a, b) => a - b);
      const bands = [0, 0.6, 2.4, TAU - 2.4, TAU - 0.6, TAU];
      for (let i = 0; i < joints.length - 1; i++)
        for (let b = 0; b < bands.length - 1; b++) {
          const x0 = X(joints[i]);
          K.tone(x0, Y(bands[b]), X(joints[i + 1]) - x0, Y(bands[b + 1]) - Y(bands[b]) + (b === 4 ? 1 : 0), (K.r() - 0.5) * 0.2);
        }
      for (const u of joints) {
        K.line(X(u), 0, X(u), H, lw, 0.8);
        K.rivets(X(u) - lw * 3, 0, X(u) - lw * 3, H, 10 * s + 4);
        K.rivets(X(u) + lw * 3, 0, X(u) + lw * 3, H, 10 * s + 4);
      }
      for (const a of [0.6, 2.4]) for (const sg of [1, -1]) {
        const y = Y(sg > 0 ? a : TAU - a);
        K.line(X(f.nose * 0.55), y, X(0.96), y, lw, 0.7);
      }
      // Passenger door, port side, with an inner moulding and a handle recess.
      const [d0, d1] = doorSpan(f);
      const ac = TAU - 1.33;
      const dx = X(d0);
      const dw = X(d1) - dx;
      const dy = Y(ac - 0.62);
      const dh = Y(ac + 0.58) - dy;
      K.rrect(dx, dy, dw, dh, dw * 0.22, lw * 1.5, 1.1);
      K.rrect(dx + dw * 0.1, dy + dh * 0.07, dw * 0.8, dh * 0.86, dw * 0.18, lw * 0.9, 0.55);
      K.rrect(dx + dw * 0.62, dy + dh * 0.5, dw * 0.2, dh * 0.07, 4, lw, 0.8);
      // Baggage door, starboard aft; service panels; the ventral wing-body fairing outline.
      K.rrect(X(0.655), Y(2.0), X(0.045), Y(2.55) - Y(2.0), 12 * s + 4, lw * 1.4, 1);
      K.rrect(X(0.668), Y(2.14), X(0.019), Y(2.4) - Y(2.14), 6, lw * 0.9, 0.6);
      for (const sg of [1, -1]) K.rrect(X(f.nose * 0.3), Y(sg > 0 ? 1.15 : TAU - 1.6), X(f.nose * 0.18), Y(0.45), 10 * s + 3, lw, 0.8);
      K.rrect(X(0.39), Y(Math.PI - 0.85), X(0.23), Y(Math.PI + 0.85) - Y(Math.PI - 0.85), 40 * s + 8, lw * 1.3, 0.9);
      K.rrect(X(0.45), Y(Math.PI - 0.2), X(0.05), Y(Math.PI + 0.2) - Y(Math.PI - 0.2), 6, lw, 0.6);
      // Soot behind the engines.
      for (const sg of [1, -1]) K.soot(X(0.755), Y(sg > 0 ? 0.95 : TAU - 1.45), X(0.2), Y(0.5), 0.12);
    },
  });
}

function wingSkin(P, hi) {
  const W = hi ? 1024 : 512;
  const lw = hi ? 2.2 : 1.3;
  return paintSkin({
    W,
    H: W,
    seed: 41,
    flake: P.flake ?? 0,
    brush: P.brush ?? 0,
    lw,
    draw(K) {
      const X = (t) => t * W;
      const Y = (v) => (1 - v) * W;
      const lh = lw * 0.34; // horizontal lines span the long axis: thinner in texels
      // Only the control surfaces are cut: flap, aileron and two spoiler groups, plus very faint ribs.
      K.line(X(0.1), Y(0.02), X(0.1), Y(0.98), lw, 0.22);
      K.line(X(0.3), Y(0.05), X(0.3), Y(0.96), lw, 0.16);
      // inboard flap, outboard aileron
      K.line(X(0.74), Y(0.045), X(0.74), Y(0.45), lw, 0.7);
      K.line(X(0.74), Y(0.045), X(1), Y(0.045), lh, 0.55);
      K.line(X(0.74), Y(0.45), X(1), Y(0.45), lh, 0.55);
      K.line(X(0.77), Y(0.56), X(0.77), Y(0.93), lw, 0.7);
      K.line(X(0.77), Y(0.56), X(1), Y(0.56), lh, 0.55);
      K.line(X(0.77), Y(0.93), X(1), Y(0.93), lh, 0.55);
      // spoilers: one outline per group, a single faint split inside each
      for (const [v0, v1] of [[0.06, 0.39], [0.6, 0.82]]) K.rrect(X(0.5), Y(v1), X(0.24), Y(v0) - Y(v1), 3, lh * 1.1, 0.4);
      for (const v of [0.225, 0.71]) K.line(X(0.5), Y(v), X(0.74), Y(v), lh * 0.8, 0.14);
    },
  });
}

function tailSkin(P, hi) {
  const W = hi ? 512 : 256;
  const lw = hi ? 2 : 1.2;
  return paintSkin({
    W,
    H: W,
    seed: 53,
    flake: P.flake ?? 0,
    brush: P.brush ?? 0,
    lw,
    draw(K) {
      const X = (t) => t * W;
      const Y = (v) => (1 - v) * W;
      K.line(X(0.69), Y(0.05), X(0.69), Y(0.95), lw, 1);
      K.line(X(0.69), Y(0.05), X(1), Y(0.05), lw * 0.5, 1);
      K.line(X(0.69), Y(0.95), X(1), Y(0.95), lw * 0.5, 1);
      K.line(X(0.12), Y(0.04), X(0.12), Y(0.96), lw, 0.6);
      K.line(X(0.4), Y(0.04), X(0.4), Y(0.96), lw, 0.45);
      for (let v = 0.18; v < 0.95; v += 0.15) K.line(X(0.14), Y(v), X(0.69), Y(v), lw * 0.4, 0.35);
      K.rrect(X(0.74), Y(0.5), X(0.1), Y(0.42) - Y(0.5), 3, lw * 0.6, 0.7);
    },
  });
}

function plainSkin(P, hi) {
  const W = hi ? 512 : 256;
  return paintSkin({
    W,
    H: W,
    seed: 67,
    flake: P.flake ?? 0,
    brush: P.brush ?? 0,
    lw: hi ? 2 : 1.2,
    draw(K) {
      K.line(W * 0.3, 0, W * 0.3, W, K.lw, 0.55);
      K.line(W * 0.66, 0, W * 0.66, W, K.lw, 0.55);
    },
  });
}

function nacelleSkin(P, hi) {
  const W = hi ? 1024 : 512;
  const H = W / 2;
  const lw = hi ? 2.2 : 1.3;
  return paintSkin({
    W,
    H,
    seed: 79,
    flake: P.flake ?? 0,
    brush: P.brush ?? 0,
    lw,
    draw(K) {
      const Y = (v) => (1 - v) * H;
      for (const v of [0.3, 0.52, 0.74]) K.line(0, Y(v), W, Y(v), lw, v === 0.52 ? 1 : 0.75);
      for (const u of [0.0, 0.25, 0.5, 0.75]) {
        K.line(W * u, Y(0.52), W * u, Y(0.74), lw, 0.8);
        K.line(W * (u + 0.12), Y(0.3), W * (u + 0.12), Y(0.52), lw, 0.6);
      }
      for (const u of [0.09, 0.59]) K.rrect(W * u, Y(0.7), W * 0.07, H * 0.14, 5, lw, 0.8);
      K.soot(W * 0.1, Y(0.9), W * 0.8, H * 0.2, 0.09);
    },
  });
}

/* ============================================================ materials */
function paintMaterial(p, maps, { flat = false } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: p.color,
    metalness: p.metalness,
    roughness: clamp(Math.max(p.roughness * 1.3, flat ? 0.62 : 0)),
    clearcoat: p.clearcoat ?? 1,
    clearcoatRoughness: Math.max(p.clearcoatRoughness ?? 0.1, flat ? 0.42 : 0),
    specularIntensity: p.specular ?? 1,
    iridescence: p.iridescence ?? 0,
    iridescenceIOR: 1.5,
    sheen: p.sheen ?? 0,
    sheenColor: new THREE.Color(0xffe6c8),
    sheenRoughness: 0.5,
    envMapIntensity: p.env ?? 1,
    side: THREE.DoubleSide,
    map: maps.map,
    roughnessMap: maps.roughnessMap,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(1, 1),
    clearcoatNormalMap: maps.clearcoatNormalMap,
    clearcoatNormalScale: new THREE.Vector2(0.9, 0.9),
  });
}

let _windowGlow = null;
// A lit cabin window: shade pulled a third of the way down, warm light below, dark gasket edge.
function windowGlowTexture() {
  if (_windowGlow) return _windowGlow;
  const c = mkCanvas(64, 96);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 96);
  grd.addColorStop(0, '#5a4026');
  grd.addColorStop(0.3, '#6e4e2e');
  grd.addColorStop(0.34, '#ffe3b4');
  grd.addColorStop(0.7, '#ffc888');
  grd.addColorStop(1, '#f0a35e');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 96);
  g.strokeStyle = 'rgba(30,18,8,0.65)';
  g.lineWidth = 7;
  g.beginPath();
  g.ellipse(32, 48, 33, 49, 0, 0, TAU);
  g.stroke();
  _windowGlow = new THREE.CanvasTexture(c);
  _windowGlow.colorSpace = THREE.SRGBColorSpace;
  return _windowGlow;
}

let _cockpitGlass = null;
// Tinted cockpit glass: a cool sky reflection that fades to near-black, with a soft diagonal sheen,
// so the panes read as glass on a pale jet instead of a flat black cut-out. u runs nose to aft.
function cockpitGlassTexture() {
  if (_cockpitGlass) return _cockpitGlass;
  const c = mkCanvas(128, 64);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 64);
  grd.addColorStop(0, '#46607e');
  grd.addColorStop(0.3, '#1d2c40');
  grd.addColorStop(0.46, '#385070');
  grd.addColorStop(0.54, '#101a28');
  grd.addColorStop(1, '#06090e');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 64);
  _cockpitGlass = new THREE.CanvasTexture(c);
  _cockpitGlass.colorSpace = THREE.SRGBColorSpace;
  return _cockpitGlass;
}

const sharedMats = () => ({
  chrome: new THREE.MeshPhysicalMaterial({ color: 0xe6e6ea, metalness: 1, roughness: 0.2, envMapIntensity: 1.5, side: THREE.DoubleSide }),
  bezel: new THREE.MeshPhysicalMaterial({ color: 0x9d9ba0, metalness: 0.95, roughness: 0.36, envMapIntensity: 1.2, side: THREE.DoubleSide }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: cockpitGlassTexture(), metalness: 0.35, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.6, envMapIntensity: 2.4, side: THREE.DoubleSide }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide }),
  burnt: new THREE.MeshStandardMaterial({ color: 0x4d4038, metalness: 1, roughness: 0.4, side: THREE.DoubleSide }),
  blade: new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }),
  window: new THREE.MeshStandardMaterial({ color: 0x2a1b0e, emissive: 0xffffff, emissiveMap: windowGlowTexture(), emissiveIntensity: 2.7, roughness: 0.3 }),
  red: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.3) }),
  green: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 5, 1.2) }),
  white: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6) }),
  beacon: new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 0.3, 0.2) }),
});

/* =============================================================== fuselage */
// Cross-section along the body: u = 0 at the nose tip, 1 at the tail.
function section(f, u) {
  const L = f.length;
  const R = f.radius;
  const n = f.nose;
  const q = f.sharp ?? 0.56;
  let r;
  if (u < n) r = Math.pow(1 - Math.pow(1 - u / n, 2.3), q);
  else if (u < 0.6) r = 1;
  else r = 1 - 0.86 * smooth(0.6, 1, u);
  const droop = u < n ? -0.3 * Math.pow(1 - u / n, 2) : 0;
  const up = u > 0.58 ? 0.55 * Math.pow((u - 0.58) / 0.42, 1.6) : 0;
  return { x: L / 2 - u * L, cy: (droop + up) * R, r: r * R, h: 1.04 };
}

function topY(f, u) {
  const s = section(f, u);
  return s.cy + s.r * s.h;
}

function surface(f, u, a, off = 0) {
  const s = section(f, u);
  const s2 = section(f, Math.min(1, u + 0.002));
  const dr = (s2.r - s.r) / (s2.x - s.x || -1e-4);
  const p = V(s.x, s.cy + (s.r + off) * s.h * Math.cos(a), (s.r + off) * Math.sin(a));
  const n = V(-dr, Math.cos(a), Math.sin(a)).normalize();
  return { p, n };
}

function fuselageGeometry(f) {
  const NU = 220;
  const NA = 96;
  const C = NA + 1; // seam column duplicated so the texture wraps cleanly
  const pos = [];
  const uvs = [];
  const idx = [];
  const u0 = 0.0015;
  for (let i = 0; i <= NU; i++) {
    const u = u0 + (1 - u0) * Math.pow(i / NU, 1.15);
    const s = section(f, u);
    for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * TAU;
      pos.push(s.x, s.cy + s.r * s.h * Math.cos(a), s.r * Math.sin(a));
      uvs.push(u, 1 - j / NA);
    }
  }
  for (let i = 0; i < NU; i++)
    for (let j = 0; j < NA; j++) {
      const a = i * C + j;
      const b = a + 1;
      const c = (i + 1) * C + j;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  // Nose tip and tail caps
  const tip = section(f, 0);
  const tipI = pos.length / 3;
  pos.push(tip.x + 0.01, tip.cy, 0);
  uvs.push(0, 0.5);
  for (let j = 0; j < NA; j++) idx.push(tipI, j, j + 1);
  const end = section(f, 1);
  const endI = pos.length / 3;
  pos.push(end.x - 0.05, end.cy, 0);
  uvs.push(1, 0.5);
  const last = NU * C;
  for (let j = 0; j < NA; j++) idx.push(endI, last + j + 1, last + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  // Join the normals across the texture seam, then point the collapsed nose ring forward.
  for (let i = 0; i <= NU; i++) {
    const a = i * C;
    const b = a + NA;
    const x = nrm.getX(a) + nrm.getX(b);
    const y = nrm.getY(a) + nrm.getY(b);
    const z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l);
    nrm.setXYZ(b, x / l, y / l, z / l);
  }
  nrm.setXYZ(tipI, 1, 0, 0);
  for (let j = 0; j <= NA; j++) {
    const a = (j / NA) * TAU;
    nrm.setXYZ(j, 0.9, 0.44 * Math.cos(a), 0.44 * Math.sin(a));
  }
  return g;
}

// A patch of the fuselage surface, lifted by `off`. map(s, t) turns grid coords (0–1) into [u, a].
function patchGeometry(f, map, off, nu = 24, na = 24, withUv = false) {
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= na; j++) {
      const [u, a] = map(i / nu, j / na);
      const { p } = surface(f, u, a, off);
      pos.push(p.x, p.y, p.z);
      uvs.push(i / nu, j / na);
    }
  }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < na; j++) {
      const a = i * (na + 1) + j;
      idx.push(a, a + na + 1, a + 1, a + 1, a + na + 1, a + na + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ================================================================ lofts */
const yt = (t, tc) => 5 * tc * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);

// Lofted lifting surface. sections: [{ le: Vector3, chord, tc, cd: chordwise unit, td: thickness unit }]
// UVs: x = chord fraction, y = section index / count, so control-surface lines sit in the texture.
function loftGeometry(sections, nc = 18) {
  const ring = [];
  for (let i = 0; i <= nc; i++) ring.push([(1 - Math.cos((Math.PI * i) / nc)) / 2, 1]);
  for (let i = nc - 1; i >= 1; i--) ring.push([(1 - Math.cos((Math.PI * i) / nc)) / 2, -1]);
  const M = ring.length;
  const pos = [];
  const uvs = [];
  const idx = [];
  const S = sections.length;
  sections.forEach((s, k) => {
    for (const [t, side] of ring) {
      const p = s.le.clone().addScaledVector(s.cd, t * s.chord).addScaledVector(s.td, side * yt(t, s.tc) * s.chord);
      pos.push(p.x, p.y, p.z);
      uvs.push(t, 1 - k / (S - 1));
    }
  });
  for (let k = 0; k < sections.length - 1; k++)
    for (let j = 0; j < M; j++) {
      const a = k * M + j;
      const b = k * M + ((j + 1) % M);
      const c = (k + 1) * M + j;
      const d = (k + 1) * M + ((j + 1) % M);
      idx.push(a, c, b, b, c, d);
    }
  const cap = (k, flip) => {
    const s = sections[k];
    const c = s.le.clone().addScaledVector(s.cd, 0.35 * s.chord);
    const ci = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    uvs.push(0.35, 1 - k / (S - 1));
    for (let j = 0; j < M; j++) flip ? idx.push(ci, k * M + ((j + 1) % M), k * M + j) : idx.push(ci, k * M + j, k * M + ((j + 1) % M));
  };
  cap(0, false);
  cap(sections.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const AFT = V(-1, 0, 0);
const UP = V(0, 1, 0);
const SIDE = V(0, 0, 1);

/* =============================================================== engines */
function nacelle(f, m, paint, len, rad, { fan = true } = {}) {
  const g = new THREE.Group();
  const prof = [
    [0.8, 0.48],
    [0.87, 0.5],
    [0.97, 0.44],
    [1, 0.2],
    [0.97, -0.15],
    [0.84, -0.44],
    [0.72, -0.5],
    [0.6, -0.47],
  ].map(([r, y]) => new THREE.Vector2(r * rad, y * len));
  const body = new THREE.LatheGeometry(prof, 64);
  body.rotateZ(-Math.PI / 2);
  g.add(new THREE.Mesh(body, paint));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.86, rad * 0.07, 16, 72), m.chrome);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = len * 0.5;
  g.add(lip);
  if (fan) {
    // dark intake barrel, fan disk, polished spinner, blades
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.8, rad * 0.8, len * 0.12, 48, 1, true), m.dark);
    duct.rotation.z = Math.PI / 2;
    duct.position.x = len * 0.44;
    g.add(duct);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.8, 48), m.dark);
    disk.rotation.y = Math.PI / 2;
    disk.position.x = len * 0.38;
    g.add(disk);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.19, rad * 0.4, 32), m.chrome);
    spinner.rotation.z = -Math.PI / 2;
    spinner.position.x = len * 0.38 + rad * 0.2;
    g.add(spinner);
    const bladeG = new THREE.BoxGeometry(rad * 0.022, rad * 0.62, rad * 0.14);
    bladeG.translate(0, rad * 0.5, 0);
    for (let i = 0; i < 24; i++) {
      const b = new THREE.Mesh(bladeG, m.blade);
      b.rotation.x = (i / 24) * TAU;
      b.rotateY(0.5);
      b.position.x = len * 0.39;
      g.add(b);
    }
  }
  const exhaust = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.6, 40), m.dark);
  exhaust.rotation.y = -Math.PI / 2;
  exhaust.position.x = -len * 0.46;
  g.add(exhaust);
  const noz = new THREE.Mesh(new THREE.TorusGeometry(rad * 0.6, rad * 0.045, 12, 56), m.burnt);
  noz.rotation.y = Math.PI / 2;
  noz.position.x = -len * 0.47;
  g.add(noz);
  const plug = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.3, rad * 0.6, 32), m.burnt);
  plug.rotation.z = Math.PI / 2;
  plug.position.x = -len * 0.5;
  g.add(plug);
  return g;
}

/* ================================================================ airframe */
// detail: 1 = lean textures (live page), 2 = full-resolution skins (render studio).
export function createJet(id = 'umbra', { detail = 1 } = {}) {
  const spec = FLEET[id];
  const f = spec.form;
  const L = f.length;
  const R = f.radius;
  const hi = detail >= 2;
  const m = sharedMats();
  const P = spec.paint;
  const paint = paintMaterial(P, fuselageSkin(f, spec, hi));
  const wingMat = paintMaterial(P, wingSkin(P, hi), { flat: true });
  const tailMat = paintMaterial({ ...P, ...(P.tail || {}) }, tailSkin(P, hi), { flat: true });
  const nacMat = paintMaterial(P, nacelleSkin(P, hi));
  const plain = paintMaterial(P, plainSkin(P, hi), { flat: true });
  const trim = new THREE.MeshPhysicalMaterial({ color: spec.trim, metalness: 1, roughness: 0.28, envMapIntensity: 1.3, side: THREE.DoubleSide });
  const jet = new THREE.Group();
  jet.name = id;
  const add = (geo, mat) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    jet.add(mesh);
    return mesh;
  };
  const put = (geo, mat, pos) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    jet.add(mesh);
    return mesh;
  };

  add(fuselageGeometry(f), paint);

  // Windshield: two raked front panes either side of a centre post, and a side window behind each,
  // all following the nose curve. Panes are drawn in (u, a) space (a = 0 crown, 1.2 lower side edge);
  // the painted fuselage between them is the post. Each pane has a satin frame and sky-reflecting glass.
  const nz = f.nose;
  const rr = (x, y) => [lerp(x, x * Math.sqrt(1 - (y * y) / 2), 0.4), lerp(y, y * Math.sqrt(1 - (x * x) / 2), 0.4)]; // round the corners
  const pane = (sg, { a0, a1, f0, f1, b0, b1 }, pad = 0) => {
    const ap = pad / R;
    const up = pad / L;
    return (k, j) => {
      const [x, y] = rr(k * 2 - 1, j * 2 - 1);
      const kk = (x + 1) / 2;
      const jj = (y + 1) / 2;
      const uf = nz * lerp(f0, f1, jj) - up;
      const ub = nz * lerp(b0, b1, jj) + up;
      return [lerp(uf, ub, kk), sg * lerp(a0 - ap, a1 + ap, jj)];
    };
  };
  const PANES = [
    { a0: 0.075, a1: 0.7, f0: 0.52, f1: 0.66, b0: 0.88, b1: 0.97 }, // front pane
    { a0: 0.84, a1: 1.17, f0: 0.9, f1: 0.95, b0: 1.06, b1: 1.12 }, // side window
  ];
  for (const sg of [1, -1]) {
    for (const pn of PANES) {
      add(patchGeometry(f, pane(sg, pn, 0.05), 0.006, 14, 24), m.bezel);
      add(patchGeometry(f, pane(sg, pn, 0), 0.012, 14, 24, true), m.glass);
    }
  }

  // Cabin windows: warm ovals with satin bezels, both sides (the port side leaves room for the door).
  const winG = new THREE.CircleGeometry(1, 32);
  const n = f.windows;
  const wu = windowU(f);
  for (let i = 0; i < n; i++) {
    const u = wu(i);
    for (const s of [1, -1]) {
      const { p, n: nrm } = surface(f, u, s * 1.33, 0.02);
      for (const [mat, sc, off] of [[m.bezel, 1.2, 0], [m.window, 1, 0.006]]) {
        const w = new THREE.Mesh(winG, mat);
        w.scale.set(R * 0.1 * sc, R * 0.15 * sc, 1);
        w.position.copy(p).addScaledVector(nrm, off);
        w.lookAt(w.position.clone().add(nrm));
        jet.add(w);
      }
    }
  }
  // Cheat line below the windows.
  for (const s of [1, -1]) add(patchGeometry(f, (k, j) => [lerp(f.nose * 1.15, 0.86, k), s * (1.63 + j * 0.026)], 0.01, 80, 1), trim);

  // Wings: low, swept, with dihedral and blended winglets.
  const half = f.span / 2;
  const cr = L * 0.2;
  const ct = L * 0.065;
  const wy = -0.55 * R;
  const wx = L / 2 - 0.4 * L;
  const dih = Math.tan(0.07);
  const sw = Math.tan(f.sweep);
  for (const s of [1, -1]) {
    const sec = (z, chord, tc) => ({
      le: V(wx - (z - R * 0.4) * sw, wy + (z - R * 0.4) * dih, s * z),
      chord,
      tc,
      cd: AFT,
      td: UP,
    });
    const root = sec(R * 0.2, cr * 1.05, 0.13);
    const kink = sec(R + half * 0.18, cr * 0.82, 0.12);
    const tipS = sec(half, ct, 0.09);
    const secs = [root, kink, tipS];
    add(loftGeometry(secs), wingMat);
    // point on the wing surface: zf 0..1 along the span, t chord fraction, side +1 upper / -1 lower
    const wingPt = (zf, t, side = 1, lift = 0) => {
      const q = clamp(zf) * 2;
      const k = Math.min(1, Math.floor(q));
      const A = secs[k];
      const B = secs[k + 1];
      const fr = q - k;
      const chord = lerp(A.chord, B.chord, fr);
      const tc = lerp(A.tc, B.tc, fr);
      const p = A.le.clone().lerp(B.le, fr).addScaledVector(AFT, t * chord).addScaledVector(UP, side * yt(t, tc) * chord + lift);
      return { p, chord };
    };
    // winglet
    const h = L * 0.05 * f.winglet;
    const wl = (k, chord, td) => ({
      le: tipS.le.clone().add(V(-h * 0.9 * k * k, h * k, s * h * 0.12 * k * (1 - k))),
      chord,
      tc: 0.09,
      cd: AFT,
      td,
    });
    add(
      loftGeometry([
        { ...tipS },
        wl(0.15, ct * 0.95, V(0, 0.6, s * 0.8).normalize()),
        wl(0.45, ct * 0.75, V(0, 0.1, s).normalize()),
        wl(1, ct * 0.42, V(0, 0, s)),
      ]),
      plain
    );
    // nav light on the tip
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), s > 0 ? m.green : m.red);
    nav.position.copy(wl(1, 0, UP).le).add(V(-ct * 0.2, 0, 0));
    jet.add(nav);
    // flap-track fairings under the trailing edge
    for (const zf of [0.12, 0.25, 0.38]) {
      const { p, chord } = wingPt(zf, 0.82, -1, -0.07);
      const fg = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), plain);
      fg.scale.set(chord * 0.17, 0.075, 0.06);
      fg.position.copy(p).addScaledVector(AFT, chord * 0.1);
      jet.add(fg);
    }
    // stall fence on the upper surface
    {
      const { p, chord } = wingPt(0.68, 0.4, 1, 0.07);
      const fence = new THREE.Mesh(new THREE.BoxGeometry(chord * 0.5, 0.15, 0.014), plain);
      fence.position.copy(p);
      jet.add(fence);
    }
    // static wicks on the aileron trailing edge, and on the winglet
    const wick = new THREE.ConeGeometry(0.014, 0.4, 6);
    for (const zf of [0.86, 0.93, 0.99]) {
      const { p } = wingPt(zf, 1, 0);
      const w = new THREE.Mesh(wick, m.dark);
      w.rotation.z = Math.PI / 2;
      w.position.copy(p).add(V(-0.19, 0, 0));
      jet.add(w);
    }
  }
  // Wing-root fairing: a long blended body so the wing grows out of the fuselage instead of sitting on it.
  const fair = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), plain);
  fair.scale.set(L * 0.2, R * 0.42, R * 0.97);
  fair.position.set(wx - L * 0.1, -R * 0.62, 0);
  jet.add(fair);

  // Engines: rear-mounted pair on pylons, plus a centre engine for the trijet.
  const eLen = L * 0.145;
  const eRad = R * 0.56 + 0.04;
  const eu = 0.755;
  const es = section(f, eu);
  for (const s of [1, -1]) {
    const zc = s * (es.r + eRad + 0.3);
    const yc = es.cy + R * 0.32;
    const eng = nacelle(f, m, nacMat, eLen, eRad);
    eng.position.set(es.x, yc, zc);
    jet.add(eng);
    add(
      loftGeometry([
        { le: V(es.x + eLen * 0.2, yc, s * es.r * 0.7), chord: eLen * 0.6, tc: 0.17, cd: AFT, td: UP },
        { le: V(es.x + eLen * 0.16, yc, zc - s * eRad * 0.7), chord: eLen * 0.55, tc: 0.15, cd: AFT, td: UP },
      ]),
      plain
    );
  }
  let finBaseY = topY(f, 0.83) - 0.15;
  if (f.engines === 3) {
    const cu = 0.86;
    const cs = section(f, cu);
    const cy = topY(f, cu) + eRad * 0.35;
    const eng = nacelle(f, m, nacMat, eLen * 1.05, eRad * 0.95);
    eng.position.set(cs.x, cy, 0);
    jet.add(eng);
    finBaseY = cy + eRad * 0.6;
  }

  // Tail: swept fin with a T-tail or cruciform stabiliser.
  const finH = L * 0.15;
  const finCr = L * 0.17;
  const finCt = L * 0.1;
  const finSw = Math.tan(0.72);
  const finX = section(f, f.engines === 3 ? 0.83 : 0.79).x;
  const finTop = { le: V(finX - finH * finSw, finBaseY + finH, 0), chord: finCt, tc: 0.1, cd: AFT, td: SIDE };
  add(loftGeometry([{ le: V(finX + 0.4, finBaseY - 0.5, 0), chord: finCr * 1.05, tc: 0.11, cd: AFT, td: SIDE }, finTop]), tailMat);
  const stabY = f.tail === 'T' ? finBaseY + finH : finBaseY + finH * 0.38;
  const stabX = f.tail === 'T' ? finTop.le.x + finCt * 0.15 : finX - finH * 0.38 * finSw;
  const stabC = f.tail === 'T' ? finCt * 0.95 : finCr * 0.62;
  const stabHalf = L * 0.17;
  const wick = new THREE.ConeGeometry(0.012, 0.34, 6);
  for (const s of [1, -1]) {
    const tipLe = V(stabX - stabHalf * Math.tan(0.55), stabY + stabHalf * 0.04, s * stabHalf);
    add(
      loftGeometry([
        { le: V(stabX, stabY, 0), chord: stabC, tc: 0.1, cd: AFT, td: UP },
        { le: tipLe, chord: stabC * 0.48, tc: 0.08, cd: AFT, td: UP },
      ]),
      tailMat
    );
    const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6), m.white);
    tipLight.position.set(tipLe.x - stabC * 0.3, tipLe.y, tipLe.z);
    jet.add(tipLight);
    for (const k of [0.6, 0.9]) {
      const w = new THREE.Mesh(wick, m.dark);
      w.rotation.z = Math.PI / 2;
      w.position.set(lerp(stabX, tipLe.x, k) - stabC * lerp(1, 0.48, k) - 0.17, lerp(stabY, tipLe.y, k), s * stabHalf * k);
      jet.add(w);
    }
  }
  // Fin-top static wick
  {
    const w = new THREE.Mesh(wick, m.dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(finTop.le.x - finCt - 0.17, finTop.le.y - 0.05, 0);
    jet.add(w);
  }

  // Tail cone: APU exhaust ring and a white tail position light.
  const tail = section(f, 1);
  const apu = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.026, 10, 28), m.burnt);
  apu.rotation.y = Math.PI / 2;
  apu.position.set(tail.x - 0.02, tail.cy, 0);
  jet.add(apu);
  const apuIn = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), m.dark);
  apuIn.rotation.y = -Math.PI / 2;
  apuIn.position.set(tail.x - 0.035, tail.cy, 0);
  jet.add(apuIn);
  put(new THREE.SphereGeometry(0.07, 10, 6), m.white, V(tail.x - 0.1, tail.cy + 0.2, 0));

  // Antennas: spine blade aerials, a SATCOM hump, belly blades; red anti-collision beacons.
  const blade = (u, belly, h, chord, mat = plain) => {
    const a = belly ? Math.PI : 0;
    const p = surface(f, u, a, -0.03).p;
    const dir = belly ? -1 : 1;
    const g = loftGeometry(
      [
        { le: p.clone(), chord, tc: 0.07, cd: AFT, td: SIDE },
        { le: p.clone().add(V(-chord * 0.55, dir * h, 0)), chord: chord * 0.34, tc: 0.07, cd: AFT, td: SIDE },
      ],
      8
    );
    return add(g, mat);
  };
  blade(0.26, false, 0.5, 0.46);
  blade(0.55, false, 0.38, 0.34, m.dark);
  blade(0.33, true, 0.42, 0.4);
  blade(0.5, true, 0.3, 0.3, m.dark);
  blade(0.17, true, 0.2, 0.24, m.dark);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), plain);
  hump.scale.set(R * 0.62, R * 0.13, R * 0.21);
  hump.position.set(section(f, 0.43).x, topY(f, 0.43) + R * 0.01, 0);
  jet.add(hump);
  const beaconTop = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), m.beacon);
  beaconTop.scale.set(0.11, 0.05, 0.11);
  beaconTop.position.set(section(f, 0.5).x, topY(f, 0.5) + 0.01, 0);
  jet.add(beaconTop);
  const beaconBelly = beaconTop.clone();
  beaconBelly.position.set(section(f, 0.34).x, section(f, 0.34).cy - section(f, 0.34).r * 1.04 - 0.01, 0);
  jet.add(beaconBelly);

  jet.userData = {
    spec,
    length: L,
    radius: R,
    paint,
    materials: m,
    engine: V(es.x, es.cy + R * 0.32, es.r + eRad + 0.3),
    engineRadius: eRad,
    wingTip: V(wx - (half - R * 0.4) * sw, wy + (half - R * 0.4) * dih, half),
    tipChord: ct,
    finTop: finTop.le.clone(),
    cockpit: surface(f, f.nose * 0.8, 0).p,
  };
  return jet;
}

// Blink the beacon and strobes. `beacon` and `strobe` are whole flash cycles per loop (t in 0..1),
// so a clip that ends where it began also ends on the same flash phase.
export function animateJet(jet, t, { beacon = 3, strobe = 2 } = {}) {
  const m = jet.userData.materials;
  if (!m) return;
  const p = (t * beacon) % 1;
  const kb = 0.08 + 0.92 * Math.exp(-p * 9);
  m.beacon.color.setRGB(7 * kb, 0.3 * kb, 0.2 * kb);
  const q = (t * strobe) % 1;
  const ks = q < 0.035 || (q > 0.11 && q < 0.145) ? 1 : 0.04;
  m.white.color.setRGB(6 * ks, 6 * ks, 6 * ks);
}

/* ================================================================ cabin */
function woodTexture(seed = 5) {
  const c = mkCanvas(1024, 256);
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = '#4a2c19';
  g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 260; i++) {
    const y0 = r() * 256;
    g.strokeStyle = r() < 0.5 ? `rgba(22,10,4,${0.15 + r() * 0.25})` : `rgba(176,116,70,${0.1 + r() * 0.16})`;
    g.lineWidth = 0.5 + r() * 2.5;
    g.beginPath();
    const amp = 2 + r() * 8;
    const ph = r() * 6;
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y0 + Math.sin((x / 1024) * TAU + ph) * amp);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Cloud view for the cabin windows: layered billow sprites on a dusk gradient, tileable in x.
function windowViewTexture() {
  const W = 1024;
  const H = 256;
  const c = mkCanvas(W, H);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#2c2e36');
  grd.addColorStop(0.4, '#8d6f55');
  grd.addColorStop(0.5, '#e2a56b');
  grd.addColorStop(0.56, '#6e625a');
  grd.addColorStop(1, '#25262a');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const r = rng(9);
  const puffs = [3, 5, 8, 13].map((s) => billowTexture(s, { w: 256, h: 256, billows: 10 }));
  for (let i = 0; i < 46; i++) {
    const x = r() * W;
    const y = 128 + r() * r() * 140;
    const sz = 50 + r() * 120;
    g.globalAlpha = 0.5 + r() * 0.45;
    const img = puffs[Math.floor(r() * 4)];
    for (const dx of [-W, 0, W]) g.drawImage(img, x + dx - sz, y - sz * 0.62, sz * 2.2, sz * 1.2);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function leatherMaps(rows = 4, str = 4) {
  // Channel-quilted leather: soft pillows between stitched grooves, plus fine grain.
  const S = 512;
  const hc = mkCanvas(S, S);
  const hg = hc.getContext('2d', { willReadFrequently: true });
  const img = hg.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const fr = ((y / S) * (rows || 1)) % 1;
      const pillow = rows ? Math.pow(Math.sin(Math.PI * fr), 0.55) : 0.7;
      const grain = (hash2(x >> 1, y >> 1, 3) - 0.5) * 0.09 + (hash2(x >> 3, y >> 3, 5) - 0.5) * 0.06;
      let v = 0.35 + pillow * 0.55 + grain;
      // stitch dashes in the groove
      if (rows && (fr < 0.035 || fr > 0.965) && (x >> 3) % 2 === 0) v -= 0.05;
      const o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = clamp(v) * 255;
      img.data[o + 3] = 255;
    }
  hg.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(hc);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // convert to a normal map
  const d = img.data;
  const nimg = new ImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (d[(y * S + ((x + 1) % S)) * 4] - d[(y * S + ((x - 1 + S) % S)) * 4]) / 255;
      const dy = (d[(((y + 1) % S) * S + x) * 4] - d[(((y - 1 + S) % S) * S + x) * 4]) / 255;
      const nx = -dx * str;
      const ny = dy * str;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const o = (y * S + x) * 4;
      nimg.data[o] = (nx * inv * 0.5 + 0.5) * 255;
      nimg.data[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      nimg.data[o + 2] = (inv * 0.5 + 0.5) * 255;
      nimg.data[o + 3] = 255;
    }
  const nc = mkCanvas(S, S);
  nc.getContext('2d').putImageData(nimg, 0, 0);
  const n = new THREE.CanvasTexture(nc);
  n.wrapS = n.wrapT = THREE.RepeatWrapping;
  n.anisotropy = 8;
  return n;
}

function carpetTexture() {
  const S = 512;
  const c = mkCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#4a3f35';
  g.fillRect(0, 0, S, S);
  // aisle runner with a champagne border
  g.fillStyle = 'rgba(210,180,140,0.1)';
  g.fillRect(0, S * 0.3, S, S * 0.4);
  g.fillStyle = 'rgba(224,190,140,0.32)';
  g.fillRect(0, S * 0.3, S, 2);
  g.fillRect(0, S * 0.7 - 2, S, 2);
  const img = g.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = (hash2(x, y, 9) - 0.5) * 20;
      const o = (y * S + x) * 4;
      img.data[o] += n;
      img.data[o + 1] += n;
      img.data[o + 2] += n;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function pleatTexture() {
  const c = mkCanvas(64, 128);
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const grd = g.createLinearGradient(0, i * 8, 0, i * 8 + 8);
    grd.addColorStop(0, '#f1e6d0');
    grd.addColorStop(0.8, '#d4c6a8');
    grd.addColorStop(1, '#a89a7e');
    g.fillStyle = grd;
    g.fillRect(0, i * 8, 64, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A strip of the cabin's cylindrical wall between two angles (y = r sin θ, z = r cos θ), facing inward.
function cylPatch(radius, t0, t1, x0, x1, { tile = 1.5, nt = 24 } = {}) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (const x of [x0, x1])
    for (let j = 0; j <= nt; j++) {
      const th = lerp(t0, t1, j / nt);
      pos.push(x, Math.sin(th) * radius, Math.cos(th) * radius);
      nor.push(0, -Math.sin(th), -Math.cos(th));
      uv.push((x - x0) / tile, j / nt);
    }
  for (let j = 0; j < nt; j++) {
    const a = j;
    const b = j + 1;
    const c = nt + 1 + j;
    const d = nt + 2 + j;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// A small warm room to reflect in the chrome, clearcoat and veneer (the cabin has no sky).
export function cabinEnvironment(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(24, 5, 5), new THREE.MeshBasicMaterial({ color: 0x4a3a2c, side: THREE.BackSide })));
  const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.6) });
  for (const x of [-8, -4, 0, 4, 8])
    for (const z of [-0.7, 0.7]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.3), strip);
      m.position.set(x, 2.4, z);
      s.add(m);
    }
  const win = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.7), side: THREE.DoubleSide });
  for (const x of [-9, -6, -3, 0, 3, 6, 9])
    for (const z of [-2.4, 2.4]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), win);
      m.position.set(x, 0.3, z);
      m.rotation.y = Math.PI / 2;
      s.add(m);
    }
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(24, 5), new THREE.MeshBasicMaterial({ color: 0x1f1813 }));
  fl.rotation.x = -Math.PI / 2;
  fl.position.y = -2;
  s.add(fl);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.04).texture;
  pm.dispose();
  return tex;
}

export function createCabin() {
  const g = new THREE.Group();
  const R = 1.05;
  const len = 9;
  const FLOOR = -R * 0.59;
  const wood = woodTexture();
  const view = windowViewTexture();
  const pleatN = leatherMaps(4, 3);
  const grainN = leatherMaps(0, 6);
  const carpetMap = carpetTexture();
  carpetMap.repeat.set(len / 1.7, 1);

  const leatherG = new THREE.MeshPhysicalMaterial({ color: 0x4d3326, roughness: 0.46, sheen: 0.45, sheenColor: 0xd8bc98, sheenRoughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.38, normalMap: grainN, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 0.9 });
  const leather = leatherG.clone();
  leather.normalMap = pleatN;
  leather.normalScale.set(0.7, 0.7);
  const leatherLight = leatherG.clone();
  leatherLight.color.set(0xa58a68);
  const leatherLightP = leather.clone();
  leatherLightP.color.set(0xa58a68);
  const suede = new THREE.MeshStandardMaterial({ color: 0xc2b296, roughness: 0.92 });
  const veneer = new THREE.MeshPhysicalMaterial({ map: wood, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xe0c699, metalness: 1, roughness: 0.22, envMapIntensity: 1.2 });
  const carpet = new THREE.MeshStandardMaterial({ map: carpetMap, bumpMap: carpetMap, bumpScale: 0.5, roughness: 1 });
  const ceilPanel = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.44, 0.24) });
  const cove = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.37, 0.22) });

  // Wall: suede headliner above, veneer below a brass-edged ledge at the window sill.
  const SILL = 0.02;
  const thSill = Math.asin(SILL / R);
  g.add(new THREE.Mesh(cylPatch(R, thSill, Math.PI - thSill, -len / 2, len / 2, { nt: 48 }), suede));
  const lowT = Math.asin((FLOOR - 0.01) / R);
  for (const side of [1, -1]) {
    const t0 = side > 0 ? lowT : Math.PI - thSill;
    const t1 = side > 0 ? thSill : Math.PI - lowT;
    const wall = new THREE.Mesh(cylPatch(R * 0.998, t0, t1, -len / 2, len / 2, { tile: 1.6, nt: 10 }), veneer);
    g.add(wall);
  }
  // Ledges
  for (const s of [1, -1]) {
    const ledge = new THREE.Mesh(new RoundedBoxGeometry(len - 0.15, 0.04, 0.17, 2, 0.012), veneer);
    ledge.position.set(0, SILL + 0.02, s * 0.9);
    g.add(ledge);
    const trimL = new THREE.Mesh(new THREE.BoxGeometry(len - 0.15, 0.012, 0.012), brass);
    trimL.position.set(0, SILL + 0.002, s * 0.815);
    g.add(trimL);
  }
  // Ceiling light panels and cove lighting along the headliner edges
  for (const s of [1, -1]) {
    for (let k = 0; k < 7; k++) {
      const x0 = -len / 2 + 0.5 + k * 1.2;
      g.add(new THREE.Mesh(cylPatch(R * 0.994, Math.PI / 2 + s * 0.42 - 0.055, Math.PI / 2 + s * 0.42 + 0.055, x0, x0 + 0.7, { nt: 4 }), ceilPanel));
    }
    const cv = new THREE.Mesh(cylPatch(R * 0.995, s > 0 ? thSill + 0.04 : Math.PI - thSill - 0.075, s > 0 ? thSill + 0.075 : Math.PI - thSill - 0.04, -len / 2 + 0.1, len / 2 - 0.1, { nt: 2 }), cove);
    g.add(cv);
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.7), carpet);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  floor.receiveShadow = true;
  g.add(floor);

  // Forward bulkhead: veneer wall with a brass-framed door, closing the aisle.
  const bulk = new THREE.Mesh(new THREE.CircleGeometry(R, 64), veneer);
  bulk.rotation.y = Math.PI / 2;
  bulk.position.x = -len / 2 + 0.05;
  g.add(bulk);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.32), new THREE.MeshPhysicalMaterial({ map: wood, color: 0xc89c78, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.4 }));
  door.rotation.y = Math.PI / 2;
  door.position.set(-len / 2 + 0.07, FLOOR + 0.66, 0);
  g.add(door);
  for (const [w, hh, y, z] of [[0.66, 0.02, FLOOR + 1.33, 0], [0.02, 1.32, FLOOR + 0.66, 0.32], [0.02, 1.32, FLOOR + 0.66, -0.32]]) {
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.02, hh, w === 0.02 ? 0.02 : w), brass);
    fr.position.set(-len / 2 + 0.08, y, z);
    g.add(fr);
  }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.02), brass);
  handle.position.set(-len / 2 + 0.09, FLOOR + 0.66, 0.22);
  g.add(handle);
  const doorGlow = new THREE.PointLight(0xffc994, 1.3, 4.5, 1.6);
  doorGlow.position.set(-len / 2 + 0.8, R * 0.5, 0);
  g.add(doorGlow);

  // Windows: the moving cloud view, a half-lowered pleated shade, and a satin bezel.
  const rimMat = new THREE.MeshPhysicalMaterial({ color: 0xe3c68c, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.4 });
  const shadeMat = new THREE.MeshStandardMaterial({ map: pleatTexture(), color: 0xd8bf94, roughness: 0.95, emissive: 0xffbd7a, emissiveMap: pleatTexture(), emissiveIntensity: 0.2 });
  const cut = 0.14; // shade bottom edge, in window-local units (-1..1)
  const shadeShape = new THREE.Shape();
  {
    const th0 = Math.asin(cut);
    shadeShape.moveTo(Math.cos(th0), cut);
    for (let k = 0; k <= 40; k++) {
      const th = lerp(th0, Math.PI - th0, k / 40);
      shadeShape.lineTo(Math.cos(th), Math.sin(th));
    }
    shadeShape.lineTo(Math.cos(th0), cut);
  }
  const shadeGeo = new THREE.ShapeGeometry(shadeShape, 8);
  {
    const p = shadeGeo.attributes.position;
    const uv = shadeGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.5 + 0.5, p.getY(i) * 0.5 + 0.5);
  }
  const views = [];
  // Bake a unit-space window shape onto the cylindrical wall (the wall curves in above the sill, so a
  // flat window would be clipped by the headliner). off pulls it a little into the cabin.
  const WALL_R = R * 0.998;
  const onWall = (geo, cx, cy, sx, sy, s, off = 0) => {
    const g = geo.clone();
    const p = g.attributes.position;
    const nrm = new Float32Array(p.count * 3);
    const rr = WALL_R - off;
    for (let k = 0; k < p.count; k++) {
      const y = cy + p.getY(k) * sy;
      const z = s * Math.sqrt(Math.max(rr * rr - y * y, 0.01));
      p.setXYZ(k, cx - s * p.getX(k) * sx, y, z);
      const l = Math.hypot(y, z) || 1;
      nrm[k * 3 + 1] = -y / l;
      nrm[k * 3 + 2] = -z / l;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    return g;
  };
  const WY = 0.4; // window centre height
  const WSX = 0.2;
  const WSY = 0.3;
  const winGeo = new THREE.CircleGeometry(1, 40);
  const rimGeo = new THREE.RingGeometry(1, 1.3, 40, 1);
  for (let i = 0; i < 6; i++) {
    for (const s of [1, -1]) {
      const x = -len / 2 + 1.1 + i * 1.35;
      const vt = view.clone();
      vt.needsUpdate = true;
      vt.repeat.set(0.4, 1);
      vt.userData = { phase: (i * 0.17 + (s > 0 ? 0 : 0.43)) % 1 };
      views.push(vt);
      const vm = new THREE.MeshBasicMaterial({ map: vt, color: new THREE.Color(1.25, 1.12, 1.0) });
      g.add(new THREE.Mesh(onWall(winGeo, x, WY, WSX, WSY, s), vm));
      g.add(new THREE.Mesh(onWall(shadeGeo, x, WY, WSX, WSY, s, 0.006), shadeMat));
      g.add(new THREE.Mesh(onWall(rimGeo, x, WY, WSX, WSY, s, 0.012), rimMat));
      // shade pull
      const pull = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.012), brass);
      const py = WY + cut * WSY - 0.01;
      pull.position.set(x, py, s * (Math.sqrt(WALL_R * WALL_R - py * py) - 0.02));
      g.add(pull);
    }
  }

  // Club seating: pairs of facing seats with a veneer table between.
  const seat = () => {
    const s = new THREE.Group();
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.2, 0.62, 4, 0.07), leatherG);
    base.position.y = -0.28;
    const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.11, 0.5, 4, 0.05), leatherLight);
    cushion.position.set(0.03, -0.155, 0);
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.66, 0.5, 4, 0.07), leather);
    back.position.set(-0.31, 0.05, 0);
    back.rotation.z = -0.12;
    const wing = new THREE.Group();
    for (const z of [0.29, -0.29]) {
      const bol = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.5, 0.1, 3, 0.045), leather);
      bol.position.set(-0.24, -0.01, z);
      bol.rotation.set(0, -Math.sign(z) * 0.28, -0.12);
      wing.add(bol);
    }
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.26, 0.36, 4, 0.06), leatherLightP);
    head.position.set(-0.375, 0.45, 0);
    head.rotation.z = -0.12;
    const armG = new RoundedBoxGeometry(0.6, 0.14, 0.1, 3, 0.04);
    const a1 = new THREE.Mesh(armG, leatherG);
    a1.position.set(0, -0.12, 0.34);
    const a2 = a1.clone();
    a2.position.z = -0.34;
    const capG = new THREE.BoxGeometry(0.5, 0.012, 0.07);
    const c1 = new THREE.Mesh(capG, veneer);
    c1.position.set(0, -0.045, 0.34);
    const c2 = c1.clone();
    c2.position.z = -0.34;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.26, 24), brass);
    plinth.position.y = -0.5;
    const trimB = new THREE.Mesh(new RoundedBoxGeometry(0.585, 0.022, 0.585, 2, 0.01), brass);
    trimB.position.y = -0.372;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 8, 32), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.62;
    [base, cushion, back, wing, head, a1, a2, c1, c2, plinth, trimB, ring].forEach((mm) => {
      mm.traverse?.((o) => (o.castShadow = o.receiveShadow = true));
      s.add(mm);
    });
    return s;
  };
  for (const [x, z, face] of [[-2.2, 0.5, 1], [-0.6, 0.5, -1], [-2.2, -0.5, 1], [-0.6, -0.5, -1], [1.6, 0.5, 1], [1.6, -0.5, 1]]) {
    const s = seat();
    s.position.set(x, -R * 0.16, z);
    s.rotation.y = face > 0 ? 0 : Math.PI;
    g.add(s);
  }
  const lampShade = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffb866, emissiveIntensity: 1.1, roughness: 0.6, side: THREE.DoubleSide });
  for (const z of [0.55, -0.55]) {
    const top = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.04, 0.5, 3, 0.015), veneer);
    top.position.set(-1.4, -R * 0.12 - 0.02, z);
    top.castShadow = true;
    g.add(top);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.81, 0.012, 0.51), brass);
    edge.position.set(-1.4, -R * 0.12 - 0.045, z);
    g.add(edge);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.14, 12), brass);
    stem.position.set(-1.4, -R * 0.12 + 0.07, z * 1.1);
    g.add(stem);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.1, 24, 1, true), lampShade);
    lamp.position.set(-1.4, -R * 0.12 + 0.17, z * 1.1);
    g.add(lamp);
    const lampLight = new THREE.PointLight(0xffc27f, 0.7, 2.2, 1.6);
    lampLight.position.set(-1.4, -R * 0.12 + 0.2, z * 1.1);
    g.add(lampLight);
  }

  const warm = new THREE.PointLight(0xffd2a6, 3.6, 7, 1.6);
  warm.position.set(-1.4, R * 0.62, 0);
  warm.castShadow = true;
  warm.shadow.mapSize.set(1024, 1024);
  g.add(warm);
  const warm2 = new THREE.PointLight(0xffd2a0, 3, 6, 1.6);
  warm2.position.set(1.8, R * 0.62, 0);
  g.add(warm2);
  const warm3 = new THREE.PointLight(0xffd8ac, 2.2, 5, 1.6);
  warm3.position.set(-3.6, R * 0.55, 0);
  g.add(warm3);
  g.add(new THREE.HemisphereLight(0xfff0dc, 0x4a382a, 0.45));
  g.userData = {
    view,
    // advance the cloud view by whole turns: t in 0..1 over one loop
    setLoop(t) {
      view.offset.x = t;
      for (const vt of views) vt.offset.x = vt.userData.phase + t;
    },
  };
  return g;
}

/* ========================================================= environment */
// Equirectangular night-cloud sky: charcoal overcast, a low amber band, grey cloud floor.
export function skyTexture({ w = 2048, h = 1024, sunAz = 0.18, bright = 1 } = {}) {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#07080a');
  grd.addColorStop(0.3, '#16181c');
  grd.addColorStop(0.44, '#2e2f33');
  grd.addColorStop(0.49, '#6d5444');
  grd.addColorStop(0.505, '#a2724a');
  grd.addColorStop(0.53, '#3b3a3c');
  grd.addColorStop(0.62, '#26282d');
  grd.addColorStop(1, '#0d0e11');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  // sun glow on the horizon, wrapped across the seam
  for (const dx of [-w, 0, w]) {
    const x = sunAz * w + dx;
    const sg = g.createRadialGradient(x, h * 0.5, 0, x, h * 0.5, h * 0.42);
    sg.addColorStop(0, `rgba(255,186,120,${0.55 * bright})`);
    sg.addColorStop(0.3, `rgba(220,140,80,${0.22 * bright})`);
    sg.addColorStop(1, 'rgba(120,80,50,0)');
    g.fillStyle = sg;
    g.fillRect(x - h, 0, h * 2, h);
  }
  // overcast texture
  const noise = new ImprovedNoise();
  const img = g.getImageData(0, 0, w, h);
  const step = 2;
  for (let y = 0; y < h; y += step) {
    const v = y / h;
    const band = v < 0.48 ? smooth(0.05, 0.4, v) * (1 - smooth(0.44, 0.48, v)) : smooth(0.53, 0.6, v) * (1 - smooth(0.85, 1, v));
    if (band <= 0) continue;
    for (let x = 0; x < w; x += step) {
      const th = (x / w) * TAU;
      const nx = Math.cos(th) * 3;
      const nz = Math.sin(th) * 3;
      const ny = v * (v < 0.5 ? 9 : 14);
      let n = 0;
      let amp = 1;
      let fr = 1;
      for (let o = 0; o < 4; o++) {
        n += noise.noise(nx * fr, ny * fr, nz * fr) * amp;
        amp *= 0.5;
        fr *= 2.1;
      }
      const d = Math.max(0, n) * 70 * band;
      for (let yy = 0; yy < step; yy++)
        for (let xx = 0; xx < step; xx++) {
          const i = ((y + yy) * w + x + xx) * 4;
          img.data[i] += d;
          img.data[i + 1] += d * 0.98;
          img.data[i + 2] += d * 1.02;
        }
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createEnvironment(renderer, scene, opts = {}) {
  const tex = skyTexture(opts);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  scene.environment = env;
  if (opts.background !== false) {
    scene.background = tex;
    scene.backgroundIntensity = opts.backgroundIntensity ?? 0.85;
  }
  pmrem.dispose();
  return { env, tex };
}

export function addLights(scene, { sunAz = 0.18 } = {}) {
  // Equirect u = 0.18 → the sun sits ahead-left of a jet flying +X, low on the horizon.
  const az = (0.5 - sunAz) * TAU;
  const key = new THREE.DirectionalLight(0xffc690, 2.7);
  key.position.set(Math.cos(az) * 100, 22, Math.sin(az) * 100);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb2ff, 0.45);
  rim.position.set(-60, 80, -40);
  scene.add(rim);
  // A low amber kick from the far horizon: warm rim on edges that face away from the sun.
  const kick = new THREE.DirectionalLight(0xff9a55, 0.75);
  kick.position.set(-Math.cos(az) * 100, 8, -Math.sin(az) * 100);
  scene.add(kick);
  scene.add(new THREE.HemisphereLight(0x5d626e, 0x15161a, 0.5));
  return { key, rim, kick };
}

/* ================================================================ clouds */
// Cumulus billows: a pile of spheres seen from the side, each a hemisphere height field. The union
// gives creased, cauliflower lobes; the sphere normal drives the lighting (lit tops, shadowed bases),
// creases where lobes meet are darkened, and a domain-warped fbm erodes the fringe into wisps.
function billowTexture(seed, { w = 512, h = 512, billows = 16, base = 0.68, wisp = 1 } = {}) {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const noise = new ImprovedNoise();
  const r = rng(seed * 9973);
  const asp = w / h;
  const sph = [];
  for (let i = 0; i < billows; i++) {
    const cx = asp * (0.5 + (r() + r() - 1) * 0.3);
    const edge = Math.abs(cx / asp - 0.5) * 2;
    const rad = (0.05 + r() * 0.1) * (1.25 - edge * 0.6) * (asp > 1.5 ? 0.62 : 1);
    sph.push({ x: cx, y: base - rad * (0.25 + r() * 0.6) - (1 - edge) * r() * 0.1, r: rad });
  }
  const parents = sph.length;
  for (let i = 0; i < parents * 3; i++) {
    const p = sph[Math.floor(r() * parents)];
    const an = -Math.PI * (0.05 + r() * 0.9);
    const rad = p.r * (0.34 + r() * 0.26);
    sph.push({ x: p.x + Math.cos(an) * p.r * 0.88, y: p.y + Math.sin(an) * p.r * 0.88, r: rad });
  }
  const kids = sph.length;
  for (let i = 0; i < parents * 2; i++) {
    const p = sph[parents + Math.floor(r() * (kids - parents))];
    const an = -Math.PI * (0.05 + r() * 0.9);
    sph.push({ x: p.x + Math.cos(an) * p.r * 0.9, y: p.y + Math.sin(an) * p.r * 0.9, r: p.r * (0.4 + r() * 0.2) });
  }
  const L = V(-0.4, -0.78, 0.5).normalize();
  const fbm = (x, y, z, o = 4) => {
    let n = 0;
    let a = 0.5;
    let fr = 1;
    for (let k = 0; k < o; k++) {
      n += noise.noise(x * fr, y * fr, z) * a;
      a *= 0.5;
      fr *= 2.05;
    }
    return n;
  };
  const sx = seed * 1.7;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const u = (px / w) * asp;
      const v = py / h;
      // domain warp: wobbles the billow outlines
      const wx = fbm(u * 3.2 + sx, v * 3.2, 1.3, 3);
      const wy = fbm(u * 3.2 + 11, v * 3.2 + sx, 4.1, 3);
      const qx = u + wx * 0.11;
      const qy = v + wy * 0.11;
      let h1 = 0;
      let h2 = 0;
      let bn = null;
      for (let i = 0; i < sph.length; i++) {
        const s = sph[i];
        const dx = qx - s.x;
        const dy = qy - s.y;
        const d2 = s.r * s.r - dx * dx - dy * dy;
        if (d2 > 0) {
          const hh = Math.sqrt(d2);
          if (hh > h1) {
            h2 = h1;
            h1 = hh;
            bn = i;
          } else if (hh > h2) h2 = hh;
        }
      }
      const o = (py * w + px) * 4;
      if (bn === null) {
        // wispy fringe outside the billows
        const f = fbm(u * 6 + sx, v * 6, 7.7) + 0.5;
        const nearest = Math.min(1, Math.max(0, f - 0.62)) * wisp * 0.9 * smooth(base + 0.02, base - 0.3, v);
        img.data[o] = img.data[o + 1] = 150;
        img.data[o + 2] = 158;
        img.data[o + 3] = nearest > 0 ? Math.min(90, nearest * 300) * smooth(0.04, 0.12, Math.min(u, asp - u)) * smooth(0, 0.06, v) : 0;
        continue;
      }
      const s = sph[bn];
      const nx = (qx - s.x) / s.r;
      const ny = (qy - s.y) / s.r;
      const nzz = h1 / s.r;
      const lam = Math.max(0, nx * L.x + ny * L.y + nzz * L.z);
      const crease = smooth(0, 0.045, h1 - h2);
      const fine = fbm(u * 18 + sx, v * 18, 2.2, 3);
      let lit = 0.46 + 0.62 * Math.pow(lam, 0.85);
      lit *= 0.82 + 0.18 * crease;
      lit *= 1 - 0.45 * smooth(base - 0.3, base, v); // darker, flatter underside
      lit *= 0.93 + fine * 0.35;
      const erode = fbm(u * 11 + sx, v * 11, 5.5) * 0.12 * wisp;
      let a = smooth(-0.01, 0.16, h1 + erode);
      a *= smooth(base + 0.075, base - 0.01, v + wy * 0.02); // flat-ish base
      a *= smooth(0, 0.05, Math.min(u, asp - u)) * smooth(0, 0.04, v);
      const L255 = clamp(lit) * 255;
      img.data[o] = L255 * (0.9 + 0.1 * lam);
      img.data[o + 1] = L255 * (0.94 + 0.06 * lam);
      img.data[o + 2] = L255 * (1.04 - 0.02 * lam);
      img.data[o + 3] = a * 255;
    }
  const raw = mkCanvas(w, h);
  raw.getContext('2d').putImageData(img, 0, 0);
  g.filter = 'blur(1.3px)';
  g.drawImage(raw, 0, 0);
  g.filter = 'none';
  return c;
}

// Thin horizontal streaks of cloud for the fast near-field wisps.
function streakTexture(seed) {
  const w = 512;
  const h = 128;
  const c = mkCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const noise = new ImprovedNoise();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const env = smooth(0, 0.3, u) * smooth(1, 0.7, u) * (1 - Math.pow(Math.abs(v - 0.5) * 2, 1.6));
      let n = 0;
      let a = 0.5;
      let fr = 1;
      for (let k = 0; k < 4; k++) {
        n += noise.noise(u * 3 * fr + seed, v * 6 * fr, seed * 0.3) * a;
        a *= 0.5;
        fr *= 2;
      }
      const d = clamp((n + 0.22) * 1.1) * env;
      const o = (y * w + x) * 4;
      img.data[o] = img.data[o + 1] = 170 + d * 60;
      img.data[o + 2] = 178 + d * 60;
      img.data[o + 3] = d * 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

const cloudTex = (c) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// A field of cloud sprites that streams past a stationary jet along -X. Each sprite travels exactly
// one box length (2B) per loop, so frame N equals frame 0 and the video loops without a seam;
// opacity fades to zero at the box ends, so the wrap itself is never seen.
export class CloudField {
  constructor(scene, { seed = 3, B = 240, sunAz = 0.18, deck = [-95, -38], wisps = 46, deckCount = 260, ceiling = 60, near = 1 } = {}) {
    const r = rng(seed);
    this.B = B;
    this.items = [];
    const tex = [
      billowTexture(11, { billows: 16 }),
      billowTexture(23, { billows: 20 }),
      billowTexture(37, { billows: 13 }),
      billowTexture(51, { billows: 18 }),
    ].map(cloudTex);
    const bankTex = [billowTexture(61, { w: 1024, h: 256, billows: 30, base: 0.7, wisp: 0.6 }), billowTexture(71, { w: 1024, h: 256, billows: 26, base: 0.68, wisp: 0.6 })].map(cloudTex);
    const streak = [streakTexture(2), streakTexture(5)].map(cloudTex);
    const az = (0.5 - sunAz) * TAU;
    const sun = V(Math.cos(az), 0, Math.sin(az));
    const make = (x, y, z, sx, sy, op, kind, map) => {
      const dir = V(x, 0, z).normalize();
      const warm = Math.pow(Math.max(0, dir.dot(sun)), 3) * (kind === 'deck' || kind === 'bank' ? 0.8 : 0.45);
      const shade = kind === 'deck' ? lerp(0.46, 0.85, smooth(deck[0], deck[1], y)) : kind === 'ceiling' ? 0.24 : kind === 'bank' ? 0.5 : kind === 'near' ? 0.55 : 0.66;
      const col = new THREE.Color(shade, shade, shade * 1.04).lerp(new THREE.Color(1, 0.66, 0.4).multiplyScalar(shade * 1.6), warm);
      const mat = new THREE.SpriteMaterial({ map, color: col, transparent: true, opacity: op, depthWrite: false, fog: true });
      mat.rotation = kind === 'bank' || kind === 'near' ? 0 : (r() - 0.5) * 0.4;
      const sp = new THREE.Sprite(mat);
      sp.scale.set(sx, sy, 1);
      sp.position.set(x, y, z);
      sp.userData = { x0: x, op };
      scene.add(sp);
      this.items.push(sp);
    };
    const pick = () => tex[Math.floor(r() * 4)];
    for (let i = 0; i < deckCount; i++) {
      const s = 34 + r() * 60;
      make(lerp(-B, B, r()), lerp(deck[0], deck[1], Math.pow(r(), 0.7)), lerp(-220, 220, r()), s * (1.5 + r() * 0.8), s, 0.6 + r() * 0.4, 'deck', pick());
    }
    // long layered banks along the far horizon
    for (let i = 0; i < 36; i++) {
      const z = (r() < 0.5 ? -1 : 1) * lerp(150, 320, r());
      const s = 55 + r() * 45;
      make(lerp(-B, B, r()), lerp(-62, -30, r()), z, s * 4, s, 0.55 + r() * 0.35, 'bank', bankTex[i % 2]);
    }
    for (let i = 0; i < wisps; i++) {
      const z = (r() < 0.5 ? -1 : 1) * lerp(14, 150, Math.pow(r(), 1.3) / near);
      const s = 12 + r() * 30;
      make(lerp(-B, B, r()), lerp(-30, 22, r()), z, s * (1.6 + r() * 0.8), s, 0.18 + r() * 0.28, 'wisp', pick());
    }
    for (let i = 0; i < 70; i++) {
      const s = 60 + r() * 80;
      make(lerp(-B, B, r()), ceiling + r() * 40, lerp(-260, 260, r()), s * (1.6 + r() * 0.8), s, 0.5 + r() * 0.4, 'ceiling', pick());
    }
    // near-field streaks: fast, faint, for parallax against the slow far clouds
    for (let i = 0; i < 16; i++) {
      const z = (r() < 0.5 ? -1 : 1) * lerp(11, 30, r());
      make(lerp(-B, B, r()), lerp(-7, 9, r()), z, 26 + r() * 50, 5 + r() * 8, 0.07 + r() * 0.09, 'near', streak[i % 2]);
    }
  }
  // t: loop phase 0..1. laps: how many box lengths per loop.
  update(t, laps = 1) {
    const B = this.B;
    for (const sp of this.items) {
      let x = sp.userData.x0 - t * laps * 2 * B;
      x = ((((x + B) % (2 * B)) + 2 * B) % (2 * B)) - B;
      sp.position.x = x;
      sp.material.opacity = sp.userData.op * (1 - smooth(0.6 * B, 0.97 * B, Math.abs(x)));
    }
  }
}
