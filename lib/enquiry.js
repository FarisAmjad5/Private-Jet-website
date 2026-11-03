// Shared OBSIDIAN enquiry validation, used by server.js (local) and api/enquiry.js (Vercel).
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INTERESTS = ['Charter', 'Ownership', 'General Inquiry'];

// d is the parsed JSON body. Returns { errors } when invalid, { spam: true } when the `company`
// honeypot is filled (accept quietly, act on nothing), otherwise { data: { name, email, interest, message } }.
function validate(d) {
  const src = d && typeof d === 'object' ? d : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = str(src.name);
  const email = str(src.email);
  const interest = str(src.interest);
  const message = str(src.message);
  const errors = {};
  if (name.length < 2 || name.length > 120) errors.name = 'Please tell us your name.';
  if (!EMAIL.test(email) || email.length > 200) errors.email = 'Please enter a valid email address.';
  if (!INTERESTS.includes(interest)) errors.interest = 'Please choose Charter, Ownership or General Inquiry.';
  if (message.length < 10 || message.length > 4000) errors.message = 'A few words about your plans, please (at least 10 characters).';
  if (Object.keys(errors).length) return { errors };
  if (str(src.company)) return { spam: true };
  return { data: { name, email, interest, message } };
}

module.exports = { EMAIL, INTERESTS, validate };
