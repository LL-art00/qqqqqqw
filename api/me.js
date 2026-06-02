const { getConfig, isLoggedIn, sendJson } = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const config = getConfig();
  return sendJson(res, 200, { loggedIn: isLoggedIn(req, config), model: config.model });
};
