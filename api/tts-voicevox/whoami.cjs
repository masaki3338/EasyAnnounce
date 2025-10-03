module.exports = (req, res) => {
  res.status(200).json({ ok: true, by: 'vercel-node-function', path: req.url });
};