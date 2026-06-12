import { config } from "../config.js";

/**
 * ════════════════════════════════════════════════════════════════════════
 * AFRISTUDIO — Studio graphique IA (Gemini 2.0 Flash comme moteur principal)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Moteur principal : Google Gemini 2.0 Flash Image Generation
 * Moteurs de secours (si clé disponible) : OpenAI DALL-E 3, Replicate, Stability
 */

// ─── REGISTRE DES MOTEURS ────────────────────────────────────────────────────
const ENGINES = {
  gemini:     { label: "Gemini 2.0 Flash",      model: "gemini-2.0-flash-preview-image-generation", via: "gemini",    cost: 20, skill: "universel" },
  geminiImg:  { label: "Gemini Imagen 3",        model: "imagen-3.0-generate-002",                   via: "imagen",    cost: 35, skill: "photo-premium" },
  openai:     { label: "GPT Image (DALL·E 3)",   model: "dall-e-3",                                  via: "openai",    cost: 45, skill: "creatif" },
  flux:       { label: "Flux Schnell",            model: "black-forest-labs/flux-schnell",            via: "replicate", cost: 20, skill: "photo-rapide" },
  fluxPro:    { label: "Flux 1.1 Pro",            model: "black-forest-labs/flux-1.1-pro",            via: "replicate", cost: 55, skill: "photo-premium" },
  ideogram:   { label: "Ideogram v2",             model: "ideogram-ai/ideogram-v2",                   via: "replicate", cost: 50, skill: "texte" },
  ideogram3:  { label: "Ideogram V3",             model: "ideogram-ai/ideogram-v3-turbo",             via: "replicate", cost: 60, skill: "texte-premium" },
  recraft:    { label: "Recraft V3",              model: "recraft-ai/recraft-v3",                     via: "replicate", cost: 40, skill: "logo-vectoriel" },
  stability:  { label: "Stability SD3.5",         model: "sd3.5-large",                               via: "stability", cost: 12, skill: "eco" },
};

// ─── TYPES DE VISUELS — tous routés vers Gemini par défaut ──────────────────
const VISUAL_TYPES = {
  flyer:   { label: "Flyer / Affiche pub",      needsText: true,  best: "gemini", ratio: "3:4"  },
  banner:  { label: "Bannière",                 needsText: true,  best: "gemini", ratio: "16:9" },
  social:  { label: "Post réseaux sociaux",     needsText: true,  best: "gemini", ratio: "1:1"  },
  story:   { label: "Story (vertical)",         needsText: true,  best: "gemini", ratio: "9:16" },
  logo:    { label: "Logo",                     needsText: false, best: "gemini", ratio: "1:1"  },
  card:    { label: "Carte de visite",          needsText: true,  best: "gemini", ratio: "16:9" },
  poster:  { label: "Affiche événement",        needsText: true,  best: "gemini", ratio: "3:4"  },
  photo:   { label: "Photo réaliste",           needsText: false, best: "gemini", ratio: "1:1"  },
  product: { label: "Photo produit",            needsText: false, best: "gemini", ratio: "1:1"  },
  mockup:  { label: "Mockup (app/produit)",     needsText: false, best: "gemini", ratio: "4:3"  },
  menu:    { label: "Menu restaurant",          needsText: true,  best: "gemini", ratio: "3:4"  },
  retouch: { label: "Retouche / variation",     needsText: false, best: "gemini", ratio: "1:1"  },
};

export function listVisualTypes() {
  return Object.entries(VISUAL_TYPES).map(([id, v]) => ({ id, label: v.label, needsText: v.needsText, ratio: v.ratio }));
}
export function listEngines() {
  return Object.entries(ENGINES).map(([id, e]) => ({ id, label: e.label, cost: e.cost }));
}

// ─── QUALITÉS ────────────────────────────────────────────────────────────────
const QUALITIES = {
  "720":  { label: "HD 720p",       longEdge: 1280, costMult: 1   },
  "1080": { label: "Full HD 1080p", longEdge: 1920, costMult: 1.3 },
  "4k":   { label: "4K Ultra",      longEdge: 3840, costMult: 2   },
  "8k":   { label: "8K Pro",        longEdge: 7680, costMult: 3   },
};
const MAX_QUALITY_BY_PLAN = {
  free:     "720",
  starter:  "1080",
  visual:   "8k",
  pro:      "4k",
  business: "8k",
};
const QUALITY_ORDER = ["720", "1080", "4k", "8k"];

function clampQuality(requested, plan) {
  const max = MAX_QUALITY_BY_PLAN[plan] || "720";
  const reqIdx = QUALITY_ORDER.indexOf(requested || "1080");
  const maxIdx = QUALITY_ORDER.indexOf(max);
  if (reqIdx < 0) return max;
  return reqIdx <= maxIdx ? requested : max;
}

export function qualitiesForPlan(plan) {
  const maxIdx = QUALITY_ORDER.indexOf(MAX_QUALITY_BY_PLAN[plan] || "720");
  return QUALITY_ORDER.slice(0, maxIdx + 1).map((id) => ({ id, label: QUALITIES[id].label }));
}

export function listQualities() {
  return Object.entries(QUALITIES).map(([id, q]) => ({ id, label: q.label, costMult: q.costMult }));
}

function dimsFor(ratio, quality) {
  const q = QUALITIES[quality] || QUALITIES["720"];
  const [rw, rh] = (ratio || "1:1").split(":").map(Number);
  const long = q.longEdge;
  if (rw >= rh) return { width: long, height: Math.round(long * rh / rw) };
  return { width: Math.round(long * rw / rh), height: long };
}

// ─── PROMPTS PROFESSIONNELS ──────────────────────────────────────────────────
function buildPrompt(typeId, brief, opts = {}) {
  const brand = opts.brandColors ? ` Palette de marque : ${opts.brandColors.join(", ")}.` : "";
  const text  = opts.headline   ? ` Texte principal bien lisible : "${opts.headline}".` : "";
  const sub   = opts.subtext    ? ` Sous-texte : "${opts.subtext}".` : "";
  const P = {
    flyer:   `Flyer publicitaire professionnel pour : ${brief}. Composition équilibrée, hiérarchie visuelle claire, qualité agence, style commercial africain moderne.${text}${sub}${brand}`,
    banner:  `Bannière marketing horizontale pour : ${brief}. Design percutant, espace pour logo, qualité publicitaire.${text}${brand}`,
    social:  `Post réseaux sociaux carré (Instagram/Facebook) pour : ${brief}. Accrocheur, couleurs vives, style viral africain.${text}${brand}`,
    story:   `Story verticale (format 9:16) pour : ${brief}. Plein écran, dynamique, moderne.${text}${brand}`,
    logo:    `Logo professionnel épuré et mémorable pour : ${brief}. Vectoriel, fond uni, identité de marque africaine élégante.${brand}`,
    card:    `Carte de visite professionnelle pour : ${brief}. Mise en page soignée, élégante.${text}${brand}`,
    poster:  `Affiche d'événement professionnelle pour : ${brief}. Composition forte, accrocheuse, qualité agence.${text}${sub}${brand}`,
    photo:   `Photo hyper réaliste : ${brief}. Éclairage studio professionnel, ultra détaillée, 8k, photoréalisme.${brand}`,
    product: `Photo produit e-commerce premium : ${brief}. Fond épuré, éclairage studio, ombres douces, qualité catalogue.${brand}`,
    mockup:  `Mockup professionnel réaliste : ${brief}. Présentation produit/app sur support réaliste, ombres et reflets crédibles.${brand}`,
    menu:    `Menu de restaurant élégant pour : ${brief}. Mise en page claire, appétissant, style africain moderne.${text}${brand}`,
    retouch: `Variation créative et amélioration de : ${brief}. Garde l'esprit, améliore la qualité, rends plus professionnel.${brand}`,
  };
  return P[typeId] || P.photo;
}

// ─── ADAPTATEUR GEMINI 2.0 FLASH (moteur principal) ─────────────────────────
async function runGemini(prompt) {
  const key = config.gemini?.apiKey || process.env.GEMINI_KEY;
  if (!key) throw new Error("GEMINI_KEY non configuré.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    }
  );

  const data = await res.json();
  if (data.error) throw new Error(`Gemini: ${data.error.message}`);

  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData?.data);
  if (!imgPart) throw new Error("Gemini : aucune image générée.");

  return { base64: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType || "image/png" };
}

// ─── ADAPTATEUR IMAGEN 3 (via Google) ────────────────────────────────────────
async function runImagen(prompt) {
  const key = config.gemini?.apiKey || process.env.GEMINI_KEY;
  if (!key) throw new Error("GEMINI_KEY non configuré.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(`Imagen: ${data.error.message}`);
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Imagen : aucune image générée.");
  return { base64: b64, mimeType: "image/png" };
}

// ─── ADAPTATEUR OPENAI DALL-E 3 (fallback) ───────────────────────────────────
async function runOpenAI(prompt) {
  const key = config.openai?.apiKey || process.env.OPENAI_KEY;
  if (!key) throw new Error("OPENAI_KEY non configuré.");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "hd" }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`OpenAI: ${data.error.message}`);
  return { url: data.data?.[0]?.url };
}

// ─── ADAPTATEUR REPLICATE ────────────────────────────────────────────────────
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

// ─── ADAPTATEUR STABILITY ────────────────────────────────────────────────────
async function runStability(prompt) {
  const key = process.env.STABILITY_KEY;
  if (!key) throw new Error("STABILITY_KEY non configuré.");
  const f = new FormData();
  f.append("prompt", prompt);
  f.append("output_format", "webp");
  const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    body: f,
  });
  const data = await res.json();
  if (data.errors) throw new Error(`Stability: ${data.errors.join(", ")}`);
  return { base64: data.image, mimeType: "image/webp" };
}

// ─── DISPATCH ────────────────────────────────────────────────────────────────
async function dispatch(engineId, engine, prompt, ratio, dims) {
  switch (engine.via) {
    case "gemini":    return runGemini(prompt);
    case "imagen":    return runImagen(prompt);
    case "openai":    return runOpenAI(prompt);
    case "replicate": return runReplicate(engine.model, prompt, ratio, dims);
    case "stability": return runStability(prompt);
    default: throw new Error(`Moteur inconnu : ${engineId}`);
  }
}

// ─── GÉNÉRATION PRINCIPALE ───────────────────────────────────────────────────
export async function generateVisual({ type = "photo", brief, plan = "free", opts = {} }) {
  if (!brief) throw new Error("Décris le visuel à créer.");

  const t = VISUAL_TYPES[type] || VISUAL_TYPES.photo;

  // Moteur : Gemini par défaut (sauf si forcé manuellement)
  const engineId = opts.engine || t.best || "gemini";
  const engine   = ENGINES[engineId] || ENGINES.gemini;

  const quality = clampQuality(opts.quality, plan);
  const q       = QUALITIES[quality] || QUALITIES["720"];
  const prompt  = buildPrompt(type, brief, opts);
  const dims    = dimsFor(t.ratio, quality);

  let out;
  try {
    out = await dispatch(engineId, engine, prompt, t.ratio, dims);
  } catch (err) {
    // Fallback automatique vers OpenAI si Gemini échoue
    if (engineId !== "openai" && (config.openai?.apiKey || process.env.OPENAI_KEY)) {
      console.warn(`⚠️  ${engineId} a échoué (${err.message}), bascule sur OpenAI.`);
      out = await runOpenAI(prompt);
    } else {
      throw err;
    }
  }

  const cost = Math.round(engine.cost * q.costMult);
  return {
    ...out,
    type,
    engine:       engineId,
    engineLabel:  engine.label,
    quality,
    qualityLabel: q.label,
    dims,
    cost,
    ratio:        t.ratio,
  };
}

// ─── ÉCONOMIE ────────────────────────────────────────────────────────────────
export const VISUAL_QUOTA_BY_PLAN = { free: 2, starter: 15, pro: 50, business: 150, visual: 100 };
export const VISUAL_PACKS = [
  { visuals: 10,  price: 1000 },
  { visuals: 30,  price: 2500, popular: true },
  { visuals: 100, price: 7000 },
];
