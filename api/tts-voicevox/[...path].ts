// api/tts-voicevox/[...path].ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { api: { bodyParser: false } };

const TARGET = (process.env.VOICEVOX_URL || 'https://voicevox-engine-l6ll.onrender.com').replace(/\/+$/,'');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS（保険）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // /api/tts-voicevox/<path...>?<query...> → TARGET/<path...>?<query...>
  const q: any = req.query as any;
  const segs: string[] = Array.isArray(q.path) ? q.path : (q.path ? [q.path] : []);
  const path = segs.join('/');
  const search = req.url?.includes('?') ? '?' + req.url.split('?')[1] : '';
  const upstreamUrl = `${TARGET}/${path}${search}`;

  // 上流に CORS 由来ヘッダを渡さない（ここが 403 回避のキモ）
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const key = k.toLowerCase();
    if ([
      'host','connection','transfer-encoding','content-length',
      'origin','referer','accept-encoding',
      'sec-fetch-mode','sec-fetch-site','sec-fetch-dest',
      'sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform'
    ].includes(key)) continue;
    if (typeof v === 'string') headers[k] = v;
    else if (Array.isArray(v)) headers[k] = v.join(', ');
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    body: /^(GET|HEAD|OPTIONS)$/i.test(req.method || '') ? undefined : (req as any),
  };

  let r: Response;
  try {
    r = await fetch(upstreamUrl, init);
  } catch (e: any) {
    res.status(502).json({ ok: false, proxy: 'fetch_failed', message: String(e?.message || e) });
    return;
  }

  // レスポンスヘッダの転送（危険なもの除外）＋CORS再付与
  r.headers.forEach((val, key) => {
    const kk = key.toLowerCase();
    if (!['content-length','transfer-encoding','connection','content-encoding'].includes(kk)) {
      res.setHeader(key, val);
    }
  });
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.status(r.status);

  // シンプル実装：arrayBufferで返す（ストリームは環境で挙動差が出るため回避）
  const buf = Buffer.from(await r.arrayBuffer());
  res.end(buf);
}
