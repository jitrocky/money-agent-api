// server.js
import express from "express";

const app = express();
app.use(express.json());

// ============ Config ============
const PORT = process.env.PORT || 8080;

// 必填：OpenAI 的 Secret Key（服务端环境变量）
// Cloud Run -> Variables & Secrets -> OPENAI_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 必填：你的工作流智能体 ID（wf_...）
// Cloud Run -> Variables & Secrets -> WORKFLOW_ID
const WORKFLOW_ID = process.env.WORKFLOW_ID;

// 选填：允许的站点来源（你的 WP 域名），不填就放开（不推荐）
// 例：https://aiguide.art
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

// ============ Basic checks ============
if (!OPENAI_API_KEY) {
  console.error("Missing env: OPENAI_API_KEY");
}
if (!WORKFLOW_ID) {
  console.error("Missing env: WORKFLOW_ID");
}

// ============ CORS ============
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // 如果你设置了 ALLOWED_ORIGIN，就只允许该来源
  if (ALLOWED_ORIGIN) {
    if (origin === ALLOWED_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
  } else {
    // 不设置则放开（上线不推荐）
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// ============ Helpers ============
async function openaiCreateSession({ user }) {
  // ChatKit sessions endpoint + OpenAI-Beta header
  // 文档示例就是在服务端请求 /v1/chatkit/sessions，并传 workflow.id 与 user。:contentReference[oaicite:2]{index=2}
  const resp = await fetch("https://api.openai.com/v1/chatkit/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "OpenAI-Beta": "chatkit_beta=v1",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      workflow: { id: WORKFLOW_ID },
      user: user || "wp-anon",
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(`OpenAI session create failed: ${resp.status} ${msg}`);
  }
  return data; // { client_secret, ... }
}

// ============ Routes ============

// 健康检查
app.get("/", (req, res) => res.status(200).send("ok"));

// 启动：给前端一个 client_secret
app.post("/api/chatkit/start", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    if (!WORKFLOW_ID) return res.status(500).json({ error: "Missing WORKFLOW_ID" });

    const user = req.body?.user || "wp-anon";
    const session = await openaiCreateSession({ user });

    return res.json({ client_secret: session.client_secret });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

// 刷新：当前 client_secret 过期时重新发一个
//（简单做法：直接再创建一个新 session 即可）
app.post("/api/chatkit/refresh", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    if (!WORKFLOW_ID) return res.status(500).json({ error: "Missing WORKFLOW_ID" });

    const user = req.body?.user || "wp-anon";
    const session = await openaiCreateSession({ user });

    return res.json({ client_secret: session.client_secret });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on :${PORT}`);
});
