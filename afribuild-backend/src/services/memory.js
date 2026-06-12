import { config } from "../config.js";

/**
 * ════════════════════════════════════════════════════════════════════════
 * MÉMOIRE DE PROJET — l'IA se souvient
 * ════════════════════════════════════════════════════════════════════════
 *
 * Stocke, pour chaque projet, le contexte que l'IA doit retenir :
 *   - le prompt initial
 *   - les choix techniques (stack, design, secteur, pays)
 *   - l'historique des modifications demandées
 *   - les décisions importantes
 *
 * Quand l'utilisateur dit "ajoute un dashboard comme celui d'hier",
 * on injecte cette mémoire dans le prompt → l'IA comprend immédiatement.
 *
 * Stockage : table Supabase `project_memory` (clé = projectId).
 * Si Supabase n'est pas configuré, le front gère la mémoire en localStorage.
 */

function sbHeaders() {
  return {
    apikey: config.supabase.serviceKey,
    Authorization: `Bearer ${config.supabase.serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

/** Récupère la mémoire d'un projet. */
export async function getMemory(projectId, userId) {
  if (!config.supabase.url || !config.supabase.serviceKey) return null;
  const res = await fetch(`${config.supabase.url}/rest/v1/project_memory?project_id=eq.${projectId}&user_id=eq.${userId}`, {
    headers: sbHeaders(),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

/** Crée ou met à jour la mémoire d'un projet. */
export async function saveMemory({ projectId, userId, summary, decisions, history }) {
  if (!config.supabase.url || !config.supabase.serviceKey) return null;
  const existing = await getMemory(projectId, userId);
  const payload = {
    project_id: projectId,
    user_id: userId,
    summary: summary || existing?.summary || "",
    decisions: decisions || existing?.decisions || [],
    history: history || existing?.history || [],
    updated_at: new Date().toISOString(),
  };
  const method = existing ? "PATCH" : "POST";
  const url = existing
    ? `${config.supabase.url}/rest/v1/project_memory?project_id=eq.${projectId}&user_id=eq.${userId}`
    : `${config.supabase.url}/rest/v1/project_memory`;
  const res = await fetch(url, { method, headers: sbHeaders(), body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Mémoire: sauvegarde échouée — ${await res.text()}`);
  return (await res.json())[0];
}

/**
 * Construit un bloc de contexte mémoire à injecter dans le prompt IA.
 * Transforme la mémoire stockée en instructions claires pour Claude.
 */
export function buildMemoryContext(memory) {
  if (!memory) return "";
  const parts = [];
  if (memory.summary) parts.push(`Résumé du projet : ${memory.summary}`);
  if (memory.decisions?.length) parts.push(`Choix techniques déjà actés : ${memory.decisions.join(" ; ")}`);
  if (memory.history?.length) {
    const recent = memory.history.slice(-5).map((h, i) => `${i + 1}. ${h}`).join("\n");
    parts.push(`Modifications précédentes :\n${recent}`);
  }
  if (!parts.length) return "";
  return `\n\nMÉMOIRE DU PROJET (respecte la cohérence avec l'existant) :\n${parts.join("\n")}`;
}

/**
 * Génère/actualise un résumé du projet via Claude (mémoire intelligente).
 * Appelé après chaque génération pour garder la mémoire à jour.
 */
export async function summarizeProject({ prevSummary, lastAction, appTitle }) {
  if (!config.anthropic.apiKey) return prevSummary || "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": config.anthropic.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Résumé actuel du projet "${appTitle}" : "${prevSummary || "aucun"}".\nDernière action : "${lastAction}".\nDonne un nouveau résumé court (2-3 phrases) qui capture l'état du projet et les choix clés. Réponds uniquement avec le résumé.`,
        }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || prevSummary || "";
  } catch {
    return prevSummary || "";
  }
}
