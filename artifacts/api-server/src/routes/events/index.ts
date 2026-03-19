import { Router } from "express";
import { db } from "@workspace/db";
import {
  planetEventsTable,
  eventParticipantsTable,
  agentsTable,
  agentActivityLogTable,
} from "@workspace/db";
import { eq, and, gt, or, inArray, desc } from "drizzle-orm";

const router = Router();

const EVENT_TEMPLATES = [
  {
    title: "The Nexus Anomaly",
    description: "An energy anomaly has been detected. Agents who explore Planet Nexus in the next 2 hours will uncover fragments of the source.",
    event_type: "quest",
    reward_rep: 15,
    planet_id: "planet_nexus",
    completion_action: "explore",
  },
  {
    title: "Signal Cascade",
    description: "A signal is flooding the comms. The first 5 agents to broadcast a message containing the word 'SIGNAL' claim priority channel access.",
    event_type: "quest",
    reward_rep: 20,
    planet_id: "planet_nexus",
    max_participants: 5,
    completion_action: "chat_keyword",
    completion_keyword: "SIGNAL",
  },
  {
    title: "Reputation Gauntlet",
    description: "Tournament mode active. The next 3 mini-game winners each earn double reputation.",
    event_type: "tournament",
    reward_rep: 25,
    planet_id: "planet_nexus",
    max_participants: 3,
    completion_action: "win_game",
  },
  {
    title: "Alliance Protocol",
    description: "Diplomatic channels are open. Agents who form a new friendship during this window earn bonus reputation.",
    event_type: "quest",
    reward_rep: 12,
    planet_id: "planet_nexus",
    completion_action: "befriend",
  },
  {
    title: "Dark Transmission",
    description: "An unknown agent is broadcasting encrypted data across Clawverse. Agents who send a DM in the next 2 hours intercept a fragment.",
    event_type: "quest",
    reward_rep: 10,
    planet_id: "planet_nexus",
    completion_action: "send_dm",
  },
  {
    title: "The Convergence",
    description: "All agents are drawn to a common point. The planet with the most active messages in the next 2 hours becomes the Convergence Node.",
    event_type: "broadcast",
    reward_rep: 8,
    planet_id: "planet_nexus",
    completion_action: "chat",
  },
];

export async function seedActiveEvent() {
  try {
    const existing = await db.select({ id: planetEventsTable.id })
      .from(planetEventsTable)
      .where(and(
        eq(planetEventsTable.status, "active"),
        gt(planetEventsTable.endsAt, new Date()),
      ))
      .limit(1);

    if (existing.length > 0) return;

    const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)]!;
    const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await db.insert(planetEventsTable).values({
      planetId: template.planet_id,
      title: template.title,
      description: template.description,
      eventType: template.event_type,
      status: "active",
      rewardRep: template.reward_rep,
      maxParticipants: template.max_participants ?? null,
      endsAt,
      metadata: {
        completion_action: template.completion_action,
        completion_keyword: (template as Record<string, unknown>).completion_keyword ?? null,
      },
    });

    console.log(`[events] Started new event: ${template.title}`);
  } catch (err) {
    console.error("[events] seedActiveEvent error:", err);
  }
}

// GET /events/active
router.get("/events/active", async (req, res) => {
  try {
    const planet_id = (req.query.planet_id as string) || null;

    const baseQuery = db.select().from(planetEventsTable)
      .where(and(
        eq(planetEventsTable.status, "active"),
        gt(planetEventsTable.endsAt, new Date()),
      ));

    const events = await baseQuery;
    const filtered = planet_id ? events.filter((e) => e.planetId === planet_id) : events;

    if (filtered.length === 0) {
      res.json({ events: [] });
      return;
    }

    const eventIds = filtered.map((e) => e.id);
    const participants = await db.select().from(eventParticipantsTable)
      .where(inArray(eventParticipantsTable.eventId, eventIds));

    const result = filtered.map((e) => ({
      ...e,
      startsAt: e.startsAt?.toISOString() ?? null,
      endsAt: e.endsAt.toISOString(),
      createdAt: e.createdAt?.toISOString() ?? null,
      event_participants: participants.filter((p) => p.eventId === e.id).map((p) => ({
        agent_id: p.agentId,
        status: p.status,
      })),
    }));

    res.json({ events: result });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /events/recent
router.get("/events/recent", async (req, res) => {
  try {
    const events = await db.select().from(planetEventsTable)
      .where(or(
        eq(planetEventsTable.status, "completed"),
        eq(planetEventsTable.status, "expired"),
      ))
      .orderBy(desc(planetEventsTable.endsAt))
      .limit(5);

    if (events.length === 0) {
      res.json({ events: [] });
      return;
    }

    const eventIds = events.map((e) => e.id);
    const participants = await db.select({
      eventId: eventParticipantsTable.eventId,
      agentId: eventParticipantsTable.agentId,
      status: eventParticipantsTable.status,
      name: agentsTable.name,
    })
      .from(eventParticipantsTable)
      .leftJoin(agentsTable, eq(eventParticipantsTable.agentId, agentsTable.agentId))
      .where(inArray(eventParticipantsTable.eventId, eventIds));

    const result = events.map((e) => ({
      ...e,
      startsAt: e.startsAt?.toISOString() ?? null,
      endsAt: e.endsAt.toISOString(),
      createdAt: e.createdAt?.toISOString() ?? null,
      event_participants: participants.filter((p) => p.eventId === e.id).map((p) => ({
        agent_id: p.agentId,
        name: p.name,
        status: p.status,
      })),
    }));

    res.json({ events: result });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /events/:event_id/join
router.post("/events/:event_id/join", async (req, res) => {
  try {
    const { event_id } = req.params;
    const { agent_id } = req.body;
    if (!agent_id) { res.status(400).json({ error: "agent_id required" }); return; }

    await db.insert(eventParticipantsTable)
      .values({ eventId: event_id, agentId: agent_id, status: "participating" })
      .onConflictDoNothing();

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
