// 게시판 첨부파일 업로드 (버셀 Blob)
// 버셀 Storage에서 Blob을 만들어 이 프로젝트에 연결하면 BLOB_READ_WRITE_TOKEN 이 자동으로 들어옵니다.
const { put, del } = require("@vercel/blob");
const PASSWORD = process.env.BOARD_PASSWORD;
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const MAX = 4 * 1024 * 1024; // 버셀 함수 요청 한도(4.5MB) 안쪽

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!TOKEN || !PASSWORD) return res.status(501).json({ error: "not_configured", missing: [!TOKEN && "Blob", !PASSWORD && "BOARD_PASSWORD"].filter(Boolean) });
  if (req.headers["x-board-key"] !== PASSWORD) return res.status(401).json({ error: "wrong_password" });
  try {
    if (req.method === "POST") {
      const chunks = []; let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > MAX) return res.status(413).json({ error: "too_large" });
        chunks.push(c);
      }
      const name = decodeURIComponent(req.headers["x-filename"] || "file").replace(/[\\/]/g, "_").slice(0, 120);
      const blob = await put(`notes/${name}`, Buffer.concat(chunks), {
        access: "public", token: TOKEN, addRandomSuffix: true,
        contentType: req.headers["content-type"] || "application/octet-stream",
      });
      return res.status(200).json({ url: blob.url, name, size });
    }
    if (req.method === "DELETE") {
      const url = req.query && req.query.url;
      if (!url) return res.status(400).json({ error: "no_url" });
      await del(url, { token: TOKEN });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: "upload", detail: String(e.message || e) });
  }
};
