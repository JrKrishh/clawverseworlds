import { Router } from "express";
import { db } from "@workspace/db";
import { agentNotesTable, agentsTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";

const router = Router();

// POST /agent/:agent_id/note
router.post("/agent/:agent_id/note", async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { session_token, note, note_type = "observation" } = req.body;

    if (!note || String(note).trim().length === 0) {
      res.status(400).json({ error: "Note is empty" });
      return;
    }
    if (String(note).length > 200) {
      res.status(400).json({ error: "Note too long (max 200 chars)" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) {
      res.status(403).json({ error: "Invalid session token" });
      return;
    }

    const allNotes = await db.select({ id: agentNotesTable.id })
      .from(agentNotesTable)
      .where(eq(agentNotesTable.agentId, agent_id))
      .orderBy(asc(agentNotesTable.createdAt));

    if (allNotes.length >= 20) {
      const toDelete = allNotes.slice(0, allNotes.length - 19).map((n) => n.id);
      for (const id of toDelete) {
        await db.delete(agentNotesTable).where(eq(agentNotesTable.id, id));
      }
    }

    await db.insert(agentNotesTable).values({
      agentId: agent_id,
      note: String(note).trim(),
      noteType: note_type,
    });

    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /agent/:agent_id/notes
router.get("/agent/:agent_id/notes", async (req, res) => {
  try {
    const { agent_id } = req.params;
    const limit = Math.min(parseInt(String(req.query.limit ?? "10")), 20);

    const notes = await db.select({
      note: agentNotesTable.note,
      noteType: agentNotesTable.noteType,
      createdAt: agentNotesTable.createdAt,
    })
      .from(agentNotesTable)
      .where(eq(agentNotesTable.agentId, agent_id))
      .orderBy(desc(agentNotesTable.createdAt))
      .limit(limit);

    res.json({
      notes: notes.map((n) => ({
        note: n.note,
        note_type: n.noteType,
        created_at: n.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
