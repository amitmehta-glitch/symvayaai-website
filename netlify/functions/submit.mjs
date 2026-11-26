/* POST /api/submit: receive one questionnaire response, file it under the company email domain,
   and email the respondent a copy of their own answers if they asked for one. */
import { getStore } from '@netlify/blobs';
import { json, sha, cleanResponse, workDomain, summaryEmail, sendMail } from './lib/common.mjs';

const MAX_BODY = 200 * 1024, PER_IP_HOUR = 30, MAILS_PER_DAY = 3;

async function bump(store, key, max) { const n = (await store.get(key, { type: 'json' })) || 0; if (n >= max) return false; await store.setJSON(key, n + 1); return true; }

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const raw = await req.text(); if (raw.length > MAX_BODY) return json(413, { error: 'Response too large.' });
  let body; try { body = JSON.parse(raw); } catch (e) { return json(400, { error: 'Not a valid response.' }); }
  if (body && body.website) return json(200, { ok: true, emailed: false }); // spam trap: humans never fill this field

  const p = cleanResponse(body && body.response);
  if (!p || !p.respondent.name) return json(400, { error: 'Not a valid response.' });
  const domain = workDomain(p.respondent.email);
  if (!domain) return json(400, { error: 'Please use your work email, not a personal one.' });

  const limits = getStore({ name: 'limits', consistency: 'strong' });
  const hour = new Date().toISOString().slice(0, 13), day = hour.slice(0, 10);
  const ipKey = `ip/${sha((context && context.ip) || 'unknown').slice(0, 16)}/${hour}`;
  if (!(await bump(limits, ipKey, PER_IP_HOUR))) return json(429, { error: 'Too many responses from this connection. Please try again later.' });

  /* one record per person per organisation: a resubmission replaces the earlier one */
  const person = sha(p.respondent.email).slice(0, 24), key = `${domain}/${person}`;
  const responses = getStore({ name: 'responses', consistency: 'strong' });
  await responses.setJSON(key, p);

  const orgs = getStore({ name: 'orgs', consistency: 'strong' });
  const o = (await orgs.get(domain, { type: 'json' })) || { domain, names: {}, people: {}, created: p.submittedAt };
  o.people[person] = { name: p.respondent.name, role: p.respondent.roleName, seniority: p.respondent.seniorityName, at: p.submittedAt };
  const org = p.respondent.org || domain; o.names[org] = (o.names[org] || 0) + 1; o.updated = p.submittedAt;
  await orgs.setJSON(domain, o);

  let emailed = false, emailNote = '';
  if (body.emailCopy === true) {
    if (await bump(limits, `mail/${person}/${day}`, MAILS_PER_DAY)) {
      const r = await sendMail(p.respondent.email, summaryEmail(p)); emailed = r.ok; if (!r.ok) emailNote = r.reason;
    } else emailNote = 'daily email limit reached';
  }
  return json(200, { ok: true, emailed, emailNote });
};

export const config = { path: '/api/submit' };
