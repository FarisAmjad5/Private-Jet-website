// OBSIDIAN — staged camera hero: five camera stops over three renders, a 3D cloud flow, gesture-locked input,
// generated ambience. After the last view a fresh downward gesture releases scrolling into the page; back at the
// top the hero takes the controls again. Exposes window.OBS (sound + motion state) for the rest of the page.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const smooth = (a, b, v) => {
  if (b <= a) return v >= b ? 1 : 0;
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const IMAGES = { wide: 'media/wide.webp', front: 'media/front.webp', side: 'media/side.webp' };

// f / fm: focus point in the image (0–1), landscape / portrait. a / am: where that point sits on screen.
// z: zoom over a cover fit. flow: world motion past the camera (x right, y down, z into the screen).
// mask: screen ellipse (fractions of the viewport) around the jet where cloud wisps thin out.
const STOPS = [
  { label: 'Arrival', img: 'wide', f: [0.5, 0.56], fm: [0.46, 0.56], z: 1.06, a: [0.6, 0.5], am: [0.5, 0.29], flow: [0.35, 0.04, 1], mask: [0.26, 0.2] },
  { label: 'Presence', img: 'front', f: [0.55, 0.55], fm: [0.4, 0.55], z: 1.12, a: [0.55, 0.47], am: [0.5, 0.32], flow: [0.42, 0.04, 1], mask: [0.42, 0.24] },
  { label: 'Silhouette', img: 'side', f: [0.5, 0.52], fm: [0.42, 0.5], z: 1.04, a: [0.52, 0.4], am: [0.45, 0.34], flow: [1, 0, 0.12], mask: [0.4, 0.16] },
  // Close views keep the airframe in the upper half so the captions sit on cloud, not fuselage.
  { label: 'Cabin', img: 'side', f: [0.3, 0.5], fm: [0.38, 0.5], z: 1.7, a: [0.42, 0.35], am: [0.5, 0.3], flow: [1, 0, 0.08], mask: [0.55, 0.22] },
  { label: 'Power', img: 'side', f: [0.71, 0.47], fm: [0.7, 0.46], z: 1.6, a: [0.64, 0.33], am: [0.55, 0.3], flow: [1, 0, 0.08], mask: [0.5, 0.24] },
];
const DURATION = 1500;
const DURATION_RM = 500;

const hero = $('#top');
const LAST = STOPS.length - 1;
const rig = $('#rig');
const captions = $$('.cap');
const hint = $('#hint');
const announce = $('#announce');
const motionMQ = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionMQ.matches;

/* ============================================================ plates */
const plates = $$('.plate').map((el) => ({ el, img: $('img', el), key: null, ar: 16 / 9 }));
const aspect = {};
let vis = 0; // index of the plate currently on screen
let rigW = 0;
let rigH = 0;
let portrait = false;

function sizePlate(p) {
  const ar = aspect[p.key] || p.ar;
  let cw, ch;
  if (rigW / rigH > ar) { cw = rigW; ch = rigW / ar; } else { ch = rigH; cw = rigH * ar; }
  p.cw = cw;
  p.ch = ch;
  p.el.style.width = `${cw}px`;
  p.el.style.height = `${ch}px`;
}

function assign(p, key) {
  if (p.key === key) return;
  p.key = key;
  p.img.src = IMAGES[key];
  sizePlate(p);
}

function place(p, cam, opacity = 1, blur = 0) {
  const z = Math.max(1, cam.z);
  const W = p.cw * z;
  const H = p.ch * z;
  const a = portrait ? cam.am : cam.a;
  const f = portrait ? cam.fm : cam.f;
  // Hold the focus point on its screen anchor, but never let the plate's edge into frame.
  const x = clamp(a[0] * rigW - f[0] * W, rigW - W, 0);
  const y = clamp(a[1] * rigH - f[1] * H, rigH - H, 0);
  p.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${(z).toFixed(4)})`;
  p.el.style.opacity = opacity.toFixed(3);
  p.el.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : 'none';
}

function layout() {
  const r = rig.getBoundingClientRect();
  rigW = r.width;
  rigH = r.height;
  portrait = innerWidth / innerHeight < 0.9;
  plates.forEach((p) => p.key && sizePlate(p));
  sky.resize();
}

/* ======================================================== cloud flow */
const sky = (() => {
  const cv = $('#sky');
  const ctx = cv.getContext('2d');
  const NEAR = 0.7;
  const FAR = 9;
  let w = 0, h = 0, F = 1, dpr = 1;
  let clouds = [];
  let streaks = [];

  const sprites = [0, 1, 2, 3, 4].map((i) => {
    const s = document.createElement('canvas');
    s.width = s.height = 256;
    const g = s.getContext('2d');
    const c = i === 4 ? '236,204,168' : '190,196,208';
    for (let k = 0; k < 16; k++) {
      const x = 128 + (Math.random() - 0.5) * 100;
      const y = 128 + (Math.random() - 0.5) * 56;
      const r = 28 + Math.random() * 44;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${c},0.2)`);
      grd.addColorStop(0.6, `rgba(${c},0.07)`);
      grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
    }
    return s;
  });

  const halfW = (z) => (z * w) / (2 * F);
  const halfH = (z) => (z * h) / (2 * F);

  function spawn(p, z) {
    p.z = z;
    p.x = (Math.random() * 2 - 1) * (halfW(z) + p.r);
    p.y = (Math.random() * 1.7 - 0.6) * (halfH(z) + p.r * 0.6);
  }

  function seed() {
    const area = clamp((w * h) / (1440 * 900), 0.45, 1.4);
    const nc = Math.round((reduced ? 34 : 64) * area);
    const ns = Math.round((reduced ? 30 : 110) * area);
    clouds = Array.from({ length: nc }, (_, i) => {
      const p = { r: 0.5 + Math.random() * 1.3, s: sprites[i % 5 === 4 && Math.random() < 0.6 ? 4 : i % 4], a: 0.35 + Math.random() * 0.55 };
      spawn(p, NEAR + Math.random() * (FAR - NEAR));
      return p;
    });
    streaks = Array.from({ length: ns }, () => {
      const p = { r: 0.02, a: 0.25 + Math.random() * 0.5 };
      spawn(p, NEAR + Math.random() * (FAR - NEAR));
      return p;
    });
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 1.25);
    w = innerWidth;
    h = innerHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    F = Math.max(w, h) * 0.62;
    seed();
  }

  function step(p, vx, vy, vz) {
    p.x += vx;
    p.y += vy;
    p.z += vz;
    if (p.z > FAR) spawn(p, NEAR + Math.random() * 0.3);
    else if (p.z < NEAR) spawn(p, FAR - Math.random() * 0.3);
    // Recycle sideways only once fully out of frame at the particle's own depth, so no reset is ever visible.
    const hw = halfW(p.z) + p.r * 1.05;
    const hh = halfH(p.z) + p.r * 0.7;
    if (p.x > hw) p.x -= 2 * hw;
    else if (p.x < -hw) p.x += 2 * hw;
    if (p.y > hh) p.y -= 2 * hh;
    else if (p.y < -hh) p.y += 2 * hh;
  }

  const depthAlpha = (z) => smooth(NEAR, NEAR + 1.3, z) * (1 - smooth(FAR - 3, FAR, z));

  function draw(dt, s) {
    const len = Math.hypot(s.flow[0], s.flow[1], s.flow[2]) || 1;
    const speed = (reduced ? 0.45 : 1.9) * s.boost * dt;
    const vx = (s.flow[0] / len) * speed;
    const vy = (s.flow[1] / len) * speed;
    const vz = (s.flow[2] / len) * speed;
    const mx = s.anchor[0] * w;
    const my = s.anchor[1] * h;
    const rx = s.mask[0] * w;
    const ry = s.mask[1] * h;
    const cx = w / 2;
    const cy = h / 2;
    const maskAt = (x, y) => lerp(0.14, 1, smooth(0.65, 1.35, Math.hypot((x - mx) / rx, (y - my) / ry)));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    clouds.forEach((p) => step(p, vx, vy, vz));
    clouds.sort((a, b) => b.z - a.z);
    const maxR = Math.max(w, h) * 1.3;
    for (const p of clouds) {
      const sr = (p.r / p.z) * F;
      if (sr > maxR) continue;
      const sx = cx + (p.x / p.z) * F;
      const sy = cy + (p.y / p.z) * F;
      const alpha = p.a * depthAlpha(p.z) * maskAt(sx, sy) * s.density;
      if (alpha < 0.004) continue;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(p.s, sx - sr, sy - sr * 0.55, sr * 2, sr * 1.1);
    }

    // Speed streaks: each drawn back along the flow, so their length tracks velocity.
    ctx.lineCap = 'round';
    const tail = 0.05 + 0.1 * s.boost;
    for (const p of streaks) {
      step(p, vx, vy, vz);
      const z0 = p.z;
      const z1 = p.z - (s.flow[2] / len) * tail;
      if (z1 < 0.3) continue;
      const x0 = cx + (p.x / z0) * F;
      const y0 = cy + (p.y / z0) * F;
      const x1 = cx + ((p.x - (s.flow[0] / len) * tail) / z1) * F;
      const y1 = cy + ((p.y - (s.flow[1] / len) * tail) / z1) * F;
      const alpha = p.a * depthAlpha(z0) * maskAt(x0, y0) * (0.35 + 0.65 * smooth(1, 2.5, s.boost) + 0.3);
      if (alpha < 0.01) continue;
      ctx.globalAlpha = Math.min(0.8, alpha);
      ctx.strokeStyle = 'rgb(222,226,234)';
      ctx.lineWidth = clamp(1.4 / z0, 0.4, 1.6);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Cloud bank: the veil that carries the camera between renders.
    if (s.veil > 0.002) {
      const g = ctx.createRadialGradient(cx, cy * 0.9, 0, cx, cy, Math.max(w, h) * 0.75);
      g.addColorStop(0, `rgba(92,96,106,${s.veil})`);
      g.addColorStop(0.55, `rgba(52,55,62,${s.veil})`);
      g.addColorStop(1, `rgba(18,19,23,${s.veil})`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  }

  return { resize, draw, reseed: seed };
})();

/* ============================================================ sound */
// All synthesised in the browser: brown-noise wind, a low drone with a restrained minor-second
// tension, a filtered engine hum, and a band-passed whoosh per camera move. Nothing plays until
// the visitor turns sound on.
const audio = (() => {
  let ac = null;
  let master = null;
  let brown = null;
  let white = null;
  let on = false;

  function noise(seconds, isBrown) {
    const len = ac.sampleRate * seconds;
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const r = Math.random() * 2 - 1;
        if (isBrown) {
          last = (last + 0.02 * r) / 1.02;
          d[i] = last * 3.2;
        } else d[i] = r;
      }
      // Crossfade the ends so the loop has no click.
      const fade = Math.floor(ac.sampleRate * 0.25);
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        d[i] = d[i] * t + d[len - fade + i] * (1 - t);
      }
    }
    return buf;
  }

  function loop(buf) {
    const s = ac.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.loopEnd = buf.duration - 0.25;
    s.start();
    return s;
  }

  function osc(type, freq, detune = 0) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.start();
    return o;
  }

  function lfo(rate, depth, param) {
    const o = osc('sine', rate);
    const g = ac.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
  }

  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    master = ac.createGain();
    master.gain.value = 0;
    master.connect(comp).connect(ac.destination);
    brown = noise(6, true);
    white = noise(3, false);

    // Wind
    const wind = ac.createBiquadFilter();
    wind.type = 'bandpass';
    wind.frequency.value = 520;
    wind.Q.value = 0.6;
    const windGain = ac.createGain();
    windGain.gain.value = 0.32;
    loop(brown).connect(wind).connect(windGain).connect(master);
    lfo(0.07, 260, wind.frequency);
    lfo(0.11, 0.12, windGain.gain);

    // Drone: A1 with a slow beat, a fifth above, and a quiet minor second for suspense.
    const droneLp = ac.createBiquadFilter();
    droneLp.type = 'lowpass';
    droneLp.frequency.value = 340;
    const drone = ac.createGain();
    drone.gain.value = 0.16;
    [osc('sine', 55), osc('triangle', 55, 7), osc('sine', 82.41, -4)].forEach((o) => o.connect(droneLp));
    droneLp.connect(drone).connect(master);
    lfo(0.045, 0.05, drone.gain);
    const tension = ac.createGain();
    tension.gain.value = 0.012;
    [osc('sine', 220), osc('sine', 233.08)].forEach((o) => o.connect(tension));
    tension.connect(master);
    lfo(0.03, 0.01, tension.gain);

    // Engine hum and turbine hiss
    const humLp = ac.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 170;
    const hum = ac.createGain();
    hum.gain.value = 0.05;
    osc('sawtooth', 92).connect(humLp);
    osc('sawtooth', 92.6).connect(humLp);
    humLp.connect(hum).connect(master);
    const hissHp = ac.createBiquadFilter();
    hissHp.type = 'highpass';
    hissHp.frequency.value = 2600;
    const hiss = ac.createGain();
    hiss.gain.value = 0.012;
    loop(white).connect(hissHp).connect(hiss).connect(master);
    const whine = ac.createGain();
    whine.gain.value = 0.0035;
    osc('sine', 1760).connect(whine).connect(master);
  }

  function whoosh(seconds, dir) {
    if (!on || !ac) return;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = white;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(220, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + seconds * 0.5);
    bp.frequency.exponentialRampToValueAtTime(260, t + seconds);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + seconds * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    let out = g;
    if (ac.createStereoPanner) {
      const pan = ac.createStereoPanner();
      pan.pan.setValueAtTime(-0.6 * dir, t);
      pan.pan.linearRampToValueAtTime(0.6 * dir, t + seconds);
      g.connect(pan);
      out = pan;
    }
    src.connect(bp).connect(g);
    out.connect(master);
    src.start(t);
    src.stop(t + seconds + 0.05);
  }

  // Short UI cues: 'hover' (a soft air tick) and 'select' (a brief swell). One voice at a time, so a
  // pointer sweeping across cards cannot stack them up.
  let busyUntil = 0;
  function cue(kind = 'hover') {
    if (!on || !ac) return;
    const t = ac.currentTime;
    if (t < busyUntil) return;
    const hover = kind === 'hover';
    const len = hover ? 0.2 : 0.7;
    busyUntil = t + (hover ? 0.18 : 0.4);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(hover ? 0.05 : 0.13, t + len * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const src = ac.createBufferSource();
    src.buffer = white;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = hover ? 5 : 1.3;
    bp.frequency.setValueAtTime(hover ? 2600 : 380, t);
    bp.frequency.exponentialRampToValueAtTime(hover ? 1500 : 1300, t + len);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + len + 0.05);
    if (hover) {
      const o = ac.createOscillator();
      o.frequency.value = 1318.5;
      const og = ac.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.016, t + 0.012);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(og).connect(master);
      o.start(t);
      o.stop(t + 0.26);
    }
  }

  async function toggle() {
    if (!ac) build();
    on = !on;
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    if (on) {
      await ac.resume();
      master.gain.linearRampToValueAtTime(0.55, t + 1.6);
    } else {
      master.gain.linearRampToValueAtTime(0, t + 0.6);
    }
    return on;
  }

  return { toggle, whoosh, cue, get on() { return on; } };
})();

/* ========================================================= sequence */
let cur = 0;
let anim = null;
let settledAt = 0;

function cam(stop) {
  return { f: stop.f, fm: stop.fm, z: stop.z, a: stop.a, am: stop.am };
}

function setCaption(i) {
  captions.forEach((c) => c.classList.toggle('is-on', Number(c.dataset.stop) === i));
}

function go(target) {
  target = clamp(target, 0, STOPS.length - 1);
  if (anim || target === cur || !ready) return false;
  const from = STOPS[cur];
  const to = STOPS[target];
  const cut = from.img !== to.img;
  const dir = target > cur ? 1 : -1;
  if (cut) assign(plates[1 - vis], to.img);
  anim = { from, to, fromI: cur, toI: target, cut, dir, t0: performance.now(), dur: reduced ? DURATION_RM : DURATION };
  setCaption(-1);
  hint.classList.add('is-gone');
  updateProgress(target);
  audio.whoosh(anim.dur / 1000, dir);
  return true;
}

function finish() {
  const { to, toI, cut } = anim;
  if (cut) {
    plates[vis].el.style.opacity = '0';
    vis = 1 - vis;
  }
  cur = toI;
  anim = null;
  settledAt = performance.now();
  place(plates[vis], cam(to));
  setCaption(cur);
  hint.classList.toggle('is-gone', cur !== 0 && cur !== LAST);
  $('b', hint).textContent = cur === LAST ? 'Continue' : 'Scroll';
  announce.textContent = `View ${cur + 1} of ${STOPS.length}: ${to.label}`;
}

/* ============================================================ frame */
let last = performance.now();
let time = 0;
let heroVisible = true;
new IntersectionObserver(([e]) => (heroVisible = e.isIntersecting)).observe(hero);

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!heroVisible && !anim) {
    requestAnimationFrame(frame);
    return;
  }
  time += dt;

  const stop = STOPS[cur];
  let flow = stop.flow;
  let mask = stop.mask;
  let anchor = portrait ? stop.am : stop.a;
  let boost = 1;
  let veil = 0;
  let density = 1;

  if (anim) {
    const p = clamp((now - anim.t0) / anim.dur);
    const e = easeInOut(p);
    const bell = Math.sin(Math.PI * p);
    const { from, to, dir } = anim;
    flow = [lerp(from.flow[0], to.flow[0], e), lerp(from.flow[1], to.flow[1], e), lerp(from.flow[2], to.flow[2], e)];
    mask = lerp2(from.mask, to.mask, e);
    anchor = lerp2(portrait ? from.am : from.a, portrait ? to.am : to.a, e);
    boost = reduced ? 1 : 1 + 3 * bell; // a touch stronger: the shorter move still needs to feel fast

    if (!anim.cut) {
      // Same render: a curved camera path — pull back slightly mid-move, arc the anchor, settle.
      const travel = Math.hypot(to.f[0] - from.f[0], to.f[1] - from.f[1]);
      const pull = reduced ? 0 : bell * (0.16 + travel * 0.5);
      const arc = reduced ? 0 : bell * 0.035 * dir;
      const c = {
        f: lerp2(from.f, to.f, e),
        fm: lerp2(from.fm, to.fm, e),
        z: lerp(from.z, to.z, e) - pull,
        a: [lerp(from.a[0], to.a[0], e), lerp(from.a[1], to.a[1], e) + arc],
        am: [lerp(from.am[0], to.am[0], e), lerp(from.am[1], to.am[1], e) + arc],
      };
      place(plates[vis], c);
    } else if (reduced) {
      place(plates[vis], cam(from), 1 - smooth(0.2, 0.8, p));
      place(plates[1 - vis], cam(to), smooth(0.2, 0.8, p));
    } else {
      // Different render: the outgoing camera keeps travelling into a cloud bank, the incoming one
      // arrives from slightly wider and offset, and the veil hides the hand-over.
      const out = smooth(0, 0.62, p);
      const inn = smooth(0.38, 1, p);
      const outCam = {
        f: [from.f[0] + 0.05 * dir * out, from.f[1] - 0.015 * out],
        fm: [from.fm[0] + 0.05 * dir * out, from.fm[1] - 0.015 * out],
        z: from.z * (1 + 0.22 * out * out),
        a: from.a,
        am: from.am,
      };
      const inCam = {
        f: [to.f[0] - 0.06 * dir * (1 - easeInOut(inn)), to.f[1] + 0.02 * (1 - easeInOut(inn))],
        fm: [to.fm[0] - 0.06 * dir * (1 - easeInOut(inn)), to.fm[1] + 0.02 * (1 - easeInOut(inn))],
        z: to.z * (1 + 0.16 * (1 - easeInOut(inn))),
        a: to.a,
        am: to.am,
      };
      place(plates[vis], outCam, 1 - smooth(0.4, 0.56, p), 9 * smooth(0.18, 0.5, p));
      place(plates[1 - vis], inCam, smooth(0.44, 0.6, p), 9 * (1 - smooth(0.5, 0.86, p)));
      const v = Math.sin(Math.PI * smooth(0.12, 0.88, p));
      veil = 0.82 * v * v;
      density = 1 + 2.2 * v;
    }
    if (p >= 1) finish();
  }

  // Ambient flight: a slow float and a faint airframe vibration on the whole rig. The camera moves
  // above do the storytelling; this only keeps the frame alive while it waits.
  if (reduced) {
    rig.style.transform = 'none';
  } else {
    const y = Math.sin(time * 0.7) * 3 + Math.sin(time * 2.1) * 0.7;
    const x = Math.sin(time * 0.46) * 1.8;
    const r = Math.sin(time * 0.52) * 0.07;
    const vib = (Math.sin(time * 41) + Math.sin(time * 67)) * 0.18;
    rig.style.transform = `translate3d(${(x + vib).toFixed(2)}px,${(y + vib).toFixed(2)}px,0) rotate(${r.toFixed(3)}deg)`;
  }

  sky.draw(dt, { flow, mask, anchor, boost, veil, density });
  requestAnimationFrame(frame);
}

/* ============================================================ input */
// One deliberate gesture = one move. A wheel burst only counts if it starts after a quiet gap, so
// trackpad momentum left over from the previous move (which arrives as one unbroken stream) is
// discarded until it dies out, and a fresh gesture is required.
const GAP = 220;
const SETTLE = 180;
let lastWheel = 0;
let armed = false;
let acc = 0;

function canMove() {
  return ready && !anim && performance.now() - settledAt > SETTLE;
}

const atTop = () => scrollY <= 2;
const scrollToPage = () => document.getElementById('aircraft').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
let releasing = false;

addEventListener(
  'wheel',
  (e) => {
    const now = performance.now();
    const gap = now - lastWheel;
    lastWheel = now;
    if (e.ctrlKey) return; // pinch-zoom
    // Below the hero the page scrolls natively. Coming back up, momentum that reaches the top keeps
    // the burst alive, so the hero only reacts to the next fresh gesture.
    if (!atTop()) {
      armed = false;
      releasing = false;
      return;
    }
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (gap > GAP) {
      acc = 0;
      armed = canMove();
      // A fresh downward gesture on the last view hands this whole burst to the page.
      releasing = armed && cur === LAST && dy > 0;
    }
    if (releasing) return;
    e.preventDefault();
    if (!armed) return;
    acc += dy;
    if (Math.abs(acc) > 24) {
      armed = false;
      go(cur + Math.sign(acc));
    }
  },
  { passive: false }
);

// The hero takes touch-action: none, so every swipe on it is ours to route.
let touchY = null;
let touchX = null;
hero.addEventListener('touchstart', (e) => {
  touchY = e.touches[0].clientY;
  touchX = e.touches[0].clientX;
}, { passive: true });
hero.addEventListener('touchmove', (e) => {
  if (!e.target.closest('a, button')) e.preventDefault();
}, { passive: false });
hero.addEventListener('touchend', (e) => {
  if (touchY === null) return;
  const dy = touchY - e.changedTouches[0].clientY;
  const dx = touchX - e.changedTouches[0].clientX;
  touchY = null;
  if (Math.abs(dy) < 48 || Math.abs(dy) < Math.abs(dx)) return;
  if (!atTop()) {
    if (dy > 0) scrollToPage();
    else scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    return;
  }
  if (!canMove()) return;
  if (dy > 0 && cur === LAST) scrollToPage();
  else go(cur + Math.sign(dy));
});

addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!atTop() || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const onControl = e.target.closest && e.target.closest('button, a');
  const next = ['ArrowDown', 'PageDown', 'ArrowRight'].includes(e.key) || (e.key === ' ' && !onControl);
  const prev = ['ArrowUp', 'PageUp', 'ArrowLeft'].includes(e.key);
  if (!next && !prev && e.key !== 'Home' && e.key !== 'End') return;
  e.preventDefault();
  if (next && cur === LAST && !anim) return scrollToPage();
  if (!canMove()) return;
  if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(LAST);
  else go(cur + (next ? 1 : -1));
});

$('#explore').addEventListener('click', () => canMove() && go(1));

/* ========================================================= progress */
const progress = $('#progress');
STOPS.forEach((s, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<button class="tick" type="button" aria-label="View ${i + 1}: ${s.label}"><span class="tick__label">${s.label}</span><span class="tick__line"></span></button>`;
  $('button', li).addEventListener('click', () => canMove() && go(i));
  progress.append(li);
});
function updateProgress(i) {
  $$('.tick', progress).forEach((t, k) => (k === i ? t.setAttribute('aria-current', 'step') : t.removeAttribute('aria-current')));
}

/* ========================================================= controls */
const soundBtns = $$('[data-sound]');
function syncSound(on) {
  soundBtns.forEach((b) => {
    b.setAttribute('aria-pressed', String(on));
    $('.ctl__label', b).textContent = on ? 'Sound on' : 'Sound off';
  });
}
soundBtns.forEach((b) => b.addEventListener('click', async () => syncSound(await audio.toggle())));

// Motion follows the OS setting, live: flipping it mid-visit re-tunes the sky and the rest of the page.
function applyMotion() {
  document.documentElement.classList.toggle('rm', reduced);
}
motionMQ.addEventListener('change', (e) => {
  reduced = e.matches;
  applyMotion();
  sky.reseed();
  document.dispatchEvent(new CustomEvent('obs:motion', { detail: reduced }));
});

window.OBS = {
  get reduced() {
    return reduced;
  },
  cue: (kind) => audio.cue(kind),
  get soundOn() {
    return audio.on;
  },
};

/* ============================================================= boot */
let ready = false;

async function boot() {
  applyMotion();
  const bar = $('#loaderBar');
  const keys = Object.keys(IMAGES);
  let done = 0;
  await Promise.all(
    keys.map(async (k) => {
      const im = new Image();
      im.src = IMAGES[k];
      try {
        // decode() can stall in a background tab; never let it hold the loader up.
        await Promise.race([im.decode(), new Promise((r) => setTimeout(r, 4000))]);
      } catch {}
      aspect[k] = im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 16 / 9;
      bar.style.transform = `scaleX(${++done / keys.length})`;
    })
  );
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);

  plates[0].key = null;
  plates[1].key = null;
  layout();
  assign(plates[0], STOPS[0].img);
  assign(plates[1], STOPS[1].img);
  place(plates[0], cam(STOPS[0]));
  plates[1].el.style.opacity = '0';
  updateProgress(0);
  requestAnimationFrame((t) => {
    last = t;
    requestAnimationFrame(frame);
  });

  setTimeout(() => {
    $('#loader').classList.add('is-done');
    setCaption(0);
    ready = true;
    settledAt = performance.now();
  }, 250);
}

addEventListener('resize', () => {
  layout();
  if (!anim) place(plates[vis], cam(STOPS[cur]));
});

boot();
