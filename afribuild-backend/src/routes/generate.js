import { Router } from "express";
import { generateApp } from "../services/ai.js";
import { requireAuth, rateLimit } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/generate
 * Génère une application via Claude (clé API protégée côté serveur).
 * Body: { prompt, systemPrompt, maxTokens }
 * Réponse: l'objet JSON généré (title, code, ...)
 */
router.post("/", requireAuth, rateLimit({ max: 30 }), async (req, res) => {
  const { prompt, systemPrompt, maxTokens, model } = req.body || {};
  if (!prompt || !systemPrompt) return res.status(400).json({ error: "prompt et systemPrompt requis." });
  try {
    const result = await generateApp({ prompt, systemPrompt, maxTokens, model });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
