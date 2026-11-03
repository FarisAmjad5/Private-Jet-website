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

## Contact form on Vercel

On Vercel `server.js` doesn't run, so the form is handled by the serverless function `api/enquiry.js`, which validates the submission (same rules as `server.js`, shared in `lib/enquiry.js`) and emails it to you through [Resend](https://resend.com)'s HTTP API. No npm dependencies.

1. Create a free Resend account and create an API key (Resend dashboard → API Keys).
2. In Vercel → your project → Settings → Environment Variables, add:
   - `RESEND_API_KEY`: the key from step 1.
   - `ENQUIRY_TO`: the inbox that should receive enquiries.
   - `ENQUIRY_FROM` (optional): the sender, e.g. `Obsidian <enquiries@yourdomain.com>`. Defaults to `Obsidian enquiries <onboarding@resend.dev>`.
3. Redeploy (environment variables only apply to new deployments).

With the default `onboarding@resend.dev` sender, Resend only delivers to the email address the Resend account was signed up with, so `ENQUIRY_TO` must be that address. To send to any other inbox, verify a domain in Resend and set `ENQUIRY_FROM` to an address on it.

If either required variable is missing the form reports "couldn't send" and the Vercel function logs say which one. Locally, `npm start` is unchanged and still writes to `data/enquiries.jsonl`.

## More

Full details — file map, video loop names, how to re-render the loops in the studio and how to drop in real AI clips — are in [`jet/README.md`](../jet/README.md).
