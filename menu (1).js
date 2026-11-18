const crypto = require("crypto");

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const ID_RE = /^[a-z0-9]{6,12}$/;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error("db error");
  return (await r.json()).result;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(503).json({ error: "database not connected" });
  try {
    if (req.method === "GET") {
      const id = String(req.query.id || "");
      if (!ID_RE.test(id)) return res.status(400).json({ error: "bad id" });
      const v = await redis(["GET", "menu:" + id]);
      if (!v) return res.status(404).json({ error: "not found" });
      return res.status(200).json(JSON.parse(v).d);
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const d = b.data;
      if (!d || typeof d.n !== "string" || !Array.isArray(d.i) || d.i.length > 300)
        return res.status(400).json({ error: "bad data" });
      if (JSON.stringify(d).length > 60000) return res.status(413).json({ error: "too large" });
      let id = b.id, key = b.key;
      if (id) {
        if (!ID_RE.test(id)) return res.status(400).json({ error: "bad id" });
        const old = await redis(["GET", "menu:" + id]);
        if (!old || JSON.parse(old).k !== key) return res.status(403).json({ error: "not allowed" });
      } else {
        id = crypto.randomBytes(4).toString("hex");
        key = crypto.randomBytes(12).toString("hex");
      }
      await redis(["SET", "menu:" + id, JSON.stringify({ k: key, d })]);
      return res.status(200).json({ id, key });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
};
