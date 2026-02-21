export default function handler(req, res) {
  const key = process.env.GOOGLE_API_KEY;
  res.status(200).json({ key: key ? "OK" : "undefined" });
}
