const fs = require("fs/promises");
const formidableImport = require("formidable");
const OpenAIImport = require("openai");

const formidable =
  formidableImport.formidable ||
  formidableImport.default ||
  formidableImport;

const OpenAI = OpenAIImport.default || OpenAIImport;

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function parseForm(req) {
  const form = formidable({
    multiples: false,
    maxFileSize: 20 * 1024 * 1024,
    keepExtensions: true,
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function getUploadedImage(files) {
  const image = Array.isArray(files.image) ? files.image[0] : files.image;

  if (!image) {
    console.log("uploaded files keys:", Object.keys(files || {}));
    throw new Error("image ファイルが送信されていません");
  }

  return image;
}

function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

function normalizeResult(data) {
  const players = Array.isArray(data?.players) ? data.players : [];

  return {
    teamName: String(data?.teamName ?? ""),
    furigana: String(data?.furigana ?? ""),
    players: players.map((p) => ({
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

async function handler(req, res) {
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
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY が設定されていません",
      });
    }

    const { files } = await parseForm(req);
    const image = getUploadedImage(files);

    const imageBuffer = await fs.readFile(image.filepath);
    const mimeType = image.mimetype || "image/jpeg";
    const base64 = imageBuffer.toString("base64");
    const imageUrl = `data:${mimeType};base64,${base64}`;

    const openai = getOpenAI();

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

    let parsed;

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
  } catch (error) {
    console.error("lineup-ocr error:", error);

    return res.status(500).json({
      error: error?.message || "メンバー表のAI読み取りに失敗しました",
    });
  }
}

module.exports = handler;

module.exports.config = {
  api: {
    bodyParser: false,
  },
};