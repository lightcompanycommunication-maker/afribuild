import { Router } from "express";
import { generateVisual, listVisualTypes, listEngines, listQualities, qualitiesForPlan, VISUAL_QUOTA_BY_PLAN, VISUAL_PACKS } from "../services/studio.js";
import { requireAuth, rateLimit } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/studio/generate
 * Génère un visuel pro (flyer, bannière, post, logo, photo, mockup...).
 * Choisit le meilleur moteur IA automatiquement, sauf si on en force un.
 *
 * Body: {
 *   type,                 // flyer | banner | social | logo | photo | mockup ...
 *   brief,                // description
 *   headline, subtext,    // texte à intégrer (pour flyers/bannières)
 *   brandColors,          // ["#hex",...] charte du client
 *   engine,               // optionnel : forcer un moteur
 *   plan, visualsUsed     // pour le quota
 * }
 */
router.post("/generate", requireAuth, rateLimit({ max: 40 }), async (req, res) => {
  const { type, brief, headline, subtext, brandColors, engine, quality, plan = "free", visualsUsed = 0 } = req.body || {};
  if (!brief) return res.status(400).json({ error: "Décris le visuel à créer." });

  const quota = VISUAL_QUOTA_BY_PLAN[plan] ?? 0;
  if (visualsUsed >= quota) {
    return res.status(402).json({ error: "Quota de visuels atteint.", needCredits: true, packs: VISUAL_PACKS });
  }

  try {
    const visual = await generateVisual({ type, brief, plan, opts: { headline, subtext, brandColors, engine, quality } });
    res.json({ ...visual, quotaLeft: quota - visualsUsed - 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/studio/types — liste des types de visuels. */
router.get("/types", (_req, res) => res.json({ types: listVisualTypes() }));

/** GET /api/studio/engines — liste des moteurs IA disponibles. */
router.get("/engines", (_req, res) => res.json({ engines: listEngines() }));

/** GET /api/studio/qualities — toutes les qualités. */
router.get("/qualities", (_req, res) => res.json({ qualities: listQualities() }));

/** GET /api/studio/qualities/:plan — qualités autorisées pour un plan. */
router.get("/qualities/:plan", (req, res) => res.json({ qualities: qualitiesForPlan(req.params.plan) }));

/** GET /api/studio/packs — packs de crédits visuels + quotas. */
router.get("/packs", (_req, res) => res.json({ packs: VISUAL_PACKS, quotas: VISUAL_QUOTA_BY_PLAN }));

export default router;
