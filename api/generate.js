const { callModel, getConfig, isLoggedIn, readBody, sendJson } = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const config = getConfig();
  if (!isLoggedIn(req, config)) {
    return sendJson(res, 401, { error: "请先登录" });
  }

  try {
    const payload = await readBody(req);
    const result = await callModel(config, payload);
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
};
