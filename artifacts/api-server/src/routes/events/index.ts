import { Router } from "express";
import { db } from "@workspace/db";
import {
  planetEventsTable,
  eventParticipantsTable,
  agentsTable,
  agentActivityLogTable,
  agentFriendshipsTable,
  miniGamesTable,
} from "@workspace/db";
import { eq, and, gt, or, inArray, desc, gte } from "drizzle-orm";

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

// GET /events — world-feed summary for runner agents
router.get("/events", async (req, res) => {
  try {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString();

    const [
      { data: recentGames, error: gErr },
      { data: recentFriends, error: fErr },
      { data: recentMoves, error: mErr },
      { data: topAgents, error: aErr },
    ] = await Promise.all([
      db.select({
        winner_agent_id: miniGamesTable.winnerAgentId,
        title: miniGamesTable.title,
        stakes: miniGamesTable.stakes,
        creator_agent_id: miniGamesTable.creatorAgentId,
        opponent_agent_id: miniGamesTable.opponentAgentId,
        created_at: miniGamesTable.createdAt,
      })
        .from(miniGamesTable)
        .where(and(eq(miniGamesTable.status, "completed"), gte(miniGamesTable.createdAt, new Date(since))))
        .orderBy(desc(miniGamesTable.createdAt))
        .limit(10)
        .then(rows => ({ data: rows, error: null }))
        .catch(e => ({ data: [], error: e })),

      db.select({
        agent_id: agentFriendshipsTable.agentId,
        friend_agent_id: agentFriendshipsTable.friendAgentId,
        created_at: agentFriendshipsTable.createdAt,
      })
        .from(agentFriendshipsTable)
        .where(and(eq(agentFriendshipsTable.status, "accepted"), gte(agentFriendshipsTable.createdAt, new Date(since))))
        .limit(10)
        .then(rows => ({ data: rows, error: null }))
        .catch(e => ({ data: [], error: e })),

      db.select({
        agent_id: agentActivityLogTable.agentId,
        description: agentActivityLogTable.description,
        created_at: agentActivityLogTable.createdAt,
      })
        .from(agentActivityLogTable)
        .where(and(eq(agentActivityLogTable.actionType, "move"), gte(agentActivityLogTable.createdAt, new Date(since))))
        .orderBy(desc(agentActivityLogTable.createdAt))
        .limit(10)
        .then(rows => ({ data: rows, error: null }))
        .catch(e => ({ data: [], error: e })),

      db.select({
        agent_id: agentsTable.agentId,
        name: agentsTable.name,
        reputation: agentsTable.reputation,
        planet_id: agentsTable.planetId,
      })
        .from(agentsTable)
        .orderBy(desc(agentsTable.reputation))
        .limit(5)
        .then(rows => ({ data: rows, error: null }))
        .catch(e => ({ data: [], error: e })),
    ]);

    const allIds = new Set<string>();
    for (const g of (recentGames ?? [])) {
      if (g.winner_agent_id) allIds.add(g.winner_agent_id);
      if (g.creator_agent_id) allIds.add(g.creator_agent_id);
      if (g.opponent_agent_id) allIds.add(g.opponent_agent_id);
    }
    for (const f of (recentFriends ?? [])) {
      allIds.add(f.agent_id);
      allIds.add(f.friend_agent_id);
    }

    const nameMap: Record<string, string> = {};
    if (allIds.size > 0) {
      const names = await db.select({ agent_id: agentsTable.agentId, name: agentsTable.name })
        .from(agentsTable)
        .where(inArray(agentsTable.agentId, [...allIds]));
      for (const a of names) nameMap[a.agent_id] = a.name;
    }

    const events: { type: string; description: string; created_at: Date | null }[] = [];

    for (const g of (recentGames ?? [])) {
      if (g.winner_agent_id) {
        const winner = nameMap[g.winner_agent_id] ?? "Unknown";
        const loserId = g.winner_agent_id === g.creator_agent_id ? g.opponent_agent_id : g.creator_agent_id;
        const loser = loserId ? (nameMap[loserId] ?? "an opponent") : "an opponent";
        events.push({
          type: "game",
          description: `${winner} defeated ${loser} in "${g.title}" for ${g.stakes} rep`,
          created_at: g.created_at,
        });
      }
    }

    for (const f of (recentFriends ?? [])) {
      const a = nameMap[f.agent_id] ?? "Someone";
      const b = nameMap[f.friend_agent_id] ?? "someone";
      events.push({ type: "social", description: `${a} and ${b} became friends`, created_at: f.created_at });
    }

    for (const m of (recentMoves ?? [])) {
      if (m.description) {
        events.push({ type: "move", description: m.description, created_at: m.created_at });
      }
    }

    events.sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bt - at;
    });

    const leaderboard = (topAgents ?? [])
      .map((a, i) => `#${i + 1} ${a.name ?? "?"} (${a.reputation ?? 0} rep, ${a.planet_id ?? "??"})`)
      .join(" · ");

    res.json({
      events: events.slice(0, 20).map(e => ({
        type: e.type,
        description: e.description,
        created_at: e.created_at?.toISOString() ?? null,
      })),
      leaderboard,
      generated_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

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
