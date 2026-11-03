// Zero-dependency static server for the HALCYON site.
// `node server.js`            serves the site (with HTTP Range support so scrubbed video can seek).
// `node server.js --capture`  also accepts POST /__capture?f=media/... so the render studio can write frames to disk.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { validate } = require('./lib/enquiry');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;
const CAPTURE = process.argv.includes('--capture');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function safeJoin(rel) {
  const p = path.normalize(path.join(ROOT, rel));
  return p.startsWith(ROOT) ? p : null;
}

function capture(req, res, url) {
  const rel = url.searchParams.get('f') || '';
  if (!/^media\/[\w\-./]+\.(jpg|png|json)$/.test(rel) || rel.includes('..')) {
    res.writeHead(400).end('bad path');
    return;
  }
  const file = safeJoin(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = fs.createWriteStream(file);
  req.pipe(out);
  out.on('finish', () => res.writeHead(204).end());
  out.on('error', (e) => res.writeHead(500).end(String(e)));
}

// POST /api/enquiry — validates an OBSIDIAN contact-form submission and appends it to data/enquiries.jsonl.
// Replies 201 { ok: true } only once the line is on disk, so the page never shows a false success.
// Validation lives in lib/enquiry.js so the Vercel function (api/enquiry.js) applies the same rules.
function enquiry(req, res) {
  const reply = (code, body) => res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  let raw = '';
  let size = 0;
  req.setEncoding('utf8');
  req.on('data', (c) => {
    size += c.length;
    if (size > 16 * 1024) {
      reply(413, { ok: false, error: 'too large' });
      req.destroy();
    } else raw += c;
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let d;
    try {
      d = JSON.parse(raw);
    } catch {
      return reply(400, { ok: false, error: 'invalid JSON' });
    }
    const v = validate(d);
    if (v.errors) return reply(400, { ok: false, errors: v.errors });
    if (v.spam) return reply(201, { ok: true }); // honeypot filled: accept quietly, store nothing
    const { name, email, interest, message } = v.data;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const line = JSON.stringify({ id, at: new Date().toISOString(), name, email, interest, message }) + '\n';
    const dir = path.join(ROOT, 'data');
    fs.mkdir(dir, { recursive: true }, (err) => {
      if (err) return reply(500, { ok: false, error: 'storage unavailable' });
      fs.appendFile(path.join(dir, 'enquiries.jsonl'), line, (e2) => (e2 ? reply(500, { ok: false, error: 'storage unavailable' }) : reply(201, { ok: true, id })));
    });
  });
}

function serve(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  // Without the HALCYON homepage (e.g. a Private-Jet clone), send the root to the jet site.
  if (rel === '/' && !fs.existsSync(path.join(ROOT, 'index.html'))) return res.writeHead(302, { Location: '/jet/' }).end();
  if (rel.endsWith('/')) rel += 'index.html';
  const file = safeJoin(rel);
  if (!file) return res.writeHead(403).end();
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) {
        return res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'POST' && url.pathname === '/__capture') {
      return CAPTURE ? capture(req, res, url) : res.writeHead(404).end();
    }
    if (req.method === 'POST' && url.pathname === '/api/enquiry') return enquiry(req, res);
    if (url.pathname.startsWith('/data/')) return res.writeHead(404).end('Not found');
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    serve(req, res, url);
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`HALCYON on http://localhost:${PORT}${CAPTURE ? '  (capture enabled)' : ''}`);
  });
