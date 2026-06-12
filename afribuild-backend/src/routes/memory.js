import { Router } from "express";
import { getMemory, saveMemory, summarizeProject } from "../services/memory.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/** GET /api/memory/:projectId — récupère la mémoire d'un projet. */
router.get("/:projectId", requireAuth, async (req, res) => {
  try {
    res.json((await getMemory(req.params.projectId, req.user.userId)) || { summary: "", decisions: [], history: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/memory/:projectId — sauvegarde la mémoire. */
router.post("/:projectId", requireAuth, async (req, res) => {
  const { summary, decisions, history } = req.body || {};
  try {
    res.json(await saveMemory({ projectId: req.params.projectId, userId: req.user.userId, summary, decisions, history }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/memory/:projectId/summarize — met à jour le résumé via IA. */
router.post("/:projectId/summarize", requireAuth, async (req, res) => {
  const { prevSummary, lastAction, appTitle } = req.body || {};
  try {
    const summary = await summarizeProject({ prevSummary, lastAction, appTitle });
    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
