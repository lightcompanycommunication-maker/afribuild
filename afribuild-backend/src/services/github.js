import { config } from "../config.js";

/**
 * ════════════════════════════════════════════════════════════════════════
 * GITHUB — Versioning intégré
 * ════════════════════════════════════════════════════════════════════════
 *
 * Permet à chaque utilisateur de pousser son app générée sur GitHub :
 *   - Création automatique du dépôt
 *   - Commit automatique à chaque génération / modification IA
 *   - Historique des versions (rollback possible via l'historique Git)
 *
 * Utilise l'API REST GitHub v3 avec un token utilisateur (OAuth ou PAT).
 * Le token GitHub est fourni PAR L'UTILISATEUR (jamais le tien) :
 *   - soit via OAuth GitHub (recommandé en prod)
 *   - soit un Personal Access Token collé dans les réglages
 */

const GH = "https://api.github.com";

function headers(userToken) {
  return {
    Authorization: `Bearer ${userToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

/** Récupère le login GitHub à partir du token (vérifie qu'il est valide). */
export async function getGithubUser(userToken) {
  const res = await fetch(`${GH}/user`, { headers: headers(userToken) });
  if (!res.ok) throw new Error("Token GitHub invalide.");
  const u = await res.json();
  return { login: u.login, name: u.name, avatar: u.avatar_url };
}

/** Crée un dépôt (ou le réutilise s'il existe déjà). */
export async function ensureRepo({ userToken, name, description, isPrivate = true }) {
  const safe = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 90) || "afribuild-app";
  // Tente de créer ; si 422 (existe déjà), on le récupère
  const res = await fetch(`${GH}/user/repos`, {
    method: "POST",
    headers: headers(userToken),
    body: JSON.stringify({ name: safe, description: description || "Généré avec AfriBuild AI", private: isPrivate, auto_init: true }),
  });
  if (res.ok) {
    const r = await res.json();
    return { fullName: r.full_name, owner: r.owner.login, repo: r.name, url: r.html_url, defaultBranch: r.default_branch || "main" };
  }
  if (res.status === 422) {
    const me = await getGithubUser(userToken);
    const r = await (await fetch(`${GH}/repos/${me.login}/${safe}`, { headers: headers(userToken) })).json();
    return { fullName: r.full_name, owner: r.owner.login, repo: r.name, url: r.html_url, defaultBranch: r.default_branch || "main" };
  }
  throw new Error(`GitHub: création du dépôt échouée — ${await res.text()}`);
}

/**
 * Pousse (crée ou met à jour) un fichier dans le dépôt avec un message de commit.
 * GitHub gère automatiquement l'historique des versions.
 */
export async function pushFile({ userToken, owner, repo, path, content, message, branch = "main" }) {
  // Récupère le SHA existant si le fichier existe déjà (pour le mettre à jour)
  let sha;
  const existing = await fetch(`${GH}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, { headers: headers(userToken) });
  if (existing.ok) sha = (await existing.json()).sha;

  const res = await fetch(`${GH}/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: headers(userToken),
    body: JSON.stringify({
      message: message || "Mise à jour via AfriBuild AI",
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub: push échoué — ${await res.text()}`);
  const data = await res.json();
  return { commitSha: data.commit?.sha, url: data.content?.html_url };
}

/**
 * Pousse une app complète (un ou plusieurs fichiers) en un commit logique.
 * files = { "App.jsx": "...", "README.md": "...", "schema.sql": "..." }
 */
export async function pushApp({ userToken, appName, description, files, message, isPrivate = true }) {
  const me = await getGithubUser(userToken);
  const repo = await ensureRepo({ userToken, name: appName, description, isPrivate });
  const results = [];
  for (const [path, content] of Object.entries(files)) {
    if (!content) continue;
    const r = await pushFile({ userToken, owner: repo.owner, repo: repo.repo, path, content, message, branch: repo.defaultBranch });
    results.push({ path, commitSha: r.commitSha });
  }
  return { repoUrl: repo.url, owner: repo.owner, repo: repo.repo, login: me.login, commits: results };
}

/** Liste l'historique des commits (pour le rollback). */
export async function listCommits({ userToken, owner, repo, limit = 20 }) {
  const res = await fetch(`${GH}/repos/${owner}/${repo}/commits?per_page=${limit}`, { headers: headers(userToken) });
  if (!res.ok) throw new Error(`GitHub: lecture historique échouée — ${await res.text()}`);
  const commits = await res.json();
  return commits.map((c) => ({ sha: c.sha, message: c.commit.message, date: c.commit.author.date, author: c.commit.author.name }));
}

/** Récupère le contenu d'un fichier à un commit donné (rollback). */
export async function getFileAtCommit({ userToken, owner, repo, path, sha }) {
  const res = await fetch(`${GH}/repos/${owner}/${repo}/contents/${path}?ref=${sha}`, { headers: headers(userToken) });
  if (!res.ok) throw new Error("GitHub: fichier introuvable à ce commit.");
  const data = await res.json();
  return Buffer.from(data.content, "base64").toString("utf8");
}
