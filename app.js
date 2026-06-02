const categories = [
  {
    id: "visual",
    icon: "视",
    title: "AI视觉提示词",
    desc: "图片、海报、商品图",
    kicker: "把视觉想法整理成完整、稳定、可复制的 AI 视觉提示词。",
    tags: ["主体", "场景", "镜头", "光影", "负面约束"],
    task: "帮我写一组 AI 视觉提示词"
  },
  {
    id: "video",
    icon: "影",
    title: "AI视频提示词",
    desc: "Seedance / Higgsfield",
    kicker: "面向视频模型输出完整镜头、动作、运镜、时长和画幅说明。",
    tags: ["Seedance", "Higgsfield", "动作过程", "运镜", "时长"],
    task: "帮我写一组 AI 视频提示词"
  },
  {
    id: "viral",
    icon: "爆",
    title: "短视频爆款脚本",
    desc: "抖音、小红书、口播",
    kicker: "从用户痛点、开头钩子、节奏和转化目标生成短视频脚本。",
    tags: ["钩子", "痛点", "节奏", "转折", "结尾行动"],
    task: "帮我写一个短视频爆款脚本"
  },
  {
    id: "ecommerce",
    icon: "商",
    title: "电商广告视频",
    desc: "产品卖点与转化",
    kicker: "把产品、卖点、人群和场景组织成更容易转化的广告视频方案。",
    tags: ["产品", "卖点", "人群", "转化", "千川"],
    task: "帮我写一个电商广告视频脚本"
  },
  {
    id: "storyboard",
    icon: "镜",
    title: "分镜故事板",
    desc: "多镜头拆解",
    kicker: "把一个创意拆成多镜头故事板，每一镜都能独立复制使用。",
    tags: ["镜头编号", "画面", "动作", "景别", "提示词"],
    task: "帮我生成分镜故事板和每镜提示词"
  },
  {
    id: "ancient",
    icon: "古",
    title: "古风女频短剧",
    desc: "人物、情绪、场景",
    kicker: "面向古风女频短剧，强化人物身份、情绪张力和戏剧场面。",
    tags: ["古风", "女频", "人物", "情绪", "戏剧冲突"],
    task: "帮我写一个古风女频短剧分镜方案"
  },
  {
    id: "diagnosis",
    icon: "诊",
    title: "失败诊断优化",
    desc: "提示词与成片问题",
    kicker: "分析失败原因，给出可执行的重写版本和迭代方向。",
    tags: ["失败原因", "问题定位", "重写", "负面约束", "迭代"],
    task: "帮我诊断并优化这段提示词或脚本"
  },
  {
    id: "materials",
    icon: "库",
    title: "素材库分析",
    desc: "人群需求与选题",
    kicker: "从素材、账号、人群需求中提炼选题、脚本方向和内容策略。",
    tags: ["素材", "人群", "选题", "账号", "策略"],
    task: "帮我分析素材库并提炼内容策略"
  }
];

const loginView = document.querySelector("#loginView");
const appShell = document.querySelector("#appShell");
const loginForm = document.querySelector("#loginForm");
const loginStatus = document.querySelector("#loginStatus");
const passwordInput = document.querySelector("#passwordInput");
const logoutBtn = document.querySelector("#logoutBtn");
const navList = document.querySelector("#navList");
const pageTitle = document.querySelector("#pageTitle");
const pageKicker = document.querySelector("#pageKicker");
const tagRow = document.querySelector("#tagRow");
const promptForm = document.querySelector("#promptForm");
const outputText = document.querySelector("#outputText");
const copyPromptBtn = document.querySelector("#copyPromptBtn");
const copyRouteBtn = document.querySelector("#copyRouteBtn");
const clearBtn = document.querySelector("#clearBtn");
const generateBtn = document.querySelector("#generateBtn");
const resultMeta = document.querySelector("#resultMeta");

const fields = {
  need: document.querySelector("#needInput"),
  platform: document.querySelector("#platformInput"),
  ratio: document.querySelector("#ratioInput"),
  duration: document.querySelector("#durationInput"),
  style: document.querySelector("#styleInput"),
  extra: document.querySelector("#extraInput")
};

let activeCategory = getCategoryFromHash();

function getCategoryFromHash() {
  const hash = window.location.hash.replace("#", "");
  return categories.find((category) => category.id === hash) || categories[0];
}

function renderNav() {
  navList.innerHTML = categories
    .map(
      (category) => `
        <button class="nav-item" type="button" data-id="${category.id}">
          <span class="nav-icon">${category.icon}</span>
          <span>
            <span class="nav-title">${category.title}</span>
            <span class="nav-desc">${category.desc}</span>
          </span>
        </button>
      `
    )
    .join("");
}

function renderCategory() {
  pageTitle.textContent = activeCategory.title;
  pageKicker.textContent = activeCategory.kicker;
  tagRow.innerHTML = activeCategory.tags.map((tag) => `<span>${tag}</span>`).join("");

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.id === activeCategory.id);
  });
}

function getPayload() {
  return {
    categoryId: activeCategory.id,
    categoryTitle: activeCategory.title,
    task: activeCategory.task,
    need: fields.need.value.trim(),
    platform: fields.platform.value,
    ratio: fields.ratio.value,
    duration: fields.duration.value.trim(),
    style: fields.style.value.trim(),
    extra: fields.extra.value.trim()
  };
}

function previewPrompt() {
  const payload = getPayload();
  return `分工窗口：${payload.categoryTitle}
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
}

function saveState() {
  const data = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
  localStorage.setItem("aiMasterWorkbench", JSON.stringify(data));
}

function restoreState() {
  const saved = localStorage.getItem("aiMasterWorkbench");
  if (!saved) return;

  try {
    const data = JSON.parse(saved);
    Object.entries(fields).forEach(([key, field]) => {
      if (typeof data[key] === "string") field.value = data[key];
    });
    if (!fields.platform.value || fields.platform.value === "不指定") {
      fields.platform.value = "gpt-5.5";
    }
  } catch {
    localStorage.removeItem("aiMasterWorkbench");
  }
}

function showApp() {
  loginView.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
  outputText.value = previewPrompt();
  resultMeta.textContent = "预览请求";
}

function showLogin() {
  appShell.classList.add("is-hidden");
  loginView.classList.remove("is-hidden");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function checkLogin() {
  try {
    const data = await api("/api/me");
    if (data.loggedIn) {
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

async function copyText(text, button, doneText) {
  await navigator.clipboard.writeText(text);
  const oldText = button.textContent;
  button.textContent = doneText;
  window.setTimeout(() => {
    button.textContent = oldText;
  }, 1200);
}

renderNav();
restoreState();
renderCategory();
checkLogin();

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "正在验证...";

  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: passwordInput.value })
    });
    passwordInput.value = "";
    loginStatus.textContent = "";
    showApp();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  showLogin();
});

navList.addEventListener("click", (event) => {
  const button = event.target.closest(".nav-item");
  if (!button) return;
  activeCategory = categories.find((category) => category.id === button.dataset.id);
  window.location.hash = activeCategory.id;
  renderCategory();
  outputText.value = previewPrompt();
  resultMeta.textContent = "预览请求";
});

window.addEventListener("hashchange", () => {
  activeCategory = getCategoryFromHash();
  renderCategory();
});

promptForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveState();
  generateBtn.disabled = true;
  generateBtn.textContent = "生成中...";
  resultMeta.textContent = "正在调用 AI";
  outputText.value = "正在读取 ai大师 知识库并调用模型，请稍等...";

  try {
    const result = await api("/api/generate", {
      method: "POST",
      body: JSON.stringify(getPayload())
    });
    outputText.value = result.text || "模型没有返回内容。";
    resultMeta.textContent = `模型：${result.model}｜知识库片段：${result.knowledgeChars} 字`;
  } catch (error) {
    outputText.value = `出错了：${error.message}`;
    resultMeta.textContent = "生成失败";
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "提交给 AI";
  }
});

Object.values(fields).forEach((field) => {
  field.addEventListener("input", () => {
    saveState();
    outputText.value = previewPrompt();
    resultMeta.textContent = "预览请求";
  });
  field.addEventListener("change", () => {
    saveState();
    outputText.value = previewPrompt();
    resultMeta.textContent = "预览请求";
  });
});

clearBtn.addEventListener("click", () => {
  fields.need.value = "";
  fields.platform.value = "gpt-5.5";
  fields.ratio.value = "9:16";
  fields.duration.value = "";
  fields.style.value = "";
  fields.extra.value = "";
  outputText.value = previewPrompt();
  resultMeta.textContent = "预览请求";
  saveState();
});

copyPromptBtn.addEventListener("click", () => {
  copyText(outputText.value, copyPromptBtn, "已复制");
});

copyRouteBtn.addEventListener("click", () => {
  copyText(window.location.href, copyRouteBtn, "已复制网址");
});
