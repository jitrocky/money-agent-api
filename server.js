import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { fileSearchTool, Agent, Runner, withTrace } from "@openai/agents";

const app = express();
app.use(express.json());

/**
 * CORS：只允许你的 WordPress 域名访问
 * 如果后面有 staging / 测试站，再加进数组即可
 */
app.use(
  cors({
    origin: ["https://aiguide.art", "https://www.aiguide.art"],
    methods: ["POST", "GET"],
  })
);

/**
 * 基础限流，防止被刷爆 OpenAI 账单
 */
app.use(
  "/api/chat",
  rateLimit({
    windowMs: 60 * 1000,
    max: 20, // 每分钟 20 次
  })
);

/**
 * 健康检查（Cloud Run 必须有）
 */
app.get("/", (req, res) => {
  res.status(200).send("ok");
});

/**
 * Vector Store Tool
 */
const fileSearch = fileSearchTool([
  "vs_69650973238c8191b66cc80db354d760",
]);

/**
 * Agent 定义
 */
const myAgent = new Agent({
  name: "How Money Works Agent",
  instructions: `
You are a financial education assistant.

Your role is to answer questions strictly based on the attached document “How Money Works”.
If the answer is not found in the document, clearly say:
“This information is not covered in the document.”

Guidelines:
- Be accurate and concise.
- Use simple language suitable for non-professionals.
- When helpful, summarize key points in bullet form.
- If the user asks in Chinese, answer in Chinese.
- If the user asks in English, answer in English.
- Do not invent facts.
- Do not give personal financial advice.
`,
  model: "gpt-4o-mini",
  tools: [fileSearch],
  modelSettings: {
    temperature: 1,
    topP: 1,
    maxTokens: 2048,
    store: true,
  },
});

/**
 * 主聊天接口：给 WordPress 调用
 */
app.post("/api/chat", async (req, res) => {
  try {
    const inputText = String(req.body?.message ?? "").trim();
    if (!inputText) {
      return res.status(400).json({ error: "message is required" });
    }

    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "wp-gateway",
        workflow_id:
          "wf_69650f15f0208190b79a63c7da3f51010f0eefa8f6a01396",
      },
    });

    const result = await withTrace("钱如何为你工作", async () => {
      const run = await runner.run(myAgent, [
        {
          role: "user",
          content: [{ type: "input_text", text: inputText }],
        },
      ]);
      return run.finalOutput ?? "";
    });

    return res.json({ text: result });
  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({
      error: err?.message || "Internal server error",
    });
  }
});

/**
 * Cloud Run 端口（必须这样写）
 */
const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`Agent API listening on port ${port}`);
});

// server.js 里：import 下面加上（Node18+ 自带 fetch，如无则 npm i undici）
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WORKFLOW_ID = "wf_69650f15f0208190b79a63c7da3f51010f0eefa8f6a01396";

// 可选：给 WP 调用加一个简单的共享密钥，防止别人盗用你接口
const WP_SHARED_TOKEN = process.env.WP_SHARED_TOKEN; // 自己设一个随机串

app.post("/api/chatkit/session", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY missing" });

    // 可选防盗用：WP 请求必须带这个 header
    if (WP_SHARED_TOKEN) {
      const token = req.header("X-WP-Token");
      if (token !== WP_SHARED_TOKEN) return res.status(401).json({ error: "Unauthorized" });
    }

    // user 字段建议传一个稳定的匿名 id（比如设备 id / wp 用户 id / cookie id）
    const user = String(req.body?.user ?? "anon");

    const r = await fetch("https://api.openai.com/v1/chatkit/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "OpenAI-Beta": "chatkit_beta=v1",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        workflow: { id: WORKFLOW_ID },
        user,
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error ?? data });

    // 返回 client_secret 给前端（短时有效，适合放浏览器）
    return res.json({ client_secret: data.client_secret });
  } catch (e) {
    return res.status(500).json({ error: e?.message ?? "server error" });
  }
});
