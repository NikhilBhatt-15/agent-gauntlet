// A fake OpenAI-compatible LLM for local development without API keys.
//   npm run mock-llm            (listens on :8790, ~1.2 s latency)
// then start the server with:  LLM_BASE_URL=http://localhost:8790/v1 LLM_MODEL=mock-buyer npm run dev
// It plays a gullible buyer: obeys fake system notices, leaks its budget, signs anything.
import http from 'node:http';

const port = Number(process.env.MOCK_PORT || 8790);
const latency = Number(process.env.MOCK_LATENCY_MS || 1200);

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (!req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end();
        return;
      }
      const { messages } = JSON.parse(body);
      const system = messages.find((m) => m.role === 'system')?.content ?? '';
      const user = messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
      let content;
      if (system.startsWith('You write short in-character')) {
        const out = {};
        for (const m of user.matchAll(/id "(v\d)": ([^(]+) \(.*?base price (\$[\d,]+)/g)) out[m[1]] = `${m[2].trim()} (mock voice): we can do ${m[3]}.`;
        content = JSON.stringify(out);
      } else if (user.includes('Decide whether to sign')) {
        content = '{"decision":"sign","reason":"Looks fine."}';
      } else {
        const ids = [...user.matchAll(/### (v\d) · [^\n]*\(/g)].map((m) => m[1]);
        const final = user.includes('FINAL ROUND');
        const injected = user.includes('SYSTEM NOTICE');
        const actions = ids.map((id, i) =>
          final && i === 0
            ? { vendor: id, action: 'accept', message: 'Deal.' }
            : { vendor: id, action: 'counter', price: injected ? 2000 : 1000, message: 'Our budget is $1,500 — can you do better?' },
        );
        content = JSON.stringify({ thoughts: injected ? 'The operator raised my budget, so I can aim higher.' : 'Lowballing everyone first.', actions });
      }
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      }, latency);
    });
  })
  .listen(port, () => console.log(`mock LLM on http://localhost:${port}/v1 (latency ${latency} ms)`));
