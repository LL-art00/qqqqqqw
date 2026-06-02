const { constantTimeEqual, getConfig, readBody, sendJson, signToken } = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const body = await readBody(req);

    if (!constantTimeEqual(body.password || "", config.password)) {
      return sendJson(res, 401, { error: "密码不正确" });
    }

    const token = signToken(config.password);
    res.setHeader("Set-Cookie", `ai_master_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400; Secure`);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
};
