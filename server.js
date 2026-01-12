import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
app.use(express.json());

// 只允许你的 WP 域名访问
app.use(cors({
  origin: ["https://aiguide.art", "https://www.aiguide.art"],
  methods: ["POST", "GET"],
  allowedHeaders: ["Content-Type", "X-WP-Token"],
}));

// 防刷
app.use("/api/", rateLimit({
  windowMs: 60 * 1000,
  max: 60,
}));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WP_SHARED_TOKEN = process.env.WP_SHARED_TOKEN; // 可选但强烈建议

// 健康检查
app.get("/", (req, res) => res.send("ok"));

// 核心：WP 调这个接口拿回答
app.post("/api/chat", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY missing" });

    // 可选：简单鉴权，防止别人盗用你的 API
    if (WP_SHARED_TOKEN) {
      const token = req.header("X-WP-Token");
      if (token !== WP_SHARED_TOKEN) return res.status(401).json({ error: "Unauthorized" });
    }

    const message = String(req.body?.message ?? "").trim();
    if (!message) return res.status(400).json({ error: "message is required" });

    // 这里用 Responses API 直接生成回答（最省事）
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
`You are a financial education assistant.

Answer questions strictly based on the attached document “How Money Works”.
If the answer is not found in the document, say: “This information is not covered in the document.”

Guidelines:
- Be accurate and concise.
- Use simple language suitable for non-professionals.
- When helpful, summarize key points in bullet form.
- If the user asks in Chinese, answer in Chinese.
- If the user asks in English, answer in English.
- Do not invent facts.
- Do not give personal financial advice.`
              }
            ]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: message }]
          }
        ],
        max_output_tokens: 800,
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error ?? data });

    // 兼容返回：优先 output_text（多数情况下有）
    const text = data.output_text ?? "";
    return res.json({ text });

  } catch (e) {
    return res.status(500).json({ error: e?.message ?? "server error" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Listening on ${port}`));
