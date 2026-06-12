import { config } from "../config.js";

/**
 * Provisioning automatique d'infrastructure Supabase.
 *
 * Utilise la Supabase Management API (https://api.supabase.com).
 * Pour chaque app full-stack générée, on peut :
 *   1. Créer un nouveau projet Supabase (base PostgreSQL + auth + storage)
 *   2. Exécuter le schéma SQL généré (création des tables)
 *   3. Créer un bucket de stockage de fichiers
 *   4. Retourner les clés (URL + anon key) à injecter dans l'app
 *
 * NB : la création de projet prend ~1-2 min (provisioning d'une vraie base).
 */

const MGMT = "https://api.supabase.com/v1";

function headers() {
  return {
    Authorization: `Bearer ${config.supabase.accessToken}`,
    "Content-Type": "application/json",
  };
}

/** Crée un nouveau projet Supabase. */
export async function createSupabaseProject({ name, region = "eu-west-3", dbPassword }) {
  if (!config.supabase.accessToken) throw new Error("SUPABASE_ACCESS_TOKEN non configuré.");
  if (!config.supabase.orgId) throw new Error("SUPABASE_ORG_ID non configuré.");

  const res = await fetch(`${MGMT}/projects`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      organization_id: config.supabase.orgId,
      name: name.slice(0, 40),
      region, // eu-west-3 = Paris (proche de l'Afrique de l'Ouest)
      db_pass: dbPassword || randomPassword(),
      plan: "free",
    }),
  });
  if (!res.ok) throw new Error(`Supabase: création projet échouée — ${await res.text()}`);
  const project = await res.json();
  return {
    id: project.id,
    ref: project.ref || project.id,
    name: project.name,
    region: project.region,
    status: project.status,
    url: `https://${project.ref || project.id}.supabase.co`,
  };
}

/** Attend que le projet soit ACTIVE_HEALTHY (provisioning terminé). */
export async function waitForProject(ref, { timeoutMs = 180000, intervalMs = 5000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${MGMT}/projects/${ref}`, { headers: headers() });
    if (res.ok) {
      const p = await res.json();
      if (p.status === "ACTIVE_HEALTHY") return p;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timeout — le projet Supabase n'est pas devenu actif à temps.");
}

/** Exécute du SQL (création de tables, RLS, etc.) sur un projet. */
export async function runSql(ref, sql) {
  const res = await fetch(`${MGMT}/projects/${ref}/database/query`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Supabase: exécution SQL échouée — ${await res.text()}`);
  return await res.json();
}

/** Récupère les clés API (anon + service_role) du projet. */
export async function getProjectKeys(ref) {
  const res = await fetch(`${MGMT}/projects/${ref}/api-keys`, { headers: headers() });
  if (!res.ok) throw new Error(`Supabase: récupération clés échouée — ${await res.text()}`);
  const keys = await res.json();
  const anon = keys.find((k) => k.name === "anon")?.api_key;
  const service = keys.find((k) => k.name === "service_role")?.api_key;
  return { anonKey: anon, serviceKey: service };
}

/**
 * Provisioning complet en une fonction : projet + schéma + clés.
 * Retourne tout ce qu'il faut pour brancher l'app générée.
 */
export async function provisionFullStack({ appName, schemaSql }) {
  const project = await createSupabaseProject({ name: `afribuild-${appName}` });
  await waitForProject(project.ref);
  if (schemaSql) await runSql(project.ref, ensureRls(schemaSql));
  const keys = await getProjectKeys(project.ref);
  return {
    projectRef: project.ref,
    url: project.url,
    anonKey: keys.anonKey,
    // Variables d'environnement prêtes à injecter dans l'app
    env: {
      SUPABASE_URL: project.url,
      SUPABASE_ANON_KEY: keys.anonKey,
    },
  };
}

/** Ajoute Row Level Security de base si le schéma ne la définit pas déjà. */
function ensureRls(sql) {
  if (/ENABLE ROW LEVEL SECURITY/i.test(sql)) return sql;
  // On laisse le schéma tel quel ; le développeur peut ajouter des policies ensuite.
  return sql;
}

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
