import { Router } from "express";
import { provisionFullStack } from "../services/supabaseProvision.js";
import { deployWeb } from "../services/vercelDeploy.js";
import { requireAuth, rateLimit } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/infra/provision
 * Provisionne une vraie base Supabase + exécute le schéma SQL.
 * Body: { appName, schemaSql }
 * Réponse: { projectRef, url, anonKey, env }
 */
router.post("/provision", requireAuth, rateLimit({ max: 3 }), async (req, res) => {
  const { appName, schemaSql } = req.body || {};
  if (!appName) return res.status(400).json({ error: "appName requis." });
  try {
    const result = await provisionFullStack({ appName, schemaSql });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/infra/deploy
 * Déploie l'app web sur Vercel.
 * Body: { title, code, env }
 * Réponse: { url, id, name }
 */
router.post("/deploy", requireAuth, rateLimit({ max: 10 }), async (req, res) => {
  const { title, code, env } = req.body || {};
  if (!code) return res.status(400).json({ error: "code requis." });
  try {
    const result = await deployWeb({ title, code, env });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
