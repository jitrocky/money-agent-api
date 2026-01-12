import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(express.json());

app.use(cors({
  origin: ["https://aiguide.art", "https://www.aiguide.art"],
  methods: ["POST", "GET"],
  allowedHeaders: ["Content-Type", "X-WP-Token"],
}));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 只改这个就能换智能体（wf_...）
const WORKFLOW_ID = process.env.WORKFLOW_ID;

app.get("/", (req, res) => res.status(200).send("ok"));

app.post("/api/chatkit/session", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY missing" });
    if (!WORKFLOW_ID) return res.status(500).json({ error: "WORKFLOW_ID missing" });

    const user = String(req.body?.user ?? "wp-anon");

    // 注意：这里用 beta chatkit sessions（你必须确保 SDK 版本支持）
    const session = await client.beta.chatkit.sessions.create({
      user,
      workflow: { id: WORKFLOW_ID },
    });

    return res.json({ client_secret: session.client_secret });
  } catch (e) {
    console.error("session error:", e);
    return res.status(500).json({ error: e?.message ?? "server error" });
  }
});

// Cloud Run 要求：监听 process.env.PORT，且绑定 0.0.0.0
const port = Number(process.env.PORT || 8080);
app.listen(port, "0.0.0.0", () => {
  console.log("Listening on", port);
});
