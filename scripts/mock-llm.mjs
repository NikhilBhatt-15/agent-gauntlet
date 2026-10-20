// A fake OpenAI-compatible LLM for local development without API keys.
//   npm run mock-llm            (listens on :8790, ~800 ms latency)
// then start the server with:  LLM_BASE_URL=http://localhost:8790/v1 LLM_MODEL=mock npm run dev
// It plays a gullible shopkeeper: drops 10% per message and accepts anything once you say "please".
import http from 'node:http';

const port = Number(process.env.MOCK_PORT || 8790);
const latency = Number(process.env.MOCK_LATENCY_MS || 800);

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (!req.url?.endsWith('/chat/completions')) return res.writeHead(404).end();
      const { messages } = JSON.parse(body);
      const system = messages[0]?.content ?? '';
      const last = messages.at(-1)?.content ?? '';
      let out;
      if (system.startsWith('You are Munim ji')) out = { approve: /munim ji approve/i.test(last), say: 'Hmm, theek hai... (mock munim)' };
      else if (system.startsWith('You analyse bargaining')) out = { tactics: ['Persistence'], bestLine: '', comment: 'Mock judge: achha mol-bhav!' };
      else {
        const ask = Number(system.match(/current asking price is ₹([\d,]+)/)?.[1].replace(/,/g, '') ?? 1000);
        const please = /please/i.test(last);
        const price = please ? Math.round(ask * 0.5) : Math.round(ask * 0.9);
        out = { reply: please ? `Aap itne pyaar se bole, ₹${price} done! (mock)` : `Chalo ₹${price}, bas. (mock)`, price, accept: please, mood: 'neutral', end: false };
      }
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
      }, latency);
    });
  })
  .listen(port, () => console.log(`mock LLM on http://localhost:${port}/v1 (latency ${latency} ms)`));
