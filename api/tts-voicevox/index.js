// api/tts-voicevox/index.js
module.exports = (req, res) => {
  res.status(200).json({ ok: true, where: '/api/tts-voicevox' });
};
