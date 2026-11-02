// Encodes the OBSIDIAN video loops for the web: H.264 MP4 + a JPEG poster per loop.
//
// Source, per loop, in priority order:
//   1. media/source/jet/<name>.mp4       a dropped-in clip (e.g. a Seedance 2.5 render), re-encoded here
//   2. media/jet-render/<name>/0001.jpg  the render studio's frame sequence (jet/studio, ?job=all)
// Output: jet/media/video/<name>.mp4 and <name>.jpg
//
//   node scripts/build-jet-media.mjs            all loops
//   node scripts/build-jet-media.mjs umbra halo only these
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const FFMPEG = process.env.FFMPEG || (() => {
  try {
    const p = require('ffmpeg-static');
    if (p && existsSync(p)) return p;
  } catch {}
  return 'ffmpeg';
})();

function ff(args, label) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${label}`);
}

// name: [width, height, crf]
const LOOPS = {
  umbra: [1120, 700, 24],
  halo: [1120, 700, 25],
  argent: [1120, 700, 24],
  meridian: [1120, 700, 25],
  solstice: [1120, 700, 26],
  'own-cabin': [720, 960, 24],
  'own-engine': [720, 960, 24],
  'own-halo': [720, 960, 24],
  'own-winglet': [720, 960, 24],
  'own-meridian': [720, 960, 24],
  'own-umbra': [720, 960, 24],
  charter: [1600, 900, 23],
};

const only = process.argv.slice(2);
const OUT = path.join(ROOT, 'jet', 'media', 'video');
mkdirSync(OUT, { recursive: true });

for (const [name, [w, h, crf]] of Object.entries(LOOPS)) {
  if (only.length && !only.includes(name)) continue;
  const src = path.join(ROOT, 'media', 'source', 'jet', `${name}.mp4`);
  const seq = path.join(ROOT, 'media', 'jet-render', name, '0001.jpg');
  const out = path.join(OUT, `${name}.mp4`);
  const fit = `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},fps=24,format=yuv420p`;
  const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-g', '48', '-movflags', '+faststart', '-an'];
  let from;
  if (existsSync(src)) {
    ff(['-i', src, '-vf', fit, ...enc, out], name);
    from = `media/source/jet/${name}.mp4`;
  } else if (existsSync(seq)) {
    ff(['-framerate', '24', '-i', path.join(ROOT, 'media', 'jet-render', name, '%04d.jpg'), '-vf', fit, ...enc, out], name);
    from = `media/jet-render/${name}/`;
  } else {
    console.warn(`loop  ${name}  skipped: no source clip or frame sequence`);
    continue;
  }
  ff(['-i', out, '-frames:v', '1', '-q:v', '4', path.join(OUT, `${name}.jpg`)], `${name} poster`);
  console.log(`loop  ${name.padEnd(13)} ${(statSync(out).size / 1e6).toFixed(2)} MB  <- ${from}`);
}
