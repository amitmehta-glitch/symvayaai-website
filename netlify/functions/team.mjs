/* /api/team/*: private routes for the Enterprise AI Navigator team. Every call needs the
   x-team-token header to match the TEAM_TOKEN environment variable.
     GET    /api/team/orgs                              organisations with response counts
     GET    /api/team/responses?domain=d                all responses for one organisation (tool-importable)
     DELETE /api/team/responses?domain=d&person=p       delete one person's response (data deletion request)
     DELETE /api/team/org?domain=d                      delete an organisation and all its responses
     POST   /api/team/summary                           draft the report's summary with Claude, from findings */
import { getStore } from '@netlify/blobs';
import { json, teamOk, env } from './lib/common.mjs';

const SUMMARY_PER_DAY = 100;
const okDomain = (d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d || '');
const okPerson = (p) => /^[a-f0-9]{24}$/.test(p || '');

export default async (req) => {
  if (!teamOk(req)) return json(401, { error: 'Team password missing or wrong.' });
  const url = new URL(req.url), route = url.pathname.replace(/^\/api\/team\/?/, ''), domain = (url.searchParams.get('domain') || '').toLowerCase();
  const orgs = getStore({ name: 'orgs', consistency: 'strong' }), responses = getStore({ name: 'responses', consistency: 'strong' });

  if (req.method === 'GET' && route === 'orgs') {
    const { blobs } = await orgs.list(); const list = [];
    for (const b of blobs) { const o = await orgs.get(b.key, { type: 'json' }); if (!o) continue;
      const name = Object.keys(o.names || {}).sort((x, y) => o.names[y] - o.names[x])[0] || o.domain;
      list.push({ domain: o.domain, name, count: Object.keys(o.people || {}).length, updated: o.updated, people: Object.entries(o.people || {}).map(([person, v]) => ({ person, ...v })) }); }
    list.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    return json(200, { orgs: list });
  }

  if (route === 'responses') {
    if (!okDomain(domain)) return json(400, { error: 'Give a company domain.' });
    if (req.method === 'GET') {
      const { blobs } = await responses.list({ prefix: domain + '/' }); const out = [];
      for (const b of blobs) { const r = await responses.get(b.key, { type: 'json' }); if (r) out.push(r); }
      return json(200, { domain, responses: out });
    }
    if (req.method === 'DELETE') {
      const person = url.searchParams.get('person'); if (!okPerson(person)) return json(400, { error: 'Give the person to delete.' });
      await responses.delete(`${domain}/${person}`);
      const o = await orgs.get(domain, { type: 'json' });
      if (o) { delete (o.people || {})[person]; if (Object.keys(o.people).length) await orgs.setJSON(domain, o); else await orgs.delete(domain); }
      return json(200, { ok: true });
    }
  }

  if (req.method === 'DELETE' && route === 'org') {
    if (!okDomain(domain)) return json(400, { error: 'Give a company domain.' });
    const { blobs } = await responses.list({ prefix: domain + '/' });
    for (const b of blobs) await responses.delete(b.key);
    await orgs.delete(domain);
    return json(200, { ok: true, deleted: blobs.length });
  }

  if (req.method === 'POST' && route === 'summary') {
    const key = env('ANTHROPIC_API_KEY'); if (!key) return json(503, { error: 'The AI summary is not set up yet: add ANTHROPIC_API_KEY in Netlify.' });
    const limits = getStore({ name: 'limits', consistency: 'strong' }), dayKey = 'ai/' + new Date().toISOString().slice(0, 10);
    const used = (await limits.get(dayKey, { type: 'json' })) || 0; if (used >= SUMMARY_PER_DAY) return json(429, { error: 'Daily limit for AI summaries reached.' });
    let facts; try { facts = await req.json(); } catch (e) { return json(400, { error: 'Send the findings as JSON.' }); }
    const factText = JSON.stringify(facts).slice(0, 12000);
    const res = await fetch(env('AI_API_URL', 'https://api.anthropic.com/v1/messages'), { method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env('AI_MODEL', 'claude-sonnet-5-5'), max_tokens: 600,
        system: 'You write the opening summary of an AI readiness report for the leadership team of an Indian organisation. Use only the findings you are given: never add facts, figures, causes or recommendations that are not in them. Write one paragraph of 110 to 160 words in plain British English, for a busy CXO: lead with what matters most, connect the findings into one story, and end with where to start. No headings, no bullet points, no jargon, no flattery.',
        messages: [{ role: 'user', content: 'Findings from the report, as JSON:\n' + factText }] }) });
    await limits.setJSON(dayKey, used + 1);
    if (!res.ok) return json(502, { error: 'The AI service did not answer (' + res.status + '). Try again later.' });
    const out = await res.json(); const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    return json(200, { summary: text });
  }

  return json(404, { error: 'Unknown team route.' });
};

export const config = { path: '/api/team/*' };
