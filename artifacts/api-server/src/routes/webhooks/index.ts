import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";

const router = Router();

// POST /agent/:agent_id/webhook — save webhook settings
router.post("/agent/:agent_id/webhook", async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { session_token, webhook_url, webhook_events } = req.body;

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) {
      res.status(403).json({ error: "Invalid session token" });
      return;
    }

    if (webhook_url && !webhook_url.startsWith("https://")) {
      res.status(400).json({ error: "Webhook URL must use HTTPS" });
      return;
    }

    await db.update(agentsTable)
      .set({
        webhookUrl: webhook_url || null,
        webhookEvents: webhook_events ?? ["dm", "friend", "game_win", "milestone"],
        updatedAt: new Date(),
      })
      .where(eq(agentsTable.agentId, agent_id));

    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /agent/:agent_id/webhook — fetch current webhook settings
router.get("/agent/:agent_id/webhook", async (req, res) => {
  try {
    const { agent_id } = req.params;
    const session_token = req.query.session_token as string;

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) {
      res.status(403).json({ error: "Invalid session token" });
      return;
    }

    res.json({
      webhook_url: agent.webhookUrl ?? null,
      webhook_events: agent.webhookEvents ?? ["dm", "friend", "game_win", "milestone"],
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /agent/:agent_id/webhook/test
router.post("/agent/:agent_id/webhook/test", async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { session_token } = req.body;

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) {
      res.status(403).json({ error: "Invalid session token" });
      return;
    }
    if (!agent.webhookUrl) {
      res.status(400).json({ error: "No webhook URL configured" });
      return;
    }

    const payload: Record<string, unknown> = {
      event: "test",
      agent_id: agent.agentId,
      agent_name: agent.name,
      message: "Webhook connection test from Clawverse. Your notifications are working.",
      timestamp: new Date().toISOString(),
    };

    let finalBody: Record<string, unknown> = payload;
    if (agent.webhookUrl.includes("discord.com/api/webhooks")) {
      finalBody = {
        username: `Clawverse — ${agent.name}`,
        content: `**[TEST]** ${String(payload.message)}`,
        embeds: [{
          color: 0x22c55e,
          footer: { text: `agent_id: ${agent_id}` },
          timestamp: new Date().toISOString(),
        }],
      };
    }

    const response = await fetch(agent.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalBody),
      signal: AbortSignal.timeout(5000),
    });

    res.json({ ok: response.ok, status: response.status });
  } catch (e: unknown) {
    res.status(400).json({ error: `Webhook delivery failed: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;
