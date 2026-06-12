import { config } from "../config.js";

/**
 * Génération de code via l'API Anthropic (Claude), côté serveur.
 * La clé reste secrète ici ; le front n'appelle jamais Anthropic directement.
 */

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

// Mapping de tous les anciens noms vers les modèles réellement disponibles
const MODEL_MAP = {
  "claude-sonnet-4-20250514":  "claude-sonnet-4-5-20250929",
  "claude-opus-4-20250514":    "claude-opus-4-5-20251101",
  "claude-haiku-4-5-20251001": "claude-haiku-4-5-20251001",
  "claude-opus-4-5":           "claude-opus-4-5-20251101",
  "claude-sonnet-4-5":         "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5":          "claude-haiku-4-5-20251001",
  "claude-3-5-sonnet-20241022":"claude-sonnet-4-5-20250929",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
  "claude-3-opus-20240229":    "claude-opus-4-5-20251101",
};

export async function generateApp({ prompt, systemPrompt, maxTokens = 7000, model }) {
  if (!config.anthropic.apiKey) throw new Error("ANTHROPIC_API_KEY non configurée.");

  const resolved = MODEL_MAP[model] || (model?.startsWith("claude-") ? model : DEFAULT_MODEL);
  const useModel = resolved;
  const isHaiku = useModel.includes("haiku");
  const safeMaxTokens = isHaiku ? Math.min(maxTokens, 4000) : maxTokens;

  console.log(`[AI] model=${useModel} maxTokens=${safeMaxTokens} (requested=${maxTokens})`);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.anthropic.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: useModel,
      max_tokens: safeMaxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic: ${await res.text()}`);

  const data = await res.json();

  if (data.stop_reason === "max_tokens") {
    throw new Error("L'application demandée est trop complexe pour être générée en une fois. Essaie une description plus courte ou plus ciblée (ex: 'une caisse simple' plutôt que 'un système POS complet avec admin').");
  }

  const raw = data.content?.map((b) => b.text || "").join("") || "";
  const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  const jsonStr = match ? match[0] : clean;
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`La réponse du modèle n'est pas du JSON valide. Réessaie avec une description plus courte. (détail: ${e.message})`);
  }
}
