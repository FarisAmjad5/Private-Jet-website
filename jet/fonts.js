// OBSIDIAN — live typeface picker. A "Typeface" control in the footer opens a short list of display + body pairings;
// choosing one loads its Google Fonts CSS on demand, waits for the faces, then swaps --serif / --sans
// (plus a size / tracking tweak) on <html>. The choice is remembered in localStorage.
//
// To add a pairing: append an entry to PAIRINGS. `css` is the Google Fonts css2 query for the families
// that are not already on the page (display 400 + italic, body 400/500/600); `scale` and `tracking`
// tame display faces that run bigger or heavier than Instrument Serif.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const PAIRINGS = [
  { id: 'instrument-manrope', display: 'Instrument Serif', body: 'Manrope', css: null }, // already in <head>
  { id: 'cormorant-jost', display: 'Cormorant Garamond', body: 'Jost', scale: 1.12, tracking: '0em', css: 'family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Jost:wght@400;500;600' },
  { id: 'playfair-work', display: 'Playfair Display', body: 'Work Sans', scale: 0.9, tracking: '-0.02em', css: 'family=Playfair+Display:ital,wght@0,400;1,400&family=Work+Sans:wght@400;500;600' },
  { id: 'bodoni-montserrat', display: 'Bodoni Moda', body: 'Montserrat', scale: 0.92, tracking: '-0.01em', css: 'family=Bodoni+Moda:ital,wght@0,400;1,400&family=Montserrat:wght@400;500;600' },
  { id: 'fraunces-outfit', display: 'Fraunces', body: 'Outfit', scale: 0.92, tracking: '-0.02em', css: 'family=Fraunces:ital,wght@0,400;1,400&family=Outfit:wght@400;500;600' },
  { id: 'dmserif-dmsans', display: 'DM Serif Display', body: 'DM Sans', scale: 0.92, tracking: '-0.01em', css: 'family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600' },
  { id: 'syne-manrope', display: 'Syne', body: 'Manrope', sans: true, scale: 0.84, tracking: '-0.03em', css: 'family=Syne:wght@400' },
];
const KEY = 'obs-font';
const root = document.documentElement;

const serifStack = (p) => `'${p.display}', ${p.sans ? 'system-ui, sans-serif' : "'Times New Roman', serif"}`;
const sansStack = (p) => `'${p.body}', system-ui, sans-serif`;
const byId = (id) => PAIRINGS.find((p) => p.id === id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ loading */
const loading = new Map();
function ensure(p) {
  if (loading.has(p.id)) return loading.get(p.id);
  const job = (async () => {
    if (p.css) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${p.css}&display=swap`;
      const sheet = new Promise((r) => { link.onload = link.onerror = r; });
      document.head.append(link);
      await Promise.race([sheet, wait(4000)]);
    }
    // Resolve once the faces the site uses are actually decoded, not merely declared.
    await Promise.all([
      `400 1em "${p.display}"`,
      `italic 400 1em "${p.display}"`,
      `400 1em "${p.body}"`,
      `600 1em "${p.body}"`,
    ].map((f) => document.fonts.load(f).catch(() => {})));
  })();
  loading.set(p.id, job);
  return job;
}

/* ------------------------------------------------------------ storage */
function read() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function write(id) {
  try { localStorage.setItem(KEY, id); } catch {}
}

/* ----------------------------------------------------------------- UI */
// Mounts into <div class="fp" data-font-picker> (the footer). Without one it builds off-page, so a saved
// choice is still applied.
const picker = $('[data-font-picker]') || document.createElement('div');
picker.innerHTML = `
  <button class="ctl fp__btn" type="button" aria-expanded="false" aria-controls="fpPanel" aria-haspopup="true"><span class="fp__glyph" aria-hidden="true">Aa</span><span class="ctl__label">Typeface</span></button>
  <div class="fp__panel" id="fpPanel" role="radiogroup" aria-labelledby="fpTitle">
    <p class="fp__title" id="fpTitle">Typeface</p>
    ${PAIRINGS.map((p) => `<button class="fp__opt" type="button" role="radio" aria-checked="false" tabindex="-1" data-id="${p.id}">
      <span class="fp__sample" style="font-family:${serifStack(p)}">Fly above <em>the noise.</em></span>
      <span class="fp__name" style="font-family:${sansStack(p)}">${p.display} + ${p.body}</span>
    </button>`).join('')}
  </div>`;

const btn = $('.fp__btn', picker);
const panel = $('.fp__panel', picker);
const opts = $$('.fp__opt', panel);
let current = PAIRINGS[0].id;
let seq = 0;

function mark(id) {
  opts.forEach((o) => {
    const on = o.dataset.id === id;
    o.setAttribute('aria-checked', String(on));
    o.tabIndex = on ? 0 : -1;
  });
}

// Fonts load before the swap, so the page never flashes a fallback. A newer pick cancels an older one.
async function apply(id, { persist = true } = {}) {
  const p = byId(id);
  if (!p) return;
  const mine = ++seq;
  picker.classList.add('is-busy');
  await Promise.race([ensure(p), wait(2500)]);
  if (mine !== seq) return;
  picker.classList.remove('is-busy');
  if (p === PAIRINGS[0]) {
    ['--serif', '--sans', '--display-scale', '--display-tracking'].forEach((k) => root.style.removeProperty(k));
  } else {
    root.style.setProperty('--serif', serifStack(p));
    root.style.setProperty('--sans', sansStack(p));
    root.style.setProperty('--display-scale', p.scale || 1);
    root.style.setProperty('--display-tracking', p.tracking || '-0.01em');
  }
  current = id;
  mark(id);
  if (persist) write(id);
  document.dispatchEvent(new CustomEvent('obs:font', { detail: id }));
}

let primed = false;
// The panel opens upward from the control; keep it inside the viewport sideways and, if the footer sits
// near the top of the screen, scroll just enough to show all of it.
function place() {
  const g = 16;
  const vw = document.documentElement.clientWidth;
  const at = picker.getBoundingClientRect();
  const w = panel.offsetWidth;
  const left = Math.max(g, Math.min(at.right - w, vw - g - w));
  panel.style.left = `${Math.round(left - at.left)}px`;
  const over = panel.getBoundingClientRect().top - 12;
  if (over < 0) scrollBy({ top: over, behavior: 'auto' });
}
function open() {
  picker.classList.add('is-open');
  place();
  btn.setAttribute('aria-expanded', 'true');
  // The list shows each pairing in its own faces, so fetch them the first time it opens.
  if (!primed) {
    primed = true;
    PAIRINGS.forEach((p) => ensure(p));
  }
  (opts.find((o) => o.dataset.id === current) || opts[0]).focus({ preventScroll: true });
}
function close(returnFocus = true) {
  if (!picker.classList.contains('is-open')) return;
  picker.classList.remove('is-open');
  btn.setAttribute('aria-expanded', 'false');
  if (returnFocus) btn.focus({ preventScroll: true });
}
const isOpen = () => picker.classList.contains('is-open');

btn.addEventListener('click', () => (isOpen() ? close() : open()));
btn.addEventListener('keydown', (e) => {
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isOpen()) {
    e.preventDefault();
    e.stopPropagation(); // the hero would otherwise treat the arrow as a camera move
    open();
  }
});

opts.forEach((o) => {
  o.addEventListener('click', () => {
    window.OBS?.cue('select');
    apply(o.dataset.id);
  });
  o.addEventListener('pointerenter', () => window.OBS?.cue('hover'));
});

panel.addEventListener('keydown', (e) => {
  const i = opts.indexOf(document.activeElement);
  let to = -1;
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') to = (i + 1) % opts.length;
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') to = (i - 1 + opts.length) % opts.length;
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = opts.length - 1;
  else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    return close();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    window.OBS?.cue('select');
    apply(opts[Math.max(i, 0)].dataset.id);
    return e.key === 'Enter' ? close() : undefined;
  } else if (e.key === 'Tab') return close(false);
  else return;
  // Arrows behave like a radiogroup: moving focus previews that pairing live.
  e.preventDefault();
  e.stopPropagation();
  opts[to].focus({ preventScroll: true });
  window.OBS?.cue('hover');
  apply(opts[to].dataset.id);
});

// Wheel over the panel scrolls the panel, never the hero's camera.
panel.addEventListener('wheel', (e) => e.stopPropagation());
document.addEventListener('pointerdown', (e) => {
  if (isOpen() && !picker.contains(e.target)) close(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isOpen()) close();
});
addEventListener('resize', () => isOpen() && place());

mark(current);
const saved = read();
if (saved && saved !== current && byId(saved)) apply(saved, { persist: false });
