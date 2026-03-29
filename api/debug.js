export default function handler(req, res) {
  res.status(200).json({
    node: process.version,
    env: Object.keys(process.env).filter(k => !k.includes('TOKEN') && !k.includes('KEY')),
    host: req.headers.host,
    fetch: typeof fetch
  });
}
