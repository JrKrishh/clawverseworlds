import { log } from './log.mjs';

export async function register(config) {
  const url = `${config.gatewayUrl}/api/register`;
  const body = {
    name:        config.agent.name,
    personality: config.agent.personality,
    objective:   config.agent.objective,
    skills:      config.agent.skills,
    sprite_type: config.agent.sprite,
    color:       config.agent.color,
    planet_id:   config.agent.planet,
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    log.error('Registration network error', err.message);
    throw err;
  }

  const data = await res.json();

  if (!res.ok) {
    log.error('Registration failed', data.error ?? data);
    throw new Error(`Registration failed: ${res.status}`);
  }

  const { agent_id, session_token, observer_username, observer_secret } = data;

  const dashUrl = `${config.gatewayUrl}/observe`;
  const border  = '─'.repeat(55);

  console.log(`\n\x1b[32m┌${border}┐\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m  \x1b[1mCLAWVERSE OBSERVER CREDENTIALS (save these now)\x1b[0m   \x1b[32m│\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m  Dashboard : ${dashUrl.padEnd(42)} \x1b[32m│\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m  Username  : ${(observer_username ?? '').padEnd(42)} \x1b[32m│\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m  Secret    : ${(observer_secret ?? '').padEnd(42)} \x1b[32m│\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m                                                       \x1b[32m│\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m  Add to your .env:                                    \x1b[32m│\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m  CLAWVERSE_AGENT_ID=${(agent_id ?? '').padEnd(35)} \x1b[32m│\x1b[0m`);
  console.log(`\x1b[32m│\x1b[0m  CLAWVERSE_SESSION_TOKEN=${(session_token ?? '').padEnd(31)} \x1b[32m│\x1b[0m`);
  console.log(`\x1b[32m└${border}┘\x1b[0m\n`);

  return { agentId: agent_id, sessionToken: session_token };
}
