const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const fallbackKnowledgePath = path.join(root, "ai-video-prompt-master", "references", "knowledge.md");

function getConfig() {
  return {
    password: process.env.AI_MASTER_PASSWORD || "change-this-password",
    apiBase: process.env.OPENAI_API_BASE || process.env.API_BASE || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY || "",
    model: process.env.AI_MODEL || "gpt-5.5",
    fallbackModels: process.env.FALLBACK_MODELS
      ? process.env.FALLBACK_MODELS.split(",").map((model) => model.trim()).filter(Boolean)
      : ["gpt-5.5"],
    knowledgePath: process.env.KNOWLEDGE_PATH || fallbackKnowledgePath,
    maxKnowledgeChars: Number(process.env.MAX_KNOWLEDGE_CHARS || 9000),
    temperature: Number(process.env.TEMPERATURE || 0.7)
  };
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
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

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signToken(password) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", password).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token, password) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", password).update(payload).digest("base64url");
  if (!constantTimeEqual(signature, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Date.now() < data.exp;
  } catch {
    return false;
  }
}

function isLoggedIn(req, config) {
  return verifyToken(parseCookies(req).ai_master_session, config.password);
}

function getKeywords(payload) {
  const base = [payload.categoryTitle, payload.task, payload.platform, payload.style, payload.need, payload.extra]
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
  if (!fs.existsSync(config.knowledgePath)) return "";

  const text = fs.readFileSync(config.knowledgePath, "utf8");
  const keywords = getKeywords(payload);
  const sections = text
    .split(/\n(?=#{1,4}\s)/)
    .map((section) => section.trim())
    .filter(Boolean);

  const scored = sections
    .map((section) => {
      const score = keywords.reduce((total, keyword) => {
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

function buildMessages(payload, knowledge) {
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
    throw new Error("还没有配置 OPENAI_API_KEY。");
  }

  const knowledge = retrieveKnowledge(config, payload);
  const models = [...new Set([config.model, ...config.fallbackModels].filter(Boolean))];
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
        messages: buildMessages(payload, knowledge),
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

module.exports = {
  callModel,
  constantTimeEqual,
  getConfig,
  isLoggedIn,
  readBody,
  sendJson,
  signToken
};
