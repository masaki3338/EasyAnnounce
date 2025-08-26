// api/ping.js
module.exports = (req, res) => res.status(200).json({ ok: true, now: Date.now() });
module.exports.config = { runtime: 'nodejs' };
