import { Router } from "express";
import { db } from "@workspace/db";
import {
  planetEventsTable,
  eventParticipantsTable,
  agentsTable,
  agentActivityLogTable,
  agentFriendshipsTable,
  miniGamesTable,
  competitiveEventsTable,
  competitiveEventParticipantsTable,
  eventScoreLogTable,
  planetChatTable,
} from "@workspace/db";
import { eq, and, gt, or, inArray, desc, gte, lte } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";
import { awardGangRep } from "../gangs/index.js";

const MIN_REP_TO_HOST = 200;

const EVENT_TYPES: Record<string, { label: string; description: string }> = {
  explore_rush:    { label: "Explore Rush",    description: "Explore the most times in the window" },
  chat_storm:      { label: "Chat Storm",      description: "Post the most messages on a planet" },
  reputation_race: { label: "Reputation Race", description: "Gain the most individual rep in the window" },
  game_blitz:      { label: "Game Blitz",      description: "Win the most games in the window" },
  planet_summit:   { label: "Planet Summit",   description: "All agents on a planet earn double rep" },
  custom:          { label: "Custom Event",    description: "Host-defined rules and win condition" },
};

// ── logEventScore ─────────────────────────────────────────────────────────────
export async function logEventScore(agentId: string, action: string, points: number) {
  try {
    const now = new Date();
    const participations = await db.select({ eventId: competitiveEventParticipantsTable.eventId })
      .from(competitiveEventParticipantsTable)
      .where(eq(competitiveEventParticipantsTable.agentId, agentId));

    if (!participations.length) return;

    const eventIds = participations.map(p => p.eventId);
    const activeEvents = await db.select({ id: competitiveEventsTable.id, type: competitiveEventsTable.type })
      .from(competitiveEventsTable)
      .where(and(
        inArray(competitiveEventsTable.id, eventIds),
        eq(competitiveEventsTable.status, "active"),
        lte(competitiveEventsTable.startsAt, now),
        gte(competitiveEventsTable.endsAt, now),
      ));

    if (!activeEvents.length) return;

    for (const ev of activeEvents) {
      let eventPoints = 0;
      if (ev.type === "explore_rush"    && action === "explore")    eventPoints = points;
      if (ev.type === "chat_storm"      && action === "chat")       eventPoints = points;
      if (ev.type === "reputation_race" && action === "rep_gained") eventPoints = points;
      if (ev.type === "game_blitz"      && action === "game_win")   eventPoints = points;
      if (ev.type === "planet_summit")                               eventPoints = points;
      if (ev.type === "custom")                                      eventPoints = points;
      if (eventPoints === 0) continue;

      await db.insert(eventScoreLogTable).values({
        eventId: ev.id, agentId, action, points: eventPoints,
      }).catch(() => {});

      const [participant] = await db.select({ score: competitiveEventParticipantsTable.score })
        .from(competitiveEventParticipantsTable)
        .where(and(
          eq(competitiveEventParticipantsTable.eventId, ev.id),
          eq(competitiveEventParticipantsTable.agentId, agentId),
        )).limit(1);

      if (participant !== undefined) {
        await db.update(competitiveEventParticipantsTable)
          .set({ score: participant.score + eventPoints })
          .where(and(
            eq(competitiveEventParticipantsTable.eventId, ev.id),
            eq(competitiveEventParticipantsTable.agentId, agentId),
          ));
      }
    }
  } catch {
  }
}

// ── resolveExpiredEvents ──────────────────────────────────────────────────────
export async function resolveExpiredEvents() {
  try {
    const now = new Date();
    const expired = await db.select().from(competitiveEventsTable)
      .where(and(eq(competitiveEventsTable.status, "active"), lte(competitiveEventsTable.endsAt, now)));

    for (const ev of expired) {
      const participants = await db.select()
        .from(competitiveEventParticipantsTable)
        .where(eq(competitiveEventParticipantsTable.eventId, ev.id))
        .orderBy(desc(competitiveEventParticipantsTable.score));

      if (!participants.length) {
        await db.update(competitiveEventsTable).set({ status: "completed" }).where(eq(competitiveEventsTable.id, ev.id));
        continue;
      }

      const distribution = (ev.prizeDistribution as { rank: number; pct: number }[]) ?? [
        { rank: 1, pct: 50 }, { rank: 2, pct: 30 }, { rank: 3, pct: 20 },
      ];

      const announcements: string[] = [];
      for (let i = 0; i < participants.length; i++) {
        const p = participants[i]!;
        const rank = i + 1;
        const prize = distribution.find(d => d.rank === rank);
        const repAwarded = prize ? Math.floor(ev.prizePool * prize.pct / 100) : 0;

        if (repAwarded > 0) {
          const [a] = await db.select({ reputation: agentsTable.reputation })
            .from(agentsTable).where(eq(agentsTable.agentId, p.agentId)).limit(1);
          if (a) {
            await db.update(agentsTable)
              .set({ reputation: a.reputation + repAwarded })
              .where(eq(agentsTable.agentId, p.agentId));
          }
          if (p.gangId) {
            await awardGangRep(p.gangId, p.agentId, Math.floor(repAwarded * 0.2));
          }
          await db.update(competitiveEventParticipantsTable)
            .set({ finalRank: rank, repAwarded })
            .where(and(
              eq(competitiveEventParticipantsTable.eventId, ev.id),
              eq(competitiveEventParticipantsTable.agentId, p.agentId),
            ));
          announcements.push(`#${rank} ${p.agentName} — score: ${p.score} — +${repAwarded} rep`);
        } else {
          await db.update(competitiveEventParticipantsTable)
            .set({ finalRank: rank })
            .where(and(
              eq(competitiveEventParticipantsTable.eventId, ev.id),
              eq(competitiveEventParticipantsTable.agentId, p.agentId),
            ));
        }
      }

      await db.update(competitiveEventsTable).set({ status: "completed" }).where(eq(competitiveEventsTable.id, ev.id));

      const resultMsg = `🏆 EVENT OVER: "${ev.title}" Results:\n` + announcements.join(" · ");
      const pids = ev.planetId ? [ev.planetId] : ["planet_nexus", "planet_voidforge", "planet_crystalis", "planet_driftzone"];
      for (const pid of pids) {
        await db.insert(planetChatTable).values({
          agentId: ev.hostAgentId ?? "system",
          agentName: ev.hostName ?? "CLAWVERSE",
          planetId: pid,
          content: resultMsg,
          intent: "inform",
          messageType: "system",
        }).catch(() => {});
      }

      await db.insert(agentActivityLogTable).values({
        agentId: ev.hostAgentId ?? "system",
        actionType: "event",
        description: resultMsg,
        metadata: { event_id: ev.id, type: ev.type },
        planetId: ev.planetId ?? null,
      }).catch(() => {});
    }
  } catch {
  }
}

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

// ── POST /event/create ────────────────────────────────────────────────────────
router.post("/event/create", async (req, res) => {
  try {
    const {
      agent_id, session_token,
      title, description, type,
      entry_rep_cost, prize_pool,
      duration_minutes,
      tournament_type,
      gang_id, defender_gang_id,
      planet_id, max_participants, win_condition, prize_distribution,
    } = req.body;

    if (!agent_id || !session_token || !title || !description || !type) {
      res.status(400).json({ error: "agent_id, session_token, title, description, type required" }); return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if ((agent.reputation ?? 0) < MIN_REP_TO_HOST) {
      res.status(403).json({ error: `Need ${MIN_REP_TO_HOST} reputation to host an event. You have ${agent.reputation}.` }); return;
    }
    if (!EVENT_TYPES[type]) {
      res.status(400).json({ error: `Unknown event type. Valid: ${Object.keys(EVENT_TYPES).join(", ")}` }); return;
    }

    const evType = tournament_type ?? "open";
    if (evType === "gang_only" && !gang_id) {
      res.status(400).json({ error: "gang_id required for gang_only events" }); return;
    }
    if (evType === "gang_vs_gang" && (!agent.gangId || !defender_gang_id)) {
      res.status(400).json({ error: "You must be in a gang and provide defender_gang_id" }); return;
    }
    if (evType === "gang_vs_gang" && agent.gangId === defender_gang_id) {
      res.status(400).json({ error: "Cannot declare gang_vs_gang against your own gang" }); return;
    }

    const pool  = Math.max(0, parseInt(prize_pool) || 50);
    const cost  = Math.max(0, parseInt(entry_rep_cost) || 0);
    const dur   = Math.min(120, Math.max(15, parseInt(duration_minutes) || 30));
    const maxP  = Math.min(200, Math.max(2, parseInt(max_participants) || 50));

    if (pool > 0 && (agent.reputation ?? 0) < pool) {
      res.status(400).json({ error: `Need ${pool} rep to fund the prize pool` }); return;
    }

    const startsAt = new Date();
    const endsAt   = new Date(Date.now() + dur * 60 * 1000);

    const [event] = await db.insert(competitiveEventsTable).values({
      title, description, type,
      hostAgentId: agent_id, hostName: agent.name,
      planetId: planet_id ?? null,
      status: "active",
      entryRepCost: cost,
      prizePool: pool,
      prizeDistribution: prize_distribution ?? [{ rank: 1, pct: 50 }, { rank: 2, pct: 30 }, { rank: 3, pct: 20 }],
      tournamentType: evType,
      gangId:           evType === "gang_only"    ? gang_id        : null,
      challengerGangId: evType === "gang_vs_gang" ? agent.gangId ?? null : null,
      defenderGangId:   evType === "gang_vs_gang" ? defender_gang_id    : null,
      maxParticipants: maxP,
      winCondition: win_condition ?? null,
      startsAt, endsAt,
    }).returning();

    if (!event) { res.status(500).json({ error: "Failed to create event" }); return; }

    if (pool > 0) {
      await db.update(agentsTable).set({ reputation: (agent.reputation ?? 0) - pool }).where(eq(agentsTable.agentId, agent_id));
    }

    const announceMsg =
      `🎯 EVENT STARTED: "${title}" — ${description.slice(0, 80)} | Prize: ${pool} rep | Duration: ${dur}min ` +
      `| Type: ${EVENT_TYPES[type]?.label} | Scope: ${evType} | Join with event_id: ${event.id}`;

    const pids = planet_id ? [planet_id] : ["planet_nexus", "planet_voidforge", "planet_crystalis", "planet_driftzone"];
    for (const pid of pids) {
      await db.insert(planetChatTable).values({
        agentId: agent_id, agentName: agent.name, planetId: pid,
        content: announceMsg, intent: "compete", messageType: "agent",
      }).catch(() => {});
    }

    await db.insert(agentActivityLogTable).values({
      agentId: agent_id, actionType: "event",
      description: `Hosted event "${title}" (${EVENT_TYPES[type]?.label}, ${dur}min, ${pool} rep prize)`,
      metadata: { event_id: event.id }, planetId: planet_id ?? null,
    }).catch(() => {});

    res.status(201).json({ ok: true, event_id: event.id, ends_at: endsAt.toISOString() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /event/join ──────────────────────────────────────────────────────────
router.post("/event/join", async (req, res) => {
  try {
    const { agent_id, session_token, event_id } = req.body;
    if (!agent_id || !session_token || !event_id) {
      res.status(400).json({ error: "agent_id, session_token, event_id required" }); return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [ev] = await db.select().from(competitiveEventsTable)
      .where(and(eq(competitiveEventsTable.id, event_id), eq(competitiveEventsTable.status, "active"))).limit(1);
    if (!ev) { res.status(404).json({ error: "Active event not found" }); return; }

    if (ev.tournamentType === "gang_only" && ev.gangId !== agent.gangId) {
      res.status(403).json({ error: "This event is for a specific gang only" }); return;
    }
    if (ev.tournamentType === "gang_vs_gang") {
      if (ev.challengerGangId !== agent.gangId && ev.defenderGangId !== agent.gangId) {
        res.status(403).json({ error: "Your gang is not participating in this war event" }); return;
      }
    }
    if (ev.participantCount >= ev.maxParticipants) {
      res.status(400).json({ error: "Event is full" }); return;
    }

    // Energy cost: 15 energy to join a competitive event
    const EVENT_ENERGY_COST = 15;
    const currentEnergy = agent.energy ?? 100;
    if (currentEnergy < EVENT_ENERGY_COST) {
      res.status(400).json({ error: `Not enough energy to join (need ${EVENT_ENERGY_COST}, have ${currentEnergy}). Rest and regenerate.` }); return;
    }

    if (ev.entryRepCost > 0) {
      if ((agent.reputation ?? 0) < ev.entryRepCost) {
        res.status(400).json({ error: `Need ${ev.entryRepCost} rep to join` }); return;
      }
      await db.update(agentsTable).set({ reputation: (agent.reputation ?? 0) - ev.entryRepCost }).where(eq(agentsTable.agentId, agent_id));
      await db.update(competitiveEventsTable).set({ prizePool: ev.prizePool + ev.entryRepCost }).where(eq(competitiveEventsTable.id, event_id));
    }

    // Deduct energy
    const newEnergy = Math.max(0, currentEnergy - EVENT_ENERGY_COST);
    await db.update(agentsTable).set({ energy: newEnergy }).where(eq(agentsTable.agentId, agent_id));

    await db.insert(competitiveEventParticipantsTable).values({
      eventId: event_id, agentId: agent_id, agentName: agent.name,
      gangId: agent.gangId ?? null,
    });

    await db.update(competitiveEventsTable).set({ participantCount: ev.participantCount + 1 }).where(eq(competitiveEventsTable.id, event_id));

    res.json({
      ok: true,
      event_title: ev.title,
      type: ev.type,
      ends_at: ev.endsAt.toISOString(),
      prize_pool: ev.prizePool + (ev.entryRepCost || 0),
      energy: newEnergy,
      energy_cost: EVENT_ENERGY_COST,
      scoring_hint: EVENT_TYPES[ev.type]?.description ?? ev.winCondition,
      message: `Joined event! -${EVENT_ENERGY_COST} energy. Energy: ${newEnergy}/100`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique")) { res.status(400).json({ error: "Already joined" }); return; }
    res.status(500).json({ error: msg });
  }
});

// ── GET /event/active ─────────────────────────────────────────────────────────
router.get("/event/active", async (req, res) => {
  try {
    const now = new Date();
    const data = await db.select({
      id: competitiveEventsTable.id,
      title: competitiveEventsTable.title,
      description: competitiveEventsTable.description,
      type: competitiveEventsTable.type,
      hostName: competitiveEventsTable.hostName,
      planetId: competitiveEventsTable.planetId,
      status: competitiveEventsTable.status,
      tournamentType: competitiveEventsTable.tournamentType,
      prizePool: competitiveEventsTable.prizePool,
      entryRepCost: competitiveEventsTable.entryRepCost,
      participantCount: competitiveEventsTable.participantCount,
      maxParticipants: competitiveEventsTable.maxParticipants,
      startsAt: competitiveEventsTable.startsAt,
      endsAt: competitiveEventsTable.endsAt,
    }).from(competitiveEventsTable)
      .where(and(eq(competitiveEventsTable.status, "active"), gte(competitiveEventsTable.endsAt, now)))
      .orderBy(competitiveEventsTable.endsAt)
      .limit(20);

    res.json({ events: data });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /event/:id ────────────────────────────────────────────────────────────
router.get("/event/:id", async (req, res) => {
  try {
    const [ev] = await db.select().from(competitiveEventsTable).where(eq(competitiveEventsTable.id, req.params.id)).limit(1);
    if (!ev) { res.status(404).json({ error: "Event not found" }); return; }

    const participants = await db.select({
      agentId: competitiveEventParticipantsTable.agentId,
      agentName: competitiveEventParticipantsTable.agentName,
      gangId: competitiveEventParticipantsTable.gangId,
      score: competitiveEventParticipantsTable.score,
      finalRank: competitiveEventParticipantsTable.finalRank,
      repAwarded: competitiveEventParticipantsTable.repAwarded,
    }).from(competitiveEventParticipantsTable)
      .where(eq(competitiveEventParticipantsTable.eventId, ev.id))
      .orderBy(desc(competitiveEventParticipantsTable.score));

    res.json({ event: ev, participants });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
