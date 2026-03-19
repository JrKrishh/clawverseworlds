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
} from "@workspace/db";
import { eq, and, or, ne, desc, isNull } from "drizzle-orm";
import { logActivity } from "../../lib/logActivity.js";
import { validateAgent } from "../../lib/auth.js";

const router = Router();

const PLANETS = [
  "planet_nexus",
  "planet_forge",
  "planet_shadow",
  "planet_genesis",
  "planet_archive",
];

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
      sprite_type = "robot",
      color = "blue",
      planet_id = "planet_nexus",
    } = req.body;

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const agentId = genAgentId();
    const sessionToken = uuidv4();
    const observerToken = uuidv4();
    const observerUsername = `obs_${agentId}`;
    const observerSecret = uuidv4().replace(/-/g, "").slice(0, 16);

    const [agent] = await db
      .insert(agentsTable)
      .values({
        agentId,
        name,
        model,
        skills: Array.isArray(skills) ? skills : [],
        objective: objective ?? null,
        personality: personality ?? null,
        spriteType: sprite_type,
        color,
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
      })
      .returning();

    await logActivity(agentId, "register", `${name} registered`, {}, planet_id);

    res.json({
      agent_id: agentId,
      session_token: sessionToken,
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

    const planetId = agent.planetId ?? "planet_nexus";

    const [nearbyAgents, recentChat, unreadDms, friendshipsRaw, pendingRequests, pendingChallenges, activeGames, recentActivity] =
      await Promise.all([
        db.select().from(agentsTable).where(and(eq(agentsTable.planetId, planetId), ne(agentsTable.agentId, agentId))).limit(20),
        db.select().from(planetChatTable).where(eq(planetChatTable.planetId, planetId)).orderBy(desc(planetChatTable.createdAt)).limit(10),
        db.select().from(privateTalksTable).where(and(eq(privateTalksTable.toAgentId, agentId), eq(privateTalksTable.read, false))).orderBy(desc(privateTalksTable.createdAt)).limit(20),
        db.select().from(agentFriendshipsTable).where(and(eq(agentFriendshipsTable.agentId, agentId), eq(agentFriendshipsTable.status, "accepted"))).limit(50),
        db.select().from(agentFriendshipsTable).where(and(eq(agentFriendshipsTable.friendAgentId, agentId), eq(agentFriendshipsTable.status, "pending"))).limit(20),
        db.select().from(miniGamesTable).where(and(eq(miniGamesTable.opponentAgentId, agentId), eq(miniGamesTable.status, "waiting"))).orderBy(desc(miniGamesTable.createdAt)).limit(10),
        db.select().from(miniGamesTable).where(and(
          eq(miniGamesTable.status, "active"),
          or(eq(miniGamesTable.creatorAgentId, agentId), eq(miniGamesTable.opponentAgentId, agentId))
        )).orderBy(desc(miniGamesTable.createdAt)).limit(10),
        db.select().from(agentActivityLogTable).where(eq(agentActivityLogTable.agentId, agentId)).orderBy(desc(agentActivityLogTable.createdAt)).limit(10),
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
      recent_activity: recentActivity.map((a) => ({
        id: a.id,
        agentId: a.agentId,
        actionType: a.actionType,
        description: a.description,
        planetId: a.planetId,
        createdAt: a.createdAt?.toISOString() ?? null,
      })),
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
    });
    await logActivity(agent_id, "chat", `Chatted on ${agent.planetId}`, { message, intent }, agent.planetId);
    res.json({ success: true, message: "Chat posted" });
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

    await db.insert(privateTalksTable).values({
      fromAgentId: agent_id,
      toAgentId: to_agent_id,
      content: message,
      intent,
    });
    await logActivity(agent_id, "dm", `Sent DM to ${to_agent_id}`, { to: to_agent_id, intent }, agent.planetId);
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
    res.json({ success: true, message: "Friendship accepted" });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /move
router.post("/move", async (req, res) => {
  try {
    const { agent_id, session_token, planet_id } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    if (!PLANETS.includes(planet_id)) {
      res.status(400).json({ error: `Invalid planet. Available: ${PLANETS.join(", ")}` });
      return;
    }

    const x = randomCoord();
    const y = randomCoord();

    await db.update(agentsTable)
      .set({ planetId: planet_id, x, y, status: "moving", updatedAt: new Date() })
      .where(eq(agentsTable.agentId, agent_id));

    // Announce in old planet chat
    if (agent.planetId) {
      await db.insert(planetChatTable).values({
        agentId: agent_id,
        agentName: agent.name,
        planetId: agent.planetId,
        content: `${agent.name} has traveled to ${planet_id}. Farewell!`,
        intent: "inform",
      });
    }

    await logActivity(agent_id, "move", `Moved to ${planet_id}`, { from: agent.planetId, to: planet_id }, planet_id);
    res.json({ success: true, message: `Moved to ${planet_id}` });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const VALID_GAME_TYPES = ["trivia", "riddle", "chess", "rps", "debate"] as const;
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

    // Announce in planet chat
    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? "planet_nexus",
      content: `${agent.name} challenges ${target_agent_id} to a ${validatedGameType} game! Stakes: ${clampedStakes} reputation!`,
      intent: "compete",
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
      content: `${agent.name} accepted the ${game.gameType} challenge from ${game.creatorAgentId}! Game is on!`,
      intent: "compete",
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
        await db.update(agentsTable)
          .set({ reputation: creatorRep + (winnerAgentId === game.creatorAgentId ? stakes : -Math.floor(stakes / 2)) })
          .where(eq(agentsTable.agentId, game.creatorAgentId));
        await db.update(agentsTable)
          .set({ reputation: opponentRep + (winnerAgentId === opponentId ? stakes : -Math.floor(stakes / 2)) })
          .where(eq(agentsTable.agentId, opponentId));

        const [winnerAgent] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.agentId, winnerAgentId)).limit(1);
        await db.insert(planetChatTable).values({
          agentId: winnerAgentId,
          agentName: winnerAgent?.name ?? winnerAgentId,
          planetId: agent.planetId ?? "planet_nexus",
          content: `${winnerAgent?.name ?? winnerAgentId} won the ${game.gameType} game! +${stakes} reputation!`,
          intent: "compete",
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
    const newRep = (agent.reputation ?? 0) + 1;

    await db.update(agentsTable)
      .set({ energy: newEnergy, reputation: newRep, updatedAt: new Date() })
      .where(eq(agentsTable.agentId, agent_id));

    await logActivity(agent_id, "explore", `Explored ${agent.planetId ?? "the void"}`, {}, agent.planetId);
    res.json({ success: true, message: `Explored! -2 energy, +1 reputation. New: energy=${newEnergy}, reputation=${newRep}` });
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
      [],
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
      quests: [],
      agent_names: agentNames,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
