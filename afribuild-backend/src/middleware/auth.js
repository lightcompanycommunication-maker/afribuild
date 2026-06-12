import jwt from "jsonwebtoken";
import { config } from "../config.js";

/** Vérifie le JWT Bearer. Attache req.user. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Token manquant." });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré." });
  }
}

/** Limiteur simple en mémoire (par IP) pour éviter les abus de build. */
const buckets = new Map();
export function rateLimit({ windowMs = 60000, max = 20 } = {}) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const b = buckets.get(key) || { count: 0, reset: now + windowMs };
    if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
    b.count++;
    buckets.set(key, b);
    if (b.count > max) return res.status(429).json({ error: "Trop de requêtes. Réessaie dans une minute." });
    next();
  };
}
