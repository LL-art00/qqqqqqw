const { sendJson } = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  res.setHeader("Set-Cookie", "ai_master_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure");
  return sendJson(res, 200, { ok: true });
};
