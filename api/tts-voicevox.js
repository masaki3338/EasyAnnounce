// api/tts-voicevox/[...path].ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'node:stream';

export const config = { api: { bodyParser: false } };

const TARGET = process.env.VOICEVOX_URL || 'https://voicevox-engine-l6ll.onrender.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!TARGET) {
    res.status(500).json({ ok: false, error: 'VOICEVOX_URL not set' });
    return;
  }

  // CORS (必要十分。必要なら Origin 絞ってください)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // /api/tts-voicevox/<path...>?<query...> → TARGET/<path...>?<query...>
  const segs = Array.isArray(req.query.path) ? req.query.path : (req.query.path ? [req.query.path] : []);
  const path = segs.join('/');
  const search = req.url?.includes('?') ? '?' + req.url.split('?')[1] : '';
  const url = `${TARGET.replace(/\/+$/,'')}/${path}${search}`;

  // 転送ヘッダ生成（ホップバイホップは落とす）
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const key = k.toLowerCase();
    if (['host','connection','transfer-encoding','content-length'].includes(key)) continue;
    if (typeof v === 'string') headers[k] = v;
    else if (Array.isArray(v)) headers[k] = v.join(', ');
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    body: /^(GET|HEAD|OPTIONS)$/i.test(req.method || '') ? undefined : (req as any),
  };

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (err: any) {
    res.status(502).json({ ok: false, proxy: 'fetch_failed', message: String(err?.message || err) });
    return;
  }

  // 上流ヘッダを転送（危険なものは除外）＋CORS再付与
  upstream.headers.forEach((val, key) => {
    const k = key.toLowerCase();
    if (!['content-length','transfer-encoding','connection'].includes(k)) {
      res.setHeader(key, val);
    }
  });
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.status(upstream.status);
  if (upstream.body) {
    // WebStream → NodeStream でストリーム返却（大きいWAVでもOK）
    // Node18+ なら fromWeb が使えます
    if ((Readable as any).fromWeb) {
      (Readable as any).fromWeb(upstream.body as any).pipe(res);
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    }
  } else {
    res.end();
  }
}
