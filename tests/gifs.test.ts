import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GifService } from '../server/gifs.ts';

describe('GIPHY reactions', () => {
  let calls = 0;
  let fail = false;
  const server = http.createServer((req, res) => {
    calls++;
    const q = new URL(req.url!, 'http://x').searchParams;
    if (fail || q.get('api_key') !== 'k') {
      res.writeHead(403).end('{}');
      return;
    }
    expect(q.get('rating')).toBe('pg');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        data: [
          { title: 'ok', images: { fixed_height: { webp: 'https://media1.giphy.com/media/abc/200.webp', width: '356', height: '200' } } },
          { title: 'evil', images: { fixed_height: { url: 'https://evil.example.com/x.gif' } } },
          { title: 'empty', images: {} },
        ],
      }),
    );
  });
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it('is off without a key', async () => {
    const g = new GifService(null, base);
    expect(g.enabled).toBe(false);
    expect(await g.pick('angry')).toBeNull();
  });

  it('only returns GIPHY-hosted media, and caches searches', async () => {
    const g = new GifService('k', base);
    calls = 0;
    for (let i = 0; i < 12; i++) {
      const gif = await g.pick('angry');
      expect(gif).toEqual({ url: 'https://media1.giphy.com/media/abc/200.webp', width: 356, height: 200, title: 'ok' });
    }
    // three possible queries for "angry" → at most three upstream calls, however many picks
    expect(calls).toBeLessThanOrEqual(3);
  });

  it('fails soft when GIPHY errors', async () => {
    fail = true;
    const g = new GifService('k', base);
    expect(await g.pick('deal')).toBeNull();
    fail = false;
  });
});
