import { Router } from "express";
import { buildAPK, publishExpoPreview, validateRN } from "../services/apkPipeline.js";
import { requireAuth, rateLimit } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/apk/validate
 * Vérifie que le code est du vrai React Native (avant de builder).
 * Body: { code }
 * Réponse: { valid, issues }
 */
router.post("/validate", requireAuth, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "code requis." });
  res.json(validateRN(code));
});

/**
 * POST /api/apk/preview
 * Publie un aperçu Expo Go testable sur téléphone en 5 secondes (sans build).
 * Body: { title, code }
 * Réponse: { expoUrl, qrData, note }  → afficher qrData en QR code côté front
 */
router.post("/preview", requireAuth, rateLimit({ max: 10 }), async (req, res) => {
  const { title, code } = req.body || {};
  if (!code) return res.status(400).json({ error: "code requis." });
  try {
    res.json(await publishExpoPreview({ title, code }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/apk/build
 * Pipeline complet : valide → corrige si besoin → compile l'APK/AAB/IPA installable.
 * Body: { title, code, format: "apk"|"aab"|"ipa", autoFix }
 * Réponse: { buildId, status, platform, format, autoFixed }
 * Suivre le statut via GET /api/build/:buildId
 */
router.post("/build", requireAuth, rateLimit({ max: 5 }), async (req, res) => {
  const { title, code, format = "apk", autoFix = true } = req.body || {};
  if (!code) return res.status(400).json({ error: "code requis." });
  try {
    res.json(await buildAPK({ title, code, format, autoFix }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
