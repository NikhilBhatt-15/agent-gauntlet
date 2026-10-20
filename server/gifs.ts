/**
 * Reaction GIFs from GIPHY's official API. GIFs stay hosted on GIPHY's CDN (that is what the
 * API terms allow — we never download or re-host them) and the UI shows "Powered by GIPHY".
 * Search results are cached so a free key's hourly quota is plenty.
 */
export type GifKind = 'angry' | 'annoyed' | 'happy' | 'impressed' | 'suspicious' | 'jugaad' | 'deal' | 'nodeal';

export const GIF_KINDS: GifKind[] = ['angry', 'annoyed', 'happy', 'impressed', 'suspicious', 'jugaad', 'deal', 'nodeal'];

// Desi-flavoured searches per reaction; one is picked at random per fetch.
const QUERIES: Record<GifKind, string[]> = {
  angry: ['bollywood angry', 'angry indian uncle', 'gussa'],
  annoyed: ['bollywood eye roll', 'irritated bollywood', 'facepalm bollywood'],
  happy: ['bollywood happy dance', 'bollywood happy', 'khushi'],
  impressed: ['wah wah', 'bollywood clapping', 'bollywood impressed'],
  suspicious: ['bollywood suspicious', 'suspicious look', 'shak'],
  jugaad: ['bollywood shocked', 'shocked uncle', 'lut gaya'],
  deal: ['bollywood celebration', 'deal done bollywood', 'party bollywood'],
  nodeal: ['bollywood sad', 'bollywood crying funny', 'dil toot gaya'],
};

export interface Gif {
  url: string;
  width: number;
  height: number;
  title: string;
}

interface GiphyItem {
  title?: string;
  images?: Record<string, { url?: string; webp?: string; width?: string; height?: string }>;
}

export class GifService {
  private cache = new Map<string, { gifs: Gif[]; at: number }>();

  constructor(
    private apiKey: string | null,
    private baseUrl = 'https://api.giphy.com/v1',
    private ttlMs = 12 * 3600_000,
  ) {}

  get enabled() {
    return !!this.apiKey;
  }

  private async search(q: string): Promise<Gif[]> {
    const hit = this.cache.get(q);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.gifs;
    const url = `${this.baseUrl}/gifs/search?${new URLSearchParams({ api_key: this.apiKey!, q, limit: '25', rating: 'pg', lang: 'en' })}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`GIPHY ${res.status}`);
    const data = (await res.json()) as { data?: GiphyItem[] };
    const gifs = (data.data ?? [])
      .map((d) => {
        const img = d.images?.fixed_height ?? d.images?.downsized;
        const src = img?.webp || img?.url;
        // only ever hotlink GIPHY's own media hosts
        if (!src || !/^https:\/\/media\d*\.giphy\.com\//.test(src)) return null;
        return { url: src, width: Number(img?.width) || 200, height: Number(img?.height) || 200, title: String(d.title ?? '').slice(0, 120) };
      })
      .filter((g): g is Gif => !!g);
    this.cache.set(q, { gifs, at: Date.now() });
    return gifs;
  }

  async pick(kind: GifKind): Promise<Gif | null> {
    if (!this.apiKey) return null;
    const qs = QUERIES[kind];
    const q = qs[Math.floor(Math.random() * qs.length)];
    try {
      const gifs = await this.search(q);
      return gifs.length ? gifs[Math.floor(Math.random() * gifs.length)] : null;
    } catch (e) {
      console.warn(`[gif] ${kind}: ${(e as Error).message}`);
      return null;
    }
  }
}
