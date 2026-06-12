import { Router } from "express";
import { getGithubUser, pushApp, listCommits, getFileAtCommit } from "../services/github.js";
import { requireAuth, rateLimit } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/github/verify
 * Vérifie le token GitHub de l'utilisateur.
 * Body: { githubToken }
 */
router.post("/verify", requireAuth, async (req, res) => {
  try {
    res.json(await getGithubUser(req.body?.githubToken));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/github/push
 * Crée le dépôt si besoin et pousse l'app (commit automatique).
 * Body: { githubToken, appName, description, files, message, isPrivate }
 */
router.post("/push", requireAuth, rateLimit({ max: 20 }), async (req, res) => {
  const { githubToken, appName, description, files, message, isPrivate } = req.body || {};
  if (!githubToken || !appName || !files) return res.status(400).json({ error: "githubToken, appName et files requis." });
  try {
    res.json(await pushApp({ userToken: githubToken, appName, description, files, message, isPrivate }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/github/history
 * Liste les versions (commits) d'un dépôt.
 * Body: { githubToken, owner, repo }
 */
router.post("/history", requireAuth, async (req, res) => {
  const { githubToken, owner, repo } = req.body || {};
  try {
    res.json({ commits: await listCommits({ userToken: githubToken, owner, repo }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/github/rollback
 * Récupère le code d'une version antérieure.
 * Body: { githubToken, owner, repo, path, sha }
 */
router.post("/rollback", requireAuth, async (req, res) => {
  const { githubToken, owner, repo, path, sha } = req.body || {};
  try {
    res.json({ code: await getFileAtCommit({ userToken: githubToken, owner, repo, path, sha }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
