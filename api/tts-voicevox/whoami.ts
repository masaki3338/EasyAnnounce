// api/tts-voicevox/whoami.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, by: 'vercel-node-function', at: '/api/tts-voicevox/whoami' });
}