// Vercel serverless function: POST /api/enquiry
// Validates the OBSIDIAN contact form (same rules as server.js, via lib/enquiry.js) and emails it to the
// site owner through Resend's HTTP API. Replies 201 only once Resend has accepted the message.
// Env: RESEND_API_KEY (required), ENQUIRY_TO (required), ENQUIRY_FROM (optional).
const { validate } = require('../lib/enquiry');

const MAX_BYTES = 16 * 1024;
const DEFAULT_FROM = 'Obsidian enquiries <onboarding@resend.dev>';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

module.exports = async (req, res) => {
  const reply = (code, body, headers = {}) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.end(JSON.stringify(body));
  };

  if (req.method !== 'POST') return reply(405, { ok: false, error: 'method not allowed' }, { Allow: 'POST' });

  // Vercel hands us a parsed object for application/json; anything else arrives as a string or Buffer.
  let d = req.body;
  if (Buffer.isBuffer(d)) d = d.toString('utf8');
  if (d === undefined || d === null || typeof d === 'string') {
    const raw = d || '';
    if (Buffer.byteLength(raw) > MAX_BYTES) return reply(413, { ok: false, error: 'too large' });
    try {
      d = JSON.parse(raw);
    } catch {
      return reply(400, { ok: false, error: 'invalid JSON' });
    }
  } else if (Buffer.byteLength(JSON.stringify(d)) > MAX_BYTES) {
    return reply(413, { ok: false, error: 'too large' });
  }

  const v = validate(d);
  if (v.errors) return reply(400, { ok: false, errors: v.errors });
  if (v.spam) return reply(201, { ok: true }); // honeypot filled: accept quietly, send nothing

  const key = process.env.RESEND_API_KEY;
  const to = process.env.ENQUIRY_TO;
  const from = process.env.ENQUIRY_FROM || DEFAULT_FROM;
  const missing = ['RESEND_API_KEY', 'ENQUIRY_TO'].filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`enquiry: ${missing.join(' and ')} not set in the environment`);
    return reply(500, { ok: false, error: 'email not configured' });
  }

  const { name, email, interest, message } = v.data;
  const at = new Date().toISOString();
  const text = [`Name: ${name}`, `Email: ${email}`, `Interest: ${interest}`, `Received: ${at}`, '', 'Message:', message].join('\n');
  const html =
    `<p><strong>Name:</strong> ${esc(name)}<br><strong>Email:</strong> ${esc(email)}<br><strong>Interest:</strong> ${esc(interest)}<br><strong>Received:</strong> ${esc(at)}</p>` +
    `<p><strong>Message:</strong></p><p style="white-space:pre-wrap">${esc(message)}</p>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `New ${interest} enquiry from ${name}`.replace(/\s+/g, ' '),
        text,
        html,
      }),
    });
    if (!r.ok) {
      console.error(`enquiry: Resend responded ${r.status}: ${await r.text().catch(() => '')}`);
      return reply(502, { ok: false, error: 'email failed' });
    }
    const out = await r.json().catch(() => ({}));
    return reply(201, { ok: true, id: out.id });
  } catch (e) {
    console.error('enquiry: Resend request failed:', e && e.message ? e.message : e);
    return reply(502, { ok: false, error: 'email failed' });
  }
};
