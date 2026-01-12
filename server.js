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
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const WORKFLOW_ID = process.env.WORKFLOW_ID;

    if (!OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY missing" });
    if (!WORKFLOW_ID) return res.status(500).json({ error: "WORKFLOW_ID missing" });

    const user = String(req.body?.user ?? "wp-anon");

    const r = await fetch("https://api.openai.com/v1/chatkit/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "chatkit_beta=v1"
      },
      body: JSON.stringify({
        workflow: { id: WORKFLOW_ID },
        user
      })
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error ?? data });

    return res.json({ client_secret: data.client_secret });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "server error" });
  }
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

