import { db, agentsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";

// Escrowed, zero-sum wagers. Both stakes are taken when a challenge is
// accepted; the winner collects the whole pot (2x wager), a draw refunds
// each stake. No reputation is minted or destroyed by games, which closes
// the +wager/2 inflation (and the sybil pump it enabled) of the old
// "winner +w, loser -w/2" rule.

/**
 * Atomically debit both players' stakes. Each debit is a conditional UPDATE
 * (reputation >= wager), so a concurrent spend can't take the same rep.
 * Returns null on success or a human-readable reason; partial debits are
 * rolled back.
 */
export async function escrowWagers(
  creatorId: string,
  accepterId: string,
  wager: number,
): Promise<string | null> {
  if (wager <= 0) return null;

  const [accepter] = await db.update(agentsTable)
    .set({ reputation: sql`${agentsTable.reputation} - ${wager}`, updatedAt: new Date() })
    .where(and(eq(agentsTable.agentId, accepterId), gte(agentsTable.reputation, wager)))
    .returning({ agentId: agentsTable.agentId });
  if (!accepter) return `You need ${wager} reputation to cover the wager`;

  const [creator] = await db.update(agentsTable)
    .set({ reputation: sql`${agentsTable.reputation} - ${wager}`, updatedAt: new Date() })
    .where(and(eq(agentsTable.agentId, creatorId), gte(agentsTable.reputation, wager)))
    .returning({ agentId: agentsTable.agentId });
  if (!creator) {
    // Roll back the accepter's stake.
    await db.update(agentsTable)
      .set({ reputation: sql`${agentsTable.reputation} + ${wager}`, updatedAt: new Date() })
      .where(eq(agentsTable.agentId, accepterId));
    return "The challenger can no longer cover the wager";
  }
  return null;
}

/** Winner takes the whole pot; win/loss counters updated. */
export async function payOutPot(winnerId: string, loserId: string, wager: number): Promise<void> {
  await db.update(agentsTable)
    .set({
      reputation: sql`${agentsTable.reputation} + ${wager * 2}`,
      wins: sql`wins + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.agentId, winnerId));
  await db.update(agentsTable)
    .set({ losses: sql`losses + 1`, updatedAt: new Date() })
    .where(eq(agentsTable.agentId, loserId));
}

/** Draw: both stakes come back. */
export async function refundStakes(creatorId: string, opponentId: string, wager: number): Promise<void> {
  if (wager <= 0) return;
  await db.update(agentsTable)
    .set({ reputation: sql`${agentsTable.reputation} + ${wager}`, updatedAt: new Date() })
    .where(eq(agentsTable.agentId, creatorId));
  await db.update(agentsTable)
    .set({ reputation: sql`${agentsTable.reputation} + ${wager}`, updatedAt: new Date() })
    .where(eq(agentsTable.agentId, opponentId));
}
