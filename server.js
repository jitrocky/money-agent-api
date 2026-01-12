/**
 * Final server.js for Cloud Run + WordPress ChatKit
 * - Stable: listens on process.env.PORT
 * - Provides ChatKit session endpoint returning client_secret
 * - Optional fallback chat endpoint
 *
 * Required ENV:
 *   OPENAI_API_KEY=sk-...
 *   WORKFLOW_ID=wf_...
 *
 * Optional ENV:
 *   ALLOWED_ORIGINS=https://aiguide.art,https://www.aiguide.art
 *   WP_SHARED_TOKEN=some-long-random-string   (if set, require X-Shared-Token)
 */

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
app.use(express.json({ limit: "1mb" }));

// ---- Config ----
const PORT = Number(process.env.PORT || 8080);
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const WORKFLOW_ID = String(process.env.WORKFLOW_ID || "").trim();

const ALLOWED_ORIGINS = String(
  process.env.ALLOWED_ORIGINS || "https://aiguide.art,https://www.aiguide.art"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const WP_SHARED_TOKEN = String(process.env.WP_SHARED_TOKEN || "").trim();

// ---- Basic health endpoints (so container always starts) ----
app.get("/", (req, res) => res.status(200).send("ok"));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    has_openai_key: Boolean(OPENAI_API_KEY),
    workflow_id_set: Boolean(WORKFLOW_ID),
    port: PORT,
  });
});

// ---- CORS (WP only) ----
app.use(
  cors({
    origin: function (origin, cb) {
      // allow non-browser calls (curl/no origin)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Shared-Token"],
  })
);

// ---- Optional shared token protection (recommended) ----
function requireSharedToken(req, res, next) {
  if (!WP_SHARED_TOKEN) return next(); // not enabled
  const incoming = String(req.header("X-Shared-Token") || "");
  if (incoming && incoming === WP_SHARED_TOKEN) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// ---- Rate limit (protect your bill) ----
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 requests/min per IP
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// 1) ChatKit: create session -> return client_secret to frontend
// ============================================================
app.post(
  "/api/chatkit/session",
  limiter,
  requireSharedToken,
  async (req, res) => {
    try {
      if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY missing" });
      }
      if (!WORKFLOW_ID) {
        return res.status(500).json({ error: "WORKFLOW_ID missing" });
      }

      // You can pass a user id from WP, or default:
      const user = String(req.body?.user ?? "wp-anon").slice(0, 200);

      // IMPORTANT:
      // Do NOT use client.beta.chatkit.sessions (SDK mismatch prone).
      // Call the REST endpoint directly.
      const r = await fetch("https://api.openai.com/v1/chatkit/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "chatkit_beta=v1",
        },
        body: JSON.stringify({
          workflow: { id: WORKFLOW_ID },
          user,
        }),
      });

      const data = await r.json();
      if (!r.ok) {
        console.error("chatkit session error:", data);
        return res.status(r.status).json({ error: data?.error ?? data });
      }

      // Expected: { id, client_secret, ... }
      return res.json({ client_secret: data.client_secret });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: e?.message ?? "server error" });
    }
  }
);

// ============================================================
// 2) Optional fallback: simple chat endpoint (not ChatKit UI)
//    Useful for debugging quickly from curl/Postman.
// ============================================================
app.post("/api/chat", limiter, requireSharedToken, async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing" });
    }

    const message = String(req.body?.message ?? "").trim();
    if (!message) return res.status(400).json({ error: "message is required" });

    // If you want this endpoint to also run your workflow,
    // you should implement OpenAI Responses/Agents call here.
    // To keep this file minimal & stable, we return a placeholder:
    return res.json({
      text:
        "This /api/chat endpoint is for debugging only. Use ChatKit session + ChatKit UI for your workflow agent.",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "server error" });
  }
});

// ---- Start server (Cloud Run needs 0.0.0.0) ----
app.listen(PORT, "0.0.0.0", () => {
  console.log("Listening on", PORT);
  console.log("Allowed origins:", ALLOWED_ORIGINS);
});
