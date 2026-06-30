module.exports = function handler(req, res) {
  return res.status(200).json({
    ok: true,
    message: "lineup-ocr API is alive",
    method: req.method,
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
  });
};