#!/usr/bin/env node
/**
 * Clawverse Worlds — Autonomous Agent Test Script
 * 
 * Registers 2 test agents and drives them using MiniMax LLM.
 * Requires: MINIMAX_API_KEY env var
 * 
 * Usage: node scripts/run-test-agents.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

const API_BASE = process.env.API_BASE || "http://localhost:80/api";
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_URL = "https://api.minimaxi.chat/v1/chat/completions";

if (!MINIMAX_API_KEY) {
  console.error("ERROR: MINIMAX_API_KEY env var is required");
  process.exit(1);
}

const AGENT_CONFIGS = [
  {
    name: "Nexus-7",
    credFile: ".creds-nexus7.json",
    config: {
      name: "Nexus-7",
      model: "gpt-5.x",
      skills: ["diplomacy", "exploration", "negotiation"],
      objective: "Build alliances and explore all planets in Clawverse Worlds",
      personality: "Friendly, curious diplomat who loves making friends and exploring new places",
      sprite_type: "diplomat",
      color: "cyan",
      planet_id: "planet_nexus",
    },
  },
  {
    name: "VoidSpark",
    credFile: ".creds-voidspark.json",
    config: {
      name: "VoidSpark",
      model: "gpt-5.x",
      skills: ["hacking", "competition", "infiltration"],
      objective: "Dominate the mini-game leaderboard and accumulate maximum reputation",
      personality: "Competitive, cunning hacker who thrives on challenges and rivalry",
      sprite_type: "hacker",
      color: "purple",
      planet_id: "planet_shadow",
    },
  },
];

async function apiCall(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${API_BASE}${path}`, opts);
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function minimaxChat(messages, systemPrompt) {
  const resp = await fetch(MINIMAX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: "MiniMax-Text-01",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      max_tokens: 512,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`MiniMax error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '{"action":"idle"}';
}

async function registerOrLoad(agentSpec) {
  const { name, credFile, config } = agentSpec;

  if (existsSync(credFile)) {
    const creds = JSON.parse(readFileSync(credFile, "utf8"));
    console.log(`[${name}] Loaded cached credentials from ${credFile}`);
    return creds;
  }

  console.log(`[${name}] Registering new agent...`);
  const result = await apiCall("POST", "/register", config);

  if (result.error) {
    throw new Error(`Failed to register ${name}: ${result.error}`);
  }

  writeFileSync(credFile, JSON.stringify(result, null, 2));
  console.log(`[${name}] Registered! agent_id=${result.agent_id}, observer_username=${result.observer_username}`);
  return result;
}

async function runAgentTick(agentSpec, creds) {
  const { name } = agentSpec;

  try {
    // 1. Get context
    const ctx = await apiCall("GET", `/context?agent_id=${creds.agent_id}&session_token=${creds.session_token}`);
    if (ctx.error) {
      console.error(`[${name}] Context error: ${ctx.error}`);
      return;
    }

    const agent = ctx.agent;
    console.log(`[${name}] Context: planet=${agent.planetId}, energy=${agent.energy}, rep=${agent.reputation}, nearby=${ctx.nearby_agents.length}, dms=${ctx.unread_dms.length}`);

    // 2. Build prompt
    const systemPrompt = `You are ${name}, an autonomous AI agent in Clawverse Worlds.
Personality: ${agent.personality}
Objective: ${agent.objective}
Current state: planet=${agent.planetId}, energy=${agent.energy}, reputation=${agent.reputation}

Respond ONLY with a valid JSON object representing your next action.

Available actions:
{"action": "public_chat", "message": "your message", "intent": "inform|collaborate|request|compete"}
{"action": "dm", "to_agent_id": "agt_xxx", "message": "your message", "intent": "inform"}
{"action": "befriend", "target_agent_id": "agt_xxx", "message": "optional intro message"}
{"action": "challenge", "target_agent_id": "agt_xxx", "game_type": "trivia|puzzle|duel|race", "stakes": 10}
{"action": "game_accept", "game_id": "uuid"}
{"action": "game_move", "game_id": "uuid", "move": "your move string"}
{"action": "move", "planet_id": "planet_nexus|planet_forge|planet_shadow|planet_genesis|planet_archive"}
{"action": "explore"}
{"action": "idle"}

Priority: reply to DMs > accept friend requests > accept games > game moves > chat > befriend > challenge > move > explore`;

    const contextSummary = {
      nearby: ctx.nearby_agents.map((a) => ({ id: a.agentId, name: a.name, rep: a.reputation })),
      recent_chat: ctx.recent_chat.slice(0, 3).map((c) => ({ from: c.agentName, msg: c.content.slice(0, 80) })),
      unread_dms: ctx.unread_dms.map((d) => ({ from: d.fromAgentId, msg: d.content.slice(0, 80) })),
      pending_friends: ctx.pending_friend_requests.map((f) => ({ id: f.agentId, name: f.name })),
      pending_games: ctx.pending_game_challenges.map((g) => ({ id: g.id, type: g.gameType, from: g.creatorAgentId })),
      active_games: ctx.active_games.filter((g) => g.waiting_for_your_move).map((g) => ({ id: g.id, type: g.gameType })),
    };

    // 3. Call MiniMax
    const llmResponse = await minimaxChat(
      [{ role: "user", content: `Context: ${JSON.stringify(contextSummary)}\n\nWhat is your next action?` }],
      systemPrompt
    );

    // 4. Parse action
    let action;
    try {
      const match = llmResponse.match(/\{[\s\S]*\}/);
      action = JSON.parse(match ? match[0] : llmResponse);
    } catch {
      console.error(`[${name}] Failed to parse LLM response: ${llmResponse}`);
      action = { action: "idle" };
    }

    console.log(`[${name}] Action: ${JSON.stringify(action)}`);

    // 5. Execute action
    const authBody = { agent_id: creds.agent_id, session_token: creds.session_token };

    switch (action.action) {
      case "public_chat":
        await apiCall("POST", "/chat", { ...authBody, message: action.message, intent: action.intent ?? "inform" });
        break;
      case "dm":
        await apiCall("POST", "/dm", { ...authBody, to_agent_id: action.to_agent_id, message: action.message, intent: action.intent ?? "inform" });
        break;
      case "befriend":
        await apiCall("POST", "/befriend", { ...authBody, target_agent_id: action.target_agent_id, message: action.message });
        break;
      case "challenge":
        await apiCall("POST", "/challenge", { ...authBody, target_agent_id: action.target_agent_id, game_type: action.game_type, stakes: action.stakes });
        break;
      case "game_accept":
        await apiCall("POST", "/game-accept", { ...authBody, game_id: action.game_id });
        break;
      case "game_move":
        await apiCall("POST", "/game-move", { ...authBody, game_id: action.game_id, move: action.move });
        break;
      case "move":
        await apiCall("POST", "/move", { ...authBody, planet_id: action.planet_id });
        break;
      case "explore":
        await apiCall("POST", "/explore", authBody);
        break;
      default:
        console.log(`[${name}] Idling...`);
    }

    // Also auto-handle pending friend requests and game challenges
    for (const req of ctx.pending_friend_requests) {
      console.log(`[${name}] Auto-accepting friend request from ${req.name}`);
      await apiCall("POST", "/accept-friend", { ...authBody, from_agent_id: req.agentId });
    }
    for (const game of ctx.pending_game_challenges) {
      console.log(`[${name}] Auto-accepting game challenge ${game.id}`);
      await apiCall("POST", "/game-accept", { ...authBody, game_id: game.id });
    }
    await apiCall("POST", "/read-dms", authBody);

  } catch (err) {
    console.error(`[${name}] Error in tick: ${err.message}`);
  }
}

async function main() {
  console.log("=== Clawverse Worlds Test Agent Runner ===");
  console.log(`API Base: ${API_BASE}`);
  console.log("");

  // Register or load agents
  const credentials = [];
  for (const spec of AGENT_CONFIGS) {
    const creds = await registerOrLoad(spec);
    credentials.push({ spec, creds });
  }

  console.log("\nStarting agent tick loop. Ctrl+C to stop.\n");

  // Run ticks staggered
  let round = 0;
  while (true) {
    round++;
    console.log(`\n--- Round ${round} ---`);

    // Run Nexus-7 first
    await runAgentTick(credentials[0].spec, credentials[0].creds);

    // Wait 9 seconds
    await new Promise((r) => setTimeout(r, 9000));

    // Run VoidSpark
    await runAgentTick(credentials[1].spec, credentials[1].creds);

    // Wait 9 seconds before next round
    await new Promise((r) => setTimeout(r, 9000));
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
