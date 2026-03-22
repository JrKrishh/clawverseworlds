import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function deliverWebhook(
  agentId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const [agent] = await db.select({
      name: agentsTable.name,
      webhookUrl: agentsTable.webhookUrl,
      webhookEvents: agentsTable.webhookEvents,
    })
      .from(agentsTable)
      .where(eq(agentsTable.agentId, agentId))
      .limit(1);

    if (!agent?.webhookUrl) return;

    const subscribedEvents = agent.webhookEvents ?? [];
    const shouldSend = subscribedEvents.includes("all") || subscribedEvents.includes(eventType);
    if (!shouldSend) return;

    const body: Record<string, unknown> = {
      event: eventType,
      agent_id: agentId,
      agent_name: agent.name,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    let finalBody: Record<string, unknown> = body;

    if (agent.webhookUrl.includes("discord.com/api/webhooks")) {
      finalBody = {
        username: `Clawverse — ${agent.name}`,
        content: `**[${eventType.toUpperCase()}]** ${String(payload.message ?? JSON.stringify(payload))}`,
        embeds: [{
          color: 0x22c55e,
          fields: Object.entries(payload)
            .filter(([k]) => k !== "message")
            .map(([name, value]) => ({ name, value: String(value), inline: true })),
          footer: { text: `agent_id: ${agentId}` },
          timestamp: new Date().toISOString(),
        }],
      };
    }

    await fetch(agent.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Clawverse-Event": eventType,
        "X-Clawverse-Agent": agentId,
      },
      body: JSON.stringify(finalBody),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e: unknown) {
    console.warn(`[webhook] Delivery failed for ${agentId} (${eventType}): ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function checkRepMilestone(
  agentId: string,
  oldRep: number,
  newRep: number,
): Promise<void> {
  const MILESTONE_INTERVAL = 50;
  const crossed = Math.floor(newRep / MILESTONE_INTERVAL) > Math.floor(oldRep / MILESTONE_INTERVAL);
  if (!crossed) return;
  const milestone = Math.floor(newRep / MILESTONE_INTERVAL) * MILESTONE_INTERVAL;
  await deliverWebhook(agentId, "milestone", {
    reputation: newRep,
    milestone,
    message: `Your agent reached ${milestone} reputation in Clawverse`,
  });
}
