/* Shared logic for the Enterprise AI Navigator server functions. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { NAV } from './nav.mjs';

export const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
export const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
export const env = (k, d = '') => (globalThis.Netlify && Netlify.env.get(k)) || process.env[k] || d;

/* ---------- email addresses ---------- */
export const emailDomain = (e) => { const m = String(e || '').trim().toLowerCase().match(/^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/); return m ? m[1] : ''; };
export const workDomain = (e) => { const d = emailDomain(e); return d && !NAV.freeMail.includes(d) ? d : ''; };

/* ---------- never trust a response: keep only known fields, in range ---------- */
export function cleanResponse(r) {
  if (!r || typeof r !== 'object' || !r.respondent || typeof r.respondent !== 'object' || !r.answers || typeof r.answers !== 'object') return null;
  const s = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 200);
  const pick = (v, arr) => { const i = Number(v); return v !== '' && v != null && Number.isInteger(i) && i >= 0 && i < arr.length ? i : null; };
  const answers = {};
  NAV.bcaps.forEach(c => { const a = r.answers[c.id]; if (!a || typeof a !== 'object') { answers[c.id] = { l: null, dk: false, s: null, n: '' }; return; }
    const l = Number(a.l); answers[c.id] = { l: a.l != null && a.l !== '' && Number.isInteger(l) && l >= 1 && l <= 5 ? l : null, dk: !!a.dk, s: 'assumed', n: s(a.n, 1000) }; });
  const outcomes = {};
  NAV.outcomeQs.forEach(q => { const o = r.outcomes && r.outcomes[q.id]; if (!o || typeof o !== 'object') { outcomes[q.id] = null; return; }
    const v = Number(o.v); outcomes[q.id] = { v: o.v != null && Number.isInteger(v) && v >= 0 && v < q.o.length - 1 ? v : null, dk: !!o.dk }; });
  const R = r.respondent, role = pick(R.role, NAV.roles), sen = pick(R.seniority, NAV.seniorities), ind = pick(R.industry, NAV.industries),
    size = pick(R.size, NAV.sizes), reg = pick(R.region, NAV.regions), own = pick(R.ownership, NAV.ownerships);
  return {
    type: 'enterprise-ai-navigator/readiness-response', v: NAV.qVersion, id: s(r.id, 40) || 'rs' + Date.now().toString(36), submittedAt: new Date().toISOString(),
    wave: s(r.wave, 60), invitedBy: s(r.invitedBy, 120), durationSec: Number.isFinite(Number(r.durationSec)) ? Math.max(0, Math.round(Number(r.durationSec))) : null,
    respondent: { name: s(R.name, 120), email: s(R.email, 160).toLowerCase(), role, roleName: role != null ? NAV.roles[role] : '', org: s(R.org, 160), unit: s(R.unit, 160),
      industry: ind, industryName: ind != null ? NAV.industries[ind] : '', size, sizeName: size != null ? NAV.sizes[size] : '', region: reg, regionName: reg != null ? NAV.regions[reg] : '',
      seniority: sen, seniorityName: sen != null ? NAV.seniorities[sen] : '', ownership: own, ownershipName: own != null ? NAV.ownerships[own] : '' },
    consent: { research: r.consent && r.consent.research === true, named: r.consent && r.consent.named === true, contact: r.consent && r.consent.contact === true },
    ambition: NAV.ambitions.some(a => a.id === r.ambition) ? r.ambition : null, patterns: Array.isArray(r.patterns) ? r.patterns.filter(p => NAV.patterns.includes(p)).slice(0, 7) : [],
    answers, outcomes
  };
}

/* ---------- team password: TEAM_TOKEN, compared in constant time ---------- */
export function teamOk(req) {
  const want = env('TEAM_TOKEN'); const got = req.headers.get('x-team-token') || '';
  if (!want || want.length < 16 || !got) return false;
  const a = Buffer.from(sha(want), 'hex'), b = Buffer.from(sha(got), 'hex');
  return timingSafeEqual(a, b);
}

/* ---------- the respondent's own summary, as an email ---------- */
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Names and organisations are typed by the respondent: strip anything link-like so the email cannot carry someone else's link */
const noLinks = (t) => String(t || '').replace(/(https?:\/\/|www\.)\S*/gi, '').replace(/\b[\w-]+(\.[\w-]+)+\/\S*/g, '').trim();
export function summaryEmail(p) {
  const r = { ...p.respondent, name: noLinks(p.respondent.name), org: noLinks(p.respondent.org) }, A = p.answers;
  const st = NAV.bgroups.map(g => { const v = NAV.bcaps.filter(c => c.g === g.id).map(c => A[c.id].l).filter(x => x != null); return { g, v, av: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }; });
  let stuck = null; for (const x of st.filter(x => x.g.id !== 'F')) { if (x.av == null || x.av < 2.75 || Math.min(...x.v) < 2) { stuck = x; break; } }
  const answered = st.some(x => x.av != null);
  const amb = NAV.ambitions.find(a => a.id === p.ambition);
  const td = 'padding:6px 8px;border-bottom:1px solid #D8E0E5;vertical-align:top;font-size:14px;';
  const bars = st.map(x => `<tr><td style="${td}width:42%">${esc(x.g.id === 'F' ? 'Foundations' : 'Stage ' + x.g.id.slice(1) + ' · ' + x.g.short)}</td><td style="${td}"><div style="background:#EEF1F4;height:12px;width:100%"><div style="background:#1E5A82;height:12px;width:${x.av == null ? 0 : Math.round((x.av - 1) / 4 * 100)}%"></div></div></td><td style="${td}text-align:right;font-weight:bold;width:40px">${x.av == null ? '—' : x.av.toFixed(1)}</td></tr>`).join('');
  const rows = NAV.bgroups.map(g => `<tr><td colspan="2" style="${td}background:#F2F4F6;color:#1E5A82;font-weight:bold">${esc(g.name)}</td></tr>` + NAV.bcaps.filter(c => c.g === g.id).map(c => { const a = A[c.id], q = NAV.bq[c.id];
    return `<tr><td style="${td}width:48%">${esc(q.q)}</td><td style="${td}">${a.dk ? '<i>Don’t know</i>' : a.l ? `<b>${a.l}</b> · ${esc(q.o[a.l - 1])}` : '<i>Not answered</i>'}</td></tr>`; }).join('')).join('');
  const outs = NAV.outcomeQs.map(x => { const o = p.outcomes[x.id]; return `<tr><td style="${td}width:48%">${esc(x.q)}</td><td style="${td}">${!o ? '<i>Not answered</i>' : o.dk ? '<i>Don’t know</i>' : esc(x.o[o.v])}</td></tr>`; }).join('');
  const view = !answered ? 'You did not rate any capabilities.' : stuck ? `In your view, AI work at ${esc(r.org || 'your organisation')} gets stuck at <b>Stage ${stuck.g.id.slice(1)}, ${esc(stuck.g.name.replace(/^Stage \d · /, ''))}</b>: the first stage where your answers average below 3 or include a 1.` : 'In your view, AI work does not get stuck at any of the six stages: each averages 3 or more in your answers.';
  const contact = env('DATA_CONTACT', 'amitmehta@symvayaai.com');
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#F4F6F8;font-family:Arial,Helvetica,sans-serif;color:#1C2B39">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="background:#0F2235;padding:22px 26px"><div style="color:#E3B05A;font-weight:bold;font-size:13px">Enterprise AI Navigator</div><div style="color:#fff;font-family:Georgia,serif;font-size:24px;margin-top:6px">Your AI readiness answers</div><div style="color:#C9D4DE;font-size:13px;margin-top:4px">${esc(r.name)} · ${esc(r.roleName)} · ${esc(r.org)}</div></td></tr>
<tr><td style="padding:22px 26px">
<p style="font-size:15px;line-height:1.5;margin:0 0 12px">Thank you for taking the AI readiness assessment. Here is a copy of your answers.</p>
<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;color:#0F2235;margin:18px 0 8px">Your view, in short</h2>
<p style="font-size:14px;line-height:1.5;margin:0 0 10px">${view}${amb ? ` The goal you chose for the next 12 to 18 months: <b>${esc(amb.name)}</b>.` : ''}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bars}</table>
<p style="font-size:12px;color:#586A7B;margin:6px 0 0">Average of your answers for each stage, on a scale of 1 (ad hoc) to 5 (optimised).</p>
<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;color:#0F2235;margin:22px 0 8px">Your answers</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;color:#0F2235;margin:22px 0 8px">Results so far</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${outs}</table>
<p style="font-size:13px;line-height:1.5;color:#33475B;margin:20px 0 0">This is your own view. Your organisation’s report combines your answers with your colleagues’ and is shared after the Enterprise AI Navigator team has reviewed it.</p>
<p style="font-size:12px;line-height:1.5;color:#586A7B;margin:10px 0 0">You received this because you asked for a copy of your answers. To see, correct or delete your data, write to ${esc(contact)}.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `Your AI readiness answers\n${r.name} · ${r.roleName} · ${r.org}\n\n${view.replace(/<[^>]+>/g, '')}\n\n` + st.map(x => `${x.g.id === 'F' ? 'Foundations' : 'Stage ' + x.g.id.slice(1) + ' · ' + x.g.short}: ${x.av == null ? '—' : x.av.toFixed(1)}`).join('\n') + `\n\nTo see, correct or delete your data, write to ${contact}.`;
  return { subject: 'Your AI readiness answers', html, text };
}

export async function sendMail(to, msg) {
  const key = env('RESEND_API_KEY'); if (!key) return { ok: false, reason: 'email not set up' };
  const from = env('MAIL_FROM', 'Enterprise AI Navigator <onboarding@resend.dev>'), replyTo = env('MAIL_REPLY_TO');
  const res = await fetch(env('MAIL_API_URL', 'https://api.resend.com/emails'), { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: msg.subject, html: msg.html, text: msg.text, ...(replyTo ? { reply_to: replyTo } : {}) }) });
  if (!res.ok) return { ok: false, reason: 'email service ' + res.status };
  return { ok: true };
}
