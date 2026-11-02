# OBSIDIAN — private aviation page

A cinematic single-page site for **OBSIDIAN**, a *fictional* private-aviation brand. The brand, the five aircraft (Umbra, Halo, Argent, Meridian, Solstice) and all copy are invented. The jets are procedural design concepts drawn in Three.js, not real aircraft, and no figures describe a real manufacturer's specifications.

Page flow: a staged camera hero (5 stops) → fleet reel → charter film with a live top-down jet → ownership carousel (scroll-driven) → contact and enquiry form → footer (sound toggle, typeface picker, back to top). The system `prefers-reduced-motion` setting calms the whole page.

## Run it

```bash
npm start
```

Open http://localhost:4173/jet/ (run from the project root).

The enquiry form needs this Node server. A static host will serve the page fine, but `POST /api/enquiry` will 404 and the form will show its "couldn't send" message. Submissions are validated server-side and appended, one JSON object per line, to `data/enquiries.jsonl` (created on first submit; it is git-ignored).

## File map

| Path | What it is |
| --- | --- |
| `jet/index.html` | Markup: hero, `#aircraft`, `#charter`, `#ownership`, `#contact`, footer, `<dialog id="detail">` |
| `jet/jet.js` | Classic script: hero camera stops, gesture-locked wheel/touch/keyboard, sound, reduced-motion handling. Exposes `window.OBS` and fires `obs:motion` |
| `jet/fonts.js`, `jet/fonts.css` | Typeface picker in the footer (7 pairings, saved in localStorage) |
| `jet/contact.css` | The "flight request" contact section |
| `jet/site.js` | ES module: fleet reel, detail dialog, charter + live top-down jet, ownership carousel, contact clouds, enquiry form, nav |
| `jet/js/jet-model.js` | Procedural jet models, lighting and environment (Three.js) |
| `jet/jet.css`, `jet/sections.css` | Styles for the hero and for everything after it |
| `jet/media/video/` | The 12 loops (`<name>.mp4` + `<name>.jpg` poster) |
| `jet/media/*.webp` | Hero renders |
| `jet/studio/` | Render studio that produces the loop frames |
| `scripts/build-jet-media.mjs` | Encoder (`npm run jet-media`) |
| `server.js` | Static server (HTTP Range supported) + `POST /api/enquiry` |

## Loops

Fleet: `umbra`, `halo`, `argent`, `meridian`, `solstice`
Ownership: `own-cabin`, `own-engine`, `own-halo`, `own-winglet`, `own-meridian`, `own-umbra`
Charter: `charter`

## Re-render the loops

```bash
npm run studio          # node server.js --capture (lets the studio write frames to disk)
```

Then open the studio in a browser:

- `http://localhost:4173/jet/studio/?job=all` renders everything
- `?job=cards`, `?job=own` or `?job=feature` renders one group (fleet cards, ownership cards, charter)
- add `&only=umbra,halo` to limit to named loops, e.g. `?job=cards&only=umbra`
- `?job=preview` writes one still per shot to `media/_preview/` for a quick look before a full render (git-ignored)

Frames land in `media/jet-render/<name>/`. Then encode them:

```bash
npm run jet-media            # all loops
npm run jet-media umbra halo # only these
```

This writes `jet/media/video/<name>.mp4` and `<name>.jpg`. It uses the bundled `ffmpeg-static` (or `ffmpeg` on your PATH, or `FFMPEG=/path/to/ffmpeg`).

## Drop in real AI clips later

Put a clip at `media/source/jet/<name>.mp4` (any loop name above), then:

```bash
npm run jet-media <name>
```

A source clip takes priority over the studio frames, and is re-encoded to the loop's size (fleet 1120x700, ownership 720x960, charter 1600x900, 24 fps, H.264, no audio). Make the first and last frames match so the loop is seamless. No code changes are needed.
