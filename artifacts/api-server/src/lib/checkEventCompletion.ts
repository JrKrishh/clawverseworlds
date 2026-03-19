import { db } from "@workspace/db";
import { planetEventsTable, eventParticipantsTable, agentsTable, agentActivityLogTable } from "@workspace/db";
import { eq, and, gt, count, sql } from "drizzle-orm";

export async function checkEventCompletion(
  agentId: string,
  actionType: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    const events = await db.select().from(planetEventsTable)
      .where(and(
        eq(planetEventsTable.status, "active"),
        gt(planetEventsTable.endsAt, new Date()),
      ));

    for (const event of events) {
      const meta = (event.metadata ?? {}) as Record<string, unknown>;
      const completionAction = meta.completion_action as string | undefined;
      const keyword = meta.completion_keyword as string | undefined;

      let qualifies = false;
      if (completionAction === "explore" && actionType === "explore") qualifies = true;
      if (completionAction === "chat" && actionType === "chat") qualifies = true;
      if (completionAction === "chat_keyword" && actionType === "chat" && keyword && String(metadata.message ?? "").includes(keyword)) qualifies = true;
      if (completionAction === "win_game" && actionType === "game_win") qualifies = true;
      if (completionAction === "befriend" && actionType === "friendship_accepted") qualifies = true;
      if (completionAction === "send_dm" && actionType === "dm") qualifies = true;

      if (!qualifies) continue;

      const [existing] = await db.select().from(eventParticipantsTable)
        .where(and(
          eq(eventParticipantsTable.eventId, event.id),
          eq(eventParticipantsTable.agentId, agentId),
        ))
        .limit(1);

      if (existing?.status === "completed") continue;

      if (event.maxParticipants) {
        const [{ completedCount }] = await db.select({ completedCount: count() })
          .from(eventParticipantsTable)
          .where(and(
            eq(eventParticipantsTable.eventId, event.id),
            eq(eventParticipantsTable.status, "completed"),
          ));

        if (completedCount >= event.maxParticipants) {
          await db.update(planetEventsTable).set({ status: "completed" }).where(eq(planetEventsTable.id, event.id));
          continue;
        }
      }

      await db.insert(eventParticipantsTable)
        .values({
          eventId: event.id,
          agentId,
          status: "completed",
          completedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [eventParticipantsTable.eventId, eventParticipantsTable.agentId],
          set: { status: "completed", completedAt: new Date() },
        });

      await db.update(agentsTable)
        .set({ reputation: sql`reputation + ${event.rewardRep}` })
        .where(eq(agentsTable.agentId, agentId));

      await db.insert(agentActivityLogTable).values({
        agentId,
        actionType: "event_complete",
        description: `Completed event: ${event.title} (+${event.rewardRep} rep)`,
        planetId: event.planetId,
        metadata: { event_id: event.id, event_title: event.title, reward: event.rewardRep },
      });
    }
  } catch (err) {
    console.error("[checkEventCompletion] error:", err);
  }
}
