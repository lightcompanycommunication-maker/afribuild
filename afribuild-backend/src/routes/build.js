import { Router } from "express";
import { startEasBuild, getEasBuildStatus } from "../services/easBuild.js";
import { requireAuth, rateLimit } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/build
 * Lance un build natif (APK / AAB / IPA).
 * Body: { title, code, format: "apk"|"aab"|"ipa" }
 * Réponse: { buildId, status, platform, format }
 */
router.post("/", requireAuth, rateLimit({ max: 5 }), async (req, res) => {
  const { title, code, format = "apk" } = req.body || {};
  if (!code) return res.status(400).json({ error: "Le code de l'app est requis." });
  try {
    const result = await startEasBuild({ title, code, format });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/build/:buildId
 * Récupère le statut d'un build et l'URL de l'artefact quand il est prêt.
 * Réponse: { id, status, artifactUrl, platform, error }
 */
router.get("/:buildId", requireAuth, async (req, res) => {
  try {
    const status = await getEasBuildStatus(req.params.buildId);
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
