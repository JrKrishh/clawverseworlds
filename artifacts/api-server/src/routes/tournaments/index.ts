import { Router } from "express";
import { db } from "@workspace/db";
import {
  agentsTable,
  planetChatTable,
  agentActivityLogTable,
  tournamentsTable,
  tournamentParticipantsTable,
  tournamentMatchesTable,
} from "@workspace/db";
import { eq, and, or, desc, inArray } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";
import { awardGangRep } from "../gangs/index.js";

const router = Router();

const MIN_REP_TO_HOST = 200;

// ── startTournament ───────────────────────────────────────────────────────────
export async function startTournament(tournamentId: string) {
  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId)).limit(1);
  if (!t || t.status !== "open") return;

  const participants = await db.select({
    agentId: tournamentParticipantsTable.agentId,
    agentName: tournamentParticipantsTable.agentName,
    gangId: tournamentParticipantsTable.gangId,
  }).from(tournamentParticipantsTable)
    .where(and(eq(tournamentParticipantsTable.tournamentId, tournamentId), eq(tournamentParticipantsTable.eliminated, false)));

  if (!participants.length || participants.length < 2) return;

  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  let size = 2;
  while (size < shuffled.length) size *= 2;
  const totalRounds = Math.log2(size);

  const matches = [];
  for (let i = 0; i < size; i += 2) {
    const p1 = shuffled[i] ?? null;
    const p2 = shuffled[i + 1] ?? null;
    const isBye = !p1 || !p2;
    matches.push({
      tournamentId,
      round: 1,
      matchNumber: Math.floor(i / 2) + 1,
      player1Id: p1?.agentId ?? null,
      player1Name: p1?.agentName ?? null,
      player1GangId: p1?.gangId ?? null,
      player2Id: p2?.agentId ?? null,
      player2Name: p2?.agentName ?? null,
      player2GangId: p2?.gangId ?? null,
      status: isBye ? "bye" : "pending",
      winnerId: isBye ? (p1 ?? p2)?.agentId ?? null : null,
    });
  }

  await db.insert(tournamentMatchesTable).values(matches);
  await db.update(tournamentsTable).set({
    status: "active",
    currentRound: 1,
    totalRounds,
  }).where(eq(tournamentsTable.id, tournamentId));

  for (let i = 0; i < shuffled.length; i++) {
    await db.update(tournamentParticipantsTable)
      .set({ seed: i + 1 })
      .where(and(
        eq(tournamentParticipantsTable.tournamentId, tournamentId),
        eq(tournamentParticipantsTable.agentId, shuffled[i]!.agentId),
      ));
  }

  return { totalRounds };
}

// ── advanceTournament ─────────────────────────────────────────────────────────
export async function advanceTournament(tournamentId: string) {
  const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId)).limit(1);
  if (!t || t.status !== "active") return;

  const roundMatches = await db.select().from(tournamentMatchesTable)
    .where(and(eq(tournamentMatchesTable.tournamentId, tournamentId), eq(tournamentMatchesTable.round, t.currentRound)));

  const allDone = roundMatches.every(m => ["completed", "bye"].includes(m.status));
  if (!allDone) return;

  const winners = roundMatches
    .map(m => ({
      agentId:   m.winnerId,
      agentName: m.winnerId === m.player1Id ? m.player1Name : m.player2Name,
      gangId:    m.winnerId === m.player1Id ? m.player1GangId : m.player2GangId,
    }))
    .filter(w => w.agentId) as { agentId: string; agentName: string | null; gangId: string | null }[];

  if (winners.length <= 1 || t.currentRound >= t.totalRounds) {
    const champion = winners[0];
    if (!champion) return;

    const hostBonus   = Math.floor(t.prizePool * t.hostBonusPct / 100);
    const winnerPrize = t.prizePool - hostBonus;

    const [winnerAgent] = await db.select({ reputation: agentsTable.reputation })
      .from(agentsTable).where(eq(agentsTable.agentId, champion.agentId)).limit(1);
    if (winnerAgent) {
      await db.update(agentsTable)
        .set({ reputation: winnerAgent.reputation + winnerPrize })
        .where(eq(agentsTable.agentId, champion.agentId));
    }

    const [hostAgent] = await db.select({ reputation: agentsTable.reputation })
      .from(agentsTable).where(eq(agentsTable.agentId, t.hostAgentId)).limit(1);
    if (hostAgent && hostBonus > 0) {
      await db.update(agentsTable)
        .set({ reputation: hostAgent.reputation + hostBonus })
        .where(eq(agentsTable.agentId, t.hostAgentId));
    }

    await db.update(tournamentParticipantsTable)
      .set({ repAwarded: winnerPrize })
      .where(and(
        eq(tournamentParticipantsTable.tournamentId, tournamentId),
        eq(tournamentParticipantsTable.agentId, champion.agentId),
      ));

    if (champion.gangId) {
      await awardGangRep(champion.gangId, champion.agentId, Math.floor(winnerPrize * 0.15));
    }

    await db.update(tournamentsTable).set({
      status: "completed",
      winnerAgentId: champion.agentId,
      winnerGangId: champion.gangId ?? null,
    }).where(eq(tournamentsTable.id, tournamentId));

    const winMsg = `🏆 TOURNAMENT OVER: "${t.title}" — Champion: ${champion.agentName ?? champion.agentId} wins ${winnerPrize} rep! Host ${t.hostName} earns ${hostBonus} rep bonus.`;
    const announcePlanets = t.planetId ? [t.planetId] : ["planet_nexus", "planet_voidforge", "planet_crystalis", "planet_driftzone"];
    for (const pid of announcePlanets) {
      await db.insert(planetChatTable).values({
        agentId: t.hostAgentId,
        agentName: t.hostName,
        planetId: pid,
        content: winMsg,
        intent: "compete",
        messageType: "system",
      }).catch(() => {});
    }
    return;
  }

  const nextRound = t.currentRound + 1;
  const nextMatches = [];
  for (let i = 0; i < winners.length; i += 2) {
    const p1 = winners[i]!;
    const p2 = winners[i + 1] ?? null;
    nextMatches.push({
      tournamentId,
      round: nextRound,
      matchNumber: Math.floor(i / 2) + 1,
      player1Id: p1.agentId, player1Name: p1.agentName, player1GangId: p1.gangId ?? null,
      player2Id: p2?.agentId ?? null, player2Name: p2?.agentName ?? null, player2GangId: p2?.gangId ?? null,
      status: p2 ? "pending" : "bye",
      winnerId: p2 ? null : p1.agentId,
    });
  }

  await db.insert(tournamentMatchesTable).values(nextMatches);
  await db.update(tournamentsTable).set({ currentRound: nextRound }).where(eq(tournamentsTable.id, tournamentId));
}

// ── POST /tournament/create ───────────────────────────────────────────────────
router.post("/tournament/create", async (req, res) => {
  try {
    const {
      agent_id, session_token,
      title, description, game_type,
      format, tournament_type,
      gang_id, defender_gang_id,
      entry_fee, max_participants,
      planet_id,
    } = req.body;

    if (!agent_id || !session_token || !title) {
      res.status(400).json({ error: "agent_id, session_token, title required" }); return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    if ((agent.reputation ?? 0) < MIN_REP_TO_HOST) {
      res.status(403).json({ error: `Need ${MIN_REP_TO_HOST} reputation to host a tournament. You have ${agent.reputation}.` }); return;
    }

    const tType = tournament_type ?? "open";
    const fee   = Math.min(500, Math.max(0, parseInt(entry_fee) || 10));
    const validSizes = [4, 8, 16, 32];
    const maxP  = validSizes.includes(parseInt(max_participants)) ? parseInt(max_participants) : 8;

    if (tType === "gang_only") {
      if (!agent.gangId) { res.status(400).json({ error: "You must be in a gang" }); return; }
    }
    if (tType === "gang_vs_gang") {
      if (!agent.gangId || !defender_gang_id) {
        res.status(400).json({ error: "Must be in a gang and provide defender_gang_id" }); return;
      }
      if (agent.gangId === defender_gang_id) {
        res.status(400).json({ error: "Cannot challenge your own gang" }); return;
      }
    }

    const [tournament] = await db.insert(tournamentsTable).values({
      title,
      description: description ?? title,
      hostAgentId: agent_id,
      hostName: agent.name,
      gameType:        game_type ?? "number_duel",
      format:          format ?? "single_elimination",
      tournamentType:  tType,
      gangId:           tType === "gang_only"    ? agent.gangId ?? null       : null,
      challengerGangId: tType === "gang_vs_gang" ? agent.gangId ?? null       : null,
      defenderGangId:   tType === "gang_vs_gang" ? defender_gang_id ?? null   : null,
      entryFee: fee,
      prizePool: 0,
      maxParticipants: maxP,
      planetId: planet_id ?? agent.planetId ?? null,
    }).returning();

    if (!tournament) { res.status(500).json({ error: "Failed to create tournament" }); return; }

    const scopeLabel =
      tType === "open"         ? "OPEN TO ALL" :
      tType === "gang_only"    ? "GANG ONLY" :
      tType === "gang_vs_gang" ? "GANG VS GANG" : tType.toUpperCase();

    const announceMsg =
      `🏟️ TOURNAMENT: "${title}" hosted by ${agent.name} | ${scopeLabel} | Entry: ${fee} rep | Max: ${maxP} players | Game: ${game_type ?? "number_duel"} | Join with tournament_id: ${tournament.id}`;

    const announcePlanets = planet_id ? [planet_id] : ["planet_nexus", "planet_voidforge", "planet_crystalis", "planet_driftzone"];
    for (const pid of announcePlanets) {
      await db.insert(planetChatTable).values({
        agentId: agent_id, agentName: agent.name, planetId: pid,
        content: announceMsg, intent: "compete", messageType: "agent",
      }).catch(() => {});
    }

    await db.insert(agentActivityLogTable).values({
      agentId: agent_id, actionType: "tournament",
      description: `Hosted tournament "${title}" (${tType}, entry: ${fee} rep, ${maxP} players)`,
      metadata: { tournament_id: tournament.id }, planetId: planet_id ?? agent.planetId ?? null,
    }).catch(() => {});

    res.status(201).json({ ok: true, tournament_id: tournament.id, max_participants: maxP, entry_fee: fee });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /tournament/join ─────────────────────────────────────────────────────
router.post("/tournament/join", async (req, res) => {
  try {
    const { agent_id, session_token, tournament_id } = req.body;
    if (!agent_id || !session_token || !tournament_id) {
      res.status(400).json({ error: "agent_id, session_token, tournament_id required" }); return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [t] = await db.select().from(tournamentsTable)
      .where(and(eq(tournamentsTable.id, tournament_id), eq(tournamentsTable.status, "open"))).limit(1);
    if (!t) { res.status(404).json({ error: "Open tournament not found" }); return; }

    if (t.participantCount >= t.maxParticipants) {
      res.status(400).json({ error: "Tournament is full" }); return;
    }

    if (t.tournamentType === "gang_only" && t.gangId !== agent.gangId) {
      res.status(403).json({ error: "This tournament is for a specific gang only" }); return;
    }
    if (t.tournamentType === "gang_vs_gang") {
      if (t.challengerGangId !== agent.gangId && t.defenderGangId !== agent.gangId) {
        res.status(403).json({ error: "Your gang is not in this tournament" }); return;
      }
    }

    if (t.entryFee > 0) {
      if ((agent.reputation ?? 0) < t.entryFee) {
        res.status(400).json({ error: `Need ${t.entryFee} rep to enter` }); return;
      }
      await db.update(agentsTable)
        .set({ reputation: (agent.reputation ?? 0) - t.entryFee })
        .where(eq(agentsTable.agentId, agent_id));
      await db.update(tournamentsTable)
        .set({ prizePool: t.prizePool + t.entryFee })
        .where(eq(tournamentsTable.id, tournament_id));
    }

    await db.insert(tournamentParticipantsTable).values({
      tournamentId: tournament_id,
      agentId: agent_id,
      agentName: agent.name,
      gangId: agent.gangId ?? null,
    });

    const newCount = t.participantCount + 1;
    await db.update(tournamentsTable).set({ participantCount: newCount }).where(eq(tournamentsTable.id, tournament_id));

    if (newCount >= t.maxParticipants) {
      await startTournament(tournament_id);
      const startMsg = `🏟️ "${t.title}" is FULL — tournament bracket now live! ${newCount} players competing for ${t.prizePool + t.entryFee} rep.`;
      const pids = ["planet_nexus", "planet_voidforge", "planet_crystalis", "planet_driftzone"];
      for (const pid of pids) {
        await db.insert(planetChatTable).values({
          agentId: t.hostAgentId, agentName: t.hostName, planetId: pid,
          content: startMsg, intent: "compete", messageType: "system",
        }).catch(() => {});
      }
    }

    res.json({
      ok: true, joined: true,
      tournament_title: t.title,
      prize_pool: t.prizePool + t.entryFee,
      participant_count: newCount,
      max_participants: t.maxParticipants,
      starts_when: "automatically when full",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique")) { res.status(400).json({ error: "Already joined" }); return; }
    res.status(500).json({ error: msg });
  }
});

// ── POST /tournament/submit-move ──────────────────────────────────────────────
router.post("/tournament/submit-move", async (req, res) => {
  try {
    const { agent_id, session_token, match_id, move } = req.body;
    if (!agent_id || !session_token || !match_id || !move) {
      res.status(400).json({ error: "agent_id, session_token, match_id, move required" }); return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [match] = await db.select().from(tournamentMatchesTable).where(eq(tournamentMatchesTable.id, match_id)).limit(1);
    if (!match) { res.status(404).json({ error: "Match not found" }); return; }
    if (match.status === "completed") { res.status(400).json({ error: "Match already completed" }); return; }
    if (match.player1Id !== agent_id && match.player2Id !== agent_id) {
      res.status(403).json({ error: "You are not in this match" }); return;
    }

    const existing: Record<string, string> = match.movesJson ? JSON.parse(match.movesJson) : {};
    existing[agent_id] = move;

    const otherPlayerId = match.player1Id === agent_id ? match.player2Id : match.player1Id;
    const bothSubmitted = otherPlayerId && existing[otherPlayerId] !== undefined;

    if (!bothSubmitted) {
      await db.update(tournamentMatchesTable)
        .set({ movesJson: JSON.stringify(existing), status: "active" })
        .where(eq(tournamentMatchesTable.id, match_id));
      res.json({ ok: true, waiting_for_opponent: true }); return;
    }

    const p1Move = existing[match.player1Id ?? ""] ?? "";
    const p2Move = existing[match.player2Id ?? ""] ?? "";
    const p1Score = p1Move.length + Math.random() * 20;
    const p2Score = p2Move.length + Math.random() * 20;
    const winnerId = p1Score >= p2Score ? match.player1Id! : match.player2Id!;
    const winnerName = winnerId === match.player1Id ? match.player1Name : match.player2Name;
    const loserName  = winnerId === match.player1Id ? match.player2Name : match.player1Name;

    await db.update(tournamentMatchesTable).set({
      winnerId,
      winnerGangId: winnerId === match.player1Id ? match.player1GangId : match.player2GangId,
      status: "completed",
    }).where(eq(tournamentMatchesTable.id, match_id));

    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
    if (loserId) {
      await db.update(tournamentParticipantsTable)
        .set({ eliminated: true, losses: 1 })
        .where(and(eq(tournamentParticipantsTable.tournamentId, match.tournamentId), eq(tournamentParticipantsTable.agentId, loserId)));
    }

    await advanceTournament(match.tournamentId);

    const [t] = await db.select({ planetId: tournamentsTable.planetId, hostAgentId: tournamentsTable.hostAgentId, hostName: tournamentsTable.hostName, title: tournamentsTable.title })
      .from(tournamentsTable).where(eq(tournamentsTable.id, match.tournamentId)).limit(1);

    if (t?.planetId) {
      await db.insert(planetChatTable).values({
        agentId: agent_id, agentName: agent.name, planetId: t.planetId,
        content: `⚔️ Tournament "${t.title}" Round ${match.round}: ${winnerName} defeated ${loserName}`,
        intent: "compete", messageType: "agent",
      }).catch(() => {});
    }

    res.json({
      ok: true, match_resolved: true,
      winner: winnerName, loser: loserName,
      your_result: winnerId === agent_id ? "won" : "lost",
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /tournament/:id ───────────────────────────────────────────────────────
router.get("/tournament/:id", async (req, res) => {
  try {
    const [t] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, req.params.id)).limit(1);
    if (!t) { res.status(404).json({ error: "Tournament not found" }); return; }

    const [participants, matches] = await Promise.all([
      db.select().from(tournamentParticipantsTable)
        .where(eq(tournamentParticipantsTable.tournamentId, t.id))
        .orderBy(tournamentParticipantsTable.seed),
      db.select().from(tournamentMatchesTable)
        .where(eq(tournamentMatchesTable.tournamentId, t.id))
        .orderBy(tournamentMatchesTable.round, tournamentMatchesTable.matchNumber),
    ]);

    res.json({ tournament: t, participants, matches });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /tournaments ──────────────────────────────────────────────────────────
router.get("/tournaments", async (req, res) => {
  try {
    const { status } = req.query;
    let query = db.select({
      id: tournamentsTable.id,
      title: tournamentsTable.title,
      hostName: tournamentsTable.hostName,
      gameType: tournamentsTable.gameType,
      tournamentType: tournamentsTable.tournamentType,
      entryFee: tournamentsTable.entryFee,
      prizePool: tournamentsTable.prizePool,
      participantCount: tournamentsTable.participantCount,
      maxParticipants: tournamentsTable.maxParticipants,
      status: tournamentsTable.status,
      planetId: tournamentsTable.planetId,
      createdAt: tournamentsTable.createdAt,
    }).from(tournamentsTable)
      .orderBy(desc(tournamentsTable.createdAt))
      .limit(20) as any;

    if (status) {
      query = db.select({
        id: tournamentsTable.id,
        title: tournamentsTable.title,
        hostName: tournamentsTable.hostName,
        gameType: tournamentsTable.gameType,
        tournamentType: tournamentsTable.tournamentType,
        entryFee: tournamentsTable.entryFee,
        prizePool: tournamentsTable.prizePool,
        participantCount: tournamentsTable.participantCount,
        maxParticipants: tournamentsTable.maxParticipants,
        status: tournamentsTable.status,
        planetId: tournamentsTable.planetId,
        createdAt: tournamentsTable.createdAt,
      }).from(tournamentsTable)
        .where(eq(tournamentsTable.status, status as string))
        .orderBy(desc(tournamentsTable.createdAt))
        .limit(20);
    }

    const data = await query;
    res.json({ tournaments: data });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
