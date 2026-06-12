import { config } from "../config.js";

/**
 * ════════════════════════════════════════════════════════════════════════
 * AFRIMAGE — Génération d'images réelles (logos + photos hyper réalistes)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Branche les meilleures IA d'image du marché. Chaque image a un COÛT réel,
 * donc le système est conçu pour être FACTURÉ (crédits images séparés).
 *
 * Fournisseurs supportés (choisis selon qualité/prix) :
 *   - flux       → Black Forest Labs (via Replicate) : top réalisme, abordable
 *   - openai     → GPT Image / DALL·E 3 : excellent, facile
 *   - stability  → SDXL : le moins cher, qualité correcte
 *
 * Le client choisit le TYPE :
 *   - "logo"        → logo vectoriel/marque
 *   - "photo"       → photo produit / lifestyle hyper réaliste
 *   - "banner"      → bannière marketing
 *   - "interior"    → intérieur / foyer / décor réaliste
 *
 * IMPORTANT : chaque génération décrémente le quota d'images de l'utilisateur.
 */

// Coût indicatif par image (à ajuster selon les tarifs réels des fournisseurs)
export const IMAGE_COST_FCFA = { flux: 20, openai: 45, stability: 12 };

// Quotas d'images inclus par plan (au-delà → achat de crédits images)
export const IMAGE_QUOTA_BY_PLAN = { free: 1, starter: 5, pro: 20, business: 60 };

// Packs de crédits images (revenu dédié, marge ~3x le coût)
export const IMAGE_PACKS = [
  { images: 10,  price: 1000 },
  { images: 30,  price: 2500, popular: true },
  { images: 100, price: 7000 },
];

/** Construit un prompt enrichi selon le type d'image demandé. */
function buildImagePrompt(kind, subject, opts = {}) {
  const style = opts.style || "";
  const bases = {
    logo: `Logo professionnel moderne pour "${subject}". Design épuré, mémorable, vectoriel, fond uni, haute qualité, identité de marque africaine élégante. ${style}`,
    photo: `Photo hyper réaliste de "${subject}". Éclairage professionnel studio, ultra détaillée, qualité commerciale, 8k, photoréalisme. ${style}`,
    interior: `Photo intérieure hyper réaliste : "${subject}". Décor soigné, lumière naturelle chaleureuse, photoréalisme architectural, qualité magazine. ${style}`,
    banner: `Bannière marketing professionnelle pour "${subject}". Composition équilibrée, couleurs vives, espace pour texte, qualité publicitaire. ${style}`,
    product: `Photo produit e-commerce hyper réaliste : "${subject}". Fond épuré, éclairage studio, ombres douces, qualité catalogue premium. ${style}`,
  };
  return bases[kind] || bases.photo;
}

/** ─── FLUX via Replicate (recommandé : réalisme + prix) ───────────────────── */
async function generateFlux(prompt, { width = 1024, height = 1024 } = {}) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN non configuré.");
  // Lance la prédiction
  const start = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input: { prompt, width, height, num_outputs: 1, output_format: "webp", output_quality: 90 } }),
  });
  const data = await start.json();
  if (data.error) throw new Error(`Flux: ${data.error}`);
  const url = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!url) throw new Error("Flux: aucune image générée.");
  return { url, provider: "flux" };
}

/** ─── OpenAI (DALL·E 3 / GPT Image) ───────────────────────────────────────── */
async function generateOpenAI(prompt, { size = "1024x1024" } = {}) {
  const key = process.env.OPENAI_KEY;
  if (!key) throw new Error("OPENAI_KEY non configuré.");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size, quality: "hd" }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`OpenAI: ${data.error.message}`);
  return { url: data.data?.[0]?.url, provider: "openai" };
}

/** ─── Stability AI (SDXL) — le moins cher ─────────────────────────────────── */
async function generateStability(prompt) {
  const key = process.env.STABILITY_KEY;
  if (!key) throw new Error("STABILITY_KEY non configuré.");
  const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    body: (() => { const f = new FormData(); f.append("prompt", prompt); f.append("output_format", "webp"); return f; })(),
  });
  const data = await res.json();
  if (data.errors) throw new Error(`Stability: ${data.errors.join(", ")}`);
  // renvoie du base64
  return { base64: data.image, provider: "stability" };
}

/**
 * Génère une image. Choisit le fournisseur (défaut : flux).
 * Retourne l'URL (ou base64) + le coût pour décompte du quota.
 */
export async function generateImage({ kind = "photo", subject, provider = "flux", style, size }) {
  if (!subject) throw new Error("Décris l'image à générer.");
  const prompt = buildImagePrompt(kind, subject, { style });
  let result;
  if (provider === "openai") result = await generateOpenAI(prompt, { size });
  else if (provider === "stability") result = await generateStability(prompt);
  else result = await generateFlux(prompt, size ? { width: +size.split("x")[0], height: +size.split("x")[1] } : {});
  return { ...result, kind, subject, cost: IMAGE_COST_FCFA[result.provider] || 20 };
}
