// api/tts-voicevox/version.js
module.exports = async (req, res) => {
  const TARGET = (process.env.VOICEVOX_URL || 'https://voicevox-engine-l6ll.onrender.com').replace(/\/+$/,'');
  const r = await fetch(`${TARGET}/version`);
  const txt = await r.text();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(r.status).end(txt);
};
