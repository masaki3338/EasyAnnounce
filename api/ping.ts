// api/ping.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ ok: true, where: "/api/ping" });
}
