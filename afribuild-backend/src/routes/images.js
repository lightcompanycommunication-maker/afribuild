import { Router } from "express";
import { generateImage, IMAGE_QUOTA_BY_PLAN, IMAGE_PACKS, IMAGE_COST_FCFA } from "../services/images.js";
import { requireAuth, rateLimit } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/images/generate
 * Génère une vraie image (logo / photo / intérieur...).
 * IMPORTANT : le quota d'images est géré côté app (front décrémente),
 * mais on vérifie ici que le plan autorise au moins 1 image.
 *
 * Body: { kind, subject, provider, style, size, plan, imagesUsed }
 * Réponse: { url|base64, provider, cost, quotaLeft }
 */
router.post("/generate", requireAuth, rateLimit({ max: 30 }), async (req, res) => {
  const { kind, subject, provider, style, size, plan = "free", imagesUsed = 0 } = req.body || {};
  if (!subject) return res.status(400).json({ error: "Décris l'image à générer." });

  // Vérification du quota (anti-perte d'argent)
  const quota = IMAGE_QUOTA_BY_PLAN[plan] ?? 0;
  if (imagesUsed >= quota) {
    return res.status(402).json({
      error: "Quota d'images atteint pour ce plan.",
      needCredits: true,
      packs: IMAGE_PACKS,
    });
  }

  try {
    const img = await generateImage({ kind, subject, provider, style, size });
    res.json({ ...img, quotaLeft: quota - imagesUsed - 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/images/analyze-logo
 * Analyse un logo uploadé (base64) pour en extraire les couleurs dominantes.
 * Ces couleurs seront injectées dans la génération d'app → l'app respecte
 * la charte graphique du client.
 *
 * Body: { imageBase64 }
 * Réponse: { colors: ["#hex", ...], primary, secondary }
 */
router.post("/analyze-logo", requireAuth, async (req, res) => {
  const { imageBase64 } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "Image manquante." });
  try {
    // Utilise Claude (vision) pour analyser le logo et extraire la palette
    const raw = await analyzeWithClaude(imageBase64);
    res.json(raw);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/images/packs — packs de crédits images disponibles. */
router.get("/packs", (_req, res) => res.json({ packs: IMAGE_PACKS, quotas: IMAGE_QUOTA_BY_PLAN, costs: IMAGE_COST_FCFA }));

async function analyzeWithClaude(imageBase64) {
  const { config } = await import("../config.js");
  const media = imageBase64.startsWith("data:") ? imageBase64.split(";")[0].split(":")[1] : "image/png";
  const data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": config.anthropic.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: media, data } },
          { type: "text", text: `Analyse ce logo et extrais sa charte graphique. Réponds UNIQUEMENT en JSON : {"colors":["#hex","#hex","#hex"],"primary":"#hex","secondary":"#hex","style":"description courte du style"}` },
        ],
      }],
    }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  const txt = d.content?.map((b) => b.text || "").join("") || "";
  const clean = txt.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0] || clean);
}

export default router;
