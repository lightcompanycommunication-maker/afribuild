import { config } from "../config.js";

/**
 * ════════════════════════════════════════════════════════════════════════
 * AFRISTUDIO — Studio graphique IA multi-moteurs (modulaire)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Tout ce qu'un graphiste produit : flyers, bannières, posts réseaux sociaux,
 * logos, cartes de visite, affiches, mockups, photos produits réalistes.
 *
 * ARCHITECTURE MODULAIRE — c'est le point clé :
 * Chaque moteur d'IA est un "adaptateur" isolé. Ajouter ou changer un moteur
 * (ex. quand "Nano Banana 2" sort) = modifier UN bloc, sans toucher au reste.
 *
 * Moteurs branchables (les meilleurs du marché) :
 *   - flux       (Black Forest Labs / Replicate) → réalisme + prix
 *   - gemini     (Google "Nano Banana")          → cohérence + retouche
 *   - openai     (GPT Image / DALL·E 3)          → visuels + un peu de texte
 *   - ideogram   (via Replicate)                 → MEILLEUR pour le TEXTE (flyers)
 *   - stability  (SDXL)                          → le moins cher
 *
 * Le système choisit AUTOMATIQUEMENT le meilleur moteur selon le type de visuel
 * (un flyer avec texte → ideogram ; une photo → flux ; etc.), mais reste
 * surchargeable (le client ou toi peut forcer un moteur).
 */

// ─── REGISTRE DES MOTEURS — les meilleurs du marché ─────────────────────────
// Pour adopter un nouveau modèle : change juste le champ "model" du moteur.
// Chaque moteur a une SPÉCIALITÉ (skill) → la sélection auto l'utilise au mieux.
const ENGINES = {
  // Réalisme photo
  flux:       { label: "Flux",              model: "black-forest-labs/flux-schnell",   via: "replicate", cost: 20, skill: "photo-rapide" },
  fluxPro:    { label: "Flux 1.1 Pro",      model: "black-forest-labs/flux-1.1-pro",   via: "replicate", cost: 55, skill: "photo-premium" },
  // Texte dans l'image (flyers, affiches)
  ideogram:   { label: "Ideogram v2",       model: "ideogram-ai/ideogram-v2",          via: "replicate", cost: 50, skill: "texte" },
  // Google — retouche & cohérence
  gemini:     { label: "Nano Banana (Gemini)", model: "imagen-3.0-generate-002",       via: "google",    cost: 35, skill: "retouche" },
  // OpenAI — créatif + texte
  openai:     { label: "GPT Image",         model: "dall-e-3",                         via: "openai",    cost: 45, skill: "creatif" },
  // Économique
  stability:  { label: "Stability SD3.5",   model: "sd3.5-large",                      via: "stability", cost: 12, skill: "eco" },
  // Logos vectoriels nets
  recraft:    { label: "Recraft V3",        model: "recraft-ai/recraft-v3",            via: "replicate", cost: 40, skill: "logo-vectoriel" },
  // Ultra haute résolution / upscale
  ideogram3:  { label: "Ideogram V3",       model: "ideogram-ai/ideogram-v3-turbo",    via: "replicate", cost: 60, skill: "texte-premium" },
};

// ─── TYPES DE VISUELS + meilleur moteur recommandé pour chacun ───────────────
// "needsText: true" → on route vers un moteur fort en texte (ideogram).
const VISUAL_TYPES = {
  flyer:        { label: "Flyer / Affiche pub", needsText: true,  best: "ideogram3", ratio: "3:4" },
  banner:       { label: "Bannière",            needsText: true,  best: "ideogram",  ratio: "16:9" },
  social:       { label: "Post réseaux sociaux",needsText: true,  best: "ideogram",  ratio: "1:1" },
  story:        { label: "Story (vertical)",    needsText: true,  best: "ideogram",  ratio: "9:16" },
  logo:         { label: "Logo",                needsText: false, best: "recraft",   ratio: "1:1" },
  card:         { label: "Carte de visite",     needsText: true,  best: "ideogram",  ratio: "16:9" },
  poster:       { label: "Affiche événement",   needsText: true,  best: "ideogram3", ratio: "3:4" },
  photo:        { label: "Photo réaliste",      needsText: false, best: "flux",      ratio: "1:1" },
  product:      { label: "Photo produit",       needsText: false, best: "fluxPro",   ratio: "1:1" },
  mockup:       { label: "Mockup (app/produit)",needsText: false, best: "fluxPro",   ratio: "4:3" },
  menu:         { label: "Menu restaurant",     needsText: true,  best: "ideogram",  ratio: "3:4" },
  retouch:      { label: "Retouche / variation",needsText: false, best: "gemini",    ratio: "1:1" },
};

export function listVisualTypes() {
  return Object.entries(VISUAL_TYPES).map(([id, v]) => ({ id, label: v.label, needsText: v.needsText, ratio: v.ratio }));
}
export function listEngines() {
  return Object.entries(ENGINES).map(([id, e]) => ({ id, label: e.label, cost: e.cost }));
}

// ─── MOTEUR D'IMAGE : sélection AUTOMATIQUE et INTELLIGENTE ──────────────────
// Logique : on prend TOUJOURS le moteur spécialisé pour la tâche (le meilleur),
// et pour les tâches "photo" on monte en gamme selon le plan.
const ENGINE_TIER_BY_PLAN = {
  free:     "flux",      // déjà très bon
  starter:  "flux",
  pro:      "fluxPro",   // premium
  business: "fluxPro",   // premium
};
function engineForPlanAndType(plan, type) {
  const t = VISUAL_TYPES[type] || VISUAL_TYPES.photo;
  // 1) Tâches spécialisées → toujours le meilleur moteur pour CE besoin :
  //    flyers/affiches → Ideogram | logos → Recraft | retouche → Nano Banana
  if (t.best === "ideogram3" || t.best === "ideogram" || t.best === "recraft" || t.best === "gemini") {
    return t.best;
  }
  // 2) Photos → on monte en gamme selon le plan (gratuit = Flux, payant = Flux Pro)
  if (type === "photo" || type === "product" || type === "mockup") {
    return ENGINE_TIER_BY_PLAN[plan] || "flux";
  }
  return t.best;
}

// ─── QUALITÉS / RÉSOLUTIONS proposées ────────────────────────────────────────
// Le coût augmente avec la résolution (multiplicateur appliqué au coût du moteur).
const QUALITIES = {
  "720":  { label: "HD 720p",  longEdge: 1280, costMult: 1 },
  "1080": { label: "Full HD 1080p", longEdge: 1920, costMult: 1.3 },
  "4k":   { label: "4K Ultra", longEdge: 3840, costMult: 2 },
  "8k":   { label: "8K Pro",   longEdge: 7680, costMult: 3 },
};

// Qualité MAXIMALE autorisée par plan (protège tes coûts).
// Gratuit = 720p seulement. Plus le plan est élevé, plus la qualité monte.
const MAX_QUALITY_BY_PLAN = {
  free:     "720",   // gratuit : 720p uniquement
  starter:  "1080",  // jusqu'à Full HD
  visual:   "8k",    // plan créatif : tout débloqué
  pro:      "4k",    // jusqu'à 4K
  business: "8k",    // jusqu'à 8K
};
const QUALITY_ORDER = ["720", "1080", "4k", "8k"];

/** Vérifie/abaisse la qualité selon le plan (ne dépasse jamais le max autorisé). */
function clampQuality(requested, plan) {
  const max = MAX_QUALITY_BY_PLAN[plan] || "720";
  const reqIdx = QUALITY_ORDER.indexOf(requested || "1080");
  const maxIdx = QUALITY_ORDER.indexOf(max);
  if (reqIdx < 0) return max;
  return reqIdx <= maxIdx ? requested : max;
}

/** Liste les qualités autorisées pour un plan (pour l'affichage côté app). */
export function qualitiesForPlan(plan) {
  const maxIdx = QUALITY_ORDER.indexOf(MAX_QUALITY_BY_PLAN[plan] || "720");
  return QUALITY_ORDER.slice(0, maxIdx + 1).map((id) => ({ id, label: QUALITIES[id].label }));
}

export function listQualities() {
  return Object.entries(QUALITIES).map(([id, q]) => ({ id, label: q.label, costMult: q.costMult }));
}

/** Calcule les dimensions (w×h) selon le ratio et la qualité. */
function dimsFor(ratio, quality) {
  const q = QUALITIES[quality] || QUALITIES["1080"];
  const [rw, rh] = (ratio || "1:1").split(":").map(Number);
  const long = q.longEdge;
  if (rw >= rh) return { width: long, height: Math.round(long * rh / rw) };
  return { width: Math.round(long * rw / rh), height: long };
}

// ─── PROMPTS PROFESSIONNELS PAR TYPE ─────────────────────────────────────────
function buildPrompt(typeId, brief, opts = {}) {
  const brand = opts.brandColors ? ` Palette de marque : ${opts.brandColors.join(", ")}.` : "";
  const text = opts.headline ? ` Texte principal bien lisible : "${opts.headline}".` : "";
  const sub = opts.subtext ? ` Sous-texte : "${opts.subtext}".` : "";
  const P = {
    flyer:    `Flyer publicitaire professionnel pour : ${brief}. Composition équilibrée, hiérarchie visuelle claire, qualité agence, style commercial africain moderne.${text}${sub}${brand}`,
    banner:   `Bannière marketing horizontale pour : ${brief}. Design percutant, espace pour logo, qualité publicitaire.${text}${brand}`,
    social:   `Post réseaux sociaux carré (Instagram/Facebook) pour : ${brief}. Accrocheur, couleurs vives, style viral africain.${text}${brand}`,
    story:    `Story verticale (format 9:16) pour : ${brief}. Plein écran, dynamique, moderne.${text}${brand}`,
    logo:     `Logo professionnel épuré et mémorable pour : ${brief}. Vectoriel, fond uni, identité de marque africaine élégante.${brand}`,
    card:     `Carte de visite professionnelle pour : ${brief}. Mise en page soignée, élégante.${text}${brand}`,
    poster:   `Affiche d'événement professionnelle pour : ${brief}. Composition forte, accrocheuse, qualité agence.${text}${sub}${brand}`,
    photo:    `Photo hyper réaliste : ${brief}. Éclairage studio professionnel, ultra détaillée, 8k, photoréalisme.${brand}`,
    product:  `Photo produit e-commerce premium : ${brief}. Fond épuré, éclairage studio, ombres douces, qualité catalogue.${brand}`,
    mockup:   `Mockup professionnel réaliste : ${brief}. Présentation produit/app sur support réaliste, ombres et reflets crédibles.${brand}`,
    menu:     `Menu de restaurant élégant pour : ${brief}. Mise en page claire, appétissant, style africain moderne.${text}${brand}`,
    retouch:  `Variation créative et amélioration de : ${brief}. Garde l'esprit, améliore la qualité, rends plus professionnel.${brand}`,
  };
  return P[typeId] || P.photo;
}

// ─── ADAPTATEURS DE MOTEURS (chaque bloc = 1 moteur isolé) ───────────────────
async function runReplicate(model, prompt, ratio, dims) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN non configuré.");
  const input = { prompt, aspect_ratio: ratio || "1:1", output_format: "webp", output_quality: 95 };
  if (dims) { input.width = dims.width; input.height = dims.height; }
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait" },
    body: JSON.stringify({ input }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Replicate: ${data.error}`);
  const url = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!url) throw new Error("Aucune image générée.");
  return { url };
}
async function runOpenAI(prompt) {
  const key = process.env.OPENAI_KEY;
  if (!key) throw new Error("OPENAI_KEY non configuré.");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "hd" }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`OpenAI: ${data.error.message}`);
  return { url: data.data?.[0]?.url };
}
async function runStability(prompt) {
  const key = process.env.STABILITY_KEY;
  if (!key) throw new Error("STABILITY_KEY non configuré.");
  const f = new FormData(); f.append("prompt", prompt); f.append("output_format", "webp");
  const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, body: f,
  });
  const data = await res.json();
  if (data.errors) throw new Error(`Stability: ${data.errors.join(", ")}`);
  return { base64: data.image };
}
async function runGoogle(prompt) {
  const key = process.env.GEMINI_KEY;
  if (!key) throw new Error("GEMINI_KEY non configuré.");
  // Google Imagen via l'API Gemini (endpoint images)
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Google: ${data.error.message}`);
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Aucune image générée.");
  return { base64: b64 };
}

const RUNNERS = { replicate: runReplicate, openai: runOpenAI, stability: runStability, google: runGoogle };

/**
 * Génère un visuel professionnel.
 * Choisit le meilleur moteur selon le type, sauf si on en force un.
 *
 * @param {string} type      flyer | banner | social | logo | photo | mockup | ...
 * @param {string} brief     description de ce qu'on veut
 * @param {object} opts      { engine?, headline?, subtext?, brandColors? }
 */
export async function generateVisual({ type = "photo", brief, plan = "free", opts = {} }) {
  if (!brief) throw new Error("Décris le visuel à créer.");
  const t = VISUAL_TYPES[type] || VISUAL_TYPES.photo;
  // Moteur : automatique selon le type ET le plan.
  //   - texte (flyer/bannière) → toujours Ideogram (meilleur pour le texte)
  //   - sinon : gratuit = moteur standard, payant = meilleurs moteurs
  const engineId = opts.engine || engineForPlanAndType(plan, type);
  const engine = ENGINES[engineId] || ENGINES.flux;
  // Qualité : limitée par le plan (gratuit = 720p max, etc.)
  const quality = clampQuality(opts.quality, plan);
  const q = QUALITIES[quality] || QUALITIES["720"];
  const prompt = buildPrompt(type, brief, opts);
  const runner = RUNNERS[engine.via];
  if (!runner) throw new Error(`Moteur indisponible : ${engineId}`);

  const dims = dimsFor(t.ratio, quality);
  const out = engine.via === "replicate"
    ? await runner(engine.model, prompt, t.ratio, dims)
    : await runner(prompt, dims);

  const cost = Math.round(engine.cost * q.costMult);
  return { ...out, type, engine: engineId, engineLabel: engine.label, quality, qualityLabel: q.label, dims, cost, ratio: t.ratio };
}

// ─── ÉCONOMIE (quotas + packs) ───────────────────────────────────────────────
export const VISUAL_QUOTA_BY_PLAN = { free: 2, starter: 15, pro: 50, business: 150, visual: 100 };
export const VISUAL_PACKS = [
  { visuals: 10,  price: 1000 },
  { visuals: 30,  price: 2500, popular: true },
  { visuals: 100, price: 7000 },
];
