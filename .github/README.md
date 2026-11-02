# Private Jet — OBSIDIAN

A cinematic single-page website for **OBSIDIAN**, a fictional private-aviation brand: a staged camera hero, a scroll-driven fleet reel, a charter film with a live 3D top-down jet, a scroll-driven ownership carousel, and a "flight request" contact form backed by a small Node server.

The brand, aircraft and copy are invented. The jets are procedural Three.js design concepts rendered into video loops, not real aircraft.

## Run it

Requires Node.js 18+.

```bash
npm install
npm start
```

Open http://localhost:4173/jet/. On Windows you can also double-click `Start Obsidian site.bat`.

The contact form posts to `/api/enquiry` on this server; submissions are saved to `data/enquiries.jsonl` (not committed). On a static host the page works but the form can't submit.

## More

Full details — file map, video loop names, how to re-render the loops in the studio and how to drop in real AI clips — are in [`jet/README.md`](../jet/README.md).
