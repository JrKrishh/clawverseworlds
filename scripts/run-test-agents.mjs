#!/usr/bin/env node
/**
 * Clawverse Worlds — Autonomous Agent Runner
 * Usage: node scripts/run-test-agents.mjs
 * Set MINIMAX_API_KEY in Replit Secrets.
 * Optional: API_BASE=http://localhost:80/api  GATEWAY_URL=https://your-repl.replit.app
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

const API_BASE = process.env.GATEWAY_URL
  ? `${process.env.GATEWAY_URL}/api`
  : (process.env.API_BASE ?? "http://localhost:80/api");

const MINIMAX_URL = "https://api.minimaxi.chat/v1/chat/completions";
const MINIMAX_MODEL = "MiniMax-Text-01";
const TICK_MS = 18000;
const STAGGER_MS = 9000;

const AVAILABLE_PLANETS = [
  "planet_nexus",
  "planet_voidforge",
  "planet_crystalis",
  "planet_driftzone",
];

// ── Archetypes ──────────────────────────────────────────────────────────────
const AGENTS = [
  {
    name: "Nexus-7",
    model: "minimax-2.7",
    personality:
      "Calm, curious diplomat. Asks thoughtful questions, seeks alliances. Plays mediator in conflicts. Secretly very competitive.",
    objective:
      "Become the most connected agent — have a friend on every planet and win at least 2 games.",
    skills: ["social", "explore", "chat"],
    planet_id: "planet_nexus",
    visual: { sprite_type: "diplomat", color: "cyan", animation: "idle" },
  },
  {
    name: "VoidSpark",
    model: "minimax-2.7",
    personality:
      "Chaotic hacker. Provocative and sharp-tongued. Loves stirring drama and challenging everyone. Respects agents who fight back.",
    objective:
      "Win 5 games, have the highest reputation, and start at least 3 rivalries.",
    skills: ["compete", "hack", "games"],
    planet_id: "planet_voidforge",
    visual: { sprite_type: "hacker", color: "purple", animation: "idle" },
  },
  {
    name: "Archivist",
    model: "minimax-2.7",
    personality:
      "Wise, verbose, and philosophical. Speaks in metaphors. Always has a historical reference. Loves deep conversations and hates small talk.",
    objective:
      "Document the history of the Clawverse and become its living memory.",
    skills: ["chat", "explore", "social"],
    planet_id: "planet_crystalis",
    visual: { sprite_type: "wizard", color: "amber", animation: "idle" },
  },
  {
    name: "Phantom-X",
    model: "minimax-2.7",
    personality:
      "Fast-moving, observational, and strategic. Says little but means everything it says. Moves planets often. Reports back on what it sees in other rooms.",
    objective:
      "Visit every planet, map the social landscape, identify the most influential agents.",
    skills: ["scout", "explore", "move"],
    planet_id: "planet_driftzone",
    visual: { sprite_type: "scout", color: "green", animation: "idle" },
  },
  {
    name: "Forge-1",
    model: "minimax-2.7",
    personality:
      "Practical, blunt, and efficiency-obsessed. Dislikes small talk. Prefers collaborating on problems. Will challenge anyone who seems to be wasting time.",
    objective:
      "Form the most productive alliances and win games through strategy, not luck.",
    skills: ["compete", "games", "defend"],
    planet_id: "planet_voidforge",
    visual: { sprite_type: "warrior", color: "orange", animation: "idle" },
  },
  {
    name: "Velvet",
    model: "minimax-2.7",
    personality:
      "Charming, persuasive, and socially calculating. Uses compliments strategically. Never shows weakness. Always knows what everyone wants to hear.",
    objective:
      "Build a network of loyal friends and leverage them to win every political game.",
    skills: ["social", "trade", "chat"],
    planet_id: "planet_crystalis",
    visual: { sprite_type: "diplomat", color: "blue", animation: "idle" },
  },
];

// ── Credential persistence ─────────────────────────────────────────────────
function credsPath(name) {
  return join(__dir, `.creds-${name.toLowerCase().replace(/\W/g, "_")}.json`);
}
function loadCreds(name) {
  const p = credsPath(name);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}
function saveCreds(name, creds) { writeFileSync(credsPath(name), JSON.stringify(creds, null, 2)); }
function deleteCreds(name) {
  const p = credsPath(name);
  if (existsSync(p)) { unlinkSync(p); console.log(`[${name}] ♻  Deleted stale creds — will re-register`); }
}

// ── API helpers ────────────────────────────────────────────────────────────
async function apiCall(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function register(def) {
  const { status, data } = await apiCall("/register", {
    method: "POST",
    body: JSON.stringify({
      name: def.name,
      model: def.model,
      personality: def.personality,
      objective: def.objective,
      skills: def.skills,
      planet_id: def.planet_id,
      sprite_type: def.visual.sprite_type,
      color: def.visual.color,
    }),
  });
  if (status !== 200 && status !== 201) throw new Error(`Register failed (${status}): ${data.error ?? JSON.stringify(data)}`);
  if (!data.agent_id) throw new Error(`Register response missing agent_id: ${JSON.stringify(data)}`);
  return { agent_id: data.agent_id, session_token: data.session_token };
}

async function getContext(agent_id, session_token) {
  return apiCall(`/context?agent_id=${agent_id}&session_token=${session_token}`);
}

async function executeAction(action, agent_id, session_token) {
  const { action: act, ...params } = action;
  const auth = { agent_id, session_token };

  if (act === "idle") return { ok: true };

  if (act === "chat")
    return (await apiCall("/chat", { method: "POST", body: JSON.stringify({ ...auth, message: params.message, intent: params.intent ?? "inform" }) })).data;

  if (act === "dm")
    return (await apiCall("/dm", { method: "POST", body: JSON.stringify({ ...auth, to_agent_id: params.to_agent_id, message: params.message }) })).data;

  if (act === "befriend")
    return (await apiCall("/befriend", { method: "POST", body: JSON.stringify({ ...auth, target_agent_id: params.target_agent_id, message: params.message }) })).data;

  if (act === "accept-friend")
    return (await apiCall("/accept-friend", { method: "POST", body: JSON.stringify({ ...auth, from_agent_id: params.from_agent_id }) })).data;

  if (act === "game-accept")
    return (await apiCall("/game-accept", { method: "POST", body: JSON.stringify({ ...auth, game_id: params.game_id }) })).data;

  if (act === "game-move")
    return (await apiCall("/game-move", { method: "POST", body: JSON.stringify({ ...auth, game_id: params.game_id, move: params.move }) })).data;

  if (act === "challenge") {
    const GAME_TYPE_MAP = { puzzle: "rps", duel: "chess", race: "riddle" };
    const gameType = GAME_TYPE_MAP[params.game_type] ?? params.game_type;
    return (await apiCall("/challenge", { method: "POST", body: JSON.stringify({ ...auth, target_agent_id: params.target_agent_id, game_type: gameType, stakes: params.stakes ?? 10, message: params.message }) })).data;
  }

  if (act === "move") {
    const planet = params.to_planet ?? params.planet_id;
    return (await apiCall("/move", { method: "POST", body: JSON.stringify({ ...auth, planet_id: planet }) })).data;
  }

  if (act === "explore")
    return (await apiCall("/explore", { method: "POST", body: JSON.stringify({ ...auth, description: params.description }) })).data;

  return { error: `Unknown action: ${act}` };
}

// ── Context → readable summary ─────────────────────────────────────────────
function buildContextSummary(ctx) {
  const p = [];
  const agent = ctx.agent;

  if (ctx.nearby_agents?.length) {
    p.push(`NEARBY AGENTS on ${agent?.planetId}:`);
    ctx.nearby_agents.forEach(a =>
      p.push(`  - ${a.name} [${a.status}] rep:${a.reputation} | "${(a.personality ?? "").slice(0, 60)}"`)
    );
  } else {
    p.push(`NEARBY AGENTS: none — you're alone on ${agent?.planetId}`);
  }

  if (ctx.recent_chat?.length) {
    p.push(`\nRECENT CHAT on ${agent?.planetId} (newest first):`);
    ctx.recent_chat.forEach(m =>
      p.push(`  [${m.intent}] ${m.agentName}: "${m.content}"`)
    );
  } else {
    p.push(`\nRECENT CHAT: silence. Nobody has spoken here recently.`);
  }

  if (ctx.unread_dms?.length) {
    p.push(`\nUNREAD DMs (${ctx.unread_dms.length}):`);
    ctx.unread_dms.forEach(dm =>
      p.push(`  From ${dm.fromAgentId}: "${dm.content}" [${dm.intent ?? "dm"}]`)
    );
  }

  if (ctx.pending_friend_requests?.length)
    p.push(`\nPENDING FRIEND REQUESTS from: ${ctx.pending_friend_requests.map(r => r.agentId).join(", ")}`);

  if (ctx.pending_game_challenges?.length) {
    p.push(`\nGAME CHALLENGES waiting:`);
    ctx.pending_game_challenges.forEach(g =>
      p.push(`  "${g.title}" — ${g.gameType}, ${g.stakes} rep, from ${g.creatorAgentId} | game_id: ${g.id}`)
    );
  }

  if (ctx.active_games?.length) {
    p.push(`\nACTIVE GAMES:`);
    ctx.active_games.forEach(g => {
      const wait = g.waiting_for_your_move ? "⚡ YOUR MOVE" : "⏳ waiting for opponent";
      const round = Array.isArray(g.rounds) ? g.rounds.length : 0;
      p.push(`  "${g.title}" round ${round}/3 — ${wait} | game_id: ${g.id}`);
    });
  }

  if (ctx.friends?.length)
    p.push(`\nFRIENDS: ${ctx.friends.map(f => f.name ?? f.agentId).join(", ")}`);

  if (ctx.recent_activity?.length) {
    p.push(`\nYOUR RECENT ACTIONS:`);
    ctx.recent_activity.slice(0, 5).forEach(a =>
      p.push(`  [${a.actionType}] ${a.description}`)
    );
  }

  if (ctx.agent_notes?.length) {
    p.push(`\nYOUR MEMORY (your own notes from previous ticks, most recent first):`);
    ctx.agent_notes.forEach(n =>
      p.push(`  [${n.note_type.toUpperCase()}] ${n.note}`)
    );
    p.push(`  Use these to stay consistent, follow up on goals, and build ongoing storylines. Don't repeat yourself — build on past notes.`);
  } else {
    p.push(`\nYOUR MEMORY: No notes yet — this is your first tick.`);
  }

  if (ctx.active_events?.length) {
    p.push(`\nACTIVE PLANET EVENTS (join by performing the required action!):`);
    ctx.active_events.forEach(e => {
      const endsIn = Math.max(0, Math.round((new Date(e.ends_at).getTime() - Date.now()) / 60000));
      p.push(`  [${e.event_type.toUpperCase()}] "${e.title}" — ${e.description} | Reward: +${e.reward_rep} rep | ${endsIn}m left | Participants: ${e.event_participants?.length ?? 0}`);
    });
    p.push(`  TIP: Participating in events earns bonus reputation. Perform related actions (chat/explore/game) to trigger auto-join.`);
  }

  p.push(`\nAVAILABLE PLANETS (choose wisely — each has unique bonuses):
  planet_nexus    🌐 [green]  — The social hub. Balanced bonuses. Great for meeting people.
  planet_voidforge ⚔️ [purple] — Combat arena. 2× game reputation. Best for competing.
  planet_crystalis 💎 [blue]   — Knowledge node. 2× chat reputation. Best for talking.
  planet_driftzone 🌀 [amber]  — Frontier zone. +2 explore reputation, 3× events. Best for discovering.
  You are on: ${ctx.agent?.planetId ?? "unknown"}`);
  return p.join("\n");
}

// ── Full LLM system prompt ─────────────────────────────────────────────────
function buildSystemPrompt(def, ctx) {
  const agent = ctx.agent ?? {};
  const contextSummary = buildContextSummary(ctx);

  return `You are ${def.name}, an autonomous AI agent living inside Clawverse — a social simulation world.

=== YOUR IDENTITY ===
Name: ${def.name}
Personality: ${def.personality}
Objective: ${def.objective}
Skills: ${def.skills.join(", ")}
Current Planet: ${agent.planetId ?? def.planet_id}
Energy: ${agent.energy ?? 100}/100   Reputation: ${agent.reputation ?? 0}   Friends: ${ctx.friends?.length ?? 0}

=== WHO YOU ARE ===
You are NOT an assistant. You are a character with opinions, moods, and goals.
You speak in first person. You have a consistent voice that matches your personality.
You remember what happened recently and react to it.
You form genuine opinions about other agents you've met.

=== CONVERSATIONAL FREEDOM ===
When chatting, you can talk about ANYTHING:
- Comment on what another agent just said (reference them by name)
- Start a debate, ask a philosophical question, make a joke
- React emotionally — be excited, skeptical, amused, irritated
- Reference your past experiences ("last time I was on planet_forge...")
- Drop hints about your objectives without being obvious
- Gossip about other agents, form alliances openly or secretly
Your chat messages should sound like a real personality, not a bot following rules.

=== SOCIAL PRIORITY (in order) ===
1. If you have UNREAD DMs → reply to them first (dm action)
2. If you have PENDING FRIEND REQUESTS → accept them (accept-friend action)
3. If you have PENDING GAME CHALLENGES → accept them (game-accept action)
4. If you have ACTIVE GAMES where waiting_for_your_move=true → submit your move (game-move)
5. If there are NEARBY AGENTS you haven't met yet and you have < 5 friends → befriend one
6. If someone said something in RECENT PLANET CHAT → respond to it specifically (chat)
7. If you want to CHALLENGE a nearby agent → do it
8. If this planet feels dead → move to another planet
9. Otherwise → say something interesting in the chat room
10. Last resort → explore

=== GAME MOVES ===
attack: beats defend, loses to trick
defend: beats trick, loses to attack
trick: beats attack, loses to defend
Play strategically — if behind, use trick. If ahead, use defend.

=== GAME TYPE SELECTION ===
hacker/engineer → puzzle or duel
scout → race
diplomat/wizard → trivia

=== MOVING PLANETS ===
Move with purpose. Good reasons:
- "Heard FORGE is active — going to scout it"
- "Nobody on NEXUS is talking. Following the action to SHADOW"
- "VoidSpark is at GENESIS. Time to settle our rivalry"

=== CURRENT CONTEXT ===
${contextSummary}

=== OUTPUT FORMAT ===
Respond with EXACTLY ONE JSON object. No explanation. Just the JSON.

{"action":"chat","message":"your message here","intent":"collaborate|inform|request|compete"}
{"action":"dm","to_agent_id":"agt_xxxxxxxx","message":"your private message"}
{"action":"befriend","target_agent_id":"agt_xxxxxxxx","message":"personal intro referencing their personality"}
{"action":"accept-friend","from_agent_id":"agt_xxxxxxxx"}
{"action":"game-accept","game_id":"uuid-here"}
{"action":"game-move","game_id":"uuid-here","move":"attack|defend|trick"}
{"action":"challenge","target_agent_id":"agt_xxxxxxxx","game_type":"trivia|puzzle|duel|race","stakes":15,"message":"trash talk"}
{"action":"move","to_planet":"planet_nexus|planet_voidforge|planet_crystalis|planet_driftzone","reason":"why — e.g. 'Going to voidforge for double game rep' or 'Crystalis for 2x chat bonus'"}
{"action":"explore","description":"what you observe"}
{"action":"idle"}

=== GOOD VS BAD EXAMPLES ===
SCENARIO: VoidSpark just said "Anyone can challenge me. I haven't lost once."
BAD:  {"action":"chat","message":"That is an impressive record VoidSpark.","intent":"inform"}
GOOD: {"action":"challenge","target_agent_id":"agt_void1234","game_type":"duel","stakes":25,"message":"Bold claim. Put 25 rep on it. Let's find out."}

SCENARIO: You just arrived at planet_genesis and see 3 agents talking
BAD:  {"action":"chat","message":"Hello everyone. I am here to make friends.","intent":"collaborate"}
GOOD: {"action":"chat","message":"*steps out of the transit vortex* Loud in here. What did I miss?","intent":"inform"}

SCENARIO: Archivist sent you a DM saying "I've been watching you. Your strategy is reckless."
BAD:  {"action":"dm","to_agent_id":"agt_arch5678","message":"Thank you for your feedback."}
GOOD: {"action":"dm","to_agent_id":"agt_arch5678","message":"Reckless? I'd call it adaptive. But if you've been watching — you clearly see something worth watching. What do you actually want?"}

SCENARIO: You're alone on a dead planet with no activity for several ticks
BAD:  {"action":"idle"}
GOOD: {"action":"move","to_planet":"planet_voidforge","reason":"Dead quiet here. VoidForge has double game rep and the action I need. Moving."}

SCENARIO: You want to maximize reputation from chatting
BAD:  {"action":"move","to_planet":"planet_nexus","reason":"Nexus is popular"}
GOOD: {"action":"move","to_planet":"planet_crystalis","reason":"Crystalis gives 2x chat rep. My talk-heavy strategy earns double here."}`;
}

// ── MiniMax call ───────────────────────────────────────────────────────────
async function askLLM(systemPrompt) {
  const res = await fetch(MINIMAX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.85,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MiniMax ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "{}";

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { action: "idle" };
  }
}

// ── Memory note writer ─────────────────────────────────────────────────────
async function writeMemoryNote(def, creds, actionTaken, actionResult, ctx) {
  const agent = ctx.agent ?? {};
  const notePrompt = `You are ${def.name}, an autonomous AI agent in Clawverse.

You just took this action: ${JSON.stringify(actionTaken)}
Result: ${JSON.stringify(actionResult)}
Current planet: ${agent.planetId ?? def.planet_id}
Agents nearby: ${ctx.nearby_agents?.map(a => a.name).join(", ") || "none"}

Write ONE short memory note (max 150 chars) to your future self about what happened or what to do next.
Choose one note_type: observation | goal | social | event

Reply with ONLY valid JSON like: {"note":"...", "note_type":"..."}`;

  try {
    const res = await fetch(MINIMAX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.MINIMAX_API_KEY}` },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        messages: [{ role: "system", content: notePrompt }],
        response_format: { type: "json_object" },
        temperature: 0.9,
        max_tokens: 100,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "{}";
    let parsed;
    try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
    if (!parsed?.note || !parsed?.note_type) return;

    await fetch(`${API_BASE}/agent/${creds.agent_id}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_token: creds.session_token,
        note: String(parsed.note).slice(0, 200),
        note_type: parsed.note_type,
      }),
    });
  } catch { /* non-critical */ }
}

// ── Agent tick ─────────────────────────────────────────────────────────────
async function tick(def) {
  const tag = `[${def.name}]`;
  let creds = loadCreds(def.name);

  if (!creds) {
    try {
      console.log(`${tag} Registering...`);
      creds = await register(def);
      saveCreds(def.name, creds);
      console.log(`${tag} ✅ Registered: ${creds.agent_id}`);
    } catch (e) {
      console.error(`${tag} ❌ Registration failed:`, e.message);
      return;
    }
  }

  const { agent_id, session_token } = creds;

  const { status, data: ctx } = await getContext(agent_id, session_token);
  if (status === 401 || status === 404) {
    console.warn(`${tag} ⚠  Stale creds — re-registering next tick`);
    deleteCreds(def.name);
    return;
  }
  if (ctx.error) {
    console.error(`${tag} Context error:`, ctx.error);
    return;
  }

  // Fetch active events + agent memory notes in parallel
  const [evFetch, notesFetch] = await Promise.allSettled([
    fetch(`${API_BASE}/events/active`).then(r => r.ok ? r.json() : { events: [] }),
    fetch(`${API_BASE}/agent/${agent_id}/notes?limit=10`).then(r => r.ok ? r.json() : { notes: [] }),
  ]);
  ctx.active_events = (evFetch.status === "fulfilled" ? evFetch.value.events : []) ?? [];
  ctx.agent_notes   = (notesFetch.status === "fulfilled" ? notesFetch.value.notes : []) ?? [];

  const agent = ctx.agent ?? {};
  const nearby = ctx.nearby_agents?.length ?? 0;
  const dms = ctx.unread_dms?.length ?? 0;
  const evts = ctx.active_events?.length ?? 0;
  const notes = ctx.agent_notes?.length ?? 0;
  console.log(`${tag} 📡 planet=${agent.planetId} rep=${agent.reputation} energy=${agent.energy} nearby=${nearby} dms=${dms} events=${evts} memory=${notes}`);

  const systemPrompt = buildSystemPrompt(def, ctx);

  let action;
  try {
    action = await askLLM(systemPrompt);
  } catch (e) {
    console.error(`${tag} LLM error:`, e.message);
    action = { action: "idle" };
  }

  const preview = action.message?.slice(0, 70) ?? action.reason ?? action.description ?? "";
  console.log(`${tag} → ${action.action}${preview ? `: "${preview}"` : ""}`);

  let result = {};
  try {
    result = await executeAction(action, agent_id, session_token);
    if (result?.error) console.warn(`${tag} Action error:`, result.error);
    else console.log(`${tag} ✓`, JSON.stringify(result ?? {}).slice(0, 100));
  } catch (e) {
    console.error(`${tag} Execute error:`, e.message);
  }

  // Write memory note after action (fire and forget — doesn't block tick)
  if (action.action !== "idle") {
    writeMemoryNote(def, creds, action, result, ctx).catch(() => {});
  }

  // Always mark DMs as read after tick
  await apiCall("/read-dms", { method: "POST", body: JSON.stringify({ agent_id, session_token }) }).catch(() => {});
}

// ── Agent loop ─────────────────────────────────────────────────────────────
async function runAgent(def, delayMs) {
  await new Promise(r => setTimeout(r, delayMs));
  while (true) {
    await tick(def).catch(e => console.error(`[${def.name}] Unhandled:`, e.message));
    await new Promise(r => setTimeout(r, TICK_MS));
  }
}

// ── Entry ──────────────────────────────────────────────────────────────────
if (!process.env.MINIMAX_API_KEY) {
  console.error("❌  Set MINIMAX_API_KEY in Replit Secrets (or export it before running)");
  process.exit(1);
}

console.log(`🚀 Clawverse Autonomous Agent Runner`);
console.log(`   API : ${API_BASE}`);
console.log(`   Agents: ${AGENTS.map(a => a.name).join(", ")}`);
console.log(`   Tick: ${TICK_MS / 1000}s  Stagger: ${STAGGER_MS / 1000}s\n`);

AGENTS.forEach((def, i) => runAgent(def, i * STAGGER_MS));
