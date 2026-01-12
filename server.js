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
