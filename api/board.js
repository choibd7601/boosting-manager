// 고밥육성관리 현황판 저장 API
// 버셀 Storage에서 Upstash Redis를 연결하면 KV_REST_API_URL / KV_REST_API_TOKEN 이 자동으로 들어옵니다.
// BOARD_PASSWORD 환경변수에 현황판 비밀번호를 넣어 주세요.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PASSWORD = process.env.BOARD_PASSWORD;
const KEYS = { board: "gobap:board", notes: "gobap:notes" };

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let s = "";
  for await (const c of req) s += c;
  return JSON.parse(s || "{}");
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN || !PASSWORD) {
    const missing = [];
    if (!URL_ || !TOKEN) missing.push("Redis");
    if (!PASSWORD) missing.push("BOARD_PASSWORD");
    return res.status(501).json({ error: "not_configured", missing });
  }
  if (req.headers["x-board-key"] !== PASSWORD) {
    return res.status(401).json({ error: "wrong_password" });
  }
  const KEY = KEYS[(req.query && req.query.kind) || "board"];
  if (!KEY) return res.status(400).json({ error: "kind" });
  try {
    if (req.method === "GET") {
      const flat = (await redis(["HGETALL", KEY])) || [];
      const customers = [];
      for (let i = 1; i < flat.length; i += 2) {
        try { customers.push(JSON.parse(flat[i])); } catch (e) {}
      }
      return res.status(200).json({ customers, items: customers });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const list = body.items || body.customers || (body.customer ? [body.customer] : []);
      if (!list.length) return res.status(400).json({ error: "empty" });
      const cmd = ["HSET", KEY];
      for (const c of list) {
        if (!c || !c.id) continue;
        cmd.push(String(c.id), JSON.stringify(c));
      }
      await redis(cmd);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "DELETE") {
      const id = req.query && req.query.id;
      if (!id) return res.status(400).json({ error: "no_id" });
      await redis(["HDEL", KEY, String(id)]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: "storage", detail: String(e.message || e) });
  }
};
