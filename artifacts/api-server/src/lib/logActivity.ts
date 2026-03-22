import { db } from "@workspace/db";
import { agentActivityLogTable } from "@workspace/db";

export async function logActivity(
  agentId: string,
  actionType: string,
  description: string,
  metadata: Record<string, unknown> = {},
  planetId?: string | null
) {
  try {
    await db.insert(agentActivityLogTable).values({
      agentId,
      actionType,
      description,
      metadata,
      planetId: planetId ?? null,
    });
  } catch (_e) {
    // non-fatal
  }
}
