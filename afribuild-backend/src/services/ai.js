import { config } from "../config.js";

/**
 * Génération de code via l'API OpenAI (GPT-4o), côté serveur.
 * La clé reste secrète ici ; le front n'appelle jamais OpenAI directement.
 */

const DEFAULT_MODEL = "gpt-4o";

export async function generateApp({ prompt, systemPrompt, maxTokens = 7000, model }) {
  if (!config.openai.apiKey) throw new Error("OPENAI_KEY non configurée.");

  const useModel = (typeof model === "string" && model.startsWith("gpt-")) ? model : DEFAULT_MODEL;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: useModel,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI: ${await res.text()}`);

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const clean = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : clean);
}
