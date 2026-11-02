// OBSIDIAN — everything after the hero: the fleet reel, the aircraft detail dialog, the charter film and the
// live top-down jet, the ownership arc carousel, the contact clouds and the enquiry form.
// Sound and motion preferences come from the hero (window.OBS) so the whole page shares one setting.
import { THREE, createJet, createEnvironment, addLights } from './js/jet-model.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// NaN-safe: a zero-size layout (e.g. a hidden tab at load) gives 0/0, which must not stick.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v || 0));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const OBS = () => window.OBS || { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, cue() {} };
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
let reduced = OBS().reduced;

/* ================================================================== content */
// Fictional design concepts: positioning only, no manufacturer specifications.
const FLEET = [
  {
    id: 'umbra',
    name: 'Umbra',
    finish: 'Obsidian black',
    line: 'The flagship. Long legs, an unhurried cabin and engines set far enough back that conversation stays easy.',
    points: ['Our longest-range concept', 'Three cabin zones, one for sleep', 'Rear-mounted engines, quiet cabin'],
  },
  {
    id: 'halo',
    name: 'Halo',
    finish: 'Pearl white',
    line: 'Compact and quick to dispatch, for short notice, short hops and runways the big jets cannot use.',
    points: ['Our nimblest concept', 'Club seating for six', 'Large winglets, short-field focus'],
  },
  {
    id: 'argent',
    name: 'Argent',
    finish: 'Brushed silver',
    line: 'The longest cabin in the fleet, with a deep wing sweep and a cruciform tail.',
    points: ['Our roomiest concept', 'Separate dining and lounge', 'Cruciform tail, deep sweep'],
  },
  {
    id: 'meridian',
    name: 'Meridian',
    finish: 'Deep navy',
    line: 'Three engines and a calm, steady ride, drawn for long water crossings and mountain airfields.',
    points: ['Three-engine concept', 'A steady, settled ride', 'Built for remote routes'],
  },
  {
    id: 'solstice',
    name: 'Solstice',
    finish: 'Champagne bronze',
    line: 'A sharply swept wing and a long, fine nose. The one people photograph on the apron.',
    points: ['Our most expressive concept', 'Sculpted, low-drag profile', 'Bespoke champagne finish'],
  },
];

const OWNERSHIP = [
  { id: 'own-cabin', label: 'Cabin craft', title: ['A cabin made', 'to your hand.'], text: 'Leathers, veneers and light specified with you, down to the stitch.' },
  { id: 'own-engine', label: 'Engineering', title: ['The engineering,', 'handled.'], text: 'Maintenance, crew and airworthiness managed end to end, so you only ever see the aircraft.' },
  { id: 'own-halo', label: 'Halo · Pearl white', title: ['Choose the aircraft', 'that fits your life.'], text: 'Five very different designs, from the short-field Halo to the long-range Umbra.' },
  { id: 'own-winglet', label: 'Exterior detail', title: ['Details that', 'earn their place.'], text: 'Every finish and fairing chosen for how it looks on the apron and how it flies.' },
  { id: 'own-meridian', label: 'Meridian · Deep navy', title: ['Whole, shared,', 'or in between.'], text: 'Full ownership, a fractional share or a jet card — we will help you find the honest fit.' },
  { id: 'own-umbra', label: 'Umbra · Obsidian', title: ['Yours when you fly.', 'Working when you don’t.'], text: 'Optional charter management offsets the cost of the hours you are on the ground.' },
];

const MODELS = [
  { name: 'Full ownership', line: 'One aircraft, wholly yours, managed to our standard.' },
  { name: 'Fractional share', line: 'A defined share of an aircraft and the hours that come with it.' },
  { name: 'Jet card', line: 'Prepaid hours on call, without holding an aircraft.' },
  { name: 'Charter management', line: 'Place your own aircraft in our care and fly it when you choose.' },
];

const video = (id) => ({ src: `media/video/${id}.mp4`, poster: `media/video/${id}.jpg` });

/* =================================================================== videos */
// Every loop is muted, inline, lazily sourced, and plays only while visible. Components can also veto
// playback (v._want = false) — e.g. reel cards far from the focal point.
const videos = new Set();
const vio = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    e.target._visible = e.isIntersecting;
    syncVideo(e.target);
  }),
  { rootMargin: '200px 0px' }
);
function lazyVideo(v) {
  v.muted = true;
  v.playsInline = true;
  v._want = true;
  videos.add(v);
  vio.observe(v);
  return v;
}
function syncVideo(v) {
  const play = v._visible && v._want && !reduced && !document.hidden;
  if (play) {
    if (!v.getAttribute('src')) {
      v.src = v.dataset.src;
      v.preload = 'auto';
    }
    if (v.paused) v.play().catch(() => {});
  } else if (!v.paused) v.pause();
}
const syncAll = () => videos.forEach(syncVideo);
document.addEventListener('visibilitychange', syncAll);
document.addEventListener('obs:motion', (e) => {
  reduced = e.detail;
  syncAll();
  document.dispatchEvent(new Event('obs:refresh'));
});

function videoEl(id, cls = '') {
  const { src, poster } = video(id);
  const v = document.createElement('video');
  v.className = cls;
  v.dataset.src = src;
  v.poster = poster;
  v.loop = true;
  v.muted = true;
  v.preload = 'none';
  v.setAttribute('playsinline', '');
  v.setAttribute('aria-hidden', 'true');
  return lazyVideo(v);
}

// Run fn every frame only while el is near the viewport.
function whileVisible(el, fn, margin = '100px 0px') {
  let on = false;
  let raf = 0;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fn(dt, now);
    if (on) raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !on) {
      on = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    } else if (!e.isIntersecting) {
      on = false;
      cancelAnimationFrame(raf);
    }
  }, { rootMargin: margin }).observe(el);
}

// Pointer tilt with a metallic edge highlight; one quiet hover cue per entry.
function tilt(el, { max = 7, lift = 14 } = {}) {
  if (!finePointer) return;
  el.addEventListener('pointerenter', () => OBS().cue('hover'));
  el.addEventListener('pointermove', (e) => {
    if (reduced || el.dataset.tilt === 'off') return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    el.style.transform = `translateY(-4px) translateZ(${lift}px) rotateX(${((0.5 - py) * max).toFixed(2)}deg) rotateY(${((px - 0.5) * max * 1.3).toFixed(2)}deg)`;
  });
  el.addEventListener('pointerleave', () => {
    el.style.transform = '';
  });
}

/* =================================================================== fleet */
function initFleet() {
  const sec = $('#aircraft');
  const reel = $('.fleet__reel', sec);
  const desc = $('.fleet__desc', sec);
  const count = $('.fleet__count', sec);
  const n = FLEET.length;
  sec.style.setProperty('--n', n);

  const slots = FLEET.map((a, i) => {
    const slot = document.createElement('div');
    slot.className = 'fslot';
    slot.setAttribute('role', 'listitem');
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'fcard';
    card.setAttribute('aria-label', `${a.name}, ${a.finish}. Open details`);
    const v = videoEl(a.id);
    card.append(v);
    card.insertAdjacentHTML(
      'beforeend',
      `<span class="fcard__edge"></span><span class="fcard__tag">${String(i + 1).padStart(2, '0')} · ${a.name}</span><span class="fcard__open" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg></span>`
    );
    card.addEventListener('click', () => openDetail(a));
    tilt(card);
    slot.append(card);
    reel.append(slot);

    const art = document.createElement('article');
    art.className = 'fdesc';
    art.innerHTML = `
      <p class="fdesc__num mask"><span><b>${String(i + 1).padStart(2, '0')}</b> / ${String(n).padStart(2, '0')}</span></p>
      <h3 class="mask"><span>${a.name}</span></h3>
      <p class="fdesc__finish mask"><span>${a.finish}</span></p>
      <p class="fdesc__line mask"><span>${a.line}</span></p>
      <p class="mask"><span><button class="link" type="button">View aircraft</button></span></p>`;
    $('button', art).addEventListener('click', () => openDetail(a));
    desc.append(art);
    count.insertAdjacentHTML('beforeend', `<li>${String(i + 1).padStart(2, '0')}</li>`);
    return { slot, card, v, art, li: count.children[i] };
  });

  let h = 0;
  let gap = 0;
  const measure = () => {
    h = slots[0].slot.offsetHeight;
    gap = h * (innerWidth < 760 ? 0.74 : 0.84);
  };
  measure();
  addEventListener('resize', measure);

  let shown = 0; // smoothed reel position
  let active = -1;
  const target = () => {
    const r = sec.getBoundingClientRect();
    const total = sec.offsetHeight - innerHeight;
    return clamp(-r.top / total) * (n - 1);
  };
  const render = () => {
    slots.forEach(({ slot, v }, i) => {
      const d = i - shown;
      const ad = Math.abs(d);
      const s = 1 - Math.min(ad, 1.8) * 0.17;
      slot.style.transform = `translate3d(0, ${(d * gap - h / 2).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
      slot.style.filter = ad < 0.02 ? 'none' : `brightness(${(1 - Math.min(ad, 1) * 0.62).toFixed(3)}) saturate(${(1 - Math.min(ad, 1) * 0.4).toFixed(3)})`;
      slot.style.opacity = (1 - smooth(1.6, 2.2, ad)).toFixed(3);
      slot.style.zIndex = String(20 - Math.round(ad * 4));
      slot.style.pointerEvents = ad > 1.4 ? 'none' : '';
      const want = ad < 1.25;
      if (v._want !== want) {
        v._want = want;
        syncVideo(v);
      }
    });
    const next = Math.round(shown);
    if (next !== active) {
      const forward = next > active;
      slots.forEach(({ art, li }, i) => {
        art.classList.toggle('is-on', i === next);
        // the outgoing text exits upward when moving forward, downward when reversing
        $$('.mask', art).forEach((m) => m.classList.toggle('from-below', !forward));
        art.setAttribute('aria-hidden', String(i !== next));
        li.classList.toggle('is-on', i === next);
      });
      active = next;
    }
  };
  shown = target();
  render();
  whileVisible(sec, (dt) => {
    const t = target();
    shown = reduced || !Number.isFinite(shown) ? t : lerp(shown, t, 1 - Math.exp(-dt * 7));
    if (Math.abs(shown - t) < 0.0005) shown = t;
    render();
  });
}

/* ============================================================== detail */
const dlg = $('#detail');
const dlgVideo = lazyVideo($('video', dlg));
function openDetail(a) {
  const { src, poster } = video(a.id);
  dlgVideo.dataset.src = src;
  dlgVideo.poster = poster;
  dlgVideo.removeAttribute('src');
  dlgVideo.load();
  $('#detail-k').textContent = `${String(FLEET.indexOf(a) + 1).padStart(2, '0')} / ${String(FLEET.length).padStart(2, '0')} · The fleet`;
  $('#detail-title').textContent = a.name;
  $('.detail__finish', dlg).textContent = a.finish;
  $('#detail-text').textContent = a.line;
  $('.detail__points', dlg).innerHTML = a.points.map((p) => `<li>${p}</li>`).join('');
  const cta = $('.btn', dlg);
  cta.textContent = `Enquire about ${a.name}`;
  cta.dataset.message = `I'd like to know more about the ${a.name} (${a.finish}).`;
  dlg.showModal();
  dlgVideo._visible = true;
  syncVideo(dlgVideo);
  OBS().cue('select');
}
dlg.addEventListener('click', (e) => {
  if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
});
dlg.addEventListener('close', () => {
  dlgVideo._visible = false;
  syncVideo(dlgVideo);
});

/* ============================================================== charter */
function initCharter() {
  const stage = $('.charter__stage');
  const frame = $('.charter__frame');
  const v = lazyVideo($('.charter__video'));
  const copy = $('.charter__copy');
  const update = () => {
    const r = stage.getBoundingClientRect();
    const vh = innerHeight;
    // Expand from an inset rounded frame to nearly full width as the panel rises into view.
    const e = reduced ? 1 : smooth(vh * 0.95, vh * 0.08, r.top);
    const wide = innerWidth < 760 ? 0.05 : 0.12;
    frame.style.setProperty('--inset', `${(innerWidth * lerp(wide, 0.012, e)).toFixed(1)}px`);
    frame.style.setProperty('--radius', `${lerp(28, 6, e).toFixed(1)}px`);
    const par = reduced ? 0 : (r.top + r.height / 2 - vh / 2) * -0.07;
    v.style.setProperty('--par', `${par.toFixed(1)}px`);
    if (e > 0.55 || r.top < vh * 0.4) copy.classList.add('is-on');
  };
  update();
  whileVisible(stage, update);
  document.addEventListener('obs:refresh', update);
}

/* ======================================== charter: live top-down jet */
function initTopView() {
  const box = $('.topview');
  const canvas = $('#topview');
  const list = $('.benefits');
  let started = false;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !started) {
      started = true;
      start().catch((err) => console.warn('top view unavailable', err));
    }
  }, { rootMargin: '400px 0px' }).observe(box);

  async function start() {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    createEnvironment(renderer, scene, { background: false, w: 1024, h: 512 });
    // Seen from above, black paint would mirror the darkest part of the sky. Tip the environment so
    // the amber horizon band runs across the upper surfaces instead, and add a soft overhead fill.
    scene.environmentRotation.set(Math.PI / 2.4, 0, 0);
    const { key } = addLights(scene);
    key.intensity = 3.2;
    const over = new THREE.DirectionalLight(0xdfe4ef, 1.1);
    over.position.set(-20, 80, 30);
    scene.add(over);
    const jet = createJet('umbra');
    scene.add(jet);

    // A soft shadow far below the aircraft, offset away from the sun: depth without a floor.
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    const g = sc.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(34, 30), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -24;
    scene.add(shadow);

    const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
    camera.up.set(-1, 0, 0); // screen-up is -X, so the nose (+X) points down the page, the way it travels
    const size = () => {
      renderer.setSize(box.clientWidth, box.clientHeight, false);
      camera.aspect = box.clientWidth / (box.clientHeight || 1);
      camera.updateProjectionMatrix();
    };
    size();
    addEventListener('resize', size);

    let shown = 0;
    const target = () => {
      const r = list.getBoundingClientRect();
      return clamp((innerHeight * 0.7 - r.top) / (r.height || 1));
    };
    shown = target();
    let time = 0;
    whileVisible(box, (dt) => {
      time += dt;
      const t = target();
      shown = reduced || !Number.isFinite(shown) ? t : lerp(shown, t, 1 - Math.exp(-dt * 4));
      // Frame the aircraft: distance so the wingspan fits the box width with margin.
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const distW = (15 / Math.tan(fov / 2)) / camera.aspect * 1.25;
      const dist = Math.max(distW, 58);
      const halfH = Math.tan(fov / 2) * dist;
      const travel = Math.max(0, halfH - 17);
      const x = lerp(-travel, travel, shown);
      const float = reduced ? 0 : Math.sin(time * 0.8) * 0.25;
      jet.position.set(x, float, 0);
      jet.rotation.x = Math.sin(shown * Math.PI * 2) * 0.09; // a gentle lean as it glides
      jet.rotation.y = (shown - 0.5) * 0.14;
      shadow.position.set(x + 6, -24, -7);
      const az = lerp(0.9, -0.4, shown); // the sun swings round as you read
      key.position.set(Math.cos(az) * 100, 40, Math.sin(az) * 100);
      camera.position.set(x * 0.25 + (shown - 0.5) * 10, dist, (shown - 0.5) * -6);
      camera.lookAt(x * 0.25, 0, 0);
      renderer.render(scene, camera);
    });
  }
}

/* ============================================================ ownership */
// A tall section with a sticky pin: scrolling through it glides the cards right to left along a shallow arc.
// Scroll position is the single source of truth; keys, swipes, trackpad and card clicks scroll the page.
function initOwnership() {
  const sec = $('#ownership');
  const stage = $('.own__stage', sec);
  const track = $('.own__track', stage);
  const titles = $('.own__titles', sec);
  const counter = $('.own__counter b', sec);
  const rail = $('.own__rail', sec);
  const fill = $('i', rail);
  const n = OWNERSHIP.length;
  sec.style.setProperty('--n', n);

  const ticks = OWNERSHIP.map((_, i) => {
    const s = document.createElement('s');
    s.style.left = `${(i / (n - 1)) * 100}%`;
    rail.append(s);
    return s;
  });

  const cards = OWNERSHIP.map((o, i) => {
    const el = document.createElement('div');
    el.className = 'ocard';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-roledescription', 'slide');
    el.setAttribute('aria-label', `${i + 1} of ${n}: ${o.label}`);
    const inner = document.createElement('div');
    inner.className = 'ocard__in';
    const v = videoEl(o.id);
    inner.append(v);
    inner.insertAdjacentHTML('beforeend', `<span class="ocard__label">${o.label}</span>`);
    el.append(inner);
    track.append(el);
    tilt(inner, { max: 6, lift: 10 });
    inner.addEventListener('click', () => {
      if (dragged) return;
      if (Math.abs(i - shown) > 0.5) goTo(i);
    });
    const t = document.createElement('div');
    t.className = 'own__title';
    t.innerHTML = `<h2 class="display"><span class="mask"><span>${o.title[0]}</span></span><span class="mask"><span><em>${o.title[1]}</em></span></span></h2><p>${o.text}</p>`;
    titles.append(t);
    return { el, inner, v, t };
  });

  const modelsHTML = MODELS.map((m) => `<li><b>${m.name}</b><span>${m.line}</span></li>`).join('');
  $$('.own__models').forEach((ul) => (ul.innerHTML = modelsHTML));

  let narrow = false;
  let spacing = 300;
  let shift = 0;
  let shown = 0;
  let active = -1;
  const span = () => Math.max(1, sec.offsetHeight - innerHeight);
  const target = () => clamp(-sec.getBoundingClientRect().top / span()) * (n - 1);
  const scrollFor = (k) => sec.getBoundingClientRect().top + scrollY + (k / (n - 1)) * span();
  const measure = () => {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H) return;
    narrow = innerWidth < 761; // matches the phone breakpoint in CSS: the arc then spans the full width
    spacing = narrow ? W * 0.5 : Math.min(W * 0.36, 360);
    shift = narrow ? 0 : -W * 0.06; // the active card sits a little left of centre so the motion reads
    const ch = Math.max(180, H - (narrow ? 20 : 44));
    const cw = Math.min(narrow ? W * 0.62 : Math.min(W * 0.38, 380), ch * 0.75);
    stage.style.setProperty('--cw', `${cw.toFixed(1)}px`);
  };

  const setActive = (a) => {
    cards.forEach(({ t, el }, i) => {
      t.classList.toggle('is-on', i === a);
      t.setAttribute('aria-hidden', String(i !== a));
      el.setAttribute('aria-hidden', String(i !== a));
    });
    counter.textContent = String(a + 1).padStart(2, '0');
    ticks.forEach((t, i) => t.classList.toggle('is-on', i <= a));
    if (active !== -1) OBS().cue('select'); // once per change, not per frame
    active = a;
  };

  const layout = () => {
    cards.forEach(({ el, inner, v }, i) => {
      const d = i - shown; // linear: the first card starts centred, the rest queue on the right
      const ad = Math.abs(d);
      // Along a shallow arc: out to the side, down, back in depth, turned toward the centre.
      const x = shift + d * spacing * (1 - 0.06 * Math.min(ad, 3));
      const y = Math.pow(ad, 1.45) * (narrow ? 26 : 38);
      const z = -ad * (narrow ? 180 : 250);
      const ry = -d * 24;
      const rz = d * 3.2;
      const s = 1 - 0.13 * Math.min(ad, 3);
      const op = 1 - smooth(1.7, 2.6, ad);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${s.toFixed(3)})`;
      el.style.opacity = op.toFixed(3);
      el.style.visibility = op < 0.005 ? 'hidden' : '';
      el.style.pointerEvents = op < 0.3 ? 'none' : '';
      el.style.filter = ad < 0.02 ? 'none' : `brightness(${(1 - 0.5 * Math.min(ad, 1.2)).toFixed(3)})`;
      el.style.zIndex = String(100 - Math.round(ad * 10));
      el.classList.toggle('is-active', ad < 0.5);
      inner.dataset.tilt = ad < 0.5 ? 'on' : 'off';
      const want = ad < 1.6;
      if (v._want !== want) {
        v._want = want;
        syncVideo(v);
      }
    });
    fill.style.setProperty('--p', (shown / (n - 1)).toFixed(4));
    const next = Math.round(shown);
    if (next !== active) setActive(next);
  };

  // Everything that moves the carousel scrolls the page, so scroll position stays the one source of truth.
  let goal = 0;
  let goalUntil = 0;
  function goTo(k) {
    goal = Math.round(clamp(k, 0, n - 1));
    goalUntil = performance.now() + 900;
    scrollTo({ top: scrollFor(goal), behavior: reduced ? 'auto' : 'smooth' });
  }
  function go(dir) {
    if (!dir) return;
    const base = performance.now() < goalUntil ? goal : Math.round(target());
    goTo(base + dir);
  }

  measure();
  shown = target();
  layout();
  whileVisible(sec, (dt) => {
    const t = target();
    shown = reduced || !Number.isFinite(shown) ? t : lerp(shown, t, 1 - Math.exp(-dt * 7));
    if (Math.abs(shown - t) < 0.0005) shown = t;
    layout();
  });

  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else return;
    e.preventDefault();
  });
  let downX = null;
  let downY = 0;
  let dragged = false;
  stage.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
    dragged = false;
  });
  stage.addEventListener('pointercancel', () => (downX = null));
  stage.addEventListener('pointerup', (e) => {
    if (downX === null) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    downX = null;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      dragged = true;
      go(dx < 0 ? 1 : -1);
      setTimeout(() => (dragged = false), 0);
    }
  });
  // Horizontal trackpad / wheel: one gesture (with its inertia tail) steps one card; vertical wheel is untouched.
  let lastWheel = 0;
  let lastStep = 0;
  stage.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 4) return;
      e.preventDefault();
      const now = performance.now();
      const fresh = now - lastWheel > 160 && now - lastStep > 450;
      lastWheel = now;
      if (!fresh) return;
      lastStep = now;
      go(e.deltaX > 0 ? 1 : -1);
    },
    { passive: false }
  );
  addEventListener('resize', () => {
    measure();
    layout();
  });
}

/* ======================================================== contact clouds */
function initContactSky() {
  const cv = $('.contact__sky');
  const ctx = cv.getContext('2d');
  const sprite = (warm) => {
    const s = document.createElement('canvas');
    s.width = s.height = 256;
    const g = s.getContext('2d');
    const c = warm ? '210,170,128' : '150,155,166';
    for (let k = 0; k < 14; k++) {
      const x = 128 + (Math.random() - 0.5) * 100;
      const y = 128 + (Math.random() - 0.5) * 50;
      const r = 30 + Math.random() * 44;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${c},0.16)`);
      grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
    }
    return s;
  };
  const sprites = [sprite(false), sprite(false), sprite(true)];
  let w = 0;
  let h = 0;
  let puffs = [];
  const size = () => {
    w = cv.clientWidth;
    h = cv.clientHeight;
    cv.width = Math.round(w * 0.75);
    cv.height = Math.round(h * 0.75);
    puffs = Array.from({ length: 24 }, (_, i) => ({
      x: Math.random() * (w + 800) - 400,
      y: h * (0.15 + Math.random() * 0.8),
      r: 180 + Math.random() * 360,
      v: 6 + Math.random() * 14,
      a: 0.35 + Math.random() * 0.5,
      s: sprites[i % 3],
    }));
  };
  size();
  addEventListener('resize', size);
  whileVisible(cv, (dt) => {
    ctx.setTransform(0.75, 0, 0, 0.75, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const p of puffs) {
      if (!reduced) p.x += p.v * dt;
      if (p.x - p.r > w) p.x = -p.r * 1.2;
      ctx.globalAlpha = p.a;
      ctx.drawImage(p.s, p.x - p.r, p.y - p.r * 0.5, p.r * 2, p.r);
    }
  });
}

/* ================================================================= form */
// Per-service guidance: the hint and placeholder above the message adapt to what the visitor chose.
const BRIEFS = {
  '': { hint: 'Choose a service above and we will suggest what to include.', ph: 'Tell us a little about the trip or the aircraft you have in mind.' },
  Charter: { hint: 'Helpful to include: departure and destination, dates, and how many will travel.', ph: 'Where are you flying from and to, when, and with how many passengers?' },
  Ownership: { hint: 'Helpful to include: the aircraft that interests you, how often you fly, and your timeline.', ph: 'Which aircraft are you considering, roughly how much would you fly, and when would you like to begin?' },
  'General Inquiry': { hint: 'Ask us anything about Obsidian, the fleet or how it all works.', ph: 'How can we help?' },
};

function initForm() {
  const form = $('#enquiry');
  const pass = $('#pass');
  const status = $('.form__status', form);
  const btn = $('button[type=submit]', form);
  const label = $('.btn__label', btn);
  const kindEl = $('#pass-kind');
  const hintEl = $('#h-message');
  const done = $('#pass-done');
  const thanks = $('#pass-thanks');
  const stateEl = $('.pass__state', pass);
  let tried = false;

  const rules = {
    name: (v) => v.trim().length >= 2 || 'Please tell us your name.',
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Please enter a valid email address.',
    interest: (v) => !!v || 'Please choose Charter, Ownership or General Inquiry.',
    message: (v) => v.trim().length >= 10 || 'A few words about your plans, please (at least 10 characters).',
  };
  const value = (name) => (name === 'interest' ? form.querySelector('input[name=interest]:checked')?.value || '' : form.elements[name].value);
  const fieldEl = (name) => (name === 'interest' ? $('.field--choice', form) : form.elements[name]);
  function check(name, msg) {
    const res = msg ?? rules[name](value(name));
    const ok = res === true;
    const el = fieldEl(name);
    $(`#e-${name}`).textContent = ok ? '' : res;
    if (name === 'interest') el.classList.toggle('is-invalid', !ok);
    else el.setAttribute('aria-invalid', String(!ok));
    return ok;
  }
  ['name', 'email', 'message'].forEach((n) => {
    form.elements[n].addEventListener('blur', () => form.elements[n].value && check(n));
    form.elements[n].addEventListener('input', () => tried && check(n));
  });

  // The pass header and the message guidance follow the chosen service.
  function syncInterest() {
    const v = value('interest');
    const brief = BRIEFS[v] || BRIEFS[''];
    kindEl.textContent = v || 'Not yet chosen';
    hintEl.textContent = brief.hint;
    hintEl.classList.toggle('is-live', !!v);
    form.elements.message.placeholder = brief.ph;
  }
  $$('input[name=interest]', form).forEach((r) => {
    r.addEventListener('change', () => {
      check('interest');
      syncInterest();
    });
    if (finePointer) r.closest('label').addEventListener('pointerenter', () => OBS().cue('hover'));
  });

  // Settle the card into its confirmation (and back again).
  function showDone(data) {
    $('#done-kind').textContent = data.interest;
    $('#done-email').textContent = data.email;
    thanks.textContent = '';
    thanks.append('Thank you, ');
    const em = document.createElement('em');
    em.textContent = data.name.split(' ')[0];
    thanks.append(em, '.');
    stateEl.textContent = 'Request received';
    kindEl.textContent = data.interest;
    pass.classList.add('is-sent');
    form.inert = true;
    done.inert = false;
    setTimeout(() => thanks.focus({ preventScroll: true }), reduced ? 0 : 500);
  }
  function showForm() {
    if (!pass.classList.contains('is-sent')) return;
    pass.classList.remove('is-sent');
    form.inert = false;
    done.inert = true;
    stateEl.textContent = 'Flight request';
    status.className = 'form__status';
    status.textContent = '';
    syncInterest();
  }
  $('#pass-again').addEventListener('click', () => {
    showForm();
    form.elements.name.focus({ preventScroll: true });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    tried = true;
    status.className = 'form__status';
    status.textContent = '';
    const bad = Object.keys(rules).filter((n) => !check(n));
    if (bad.length) {
      const first = bad[0] === 'interest' ? $('input[name=interest]', form) : form.elements[bad[0]];
      first.focus();
      status.classList.add('is-err');
      status.textContent = 'Please check the highlighted fields.';
      return;
    }
    const data = { name: value('name').trim(), email: value('email').trim(), interest: value('interest'), message: value('message').trim(), company: form.elements.company.value };
    btn.disabled = true;
    label.textContent = 'Sending…';
    try {
      const res = await fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        status.classList.add('is-ok');
        status.textContent = `Thank you, ${data.name.split(' ')[0]}. Your enquiry has reached the concierge team; we'll reply to ${data.email}.`;
        form.reset();
        tried = false;
        syncInterest();
        showDone(data);
        OBS().cue('select');
      } else if (res.status === 400 && body.errors) {
        Object.entries(body.errors).forEach(([n, msg]) => rules[n] && check(n, msg));
        status.classList.add('is-err');
        status.textContent = 'Please check the highlighted fields.';
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      status.classList.add('is-err');
      status.textContent = "We couldn't send your enquiry just now. Nothing was submitted — please try again in a moment.";
    } finally {
      btn.disabled = false;
      label.textContent = 'Send request';
    }
  });

  // CTAs elsewhere preselect the interest (and a message from the aircraft dialog).
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-interest]');
    if (!a) return;
    showForm();
    section.classList.add('is-in'); // don't wait for the reveal observer when sent here directly
    const r = form.querySelector(`input[name=interest][value="${a.dataset.interest}"]`);
    if (r) {
      r.checked = true;
      check('interest');
      syncInterest();
    }
    if (a.dataset.message && !form.elements.message.value) form.elements.message.value = a.dataset.message;
    if (a.closest('dialog')) a.closest('dialog').close();
  });

  // Reveal on enter; a pointer-following glint on the pass edge.
  const section = $('#contact');
  section.classList.add('reveal-ready');
  new IntersectionObserver((entries, io) => {
    if (!entries.some((en) => en.isIntersecting)) return;
    section.classList.add('is-in');
    io.disconnect();
  }, { rootMargin: '0px 0px -12% 0px' }).observe(section.querySelector('.contact__inner'));
  if (finePointer) {
    pass.addEventListener('pointermove', (e) => {
      if (OBS().reduced) return;
      const r = pass.getBoundingClientRect();
      pass.style.setProperty('--mx', `${e.clientX - r.left}px`);
      pass.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
}

/* ================================================================== nav */
function initNav() {
  const nav = $('#nav');
  const links = $$('.nav__links a');
  const onScroll = () => nav.classList.toggle('is-solid', scrollY > innerHeight * 0.6);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((l) => l.setAttribute('aria-current', String(l.getAttribute('href') === `#${e.target.id}`)));
    }),
    { rootMargin: '-45% 0px -50% 0px' }
  );
  ['aircraft', 'charter', 'ownership', 'contact'].forEach((id) => io.observe(document.getElementById(id)));
}

initNav();
initFleet();
initCharter();
initTopView();
initOwnership();
initContactSky();
initForm();
