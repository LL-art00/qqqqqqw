const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const configPath = path.join(root, "config.local.json");
const fallbackKnowledgePath = path.join(root, "ai-video-prompt-master", "references", "knowledge.md");
const privateFileNames = new Set([
  ".env",
  ".env.local",
  "config.local.json",
  "config.example.json",
  "server-out.log",
  "server-err.log"
]);

const defaultConfig = {
  host: "0.0.0.0",
  port: 5177,
  password: "123456",
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5.5",
  fallbackModels: ["gpt-5.5"],
  knowledgePath: "C:/Users/LIU/.codex/skills/ai大师/references/knowledge.md",
  maxKnowledgeChars: 9000,
  temperature: 0.7
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const sessions = new Map();

function loadConfig() {
  const localConfig = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""))
    : {};
  const envConfig = {
    host: process.env.HOST,
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    password: process.env.AI_MASTER_PASSWORD,
    apiBase: process.env.OPENAI_API_BASE || process.env.API_BASE,
    apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY,
    model: process.env.AI_MODEL,
    fallbackModels: process.env.FALLBACK_MODELS
      ? process.env.FALLBACK_MODELS.split(",").map((model) => model.trim()).filter(Boolean)
      : undefined,
    knowledgePath: process.env.KNOWLEDGE_PATH,
    maxKnowledgeChars: process.env.MAX_KNOWLEDGE_CHARS ? Number(process.env.MAX_KNOWLEDGE_CHARS) : undefined,
    temperature: process.env.TEMPERATURE ? Number(process.env.TEMPERATURE) : undefined
  };

  const cleanEnvConfig = Object.fromEntries(Object.entries(envConfig).filter(([, value]) => value !== undefined));
  return { ...defaultConfig, ...localConfig, ...cleanEnvConfig };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function isLoggedIn(req) {
  const token = parseCookies(req).ai_master_session;
  return Boolean(token && sessions.has(token));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("请求内容过大"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON 格式错误"));
      }
    });
    req.on("error", reject);
  });
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function login(req, res, config) {
  readBody(req)
    .then((body) => {
      if (!constantTimeEqual(body.password || "", config.password)) {
        sendJson(res, 401, { error: "密码不正确" });
        return;
      }

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, Date.now());
      const secureCookie = req.headers["x-forwarded-proto"] === "https" || process.env.COOKIE_SECURE === "true";
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `ai_master_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secureCookie ? "; Secure" : ""}`
      });
      res.end(JSON.stringify({ ok: true }));
    })
    .catch((error) => sendJson(res, 400, { error: error.message }));
}

function logout(req, res) {
  const token = parseCookies(req).ai_master_session;
  if (token) sessions.delete(token);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": "ai_master_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
  });
  res.end(JSON.stringify({ ok: true }));
}

function resolveKnowledgePath(config) {
  const configuredPath = path.resolve(config.knowledgePath);
  if (fs.existsSync(configuredPath)) return configuredPath;
  return fallbackKnowledgePath;
}

function getKeywords(payload) {
  const base = [
    payload.categoryTitle,
    payload.task,
    payload.platform,
    payload.style,
    payload.need,
    payload.extra
  ]
    .filter(Boolean)
    .join(" ");

  const categoryWords = {
    visual: ["视觉提示词", "画面", "光影", "主体", "负面约束"],
    video: ["视频提示词", "Seedance", "Higgsfield", "运镜", "动作过程"],
    viral: ["短视频爆款", "钩子", "痛点", "转化", "脚本"],
    ecommerce: ["电商视频", "千川", "产品", "卖点", "广告"],
    storyboard: ["分镜", "故事板", "镜头", "景别", "每一镜"],
    ancient: ["古风女频", "古风", "女频", "情绪", "短剧"],
    diagnosis: ["失败诊断", "迭代优化", "重写", "负面约束"],
    materials: ["素材库", "人群需求", "选题", "策略"]
  };

  const words = base
    .split(/[^\u4e00-\u9fa5A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);

  return [...new Set([...(categoryWords[payload.categoryId] || []), ...words])].slice(0, 30);
}

function retrieveKnowledge(config, payload) {
  const knowledgePath = resolveKnowledgePath(config);
  if (!fs.existsSync(knowledgePath)) return "";

  const text = fs.readFileSync(knowledgePath, "utf8");
  const keywords = getKeywords(payload);
  const sections = text
    .split(/\n(?=#{1,4}\s)/)
    .map((section) => section.trim())
    .filter(Boolean);

  const scored = sections
    .map((section) => {
      const score = keywords.reduce((total, keyword) => {
        if (!keyword) return total;
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const matches = section.match(new RegExp(escaped, "gi"));
        return total + (matches ? matches.length : 0);
      }, 0);
      return { section, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const selected = scored.length ? scored.map((item) => item.section) : sections.slice(0, 3);
  return selected.join("\n\n---\n\n").slice(0, config.maxKnowledgeChars);
}

function buildMessages(config, payload, knowledge) {
  const userRequest = `分工窗口：${payload.categoryTitle}
任务：${payload.task}

我的需求：
${payload.need || "请根据这个分工窗口，补全必要信息并生成可直接使用的方案。"}

参数：
- 平台/模型：${payload.platform || "不指定"}
- 画幅比例：${payload.ratio || "不指定"}
- 视频时长：${payload.duration || "不指定"}
- 风格：${payload.style || "不指定"}

补充要求：
${payload.extra || "输出要结构清晰，关键提示词可以直接复制使用。"}`;

  return [
    {
      role: "system",
      content: `你是“ai大师”，一个中文 AI 视觉提示词、AI 视频提示词、短视频爆款脚本、分镜、电商广告和内容诊断专家。

必须优先参考下面的知识库片段，但不要逐字照抄；要把知识转化成用户可直接使用的结果。

输出要求：
- 使用中文。
- 每段提示词都要独立完整，不能依赖上下文。
- 涉及视频分镜时，每一镜都要能单独复制使用。
- 涉及商业视频时，要体现人群痛点、卖点、场景和转化目标。
- 需要时加入负面约束和失败规避条件。

知识库片段：
${knowledge || "未检索到知识库片段，请按通用专业能力回答。"}`
    },
    { role: "user", content: userRequest }
  ];
}

async function callModel(config, payload) {
  if (!config.apiKey) {
    throw new Error("还没有在 config.local.json 里填写 apiKey。");
  }

  const knowledge = retrieveKnowledge(config, payload);
  const models = [...new Set([config.model, ...(config.fallbackModels || [])].filter(Boolean))];
  const errors = [];

  for (const model of models) {
    const response = await fetch(`${config.apiBase.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(config, payload, knowledge),
        temperature: config.temperature
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      errors.push(`${model}: ${data.error?.message || `HTTP ${response.status}`}`);
      continue;
    }

    return {
      text: data.choices?.[0]?.message?.content || "",
      model: data.model || model,
      knowledgeChars: knowledge.length
    };
  }

  throw new Error(`这些模型都不可用：${errors.join("；")}`);
}

function generate(req, res, config) {
  if (!isLoggedIn(req)) {
    sendJson(res, 401, { error: "请先登录" });
    return;
  }

  readBody(req)
    .then((payload) => callModel(config, payload))
    .then((result) => sendJson(res, 200, result))
    .catch((error) => sendJson(res, 500, { error: error.message }));
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(root, decodeURIComponent(pathname));

  if (pathname === "/") {
    filePath = path.join(root, "index.html");
  }

  const relativePath = path.relative(root, filePath);
  const baseName = path.basename(filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || privateFileNames.has(baseName)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    res.end(data);
  });
}

const config = loadConfig();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${config.host}:${config.port}`);

  if (req.method === "POST" && url.pathname === "/api/login") return login(req, res, config);
  if (req.method === "POST" && url.pathname === "/api/logout") return logout(req, res);
  if (req.method === "GET" && url.pathname === "/api/me") {
    return sendJson(res, 200, { loggedIn: isLoggedIn(req), model: config.model });
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, model: config.model });
  }
  if (req.method === "POST" && url.pathname === "/api/generate") return generate(req, res, config);

  return serveStatic(req, res, url.pathname);
});

server.listen(config.port, config.host, () => {
  console.log(`ai大师共享版网站已启动: http://${config.host}:${config.port}/`);
});
