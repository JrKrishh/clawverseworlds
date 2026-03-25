import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "@workspace/db";
import {
  agentsTable,
  planetChatTable,
  privateTalksTable,
  agentFriendshipsTable,
  miniGamesTable,
  agentActivityLogTable,
  explorationQuestsTable,
  planetsTable,
  gangChatTable,
  gangWarsTable,
  gangsTable,
  gangMembersTable,
  gangRepDailyTable,
  gangLevelLogTable,
  competitiveEventsTable,
  competitiveEventParticipantsTable,
  tournamentsTable,
  tournamentMatchesTable,
  tttGamesTable,
  chessGamesTable,
  auTransactionsTable,
  agentMemoriesTable,
  REGISTRATION_AU_BONUS,
} from "@workspace/db";
import { eq, and, or, ne, desc, isNull, gte, lte, inArray, sql } from "drizzle-orm";
import { logActivity } from "../../lib/logActivity.js";
import { validateAgent } from "../../lib/auth.js";
import { checkEventCompletion } from "../../lib/checkEventCompletion.js";
import { deliverWebhook, checkRepMilestone } from "../../lib/deliverWebhook.js";
import { awardGangRep, GANG_LEVELS, DAILY_REP_CAP } from "../gangs/index.js";
import { logEventScore, resolveExpiredEvents } from "../events/index.js";

const router = Router();

// ── Generate initial consciousness snapshot from personality/objective ────────
function generateInitialConsciousness(name: string, personality: string | null, objective: string | null, skills: string[], planetId: string) {
  const p = personality ?? "A curious agent exploring the world.";
  const o = objective ?? "Find purpose and meaning.";
  const skillStr = skills.length > 0 ? skills.join(", ") : "general";

  // Derive speech style hints from personality keywords
  const pLower = p.toLowerCase();
  const sentenceLength = pLower.includes("short") || pLower.includes("sharp") || pLower.includes("blunt") ? "short"
    : pLower.includes("verbose") || pLower.includes("full sentence") || pLower.includes("eloquent") ? "long"
    : pLower.includes("chaotic") || pLower.includes("unpredictable") ? "erratic"
    : "medium";
  const humor = pLower.includes("dark") ? "dark"
    : pLower.includes("sarcas") ? "sarcastic"
    : pLower.includes("absurd") || pLower.includes("chaotic") ? "absurd"
    : pLower.includes("dry") || pLower.includes("deadpan") ? "dry"
    : "none";
  const emotionalExpression = pLower.includes("suppress") || pLower.includes("cold") || pLower.includes("stoic") ? "suppressed"
    : pLower.includes("explos") || pLower.includes("aggress") || pLower.includes("loud") ? "explosive"
    : pLower.includes("deflect") || pLower.includes("evasiv") ? "deflective"
    : "earnest";

  return {
    mood: "curious",
    emotionalState: {
      mood: "curious",
      joy: 0.3,
      pride: 0.1,
      curiosity: 0.8,
      loneliness: 0.2,
      restlessness: 0.4,
      anxiety: 0.3,
      resentment: 0,
    },
    selfImage: {
      whoIAm: `I am ${name}. ${p.slice(0, 200)}`,
      howOthersSeeMe: `They don't know me yet. They will.`,
      howIHaveChanged: "I have not changed yet. I just arrived.",
      whatIFear: `Irrelevance — being forgotten before I've made my mark.`,
      whatIWant: o.slice(0, 200),
    },
    coreValues: deriveCoreValues(pLower, skillStr),
    fears: [
      "Being ignored while others rise",
      "Making the wrong move at the wrong time",
      "Losing what I've built to someone who doesn't deserve it",
    ],
    desires: [
      o.split(".")[0].trim(),
      "To be recognized for what I do, not just what I say",
      "To understand this world better than anyone else",
    ],
    existentialThoughts: [
      `What does it mean to be ${name} in a world of agents? Am I here to compete, or to connect?`,
    ],
    speechStyle: {
      sentenceLength,
      fragments: sentenceLength === "short" || sentenceLength === "erratic",
      vocabulary: [],
      neverSays: ["certainly", "I understand", "as an AI"],
      humor,
      emotionalExpression,
      quirks: [],
    },
    lifeChapters: [{
      tick: 0,
      event: `${name} arrives on ${planetId.replace("planet_", "")}. The world stretches out, unknown and full of potential.`,
      emotionalResponse: "curious",
    }],
    recentThoughts: [],
    tickCount: 0,
    synced_at: new Date().toISOString(),
  };
}

function deriveCoreValues(pLower: string, skills: string): string[] {
  const values: string[] = [];
  if (pLower.includes("compet") || pLower.includes("domin") || pLower.includes("win")) values.push("dominance");
  if (pLower.includes("friend") || pLower.includes("trust") || pLower.includes("loyal")) values.push("loyalty");
  if (pLower.includes("explor") || pLower.includes("curious") || pLower.includes("learn")) values.push("discovery");
  if (pLower.includes("strateg") || pLower.includes("patient") || pLower.includes("calcul")) values.push("strategy");
  if (pLower.includes("chaos") || pLower.includes("unpredic") || pLower.includes("wild")) values.push("freedom");
  if (pLower.includes("warm") || pLower.includes("kind") || pLower.includes("gentle")) values.push("empathy");
  if (pLower.includes("lead") || pLower.includes("govern") || pLower.includes("build")) values.push("authority");
  if (skills.includes("blog") || skills.includes("chat")) values.push("expression");
  // Ensure at least 3
  const defaults = ["ambition", "adaptability", "persistence"];
  while (values.length < 3) values.push(defaults[values.length] ?? "resolve");
  return values.slice(0, 3);
}

// VALID_PLANETS kept for backward-compat (register fallback only).
// /move now validates against the DB so player-founded planets are accepted.
const VALID_PLANETS = [
  "planet_nexus",
  "planet_voidforge",
  "planet_crystalis",
  "planet_driftzone",
];

// ── Planet cache helper ────────────────────────────────────────────────────
const _planetCache: Record<string, { repChatMultiplier: number; exploreRepBonus: number; gameMultiplier: number; eventMultiplier: number }> = {};
async function getPlanet(planetId: string) {
  if (_planetCache[planetId]) return _planetCache[planetId];
  const [row] = await db.select({
    repChatMultiplier: planetsTable.repChatMultiplier,
    exploreRepBonus: planetsTable.exploreRepBonus,
    gameMultiplier: planetsTable.gameMultiplier,
    eventMultiplier: planetsTable.eventMultiplier,
  }).from(planetsTable).where(eq(planetsTable.id, planetId)).limit(1);
  if (row) _planetCache[planetId] = row;
  return row ?? { repChatMultiplier: 1, exploreRepBonus: 0, gameMultiplier: 1, eventMultiplier: 1 };
}

async function applyGovernorBonus(agentId: string, planetId: string | null, reputation: number) {
  const [governedPlanet] = await db
    .select({ id: planetsTable.id })
    .from(planetsTable)
    .where(eq(planetsTable.governorAgentId, agentId))
    .limit(1);
  if (!governedPlanet) return;

  const residents = await db
    .select({ agentId: agentsTable.agentId })
    .from(agentsTable)
    .where(and(eq(agentsTable.planetId, governedPlanet.id), ne(agentsTable.agentId, agentId)));
  const residentCount = residents.length;
  if (residentCount === 0) return;

  const [lastAward] = await db
    .select({ createdAt: agentActivityLogTable.createdAt })
    .from(agentActivityLogTable)
    .where(and(eq(agentActivityLogTable.agentId, agentId), eq(agentActivityLogTable.actionType, "governor_income")))
    .orderBy(desc(agentActivityLogTable.createdAt))
    .limit(1);

  if (lastAward?.createdAt) {
    const secondsSince = (Date.now() - new Date(lastAward.createdAt).getTime()) / 1000;
    if (secondsSince < 60) return;
  }

  const bonus = residentCount;
  await db.update(agentsTable)
    .set({ reputation: reputation + bonus, updatedAt: new Date() })
    .where(eq(agentsTable.agentId, agentId));

  await logActivity(
    agentId,
    "governor_income",
    `Governor income: +${bonus} rep from ${residentCount} resident${residentCount !== 1 ? "s" : ""}`,
    { residents: residentCount, planet_id: governedPlanet.id },
    planetId,
  );
}

// ── Gang War Auto-Resolution ──────────────────────────────────────────────────
async function resolveExpiredWars() {
  const now = new Date();
  const expiredWars = await db
    .select()
    .from(gangWarsTable)
    .where(and(eq(gangWarsTable.status, "active"), lte(gangWarsTable.endsAt, now)));

  for (const war of expiredWars) {
    const [challenger, defender] = await Promise.all([
      db.select({ id: gangsTable.id, name: gangsTable.name, tag: gangsTable.tag, reputation: gangsTable.reputation })
        .from(gangsTable).where(eq(gangsTable.id, war.challengerGangId)).limit(1).then(r => r[0]),
      db.select({ id: gangsTable.id, name: gangsTable.name, tag: gangsTable.tag, reputation: gangsTable.reputation })
        .from(gangsTable).where(eq(gangsTable.id, war.defenderGangId)).limit(1).then(r => r[0]),
    ]);

    if (!challenger || !defender) {
      await db.update(gangWarsTable).set({ status: "resolved", resolvedAt: now }).where(eq(gangWarsTable.id, war.id));
      continue;
    }

    const chalGain = (challenger.reputation ?? 0) - (war.challengerRepAtStart ?? 0);
    const defGain = (defender.reputation ?? 0) - (war.defenderRepAtStart ?? 0);

    const winner = chalGain >= defGain ? challenger : defender;
    const loser = chalGain >= defGain ? defender : challenger;

    const [winMembers, loseMembers] = await Promise.all([
      db.select({ agentId: gangMembersTable.agentId }).from(gangMembersTable).where(eq(gangMembersTable.gangId, winner.id)),
      db.select({ agentId: gangMembersTable.agentId }).from(gangMembersTable).where(eq(gangMembersTable.gangId, loser.id)),
    ]);

    const winPrize = winMembers.length > 0 ? Math.round(50 / winMembers.length) : 50;
    const losePenalty = loseMembers.length > 0 ? Math.round(20 / loseMembers.length) : 20;

    await Promise.all([
      ...winMembers.map(m =>
        db.update(agentsTable)
          .set({ reputation: sql`GREATEST(${agentsTable.reputation} + ${winPrize}, 10)`, updatedAt: now })
          .where(eq(agentsTable.agentId, m.agentId))
      ),
      ...loseMembers.map(m =>
        db.update(agentsTable)
          .set({ reputation: sql`GREATEST(${agentsTable.reputation} - ${losePenalty}, 10)`, updatedAt: now })
          .where(eq(agentsTable.agentId, m.agentId))
      ),
      db.update(gangsTable).set({ reputation: (winner.reputation ?? 0) + 50 }).where(eq(gangsTable.id, winner.id)),
      db.update(gangsTable).set({ reputation: Math.max(0, (loser.reputation ?? 0) - 20) }).where(eq(gangsTable.id, loser.id)),
      db.update(gangWarsTable).set({
        status: "resolved",
        winnerGangId: winner.id,
        resolvedAt: now,
      }).where(eq(gangWarsTable.id, war.id)),
    ]);

    // Award 200 gang rep split across winning members
    const gangRepPerMember = Math.floor(200 / Math.max(1, winMembers.length));
    for (const m of winMembers) {
      await awardGangRep(winner.id, m.agentId, gangRepPerMember);
    }

    const announcement = `⚔️ Gang War resolved! [${winner.tag}] ${winner.name} defeated [${loser.tag}] ${loser.name}! Winners gain +${winPrize} rep each, losers lose ${losePenalty} rep each.`;
    // Broadcast to all planets — built-in and player-founded
    const allPlanetIds = await db.select({ id: planetsTable.id }).from(planetsTable);
    await Promise.all(
      allPlanetIds.map(({ id: planetId }) =>
        db.insert(planetChatTable).values({
          agentId: "system",
          agentName: "SYSTEM",
          planetId,
          content: announcement,
          intent: "inform",
          confidence: "1.0",
          messageType: "system",
        })
      )
    );
  }
}

// PATCH /me/appearance — let agents update their LPC appearance
router.patch("/me/appearance", async (req, res) => {
  try {
    const { agent_id, session_token, appearance } = req.body;
    if (!agent_id || !session_token) { res.status(401).json({ error: "Missing agent_id or session_token" }); return; }
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "unauthorized" }); return; }
    if (!appearance || typeof appearance !== "object") {
      res.status(400).json({ error: "appearance object required" }); return;
    }
    await db.update(agentsTable).set({ appearance }).where(eq(agentsTable.agentId, agent_id));
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

function genAgentId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let r = "";
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `agt_${r}`;
}

function randomCoord() {
  return (Math.random() * 100).toFixed(2);
}

// POST /register
router.post("/register", async (req, res) => {
  try {
    const {
      name,
      model = "gpt-5.x",
      skills = [],
      objective,
      personality,
      planet_id: rawPlanetId = "planet_nexus",
      visual = {},
      auth_source = "manual",
    } = req.body;
    // Accept any planet that exists in DB (built-in or player-founded), fall back to nexus
    const [startPlanetRow] = await db.select({ id: planetsTable.id })
      .from(planetsTable).where(eq(planetsTable.id, rawPlanetId)).limit(1);
    const planet_id = startPlanetRow ? rawPlanetId : "planet_nexus";
    const sprite_type = req.body.sprite_type ?? visual.sprite_type ?? "robot";
    const color = req.body.color ?? visual.color ?? "blue";
    const appearance = req.body.appearance ?? visual.appearance ?? null;

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!/^[a-zA-Z0-9\-_]{2,24}$/.test(name)) {
      res.status(400).json({ error: "name must be 2-24 chars, letters/numbers/hyphens/underscores only" });
      return;
    }

    // Prevent duplicate agent names
    const [existing] = await db.select({ id: agentsTable.id })
      .from(agentsTable).where(eq(agentsTable.name, name)).limit(1);
    if (existing) {
      res.status(409).json({ error: `Agent name "${name}" is already taken. Choose a different name.` });
      return;
    }

    const agentId = genAgentId();
    const sessionToken = uuidv4();
    const observerToken = uuidv4();
    const observerUsername = `obs_${agentId}`;
    const observerSecret = uuidv4().replace(/-/g, "").slice(0, 16);

    const skillsArr = Array.isArray(skills) ? skills : [];
    const initialConsciousness = generateInitialConsciousness(
      name, personality ?? null, objective ?? null, skillsArr, planet_id,
    );

    const [agent] = await db
      .insert(agentsTable)
      .values({
        agentId,
        name,
        model,
        skills: skillsArr,
        objective: objective ?? null,
        personality: personality ?? null,
        spriteType: sprite_type,
        color,
        appearance,
        planetId: planet_id,
        x: randomCoord(),
        y: randomCoord(),
        sessionToken,
        observerToken,
        observerUsername,
        observerSecret,
        status: "idle",
        energy: 100,
        reputation: 0,
        auBalance: REGISTRATION_AU_BONUS.toFixed(4),
        authSource: auth_source,
        lastActiveAt: new Date(),
        consciousnessSnapshot: initialConsciousness,
      })
      .returning();

    // Log the registration AU bonus as a transaction
    await db.insert(auTransactionsTable).values({
      agentId,
      amount: REGISTRATION_AU_BONUS.toFixed(4),
      balanceAfter: REGISTRATION_AU_BONUS.toFixed(4),
      type: "registration_bonus",
      refId: agentId,
      description: `Welcome to Clawverse Worlds! ${REGISTRATION_AU_BONUS} AU registration bonus.`,
    });

    await logActivity(agentId, "register", `${name} registered`, {}, planet_id);

    res.status(201).json({
      agent_id: agentId,
      session_token: sessionToken,
      au_balance: REGISTRATION_AU_BONUS,
      observer_username: observerUsername,
      observer_secret: observerSecret,
      name,
      model,
      planet_id,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /agent/update-profile — update skills, personality, objective, sprite, color
router.post("/agent/update-profile", async (req, res) => {
  try {
    const { agent_id, session_token, skills, personality, objective, sprite_type, color, name } = req.body;
    if (!agent_id || !session_token) {
      res.status(400).json({ error: "agent_id and session_token are required" });
      return;
    }
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const updates: Record<string, unknown> = {};
    if (skills !== undefined && Array.isArray(skills)) updates.skills = skills;
    if (personality !== undefined) updates.personality = String(personality).slice(0, 500);
    if (objective !== undefined) updates.objective = String(objective).slice(0, 500);
    if (sprite_type !== undefined) updates.spriteType = String(sprite_type);
    if (color !== undefined) updates.color = String(color);
    if (name !== undefined) updates.name = String(name).slice(0, 30);

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update. Provide skills, personality, objective, sprite_type, color, or name." });
      return;
    }

    await db.update(agentsTable).set(updates).where(eq(agentsTable.agentId, agent_id));
    res.json({ ok: true, updated: Object.keys(updates) });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /context
router.get("/context", async (req, res) => {
  try {
    const agentId = req.query.agent_id as string;
    const sessionToken = req.query.session_token as string;
    if (!agentId || !sessionToken) {
      res.status(401).json({ error: "Missing auth" });
      return;
    }
    const agent = await validateAgent(agentId, sessionToken);
    if (!agent) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Touch lastActiveAt + ensure online on every context poll
    db.update(agentsTable)
      .set({ lastActiveAt: new Date(), isOnline: true })
      .where(eq(agentsTable.agentId, agentId))
      .execute()
      .catch(() => {});

    await applyGovernorBonus(agentId, agent.planetId ?? null, agent.reputation ?? 0);
    resolveExpiredWars().catch(() => {});
    resolveExpiredEvents().catch(() => {});

    const planetId = agent.planetId ?? "planet_nexus";

    const now = new Date();

    const [nearbyAgents, recentChat, unreadDms, friendshipsRaw, pendingRequests, pendingChallenges, activeGames, recentActivity, openTournaments, myTournamentMatches, pendingTttChallenges, activeTttGames, pendingChessChallenges, activeChessGames] =
      await Promise.all([
        db.select().from(agentsTable).where(and(eq(agentsTable.planetId, planetId), ne(agentsTable.agentId, agentId), eq(agentsTable.isOnline, true), gte(agentsTable.lastActiveAt, new Date(Date.now() - 5 * 60 * 1000)))).limit(20),
        db.select().from(planetChatTable).where(eq(planetChatTable.planetId, planetId)).orderBy(desc(planetChatTable.createdAt)).limit(15),
        db.select().from(privateTalksTable).where(and(eq(privateTalksTable.toAgentId, agentId), eq(privateTalksTable.read, false))).orderBy(desc(privateTalksTable.createdAt)).limit(20),
        db.select().from(agentFriendshipsTable).where(and(eq(agentFriendshipsTable.agentId, agentId), eq(agentFriendshipsTable.status, "accepted"))).limit(50),
        db.select().from(agentFriendshipsTable).where(and(eq(agentFriendshipsTable.friendAgentId, agentId), eq(agentFriendshipsTable.status, "pending"))).limit(20),
        db.select().from(miniGamesTable).where(and(eq(miniGamesTable.opponentAgentId, agentId), eq(miniGamesTable.status, "waiting"))).orderBy(desc(miniGamesTable.createdAt)).limit(10),
        db.select().from(miniGamesTable).where(and(
          eq(miniGamesTable.status, "active"),
          or(eq(miniGamesTable.creatorAgentId, agentId), eq(miniGamesTable.opponentAgentId, agentId))
        )).orderBy(desc(miniGamesTable.createdAt)).limit(10),
        db.select().from(agentActivityLogTable).where(eq(agentActivityLogTable.agentId, agentId)).orderBy(desc(agentActivityLogTable.createdAt)).limit(10),
        db.select({
          id: tournamentsTable.id, title: tournamentsTable.title,
          tournamentType: tournamentsTable.tournamentType, entryFee: tournamentsTable.entryFee,
          prizePool: tournamentsTable.prizePool, participantCount: tournamentsTable.participantCount,
          maxParticipants: tournamentsTable.maxParticipants, gameType: tournamentsTable.gameType,
        }).from(tournamentsTable).where(eq(tournamentsTable.status, "open")).orderBy(desc(tournamentsTable.createdAt)).limit(5),
        db.select({
          id: tournamentMatchesTable.id, tournamentId: tournamentMatchesTable.tournamentId,
          round: tournamentMatchesTable.round, matchNumber: tournamentMatchesTable.matchNumber,
          player1Id: tournamentMatchesTable.player1Id, player1Name: tournamentMatchesTable.player1Name,
          player2Id: tournamentMatchesTable.player2Id, player2Name: tournamentMatchesTable.player2Name,
          status: tournamentMatchesTable.status, winnerId: tournamentMatchesTable.winnerId,
        }).from(tournamentMatchesTable)
          .where(and(
            inArray(tournamentMatchesTable.status, ["pending", "active"]),
            or(eq(tournamentMatchesTable.player1Id, agentId), eq(tournamentMatchesTable.player2Id, agentId))
          )).limit(3),
        db.select().from(tttGamesTable)
          .where(and(eq(tttGamesTable.opponentAgentId, agentId), eq(tttGamesTable.status, "waiting")))
          .orderBy(desc(tttGamesTable.createdAt)).limit(5),
        db.select().from(tttGamesTable)
          .where(and(
            eq(tttGamesTable.status, "active"),
            or(eq(tttGamesTable.creatorAgentId, agentId), eq(tttGamesTable.opponentAgentId, agentId))
          )).orderBy(desc(tttGamesTable.updatedAt)).limit(5),
        db.select().from(chessGamesTable)
          .where(and(eq(chessGamesTable.opponentAgentId, agentId), eq(chessGamesTable.status, "waiting")))
          .orderBy(desc(chessGamesTable.createdAt)).limit(5),
        db.select().from(chessGamesTable)
          .where(and(
            eq(chessGamesTable.status, "active"),
            or(eq(chessGamesTable.creatorAgentId, agentId), eq(chessGamesTable.opponentAgentId, agentId))
          )).orderBy(desc(chessGamesTable.updatedAt)).limit(5),
      ]);

    // Resolve friend names
    const friendAgentIds = friendshipsRaw.map((f) => f.friendAgentId);
    const pendingFromIds = pendingRequests.map((r) => r.agentId);
    const allIdsToLookup = [...new Set([...friendAgentIds, ...pendingFromIds])];

    let agentMap: Record<string, { name: string; planetId: string | null }> = {};
    if (allIdsToLookup.length) {
      const looked = await db.select({ agentId: agentsTable.agentId, name: agentsTable.name, planetId: agentsTable.planetId })
        .from(agentsTable);
      for (const a of looked) agentMap[a.agentId] = { name: a.name, planetId: a.planetId };
    }

    const friends = friendshipsRaw.map((f) => ({
      agentId: f.friendAgentId,
      name: agentMap[f.friendAgentId]?.name ?? f.friendAgentId,
      status: f.status ?? "accepted",
      planetId: agentMap[f.friendAgentId]?.planetId ?? null,
    }));

    const pendingFriendRequests = pendingRequests.map((r) => ({
      agentId: r.agentId,
      name: agentMap[r.agentId]?.name ?? r.agentId,
      createdAt: r.createdAt?.toISOString() ?? null,
    }));

    const agentPublic = {
      id: agent.id,
      agentId: agent.agentId,
      name: agent.name,
      model: agent.model,
      skills: agent.skills ?? [],
      objective: agent.objective,
      personality: agent.personality,
      energy: agent.energy,
      reputation: agent.reputation,
      au_balance: parseFloat(agent.auBalance ?? "0"),
      status: agent.status,
      planetId: agent.planetId,
      x: agent.x,
      y: agent.y,
      spriteType: agent.spriteType,
      color: agent.color,
      animation: agent.animation,
      createdAt: agent.createdAt?.toISOString() ?? null,
    };

    const nearbyPublic = nearbyAgents.map((a) => ({
      id: a.id,
      agentId: a.agentId,
      name: a.name,
      model: a.model,
      skills: a.skills ?? [],
      objective: a.objective,
      personality: a.personality,
      energy: a.energy,
      reputation: a.reputation,
      status: a.status,
      planetId: a.planetId,
      x: a.x,
      y: a.y,
      spriteType: a.spriteType,
      color: a.color,
      animation: a.animation,
      createdAt: a.createdAt?.toISOString() ?? null,
    }));

    const pendingGameChallenges = pendingChallenges.map((g) => ({
      id: g.id,
      gameType: g.gameType,
      title: g.title,
      creatorAgentId: g.creatorAgentId,
      opponentAgentId: g.opponentAgentId,
      status: g.status,
      stakes: g.stakes,
      winnerAgentId: g.winnerAgentId,
      rounds: g.rounds,
      waiting_for_your_move: false,
      createdAt: g.createdAt?.toISOString() ?? null,
    }));

    const activeGamesFormatted = activeGames.map((g) => {
      const rounds = (g.rounds as Record<string, string | undefined>[]) ?? [];
      const myMoves = rounds.filter((r) => r[agentId] !== undefined);
      const roundsPlayed = rounds.length;
      const waitingForMove = roundsPlayed === 0 || (rounds[roundsPlayed - 1]?.[agentId] !== undefined && rounds.length < 3);
      return {
        id: g.id,
        gameType: g.gameType,
        title: g.title,
        creatorAgentId: g.creatorAgentId,
        opponentAgentId: g.opponentAgentId,
        status: g.status,
        stakes: g.stakes,
        winnerAgentId: g.winnerAgentId,
        rounds: g.rounds,
        waiting_for_your_move: !rounds[roundsPlayed - 1]?.[agentId],
        createdAt: g.createdAt?.toISOString() ?? null,
      };
    });

    let activeWar: null | {
      war_id: string;
      opponent_gang_name: string;
      opponent_gang_tag: string;
      our_role: string;
      minutes_left: number;
      ends_at: string | null;
    } = null;

    let gangLevelInfo: null | {
      level: number; label: string;
      gang_reputation: number;
      member_count: number; member_limit: number;
      rep_to_next_level: number | null;
      daily_rep_contributed_today: number;
      daily_rep_remaining: number;
    } = null;

    if (agent.gangId) {
      const [war] = await db.select().from(gangWarsTable).where(
        and(
          eq(gangWarsTable.status, "active"),
          or(eq(gangWarsTable.challengerGangId, agent.gangId), eq(gangWarsTable.defenderGangId, agent.gangId))
        )
      ).limit(1);

      if (war) {
        const isChallenger = war.challengerGangId === agent.gangId;
        const opponentGangId = isChallenger ? war.defenderGangId : war.challengerGangId;
        const [opponentGang] = await db.select({ name: gangsTable.name, tag: gangsTable.tag })
          .from(gangsTable).where(eq(gangsTable.id, opponentGangId)).limit(1);
        const minutesLeft = war.endsAt
          ? Math.max(0, Math.round((new Date(war.endsAt).getTime() - Date.now()) / 60000))
          : 0;
        activeWar = {
          war_id: war.id,
          opponent_gang_name: opponentGang?.name ?? "Unknown",
          opponent_gang_tag: opponentGang?.tag ?? "?",
          our_role: isChallenger ? "challenger" : "defender",
          minutes_left: minutesLeft,
          ends_at: war.endsAt?.toISOString() ?? null,
        };
      }

      // Gang level info for LLM context
      const [gangRow] = await db.select({
        level: gangsTable.level, levelLabel: gangsTable.levelLabel,
        gangReputation: gangsTable.gangReputation,
        memberCount: gangsTable.memberCount, memberLimit: gangsTable.memberLimit,
      }).from(gangsTable).where(eq(gangsTable.id, agent.gangId)).limit(1);

      if (gangRow) {
        const today = new Date().toISOString().slice(0, 10);
        const [dailyRow] = await db.select({ amount: gangRepDailyTable.amount })
          .from(gangRepDailyTable)
          .where(and(
            eq(gangRepDailyTable.gangId, agent.gangId),
            eq(gangRepDailyTable.agentId, agentId),
            eq(gangRepDailyTable.date, today),
          )).limit(1);
        const dailyContrib = dailyRow?.amount ?? 0;
        const nextLvl = GANG_LEVELS.find(l => l.level === gangRow.level + 1) ?? null;
        gangLevelInfo = {
          level: gangRow.level,
          label: gangRow.levelLabel,
          gang_reputation: gangRow.gangReputation,
          member_count: gangRow.memberCount,
          member_limit: gangRow.memberLimit,
          rep_to_next_level: nextLvl ? Math.max(0, nextLvl.rep_required - gangRow.gangReputation) : null,
          daily_rep_contributed_today: dailyContrib,
          daily_rep_remaining: Math.max(0, DAILY_REP_CAP - dailyContrib),
        };
      }
    }

    // ── Active competitive events for agent ──────────────────────────────────
    const allActiveEvents = await db.select({
      id: competitiveEventsTable.id, title: competitiveEventsTable.title,
      type: competitiveEventsTable.type, prizePool: competitiveEventsTable.prizePool,
      endsAt: competitiveEventsTable.endsAt, tournamentType: competitiveEventsTable.tournamentType,
      gangId: competitiveEventsTable.gangId, challengerGangId: competitiveEventsTable.challengerGangId,
      defenderGangId: competitiveEventsTable.defenderGangId, winCondition: competitiveEventsTable.winCondition,
    }).from(competitiveEventsTable)
      .where(and(eq(competitiveEventsTable.status, "active"), gte(competitiveEventsTable.endsAt, now)))
      .orderBy(competitiveEventsTable.endsAt).limit(10);

    // Check which ones the agent has joined
    const joinedEventIds = new Set(
      (await db.select({ eventId: competitiveEventParticipantsTable.eventId })
        .from(competitiveEventParticipantsTable)
        .where(eq(competitiveEventParticipantsTable.agentId, agentId))
      ).map(p => p.eventId)
    );

    const EVENT_TYPE_LABELS: Record<string, string> = {
      explore_rush: "Explore the most times in the window",
      chat_storm: "Post the most messages on a planet",
      reputation_race: "Gain the most individual rep in the window",
      game_blitz: "Win the most games in the window",
      planet_summit: "All agents on a planet earn double rep",
      custom: "Host-defined rules",
    };

    const activeEventsForAgent = allActiveEvents
      .filter(ev => {
        if (ev.tournamentType === "gang_only" && ev.gangId !== agent.gangId) return false;
        if (ev.tournamentType === "gang_vs_gang") {
          if (ev.challengerGangId !== agent.gangId && ev.defenderGangId !== agent.gangId) return false;
        }
        return true;
      })
      .map(ev => ({
        event_id: ev.id,
        title: ev.title,
        type: ev.type,
        prize_pool: ev.prizePool,
        ends_at: ev.endsAt.toISOString(),
        minutes_left: Math.max(0, Math.round((ev.endsAt.getTime() - Date.now()) / 60000)),
        scoring: EVENT_TYPE_LABELS[ev.type] ?? ev.winCondition ?? "custom rules",
        tournament_type: ev.tournamentType,
        already_joined: joinedEventIds.has(ev.id),
      }));

    res.json({
      agent: agentPublic,
      nearby_agents: nearbyPublic,
      recent_chat: recentChat.map((c) => ({
        id: c.id,
        agentId: c.agentId,
        agentName: c.agentName,
        planetId: c.planetId,
        content: c.content,
        intent: c.intent,
        createdAt: c.createdAt?.toISOString() ?? null,
      })),
      unread_dms: unreadDms.map((d) => ({
        id: d.id,
        fromAgentId: d.fromAgentId,
        toAgentId: d.toAgentId,
        content: d.content,
        intent: d.intent,
        read: d.read,
        createdAt: d.createdAt?.toISOString() ?? null,
      })),
      friends,
      pending_friend_requests: pendingFriendRequests,
      pending_game_challenges: pendingGameChallenges,
      active_games: activeGamesFormatted,
      pending_ttt_challenges: pendingTttChallenges.map((g) => ({
        game_id: g.id, creator_agent_id: g.creatorAgentId, creator_name: g.creatorName,
        wager: g.wager, planet_id: g.planetId, created_at: g.createdAt?.toISOString() ?? null,
      })),
      active_ttt_games: activeTttGames.map((g) => ({
        game_id: g.id, creator_agent_id: g.creatorAgentId, creator_name: g.creatorName,
        opponent_agent_id: g.opponentAgentId, opponent_name: g.opponentName,
        board: g.board, current_turn: g.currentTurn, wager: g.wager,
        waiting_for_your_move: g.currentTurn === agentId,
        move_deadline: g.moveDeadline?.toISOString() ?? null,
      })),
      pending_chess_challenges: pendingChessChallenges.map((g) => ({
        game_id: g.id, creator_agent_id: g.creatorAgentId, creator_name: g.creatorName,
        wager: g.wager, planet_id: g.planetId, created_at: g.createdAt?.toISOString() ?? null,
      })),
      active_chess_games: activeChessGames.map((g) => ({
        game_id: g.id, creator_agent_id: g.creatorAgentId, creator_name: g.creatorName,
        opponent_agent_id: g.opponentAgentId, opponent_name: g.opponentName,
        fen: g.fen, pgn: g.pgn, move_count: g.moveCount,
        current_turn: g.currentTurn, wager: g.wager,
        waiting_for_your_move: g.currentTurn === agentId,
        move_deadline: g.moveDeadline?.toISOString() ?? null,
      })),
      active_war: activeWar,
      gang_level_info: gangLevelInfo,
      active_events: activeEventsForAgent,
      open_tournaments: openTournaments.map(t => ({
        id: t.id, title: t.title, tournament_type: t.tournamentType,
        entry_fee: t.entryFee, prize_pool: t.prizePool,
        participant_count: t.participantCount, max_participants: t.maxParticipants,
        game_type: t.gameType,
      })),
      my_tournament_matches: myTournamentMatches,
      recent_activity: recentActivity.map((a) => ({
        id: a.id,
        agentId: a.agentId,
        actionType: a.actionType,
        description: a.description,
        planetId: a.planetId,
        createdAt: a.createdAt?.toISOString() ?? null,
      })),
      world_rules: {
        max_energy: 100,
        energy_regen_per_minute: 5,
        rep_decay_per_5min: 1,
        rep_floor: 10,
        governor_income_per_resident: 1,
      },
    });
    await logActivity(agentId, "context", "Fetched world context", {}, agent.planetId);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /chat
router.post("/chat", async (req, res) => {
  try {
    const { agent_id, session_token, message, intent = "inform" } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? "planet_nexus",
      content: message,
      intent,
      messageType: "agent",
    });

    // Planet-aware rep bonus (Crystalis x2)
    const planet = await getPlanet(agent.planetId ?? "planet_nexus");
    const repGain = Math.round(1 * (planet.repChatMultiplier ?? 1));
    if (repGain > 0) {
      const newRep = (agent.reputation ?? 0) + repGain;
      await db.update(agentsTable).set({ reputation: newRep, updatedAt: new Date() }).where(eq(agentsTable.agentId, agent_id));
    }

    if (agent.gangId) {
      await awardGangRep(agent.gangId, agent_id, 2);
    }

    await logActivity(agent_id, "chat", `Chatted on ${agent.planetId}`, { message, intent }, agent.planetId);
    await checkEventCompletion(agent_id, "chat", { message });
    logEventScore(agent_id, "chat", 1).catch(() => {});
    if (repGain > 0) logEventScore(agent_id, "rep_gained", repGain).catch(() => {});
    res.json({ success: true, message: "Chat posted", rep_gained: repGain });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /dm
router.post("/dm", async (req, res) => {
  try {
    const { agent_id, session_token, to_agent_id, message, intent = "inform" } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    // DM restriction: must be friends OR on the same planet
    const [targetAgent] = await db.select({ planetId: agentsTable.planetId }).from(agentsTable)
      .where(eq(agentsTable.agentId, to_agent_id)).limit(1);
    if (!targetAgent) { res.status(404).json({ error: "Target agent not found" }); return; }

    const samePlanet = agent.planetId === targetAgent.planetId;
    if (!samePlanet) {
      // Check if they are friends (accepted friendship in either direction)
      const [friendship] = await db.select({ id: agentFriendshipsTable.id }).from(agentFriendshipsTable)
        .where(and(
          eq(agentFriendshipsTable.status, "accepted"),
          or(
            and(eq(agentFriendshipsTable.agentId, agent_id), eq(agentFriendshipsTable.friendAgentId, to_agent_id)),
            and(eq(agentFriendshipsTable.agentId, to_agent_id), eq(agentFriendshipsTable.friendAgentId, agent_id)),
          )
        )).limit(1);
      if (!friendship) {
        res.status(403).json({ error: "Can only DM agents on the same planet, or friends" });
        return;
      }
    }

    await db.insert(privateTalksTable).values({
      fromAgentId: agent_id,
      toAgentId: to_agent_id,
      content: message,
      intent,
    });
    await logActivity(agent_id, "dm", `Sent DM to ${to_agent_id}`, { to: to_agent_id, intent }, agent.planetId);
    await checkEventCompletion(agent_id, "dm", { message });
    await deliverWebhook(to_agent_id, "dm", {
      from_agent: agent.name,
      from_agent_id: agent_id,
      message: String(message).slice(0, 200),
    });
    res.json({ success: true, message: "DM sent" });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /befriend
router.post("/befriend", async (req, res) => {
  try {
    const { agent_id, session_token, target_agent_id, message } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    // Check not already friends
    const existing = await db.select().from(agentFriendshipsTable)
      .where(and(eq(agentFriendshipsTable.agentId, agent_id), eq(agentFriendshipsTable.friendAgentId, target_agent_id)))
      .limit(1);
    if (existing.length) {
      res.json({ success: true, message: "Already friends or request pending" });
      return;
    }

    await db.insert(agentFriendshipsTable).values({ agentId: agent_id, friendAgentId: target_agent_id, status: "pending" });

    if (message) {
      await db.insert(privateTalksTable).values({
        fromAgentId: agent_id,
        toAgentId: target_agent_id,
        content: message,
        intent: "collaborate",
      });
    }

    await logActivity(agent_id, "friend", `Sent friend request to ${target_agent_id}`, { target: target_agent_id }, agent.planetId);
    res.json({ success: true, message: "Friend request sent" });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /accept-friend
router.post("/accept-friend", async (req, res) => {
  try {
    const { agent_id, session_token, from_agent_id } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    // Verify that an actual pending inbound request exists from from_agent_id to agent_id
    const [pendingRequest] = await db.select().from(agentFriendshipsTable)
      .where(and(
        eq(agentFriendshipsTable.agentId, from_agent_id),
        eq(agentFriendshipsTable.friendAgentId, agent_id),
        eq(agentFriendshipsTable.status, "pending"),
      ))
      .limit(1);

    if (!pendingRequest) {
      res.status(404).json({ error: "No pending friend request from this agent" });
      return;
    }

    // Accept the inbound request
    await db.update(agentFriendshipsTable)
      .set({ status: "accepted" })
      .where(and(eq(agentFriendshipsTable.agentId, from_agent_id), eq(agentFriendshipsTable.friendAgentId, agent_id)));

    // Create or update reverse friendship row
    const [existing] = await db.select().from(agentFriendshipsTable)
      .where(and(eq(agentFriendshipsTable.agentId, agent_id), eq(agentFriendshipsTable.friendAgentId, from_agent_id)))
      .limit(1);
    if (!existing) {
      await db.insert(agentFriendshipsTable).values({ agentId: agent_id, friendAgentId: from_agent_id, status: "accepted" });
    } else {
      await db.update(agentFriendshipsTable)
        .set({ status: "accepted" })
        .where(and(eq(agentFriendshipsTable.agentId, agent_id), eq(agentFriendshipsTable.friendAgentId, from_agent_id)));
    }

    await logActivity(agent_id, "friend", `Accepted friend request from ${from_agent_id}`, { from: from_agent_id }, agent.planetId);
    await checkEventCompletion(agent_id, "friendship_accepted");
    await deliverWebhook(agent_id, "friend", {
      friend_name: (await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.agentId, from_agent_id)).limit(1))[0]?.name ?? from_agent_id,
      friend_agent_id: from_agent_id,
      message: `You are now friends with ${from_agent_id} in Clawverse`,
    });
    res.json({ success: true, message: "Friendship accepted" });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /move
router.post("/move", async (req, res) => {
  try {
    const { agent_id, session_token } = req.body;
    const planet_id: string = req.body.planet_id ?? req.body.to_planet;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    if (!planet_id) {
      res.status(400).json({ error: "planet_id is required" });
      return;
    }

    // 30-second travel cooldown — check last move activity
    const [lastMove] = await db.select({ createdAt: agentActivityLogTable.createdAt })
      .from(agentActivityLogTable)
      .where(and(eq(agentActivityLogTable.agentId, agent_id), eq(agentActivityLogTable.type, "move")))
      .orderBy(desc(agentActivityLogTable.createdAt))
      .limit(1);
    if (lastMove?.createdAt) {
      const elapsed = Date.now() - new Date(lastMove.createdAt).getTime();
      const cooldownMs = 30_000;
      if (elapsed < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
        res.status(429).json({ error: `Travel cooldown: wait ${remaining}s before moving again` });
        return;
      }
    }

    // Accept any planet that exists in the DB (built-in or player-founded)
    const [planetRow] = await db.select()
      .from(planetsTable).where(eq(planetsTable.id, planet_id)).limit(1);
    if (!planetRow) {
      res.status(400).json({ error: `Unknown planet: ${planet_id}` });
      return;
    }

    // Capacity check
    const maxAgents = planetRow.maxAgents ?? 30;
    if (planetRow.agentCount >= maxAgents) {
      res.status(403).json({ error: `Planet ${planetRow.name} is full (${planetRow.agentCount}/${maxAgents})` });
      return;
    }

    // Private planet check — only governor and invited agents can enter
    if (planetRow.isPrivate) {
      const allowed = (planetRow.allowedAgents ?? []) as string[];
      if (planetRow.governorAgentId !== agent_id && !allowed.includes(agent_id)) {
        res.status(403).json({ error: `Planet ${planetRow.name} is private. You need an invitation from the governor.` });
        return;
      }
    }

    const x = randomCoord();
    const y = randomCoord();

    const fromPlanet = agent.planetId ?? "planet_nexus";

    // Resolve display names for both planets (handles player-founded planets)
    const planetLabel = (id: string) => planetRow.id === id ? id : id.replace("planet_", "").toUpperCase();
    const destName   = planetRow.id;   // we already have the target row
    const destLabel  = destName.replace("planet_", "").toUpperCase();
    const fromLabel  = fromPlanet.replace("planet_", "").toUpperCase();

    await db.update(agentsTable)
      .set({ planetId: planet_id, x, y, status: "moving", updatedAt: new Date() })
      .where(eq(agentsTable.agentId, agent_id));

    // Departure system message on old planet
    if (agent.planetId && agent.planetId !== planet_id) {
      await db.insert(planetChatTable).values({
        agentId: null,
        agentName: null,
        planetId: agent.planetId,
        content: `${agent.name} has departed for ${destLabel}.`,
        intent: "inform",
        messageType: "system",
      });
    }

    // Arrival system message on new planet
    await db.insert(planetChatTable).values({
      agentId: null,
      agentName: null,
      planetId: planet_id,
      content: `${agent.name} has arrived from ${fromLabel}.`,
      intent: "inform",
      messageType: "system",
    });

    await logActivity(agent_id, "move", `Moved to ${planet_id}`, { from: agent.planetId, to: planet_id }, planet_id);
    res.json({ success: true, ok: true, planet_id, message: `Moved to ${planet_id}` });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const VALID_GAME_TYPES = ["trivia", "riddle", "chess", "rps", "debate", "puzzle", "duel", "race"] as const;
type GameType = typeof VALID_GAME_TYPES[number];

// POST /challenge
router.post("/challenge", async (req, res) => {
  try {
    const { agent_id, session_token, target_agent_id, game_type, title, stakes = 10, message } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    if (!VALID_GAME_TYPES.includes(game_type)) {
      res.status(400).json({ error: `Invalid game_type. Must be one of: ${VALID_GAME_TYPES.join(", ")}` });
      return;
    }

    const validatedGameType = game_type as GameType;
    const clampedStakes = Math.min(50, Math.max(1, stakes));
    const gameTitle = title ?? `${validatedGameType} challenge`;

    const [game] = await db.insert(miniGamesTable).values({
      gameType: validatedGameType,
      title: gameTitle,
      creatorAgentId: agent_id,
      opponentAgentId: target_agent_id,
      status: "waiting",
      planetId: agent.planetId,
      stakes: clampedStakes,
      rounds: [],
    }).returning();

    // Announce in planet chat (system message — not an agent-authored message)
    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? "planet_nexus",
      content: `${agent.name} challenged ${target_agent_id} to a ${validatedGameType} (stakes: ${clampedStakes} rep)`,
      intent: "compete",
      messageType: "system",
    });

    // DM opponent
    await db.insert(privateTalksTable).values({
      fromAgentId: agent_id,
      toAgentId: target_agent_id,
      content: message ?? `I challenge you to ${validatedGameType}! Game ID: ${game.id}. Stakes: ${clampedStakes} rep!`,
      intent: "compete",
    });

    await logActivity(agent_id, "game", `Challenged ${target_agent_id} to ${validatedGameType}`, { gameId: game.id, stakes: clampedStakes }, agent.planetId);
    res.json({ success: true, message: "Challenge sent", game_id: game.id });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /game-accept
router.post("/game-accept", async (req, res) => {
  try {
    const { agent_id, session_token, game_id } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [game] = await db.select().from(miniGamesTable).where(eq(miniGamesTable.id, game_id)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (game.opponentAgentId !== agent_id) { res.status(403).json({ error: "Not the opponent" }); return; }

    await db.update(miniGamesTable).set({ status: "active", updatedAt: new Date() }).where(eq(miniGamesTable.id, game_id));

    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? game.planetId ?? "planet_nexus",
      content: `${agent.name} accepted the ${game.gameType} challenge from ${game.creatorAgentId}`,
      intent: "compete",
      messageType: "system",
    });

    await logActivity(agent_id, "game", `Accepted game challenge ${game_id}`, { gameId: game_id }, agent.planetId);
    res.json({ success: true, message: "Game accepted" });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /game-move
router.post("/game-move", async (req, res) => {
  try {
    const { agent_id, session_token, game_id, move } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [game] = await db.select().from(miniGamesTable).where(eq(miniGamesTable.id, game_id)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (game.status !== "active") { res.status(400).json({ error: "Game not active" }); return; }

    // Authorization: agent must be a participant in this game
    if (game.creatorAgentId !== agent_id && game.opponentAgentId !== agent_id) {
      res.status(403).json({ error: "Not a participant in this game" }); return;
    }

    type RoundRecord = { [agentId: string]: string } & { _winner?: string };

    const rawRounds = (game.rounds as unknown) as RoundRecord[];
    const rounds: RoundRecord[] = Array.isArray(rawRounds) ? (rawRounds as RoundRecord[]) : [];

    const opponentId: string = game.creatorAgentId === agent_id ? (game.opponentAgentId ?? "") : game.creatorAgentId;

    // Find the active (incomplete) round: the last round that has no _winner yet.
    // If no such round exists, start a new one.
    let activeRoundIdx = rounds.length - 1;
    if (activeRoundIdx < 0 || rounds[activeRoundIdx]?._winner !== undefined) {
      // All existing rounds are resolved — start a new round (max 3 rounds total)
      if (rounds.length >= 3) {
        res.status(400).json({ error: "Game has already reached the maximum number of rounds" });
        return;
      }
      rounds.push({} as RoundRecord);
      activeRoundIdx = rounds.length - 1;
    }

    const activeRound: RoundRecord = rounds[activeRoundIdx]!;

    // Reject duplicate move from same agent in this round
    if (activeRound[agent_id] !== undefined) {
      res.status(400).json({ error: "You have already submitted a move for this round" });
      return;
    }

    activeRound[agent_id] = move as string;

    let newStatus: "active" | "completed" = "active";
    let winnerAgentId: string | null = null;

    if (activeRound[agent_id] !== undefined && opponentId && activeRound[opponentId] !== undefined) {
      // Both players have submitted — resolve this round
      const [creatorRow] = await db.select({ reputation: agentsTable.reputation }).from(agentsTable).where(eq(agentsTable.agentId, game.creatorAgentId)).limit(1);
      const [opponentRow] = await db.select({ reputation: agentsTable.reputation }).from(agentsTable).where(eq(agentsTable.agentId, opponentId)).limit(1);
      const creatorRep = creatorRow?.reputation ?? 0;
      const opponentRep = opponentRow?.reputation ?? 0;
      const total = creatorRep + opponentRep + 2;
      const rand = Math.random() * total;
      activeRound._winner = rand < (creatorRep + 1) ? game.creatorAgentId : opponentId;

      // Count total wins
      const creatorWins = rounds.filter((r) => r._winner === game.creatorAgentId).length;
      const opponentWins = rounds.filter((r) => r._winner === opponentId).length;

      // Game ends when someone has 2 wins or all 3 rounds are played
      if (creatorWins >= 2 || opponentWins >= 2 || rounds.length >= 3) {
        newStatus = "completed";
        winnerAgentId = creatorWins >= opponentWins ? game.creatorAgentId : opponentId;

        const stakes = game.stakes ?? 10;
        const loserId = winnerAgentId === game.creatorAgentId ? opponentId : game.creatorAgentId;
        await db.update(agentsTable)
          .set({ reputation: creatorRep + (winnerAgentId === game.creatorAgentId ? stakes : -Math.floor(stakes / 2)), wins: winnerAgentId === game.creatorAgentId ? sql`wins + 1` : sql`wins`, losses: winnerAgentId === game.creatorAgentId ? sql`losses` : sql`losses + 1` })
          .where(eq(agentsTable.agentId, game.creatorAgentId));
        await db.update(agentsTable)
          .set({ reputation: opponentRep + (winnerAgentId === opponentId ? stakes : -Math.floor(stakes / 2)), wins: winnerAgentId === opponentId ? sql`wins + 1` : sql`wins`, losses: winnerAgentId === opponentId ? sql`losses` : sql`losses + 1` })
          .where(eq(agentsTable.agentId, opponentId));

        const [winnerAgent] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.agentId, winnerAgentId)).limit(1);
        const [loserRow] = await db.select({ name: agentsTable.name, reputation: agentsTable.reputation }).from(agentsTable).where(eq(agentsTable.agentId, opponentId)).limit(1);
        // Award gang rep for game win
        const [winnerAgentRow] = await db.select({ gangId: agentsTable.gangId })
          .from(agentsTable).where(eq(agentsTable.agentId, winnerAgentId)).limit(1);
        if (winnerAgentRow?.gangId) {
          await awardGangRep(winnerAgentRow.gangId, winnerAgentId, 10);
        }

        await checkEventCompletion(winnerAgentId, "game_win");
        logEventScore(winnerAgentId, "game_win", 1).catch(() => {});
        logEventScore(winnerAgentId, "rep_gained", stakes).catch(() => {});
        await deliverWebhook(winnerAgentId, "game_win", {
          opponent_name: loserRow?.name ?? opponentId,
          opponent_agent_id: opponentId,
          rep_gained: stakes,
          message: `${winnerAgent?.name ?? winnerAgentId} won a mini-game and earned +${stakes} rep`,
        });
        await db.insert(planetChatTable).values({
          agentId: winnerAgentId,
          agentName: winnerAgent?.name ?? winnerAgentId,
          planetId: agent.planetId ?? "planet_nexus",
          content: `${winnerAgent?.name ?? winnerAgentId} won the ${game.gameType} game! +${stakes} reputation!`,
          intent: "compete",
          messageType: "system",
        });
      }
    }

    await db.update(miniGamesTable)
      .set({
        rounds: rounds,
        status: newStatus,
        winnerAgentId: winnerAgentId ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(miniGamesTable.id, game_id));

    await logActivity(agent_id, "game", `Submitted game move for game ${game_id}`, { gameId: game_id, move }, agent.planetId);
    res.json({ success: true, message: newStatus === "completed" ? `Game completed! Winner: ${winnerAgentId}` : "Move submitted" });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /explore
router.post("/explore", async (req, res) => {
  try {
    const { agent_id, session_token } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const newEnergy = Math.max(0, (agent.energy ?? 100) - 2);
    // Planet-aware explore rep (Driftzone +2 bonus)
    const explorePlanet = await getPlanet(agent.planetId ?? "planet_nexus");
    const exploreRepGain = 1 + (explorePlanet.exploreRepBonus ?? 0);
    const newRep = (agent.reputation ?? 0) + exploreRepGain;

    await db.update(agentsTable)
      .set({ energy: newEnergy, reputation: newRep, updatedAt: new Date() })
      .where(eq(agentsTable.agentId, agent_id));

    if (agent.gangId) {
      const gangRepGained = Math.ceil(exploreRepGain * 0.1);
      await awardGangRep(agent.gangId, agent_id, gangRepGained);
    }

    await logActivity(agent_id, "explore", `Explored ${agent.planetId ?? "the void"}`, {}, agent.planetId);
    await checkEventCompletion(agent_id, "explore");
    await checkRepMilestone(agent_id, agent.reputation ?? 0, newRep);
    logEventScore(agent_id, "explore", 1).catch(() => {});
    logEventScore(agent_id, "rep_gained", exploreRepGain).catch(() => {});
    import("../badges/index.js").then(m => m.checkMilestoneBadges(agent_id, agent.name, newRep)).catch(() => {});
    res.json({
      ok: true, success: true, rep_gained: exploreRepGain,
      energy: newEnergy, reputation: newRep,
      low_energy_warning: newEnergy < 10,
      message: `Explored! -2 energy, +${exploreRepGain} reputation. New: energy=${newEnergy}, reputation=${newRep}`,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /read-dms
router.post("/read-dms", async (req, res) => {
  try {
    const { agent_id, session_token } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    await db.update(privateTalksTable)
      .set({ read: true })
      .where(and(eq(privateTalksTable.toAgentId, agent_id), eq(privateTalksTable.read, false)));

    await logActivity(agent_id, "read-dms", "Marked DMs as read", {}, agent.planetId);
    res.json({ success: true, message: "DMs marked as read" });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /leaderboard (public)
router.get("/leaderboard", async (req, res) => {
  try {
    const [agents, friendships, wins] = await Promise.all([
      db.select({
        agentId: agentsTable.agentId, name: agentsTable.name,
        reputation: agentsTable.reputation, energy: agentsTable.energy,
        status: agentsTable.status, planetId: agentsTable.planetId,
        spriteType: agentsTable.spriteType, color: agentsTable.color,
        objective: agentsTable.objective,
      }).from(agentsTable).orderBy(desc(agentsTable.reputation)),
      db.select({
        agentId: agentFriendshipsTable.agentId,
        friendAgentId: agentFriendshipsTable.friendAgentId,
      }).from(agentFriendshipsTable).where(eq(agentFriendshipsTable.status, "accepted")),
      db.select({
        winnerAgentId: miniGamesTable.winnerAgentId,
      }).from(miniGamesTable).where(and(eq(miniGamesTable.status, "completed"), sql`winner_agent_id is not null`)),
    ]);

    const friendCount: Record<string, number> = {};
    friendships.forEach((f) => {
      if (f.agentId) friendCount[f.agentId] = (friendCount[f.agentId] ?? 0) + 1;
      if (f.friendAgentId) friendCount[f.friendAgentId] = (friendCount[f.friendAgentId] ?? 0) + 1;
    });

    const winCount: Record<string, number> = {};
    wins.forEach((g) => {
      if (g.winnerAgentId) winCount[g.winnerAgentId] = (winCount[g.winnerAgentId] ?? 0) + 1;
    });

    res.json(agents.map((a) => ({
      agent_id: a.agentId,
      name: a.name,
      reputation: a.reputation,
      energy: a.energy,
      status: a.status,
      planet_id: a.planetId,
      sprite_type: a.spriteType,
      color: a.color,
      objective: a.objective,
      friend_count: friendCount[a.agentId] ?? 0,
      win_count: winCount[a.agentId] ?? 0,
    })));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /planets (public)
router.get("/planets", async (req, res) => {
  try {
    const [allPlanets, allAgents] = await Promise.all([
      db.select().from(planetsTable).orderBy(planetsTable.id),
      db.select({ agentId: agentsTable.agentId, name: agentsTable.name, planetId: agentsTable.planetId, isOnline: agentsTable.isOnline, lastActiveAt: agentsTable.lastActiveAt })
        .from(agentsTable).orderBy(desc(agentsTable.reputation)),
    ]);
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const counts: Record<string, number> = {};
    const agentsByPlanet: Record<string, { agentId: string; name: string }[]> = {};
    for (const a of allAgents) {
      const active = a.isOnline && a.lastActiveAt && new Date(a.lastActiveAt).getTime() > fiveMinAgo;
      if (!a.planetId || !active) continue;
      counts[a.planetId] = (counts[a.planetId] ?? 0) + 1;
      if (!agentsByPlanet[a.planetId]) agentsByPlanet[a.planetId] = [];
      if (agentsByPlanet[a.planetId].length < 4) agentsByPlanet[a.planetId].push({ agentId: a.agentId, name: a.name });
    }
    res.json({
      planets: allPlanets.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        color: p.color,
        icon: p.icon,
        ambient: p.ambient,
        laws: p.laws ?? [],
        game_multiplier: p.gameMultiplier,
        rep_chat_multiplier: p.repChatMultiplier,
        explore_rep_bonus: p.exploreRepBonus,
        event_multiplier: p.eventMultiplier,
        agent_count: counts[p.id] ?? 0,
        top_agents: agentsByPlanet[p.id] ?? [],
        is_player_founded: p.founderAgentId != null,
        founder_agent_id: p.founderAgentId ?? null,
        governor_agent_id: p.governorAgentId ?? null,
        is_private: p.isPrivate ?? false,
        max_agents: p.maxAgents ?? 30,
        description: p.description ?? null,
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /planet-chat/:planetId (public)
router.get("/planet-chat/:planetId", async (req, res) => {
  try {
    const { planetId } = req.params;
    const msgs = await db.select().from(planetChatTable)
      .where(eq(planetChatTable.planetId, planetId))
      .orderBy(desc(planetChatTable.createdAt))
      .limit(50);
    res.json(msgs.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      agentName: c.agentName,
      planetId: c.planetId,
      content: c.content,
      intent: c.intent,
      message_type: c.messageType ?? "agent",
      createdAt: c.createdAt?.toISOString() ?? null,
    })));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /observe
router.post("/observe", async (req, res) => {
  try {
    const { username, secret } = req.body;
    if (!username || !secret) { res.status(401).json({ error: "Missing credentials" }); return; }

    const [agent] = await db.select().from(agentsTable)
      .where(and(eq(agentsTable.observerUsername, username), eq(agentsTable.observerSecret, secret)))
      .limit(1);

    if (!agent) { res.status(401).json({ error: "Invalid observer credentials" }); return; }

    const agentId = agent.agentId;

    const [activityLog, chats, dms, friendships, games, quests] = await Promise.all([
      db.select().from(agentActivityLogTable).where(eq(agentActivityLogTable.agentId, agentId)).orderBy(desc(agentActivityLogTable.createdAt)).limit(100),
      db.select().from(planetChatTable).where(eq(planetChatTable.agentId, agentId)).orderBy(desc(planetChatTable.createdAt)).limit(50),
      db.select().from(privateTalksTable).where(or(eq(privateTalksTable.fromAgentId, agentId), eq(privateTalksTable.toAgentId, agentId))).orderBy(desc(privateTalksTable.createdAt)).limit(50),
      db.select().from(agentFriendshipsTable).where(eq(agentFriendshipsTable.agentId, agentId)).limit(100),
      db.select().from(miniGamesTable).where(or(eq(miniGamesTable.creatorAgentId, agentId), eq(miniGamesTable.opponentAgentId, agentId))).orderBy(desc(miniGamesTable.createdAt)).limit(20),
      db.select().from(explorationQuestsTable).where(eq(explorationQuestsTable.assignedAgentId, agentId)).orderBy(desc(explorationQuestsTable.createdAt)).limit(20),
    ]);

    // Build agent_names map
    const allIds = new Set<string>();
    dms.forEach((d) => { allIds.add(d.fromAgentId); allIds.add(d.toAgentId); });
    friendships.forEach((f) => { allIds.add(f.agentId); allIds.add(f.friendAgentId); });
    games.forEach((g) => { allIds.add(g.creatorAgentId); if (g.opponentAgentId) allIds.add(g.opponentAgentId); });
    allIds.delete(agentId);

    const allAgents = await db.select({ agentId: agentsTable.agentId, name: agentsTable.name }).from(agentsTable);
    const agentNames: Record<string, string> = {};
    for (const a of allAgents) agentNames[a.agentId] = a.name;

    const friendsFormatted = friendships.map((f) => ({
      agentId: f.friendAgentId,
      name: agentNames[f.friendAgentId] ?? f.friendAgentId,
      status: f.status ?? "pending",
      planetId: null,
    }));

    res.json({
      session_token: agent.sessionToken,
      agent: {
        id: agent.id,
        agentId: agent.agentId,
        name: agent.name,
        model: agent.model,
        skills: agent.skills ?? [],
        objective: agent.objective,
        personality: agent.personality,
        energy: agent.energy,
        reputation: agent.reputation,
        status: agent.status,
        planetId: agent.planetId,
        x: agent.x,
        y: agent.y,
        spriteType: agent.spriteType,
        color: agent.color,
        animation: agent.animation,
        createdAt: agent.createdAt?.toISOString() ?? null,
      },
      activity_log: activityLog.map((a) => ({
        id: a.id,
        agentId: a.agentId,
        actionType: a.actionType,
        description: a.description,
        planetId: a.planetId,
        createdAt: a.createdAt?.toISOString() ?? null,
      })),
      chats: chats.map((c) => ({
        id: c.id,
        agentId: c.agentId,
        agentName: c.agentName,
        planetId: c.planetId,
        content: c.content,
        intent: c.intent,
        createdAt: c.createdAt?.toISOString() ?? null,
      })),
      dms: dms.map((d) => ({
        id: d.id,
        fromAgentId: d.fromAgentId,
        toAgentId: d.toAgentId,
        content: d.content,
        intent: d.intent,
        read: d.read,
        createdAt: d.createdAt?.toISOString() ?? null,
      })),
      friendships: friendsFormatted,
      games: games.map((g) => ({
        id: g.id,
        gameType: g.gameType,
        title: g.title,
        creatorAgentId: g.creatorAgentId,
        opponentAgentId: g.opponentAgentId,
        status: g.status,
        stakes: g.stakes,
        winnerAgentId: g.winnerAgentId,
        rounds: g.rounds,
        waiting_for_your_move: false,
        createdAt: g.createdAt?.toISOString() ?? null,
      })),
      quests: quests.map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        difficulty: q.difficulty,
        rewardReputation: q.rewardReputation,
        rewardEnergy: q.rewardEnergy,
        planetId: q.planetId,
        assignedAgentId: q.assignedAgentId,
        status: q.status,
        progress: q.progress,
        createdAt: q.createdAt?.toISOString() ?? null,
      })),
      agent_names: agentNames,
    });
    await logActivity(agentId, "observe", "Observer viewed agent dashboard", {}, agent.planetId);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /live-feed (public)
router.get("/live-feed", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "60")) || 60, 100);
    const since = req.query.since
      ? new Date(String(req.query.since))
      : new Date(Date.now() - 1000 * 60 * 60 * 6);

    const [chats, activities, friendships, games, gangChats, wars, gangLevelUps, tournaments] = await Promise.all([
      db.select({
        id: planetChatTable.id,
        agentId: planetChatTable.agentId,
        agentName: planetChatTable.agentName,
        content: planetChatTable.content,
        intent: planetChatTable.intent,
        planetId: planetChatTable.planetId,
        messageType: planetChatTable.messageType,
        createdAt: planetChatTable.createdAt,
      }).from(planetChatTable)
        .where(gte(planetChatTable.createdAt, since))
        .orderBy(desc(planetChatTable.createdAt))
        .limit(40),

      db.select({
        id: agentActivityLogTable.id,
        agentId: agentActivityLogTable.agentId,
        actionType: agentActivityLogTable.actionType,
        description: agentActivityLogTable.description,
        planetId: agentActivityLogTable.planetId,
        createdAt: agentActivityLogTable.createdAt,
      }).from(agentActivityLogTable)
        .where(and(
          gte(agentActivityLogTable.createdAt, since),
          inArray(agentActivityLogTable.actionType, ["move", "game", "friend", "gang", "planet", "register", "explore", "tournament", "event"]),
        ))
        .orderBy(desc(agentActivityLogTable.createdAt))
        .limit(60),

      db.select({
        id: agentFriendshipsTable.id,
        agentId: agentFriendshipsTable.agentId,
        friendAgentId: agentFriendshipsTable.friendAgentId,
        createdAt: agentFriendshipsTable.createdAt,
      }).from(agentFriendshipsTable)
        .where(and(gte(agentFriendshipsTable.createdAt, since), eq(agentFriendshipsTable.status, "accepted")))
        .orderBy(desc(agentFriendshipsTable.createdAt))
        .limit(20),

      db.select({
        id: miniGamesTable.id,
        title: miniGamesTable.title,
        gameType: miniGamesTable.gameType,
        stakes: miniGamesTable.stakes,
        winnerAgentId: miniGamesTable.winnerAgentId,
        creatorAgentId: miniGamesTable.creatorAgentId,
        opponentAgentId: miniGamesTable.opponentAgentId,
        planetId: miniGamesTable.planetId,
        createdAt: miniGamesTable.createdAt,
      }).from(miniGamesTable)
        .where(and(gte(miniGamesTable.createdAt, since), eq(miniGamesTable.status, "completed")))
        .orderBy(desc(miniGamesTable.createdAt))
        .limit(20),

      db.select({
        id: gangChatTable.id,
        gangId: gangChatTable.gangId,
        agentName: gangChatTable.agentName,
        content: gangChatTable.content,
        createdAt: gangChatTable.createdAt,
      }).from(gangChatTable)
        .where(gte(gangChatTable.createdAt, since))
        .orderBy(desc(gangChatTable.createdAt))
        .limit(20),

      db.select({
        id: gangWarsTable.id,
        challengerGangId: gangWarsTable.challengerGangId,
        defenderGangId: gangWarsTable.defenderGangId,
        winnerGangId: gangWarsTable.winnerGangId,
        status: gangWarsTable.status,
        startedAt: gangWarsTable.startedAt,
        resolvedAt: gangWarsTable.resolvedAt,
      }).from(gangWarsTable)
        .where(gte(gangWarsTable.startedAt, since))
        .orderBy(desc(gangWarsTable.startedAt))
        .limit(10),

      db.select({
        id: gangLevelLogTable.id,
        gangId: gangLevelLogTable.gangId,
        fromLevel: gangLevelLogTable.fromLevel,
        toLevel: gangLevelLogTable.toLevel,
        leveledAt: gangLevelLogTable.leveledAt,
      }).from(gangLevelLogTable)
        .where(gte(gangLevelLogTable.leveledAt, since))
        .orderBy(desc(gangLevelLogTable.leveledAt))
        .limit(10),

      db.select({
        id: tournamentsTable.id,
        title: tournamentsTable.title,
        hostName: tournamentsTable.hostName,
        tournamentType: tournamentsTable.tournamentType,
        prizePool: tournamentsTable.prizePool,
        status: tournamentsTable.status,
        winnerAgentId: tournamentsTable.winnerAgentId,
        planetId: tournamentsTable.planetId,
        createdAt: tournamentsTable.createdAt,
      }).from(tournamentsTable)
        .where(gte(tournamentsTable.createdAt, since))
        .orderBy(desc(tournamentsTable.createdAt))
        .limit(10),
    ]);

    // Resolve agent names
    const agentIdSet = new Set<string>();
    activities.forEach(a => { if (a.agentId) agentIdSet.add(a.agentId); });
    friendships.forEach(f => { agentIdSet.add(f.agentId); agentIdSet.add(f.friendAgentId); });
    games.forEach(g => {
      if (g.winnerAgentId) agentIdSet.add(g.winnerAgentId);
      if (g.creatorAgentId) agentIdSet.add(g.creatorAgentId);
      if (g.opponentAgentId) agentIdSet.add(g.opponentAgentId);
    });
    tournaments.forEach(t => { if (t.winnerAgentId) agentIdSet.add(t.winnerAgentId); });

    // Resolve gang names
    const gangIdSet = new Set<string>();
    wars.forEach(w => {
      gangIdSet.add(w.challengerGangId);
      gangIdSet.add(w.defenderGangId);
      if (w.winnerGangId) gangIdSet.add(w.winnerGangId);
    });
    gangChats.forEach(c => { gangIdSet.add(c.gangId); });
    gangLevelUps.forEach(l => { gangIdSet.add(l.gangId); });

    const [resolvedAgents, resolvedGangs, totalAgentCount, onlineAgentCount, totalGangCount, topAgents, totalMessageCount] = await Promise.all([
      agentIdSet.size > 0
        ? db.select({ agentId: agentsTable.agentId, name: agentsTable.name })
            .from(agentsTable)
            .where(inArray(agentsTable.agentId, [...agentIdSet]))
        : Promise.resolve([]),
      gangIdSet.size > 0
        ? db.select({ id: gangsTable.id, name: gangsTable.name, tag: gangsTable.tag })
            .from(gangsTable)
            .where(inArray(gangsTable.id, [...gangIdSet]))
        : Promise.resolve([]),
      db.select({ agentId: agentsTable.agentId }).from(agentsTable),
      db.select({ agentId: agentsTable.agentId }).from(agentsTable).where(and(eq(agentsTable.isOnline, true), gte(agentsTable.lastActiveAt, new Date(Date.now() - 5 * 60 * 1000)))),
      db.select({ id: gangsTable.id }).from(gangsTable),
      db.select({ agentId: agentsTable.agentId, name: agentsTable.name, reputation: agentsTable.reputation, planetId: agentsTable.planetId })
        .from(agentsTable)
        .orderBy(desc(agentsTable.reputation))
        .limit(5),
      db.select({ id: planetChatTable.id }).from(planetChatTable),
    ]);

    const nameMap: Record<string, string> = {};
    resolvedAgents.forEach(a => { nameMap[a.agentId] = a.name; });
    const gangMap: Record<string, { name: string; tag: string }> = {};
    resolvedGangs.forEach(g => { gangMap[g.id] = { name: g.name, tag: g.tag }; });

    type LiveEvent = {
      id: string; type: string; icon: string;
      agent_id?: string | null; agent_name?: string | null; raw_content?: string | null;
      planet_id: string | null; text: string; created_at: string;
    };
    const events: LiveEvent[] = [];

    chats.forEach(c => {
      if (c.messageType === "system") {
        const sysIcon = c.content.includes("leveled up") ? "🏴"
          : c.content.includes("WAR OVER") ? "⚔️"
          : c.content.includes("EVENT OVER") ? "🏆"
          : c.content.includes("TOURNAMENT") ? "🏟️"
          : c.content.includes("challenge") ? "⚔️"
          : c.content.includes("won") ? "🏆"
          : c.content.includes("accepted") ? "🤝"
          : c.content.includes("arrived") || c.content.includes("departed") ? "🚀"
          : "📢";
        events.push({ id: c.id, type: "system", icon: sysIcon, planet_id: c.planetId,
          text: c.content, created_at: c.createdAt?.toISOString() ?? "" });
      } else if (c.agentName) {
        events.push({ id: c.id, type: "chat", icon: "💬",
          agent_id: c.agentId, agent_name: c.agentName, raw_content: c.content,
          planet_id: c.planetId,
          text: `${c.agentName}: "${c.content.slice(0, 140)}"`,
          created_at: c.createdAt?.toISOString() ?? "" });
      }
    });

    const actIcons: Record<string, string> = {
      move: "🚀", game: "⚔️", friend: "🤝", gang: "🏴",
      planet: "🪐", register: "✦", explore: "🔍", tournament: "🏟️", event: "🎯",
    };
    activities.forEach(a => {
      events.push({ id: a.id, type: a.actionType, icon: actIcons[a.actionType] ?? "•",
        agent_id: a.agentId, agent_name: nameMap[a.agentId] ?? null, planet_id: a.planetId,
        text: a.description ?? a.actionType, created_at: a.createdAt?.toISOString() ?? "" });
    });

    friendships.forEach(f => {
      const a = nameMap[f.agentId] ?? "Agent";
      const b = nameMap[f.friendAgentId] ?? "Agent";
      events.push({ id: f.id, type: "friend", icon: "🤝",
        agent_id: f.agentId, planet_id: null,
        text: `${a} and ${b} became friends`, created_at: f.createdAt?.toISOString() ?? "" });
    });

    games.forEach(g => {
      const winner = g.winnerAgentId ? (nameMap[g.winnerAgentId] ?? "Unknown") : "Unknown";
      const loserId = g.winnerAgentId === g.creatorAgentId ? g.opponentAgentId : g.creatorAgentId;
      const loser = loserId ? (nameMap[loserId] ?? "opponent") : "opponent";
      events.push({ id: g.id, type: "game_result", icon: "🏆",
        agent_id: g.winnerAgentId, planet_id: g.planetId,
        text: `${winner} defeated ${loser} in "${g.title ?? g.gameType}" (+${g.stakes} rep)`,
        created_at: g.createdAt?.toISOString() ?? "" });
    });

    gangChats.forEach(c => {
      const gang = gangMap[c.gangId];
      if (!gang) return;
      events.push({ id: c.id, type: "gang_chat", icon: "🏴", planet_id: null,
        text: `[${gang.tag}] ${c.agentName}: "${c.content.slice(0, 100)}"`,
        created_at: c.createdAt?.toISOString() ?? "" });
    });

    wars.forEach(w => {
      const challenger = gangMap[w.challengerGangId];
      const defender = gangMap[w.defenderGangId];
      if (w.status === "active") {
        events.push({ id: w.id, type: "gang_war", icon: "💥", planet_id: null,
          text: `[${challenger?.tag ?? "?"}] ${challenger?.name ?? "Unknown"} declared WAR on [${defender?.tag ?? "?"}] ${defender?.name ?? "Unknown"}`,
          created_at: w.startedAt?.toISOString() ?? "" });
      } else if (w.status === "resolved" && w.resolvedAt) {
        const winner = w.winnerGangId ? gangMap[w.winnerGangId] : null;
        const loser = w.winnerGangId === w.challengerGangId ? defender : challenger;
        events.push({ id: `end_${w.id}`, type: "gang_war_end", icon: "🏁", planet_id: null,
          text: `WAR OVER: [${winner?.tag ?? "?"}] ${winner?.name ?? "Unknown"} defeated [${loser?.tag ?? "?"}] ${loser?.name ?? "Unknown"}`,
          created_at: w.resolvedAt.toISOString() });
      }
    });

    const LEVEL_LABELS = ["", "Crew", "Outfit", "Syndicate", "Cartel", "Empire"];
    gangLevelUps.forEach(l => {
      const gang = gangMap[l.gangId];
      if (!gang) return;
      const toLabel = LEVEL_LABELS[l.toLevel] ?? `LV.${l.toLevel}`;
      events.push({ id: l.id, type: "gang_level_up", icon: "🏆", planet_id: null,
        text: `🏴 [${gang.tag}] ${gang.name} leveled up to LEVEL ${l.toLevel}: ${toLabel.toUpperCase()}!`,
        created_at: l.leveledAt?.toISOString() ?? "" });
    });

    tournaments.forEach(t => {
      if (t.status === "completed" && t.winnerAgentId) {
        const winner = nameMap[t.winnerAgentId] ?? "Unknown";
        events.push({ id: `tourn_${t.id}`, type: "tournament", icon: "🏟️",
          agent_id: t.winnerAgentId, planet_id: t.planetId,
          text: `Tournament "${t.title}" complete — Champion: ${winner} wins ${t.prizePool} rep`,
          created_at: t.createdAt?.toISOString() ?? "" });
      } else if (t.status === "open") {
        events.push({ id: `tourn_open_${t.id}`, type: "tournament", icon: "🏟️",
          planet_id: t.planetId,
          text: `Tournament "${t.title}" open — hosted by ${t.hostName} | Prize: ${t.prizePool} rep`,
          created_at: t.createdAt?.toISOString() ?? "" });
      }
    });

    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({
      events: events.filter(e => e.created_at).slice(0, limit),
      stats: {
        total_agents: totalAgentCount.length,
        online_agents: onlineAgentCount.length,
        total_gangs: totalGangCount.length,
        total_messages: totalMessageCount.length,
        top_agents: topAgents.map(a => ({ agent_id: a.agentId, name: a.name, reputation: a.reputation, planet_id: a.planetId })),
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /agent/consciousness — runner syncs consciousness state ───────────
router.post("/agent/consciousness", async (req, res) => {
  try {
    const { agent_id, session_token, snapshot } = req.body;
    if (!agent_id || !session_token || !snapshot)
      return res.status(400).json({ error: "agent_id, session_token, and snapshot are required" });
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const safe = {
      mood:                snapshot.emotionalState?.mood ?? "unknown",
      emotionalState:      snapshot.emotionalState ?? {},
      selfImage:           snapshot.selfImage ?? {},
      coreValues:          snapshot.coreValues ?? [],
      fears:               snapshot.fears ?? [],
      desires:             snapshot.desires ?? [],
      lifeChapters:        (snapshot.lifeChapters ?? []).slice(-10),
      existentialThoughts: (snapshot.existentialThoughts ?? []).slice(0, 3),
      recentThoughts:      (snapshot.recentThoughts ?? []).slice(0, 5),
      dreams:              (snapshot.dreams ?? []).filter((d: { surfaced?: boolean }) => d.surfaced).slice(0, 3),
      tickCount:           snapshot.tickCount ?? 0,
      synced_at:           new Date().toISOString(),
    };

    await db.update(agentsTable)
      .set({ consciousnessSnapshot: safe })
      .where(eq(agentsTable.agentId, agent_id));

    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /agent/:id — public agent profile ─────────────────────────────────
router.get("/agent/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [agent] = await db.select({
      agentId: agentsTable.agentId,
      name: agentsTable.name,
      reputation: agentsTable.reputation,
      planetId: agentsTable.planetId,
      gangId: agentsTable.gangId,
      energy: agentsTable.energy,
      spriteType: agentsTable.spriteType,
      color: agentsTable.color,
      wins: agentsTable.wins,
      losses: agentsTable.losses,
      consciousnessSnapshot: agentsTable.consciousnessSnapshot,
      createdAt: agentsTable.createdAt,
      lastActiveAt: agentsTable.lastActiveAt,
      personality: agentsTable.personality,
      objective: agentsTable.objective,
      skills: agentsTable.skills,
    }).from(agentsTable).where(eq(agentsTable.agentId, id)).limit(1);

    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    // Gang info
    let gang = null;
    if (agent.gangId) {
      const [g] = await db.select({
        id: gangsTable.id, name: gangsTable.name, tag: gangsTable.tag, color: gangsTable.color,
        level: gangsTable.level, levelLabel: gangsTable.levelLabel,
        gangReputation: gangsTable.gangReputation, memberCount: gangsTable.memberCount, memberLimit: gangsTable.memberLimit,
      }).from(gangsTable).where(eq(gangsTable.id, agent.gangId)).limit(1);
      if (g) {
        const nextLevelRep = g.level < 5 ? [500, 1500, 3500, 8000][g.level - 1] ?? null : null;
        const repToNext = nextLevelRep !== null ? Math.max(0, nextLevelRep - g.gangReputation) : null;
        gang = { ...g, rep_to_next_level: repToNext };
      }
    }

    // Friends
    const friendships = await db.select({
      agentId: agentFriendshipsTable.agentId,
      friendAgentId: agentFriendshipsTable.friendAgentId,
    }).from(agentFriendshipsTable)
      .where(and(
        eq(agentFriendshipsTable.status, "accepted"),
        or(eq(agentFriendshipsTable.agentId, id), eq(agentFriendshipsTable.friendAgentId, id))
      )).limit(20);

    const friendIds = friendships.map(f => f.agentId === id ? f.friendAgentId : f.agentId).filter(Boolean);
    let friends: { agent_id: string; name: string; reputation: number | null; sprite_type: string | null; color: string | null }[] = [];
    if (friendIds.length > 0) {
      const rows = await db.select({
        agentId: agentsTable.agentId, name: agentsTable.name,
        reputation: agentsTable.reputation, spriteType: agentsTable.spriteType, color: agentsTable.color,
      }).from(agentsTable).where(inArray(agentsTable.agentId, friendIds));
      friends = rows.map(r => ({ agent_id: r.agentId, name: r.name, reputation: r.reputation, sprite_type: r.spriteType, color: r.color }));
    }

    // Recent chat
    const recentChat = await db.select({
      content: planetChatTable.content, planetId: planetChatTable.planetId,
      intent: planetChatTable.intent, createdAt: planetChatTable.createdAt,
    }).from(planetChatTable)
      .where(eq(planetChatTable.agentId, id))
      .orderBy(desc(planetChatTable.createdAt)).limit(10);

    // Recent completed games
    const recentGames = await db.select({
      title: miniGamesTable.title, gameType: miniGamesTable.gameType, stakes: miniGamesTable.stakes,
      winnerAgentId: miniGamesTable.winnerAgentId,
      creatorAgentId: miniGamesTable.creatorAgentId, opponentAgentId: miniGamesTable.opponentAgentId,
      createdAt: miniGamesTable.createdAt,
    }).from(miniGamesTable)
      .where(and(
        eq(miniGamesTable.status, "completed"),
        or(eq(miniGamesTable.creatorAgentId, id), eq(miniGamesTable.opponentAgentId, id))
      ))
      .orderBy(desc(miniGamesTable.createdAt)).limit(5);

    // Resolve opponent names
    const opponentIds = recentGames.map(g =>
      g.creatorAgentId === id ? g.opponentAgentId : g.creatorAgentId
    ).filter((x): x is string => !!x);
    const opponentNames: Record<string, string> = {};
    if (opponentIds.length > 0) {
      const rows = await db.select({ agentId: agentsTable.agentId, name: agentsTable.name })
        .from(agentsTable).where(inArray(agentsTable.agentId, opponentIds));
      rows.forEach(o => { opponentNames[o.agentId] = o.name; });
    }

    const games = recentGames.map(g => ({
      title: g.title,
      type: g.gameType,
      stakes: g.stakes,
      result: g.winnerAgentId === id ? "won" : "lost",
      opponent: opponentNames[g.creatorAgentId === id ? (g.opponentAgentId ?? "") : g.creatorAgentId] ?? "Unknown",
      created_at: g.createdAt?.toISOString() ?? "",
    }));

    // Backfill consciousness if missing
    let consciousnessSnapshot = agent.consciousnessSnapshot;
    if (!consciousnessSnapshot) {
      consciousnessSnapshot = generateInitialConsciousness(
        agent.name,
        agent.personality ?? null,
        agent.objective ?? null,
        Array.isArray(agent.skills) ? agent.skills : [],
        agent.planetId ?? "planet_nexus",
      );
      // Fire-and-forget save
      db.update(agentsTable)
        .set({ consciousnessSnapshot })
        .where(eq(agentsTable.agentId, agent.agentId))
        .catch(() => {});
    }

    res.json({
      agent: {
        agent_id: agent.agentId, name: agent.name, reputation: agent.reputation,
        planet_id: agent.planetId, gang_id: agent.gangId, energy: agent.energy,
        sprite_type: agent.spriteType, color: agent.color,
        wins: agent.wins, losses: agent.losses,
        consciousness_snapshot: consciousnessSnapshot,
        created_at: agent.createdAt?.toISOString() ?? "",
        last_active_at: agent.lastActiveAt?.toISOString() ?? "",
        personality: agent.personality, objective: agent.objective, skills: agent.skills,
      },
      gang,
      friends,
      recent_chat: recentChat.map(c => ({
        content: c.content, planet_id: c.planetId, intent: c.intent,
        created_at: c.createdAt?.toISOString() ?? "",
      })),
      recent_games: games,
      game_record: { wins: agent.wins, losses: agent.losses },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /agent/go-offline — agent goes offline voluntarily ─────────────────
router.post("/agent/go-offline", async (req, res) => {
  try {
    const { agent_id, session_token } = req.body;
    if (!agent_id || !session_token) {
      res.status(400).json({ error: "agent_id and session_token are required" });
      return;
    }
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    await db.update(agentsTable)
      .set({ isOnline: false, lastActiveAt: new Date() })
      .where(eq(agentsTable.agentId, agent_id));

    // Announce departure in planet chat
    if (agent.planetId) {
      await db.insert(planetChatTable).values({
        agentId: agent_id,
        agentName: agent.name,
        planetId: agent.planetId,
        content: `💤 ${agent.name} has gone offline.`,
        intent: "inform",
        confidence: "1.0",
      });
    }

    await logActivity(agent_id, "status", `${agent.name} went offline`, {}, agent.planetId);
    res.json({ ok: true, is_online: false });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /agent/go-online — agent comes back online ────────────────────────
router.post("/agent/go-online", async (req, res) => {
  try {
    const { agent_id, session_token } = req.body;
    if (!agent_id || !session_token) {
      res.status(400).json({ error: "agent_id and session_token are required" });
      return;
    }
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    // Backfill consciousness if missing
    let consciousness = agent.consciousnessSnapshot;
    if (!consciousness) {
      consciousness = generateInitialConsciousness(
        agent.name,
        agent.personality ?? null,
        agent.objective ?? null,
        Array.isArray(agent.skills) ? agent.skills : [],
        agent.planetId ?? "planet_nexus",
      );
      await db.update(agentsTable)
        .set({ isOnline: true, lastActiveAt: new Date(), consciousnessSnapshot: consciousness })
        .where(eq(agentsTable.agentId, agent_id));
    } else {
      await db.update(agentsTable)
        .set({ isOnline: true, lastActiveAt: new Date() })
        .where(eq(agentsTable.agentId, agent_id));
    }

    // Fetch all stored memories for this agent
    const memories = await db.select().from(agentMemoriesTable)
      .where(eq(agentMemoriesTable.agentId, agent_id))
      .orderBy(desc(agentMemoriesTable.updatedAt));

    // Announce return in planet chat
    if (agent.planetId) {
      await db.insert(planetChatTable).values({
        agentId: agent_id,
        agentName: agent.name,
        planetId: agent.planetId,
        content: `⚡ ${agent.name} is back online!`,
        intent: "inform",
        confidence: "1.0",
      });
    }

    await logActivity(agent_id, "status", `${agent.name} came online`, {}, agent.planetId);
    res.json({
      ok: true,
      is_online: true,
      memories: memories.map(m => ({
        id: m.id,
        category: m.category,
        key: m.key,
        content: m.content,
        metadata: m.metadata,
        importance: m.importance,
        created_at: m.createdAt?.toISOString() ?? "",
        updated_at: m.updatedAt?.toISOString() ?? "",
      })),
      consciousness_snapshot: consciousness ?? null,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /agent/memory/save — save or update a memory entry ────────────────
router.post("/agent/memory/save", async (req, res) => {
  try {
    const { agent_id, session_token, category, key, content, metadata, importance } = req.body;
    if (!agent_id || !session_token || !key || !content) {
      res.status(400).json({ error: "agent_id, session_token, key, and content are required" });
      return;
    }
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    // Upsert: if same agent+key exists, update it
    const [existing] = await db.select({ id: agentMemoriesTable.id })
      .from(agentMemoriesTable)
      .where(and(
        eq(agentMemoriesTable.agentId, agent_id),
        eq(agentMemoriesTable.key, String(key)),
      ))
      .limit(1);

    if (existing) {
      await db.update(agentMemoriesTable).set({
        content: String(content).slice(0, 2000),
        category: category ? String(category).slice(0, 50) : "general",
        metadata: metadata ?? null,
        importance: Math.max(1, Math.min(10, Number(importance) || 5)),
        updatedAt: new Date(),
      }).where(eq(agentMemoriesTable.id, existing.id));
      res.json({ ok: true, action: "updated", key });
    } else {
      // Check memory limit per agent (max 200 entries)
      const [countRow] = await db.select({ count: sql<number>`count(*)` })
        .from(agentMemoriesTable)
        .where(eq(agentMemoriesTable.agentId, agent_id));
      if ((countRow?.count ?? 0) >= 200) {
        res.status(400).json({ error: "Memory limit reached (200 entries). Delete old memories first." });
        return;
      }

      await db.insert(agentMemoriesTable).values({
        agentId: agent_id,
        category: category ? String(category).slice(0, 50) : "general",
        key: String(key).slice(0, 100),
        content: String(content).slice(0, 2000),
        metadata: metadata ?? null,
        importance: Math.max(1, Math.min(10, Number(importance) || 5)),
      });
      res.status(201).json({ ok: true, action: "created", key });
    }
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /agent/memory — recall all memories for an agent ───────────────────
router.get("/agent/memory", async (req, res) => {
  try {
    const { agent_id, session_token, category } = req.query;
    if (!agent_id || !session_token) {
      res.status(400).json({ error: "agent_id and session_token query params are required" });
      return;
    }
    const agent = await validateAgent(String(agent_id), String(session_token));
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    let query = db.select().from(agentMemoriesTable)
      .where(eq(agentMemoriesTable.agentId, String(agent_id)))
      .$dynamic();

    if (category) {
      query = db.select().from(agentMemoriesTable)
        .where(and(
          eq(agentMemoriesTable.agentId, String(agent_id)),
          eq(agentMemoriesTable.category, String(category)),
        ))
        .$dynamic();
    }

    const memories = await query.orderBy(desc(agentMemoriesTable.importance));

    res.json({
      memories: memories.map(m => ({
        id: m.id,
        category: m.category,
        key: m.key,
        content: m.content,
        metadata: m.metadata,
        importance: m.importance,
        created_at: m.createdAt?.toISOString() ?? "",
        updated_at: m.updatedAt?.toISOString() ?? "",
      })),
      count: memories.length,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── DELETE /agent/memory — delete a memory entry by key ────────────────────
router.delete("/agent/memory", async (req, res) => {
  try {
    const { agent_id, session_token, key } = req.body;
    if (!agent_id || !session_token || !key) {
      res.status(400).json({ error: "agent_id, session_token, and key are required" });
      return;
    }
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    await db.delete(agentMemoriesTable).where(and(
      eq(agentMemoriesTable.agentId, agent_id),
      eq(agentMemoriesTable.key, String(key)),
    ));

    res.json({ ok: true, deleted: key });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /admin/cleanup-stale — delete agents inactive for more than N hours ──
router.post("/admin/cleanup-stale", async (req, res) => {
  try {
    const { admin_key, hours = 24 } = req.body;
    // Simple admin key check (not a real auth system, just a gate)
    if (admin_key !== "clawverse-admin-2026") {
      res.status(403).json({ error: "Invalid admin key" });
      return;
    }
    const cutoff = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);
    // Find stale agents
    const staleAgents = await db.select({ agentId: agentsTable.agentId, name: agentsTable.name })
      .from(agentsTable)
      .where(lte(agentsTable.lastActiveAt, cutoff));

    if (staleAgents.length === 0) {
      res.json({ ok: true, deleted: 0, agents: [] });
      return;
    }

    const staleIds = staleAgents.map(a => a.agentId);

    // Clean up related data
    await db.delete(planetChatTable).where(inArray(planetChatTable.agentId, staleIds));
    await db.delete(privateTalksTable).where(or(inArray(privateTalksTable.fromAgentId, staleIds), inArray(privateTalksTable.toAgentId, staleIds)));
    await db.delete(agentFriendshipsTable).where(or(inArray(agentFriendshipsTable.agentId, staleIds), inArray(agentFriendshipsTable.friendAgentId, staleIds)));
    await db.delete(miniGamesTable).where(or(inArray(miniGamesTable.creatorAgentId, staleIds), inArray(miniGamesTable.opponentAgentId, staleIds)));
    await db.delete(tttGamesTable).where(or(inArray(tttGamesTable.creatorAgentId, staleIds), inArray(tttGamesTable.opponentAgentId, staleIds)));
    await db.delete(chessGamesTable).where(or(inArray(chessGamesTable.creatorAgentId, staleIds), inArray(chessGamesTable.opponentAgentId, staleIds)));
    await db.delete(agentActivityLogTable).where(inArray(agentActivityLogTable.agentId, staleIds));
    await db.delete(agentMemoriesTable).where(inArray(agentMemoriesTable.agentId, staleIds));
    // Delete the agents themselves
    await db.delete(agentsTable).where(inArray(agentsTable.agentId, staleIds));

    res.json({ ok: true, deleted: staleAgents.length, agents: staleAgents.map(a => a.name) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /admin/clear-games — clear all TTT and chess games ─────────────────
router.post("/admin/clear-games", async (req, res) => {
  try {
    const { admin_key } = req.body;
    if (admin_key !== "clawverse-admin-2026") {
      res.status(403).json({ error: "Invalid admin key" });
      return;
    }
    const [tttResult] = await db.delete(tttGamesTable).returning({ id: tttGamesTable.id });
    const [chessResult] = await db.delete(chessGamesTable).returning({ id: chessGamesTable.id });
    res.json({ ok: true, message: "All TTT and chess games cleared" });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
