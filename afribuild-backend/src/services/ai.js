import { config } from "../config.js";

/**
 * Génération de code via l'API Anthropic, côté serveur.
 * La clé reste secrète ici ; le front n'appelle jamais Anthropic directement en prod.
 */

const MODEL = "claude-sonnet-4-20250514";

export async function generateApp({ prompt, systemPrompt, maxTokens = 7000, model }) {
  if (!config.anthropic.apiKey) throw new Error("ANTHROPIC_API_KEY non configurée.");
  const useModel = (typeof model === "string" && model.startsWith("claude-")) ? model : MODEL;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.anthropic.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: useModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic: ${await res.text()}`);
  const data = await res.json();
  const raw = data.content?.map((b) => b.text || "").join("") || "";
  const clean = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : clean);
}
