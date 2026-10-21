// Measures end-to-end judging latency (POST /submissions → final verdict) against a running stack.
// Usage: node docs/report/benchJudge.mjs [baseUrl] [runsPerLanguage]
// Needs the seeded demo accounts; the submit rate limit (1 per 5 s per user) is respected by
// rotating through the three demo students.
const BASE = process.argv[2] ?? 'http://localhost:8080';
const RUNS = Number(process.argv[3] ?? 10);
const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'judgehint123';
const SLUG = 'tong-hai-so';

const SOLUTIONS = {
  python: 'a, b = map(int, input().split())\nprint(a + b)\n',
  javascript: "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(BigInt);\nconsole.log(String(a + b));\n",
  cpp: '#include <bits/stdc++.h>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}\n',
};

async function api(path, { token, ...init } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

const login = async (email) =>
  (await api('/auth/login', { method: 'POST', body: JSON.stringify({ identifier: email, password: PASSWORD }) })).accessToken;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const tokens = await Promise.all(['sv1', 'sv2', 'sv3'].map((u) => login(`${u}@judgehint.local`)));
const problem = await api(`/problems/${SLUG}`, { token: tokens[0] });
const lastSubmit = tokens.map(() => 0);
let turn = 0;

async function submitOnce(language) {
  const i = turn++ % tokens.length;
  const wait = lastSubmit[i] + 5200 - Date.now();
  if (wait > 0) await sleep(wait);
  let id;
  let started;
  // A previous run may still hold the rate-limit window: retry instead of failing.
  for (;;) {
    lastSubmit[i] = Date.now();
    started = performance.now();
    try {
      ({ submissionId: id } = await api('/submissions', {
        token: tokens[i],
        method: 'POST',
        body: JSON.stringify({ problemId: problem.id, language, code: SOLUTIONS[language] }),
      }));
      break;
    } catch (err) {
      if (!String(err.message).includes('429')) throw err;
      await sleep(1000);
    }
  }
  for (;;) {
    const s = await api(`/submissions/${id}`, { token: tokens[i] });
    if (!['PENDING', 'RUNNING'].includes(s.verdict)) return { ms: performance.now() - started, verdict: s.verdict, tests: s.totalCount };
    await sleep(100);
  }
}

console.log(`Judging "${SLUG}" ${RUNS}× per language at ${BASE}`);
console.log('language     verdicts        tests  p50 (s)  p95 (s)  max (s)');
for (const language of Object.keys(SOLUTIONS)) {
  const results = [];
  for (let r = 0; r < RUNS; r++) results.push(await submitOnce(language));
  const times = results.map((x) => x.ms / 1000).sort((a, b) => a - b);
  const verdicts = [...new Set(results.map((x) => x.verdict))].join(',');
  console.log(
    `${language.padEnd(12)} ${verdicts.padEnd(15)} ${String(results[0].tests).padEnd(6)} ${pct(times, 50).toFixed(2).padStart(7)}  ${pct(times, 95).toFixed(2).padStart(7)}  ${times.at(-1).toFixed(2).padStart(7)}`,
  );
}
