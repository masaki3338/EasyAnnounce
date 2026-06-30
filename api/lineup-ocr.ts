import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRequestBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function extractMultipartImage(body: Buffer, contentType: string) {
  const boundaryMatch = contentType.match(/boundary=(.+)$/);

  if (!boundaryMatch) {
    throw new Error("multipart boundary が見つかりません");
  }

  const boundary = `--${boundaryMatch[1]}`;
  const bodyText = body.toString("binary");
  const parts = bodyText.split(boundary);
  const imagePart = parts.find((part) => part.includes('name="image"'));

  if (!imagePart) {
    throw new Error("image ファイルが送信されていません");
  }

  const headerEnd = imagePart.indexOf("\r\n\r\n");

  if (headerEnd < 0) {
    throw new Error("画像データの形式が不正です");
  }

  const header = imagePart.slice(0, headerEnd);
  const mimeMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
  const mimeType = mimeMatch?.[1]?.trim() || "image/jpeg";

  let imageBinary = imagePart.slice(headerEnd + 4);
  imageBinary = imageBinary.replace(/\r\n--$/, "").replace(/\r\n$/, "");

  return {
    mimeType,
    buffer: Buffer.from(imageBinary, "binary"),
  };
}

function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

function normalizeResult(data: any) {
  const players = Array.isArray(data?.players) ? data.players : [];

  return {
    teamName: String(data?.teamName ?? ""),
    furigana: String(data?.furigana ?? ""),
    players: players.map((p: any) => ({
      number: String(p?.number ?? "").replace(/[^0-9]/g, ""),
      lastName: String(p?.lastName ?? ""),
      lastNameKana: String(p?.lastNameKana ?? ""),
      firstName: String(p?.firstName ?? ""),
      firstNameKana: String(p?.firstNameKana ?? ""),
      role:
        p?.role === "starter" || p?.role === "bench"
          ? p.role
          : "",
      battingOrder: String(p?.battingOrder ?? ""),
      position: String(p?.position ?? ""),
      confidence:
        p?.confidence === "high" ||
        p?.confidence === "medium" ||
        p?.confidence === "low"
          ? p.confidence
          : "low",
    })),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      message: "lineup-ocr API is running. Use POST with image.",
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY が設定されていません",
      });
    }

    const openai = new OpenAI({
      apiKey,
    });

    const contentType = String(req.headers["content-type"] || "");
    const body = await readRequestBody(req);
    const image = extractMultipartImage(body, contentType);

    const base64 = image.buffer.toString("base64");
    const imageUrl = `data:${image.mimeType};base64,${base64}`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
これは少年野球・中学野球のメンバー表画像です。
画像から選手情報を読み取り、必ずJSONのみで返してください。

目的:
チーム選手登録画面に、読み取った選手を一括登録します。

読み取り対象:
- チーム名
- スタメン選手
- 控え選手
- 背番号
- 姓
- 名
- 姓のふりがな候補
- 名のふりがな候補
- 打順
- 守備位置

返却JSON形式:
{
  "teamName": "",
  "furigana": "",
  "players": [
    {
      "number": "",
      "lastName": "",
      "lastNameKana": "",
      "firstName": "",
      "firstNameKana": "",
      "role": "starter",
      "battingOrder": "",
      "position": "",
      "confidence": "high"
    }
  ]
}

ルール:
- JSON以外の文章は返さない
- スタメンと控えを全員読み取る
- スタメンは role を "starter"
- 控えは role を "bench"
- 読めない文字は空文字
- 迷う文字は推測しすぎず confidence を "low"
- ふりがなは候補でよい
- 人名の読みが不明な場合、ふりがなは空文字
- 背番号は数字のみ
- 守備位置は画像に書かれている数字または文字をそのまま返す
- 女子選手判定は不要
              `.trim(),
            },
            {
              type: "input_image",
              image_url: imageUrl,
              detail: "high",
            },
          ],
        },
      ],
    });

    const outputText = response.output_text ?? "";

    let parsed: any;

    try {
      parsed = extractJson(outputText);
    } catch (error) {
      console.error("JSON parse error:", outputText);

      return res.status(500).json({
        error: "AIの返答をJSONとして読み取れませんでした",
        raw: outputText,
      });
    }

    return res.status(200).json(normalizeResult(parsed));
  } catch (error: any) {
    console.error("lineup-ocr error:", error);

    return res.status(500).json({
      error: error?.message || "メンバー表のAI読み取りに失敗しました",
    });
  }
}
