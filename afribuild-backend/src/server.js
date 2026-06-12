import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

import buildRoutes from "./routes/build.js";
import apkRoutes from "./routes/apk.js";
import infraRoutes from "./routes/infra.js";
import payRoutes from "./routes/pay.js";
import githubRoutes from "./routes/github.js";
import memoryRoutes from "./routes/memory.js";
import receiptRoutes from "./routes/receipts.js";
import imageRoutes from "./routes/images.js";
import studioRoutes from "./routes/studio.js";
import generateRoutes from "./routes/generate.js";

const app = express();

app.use(cors({ origin: config.frontendOrigin === "*" ? true : config.frontendOrigin.split(","), credentials: true }));
app.use(express.json({ limit: "5mb" }));

// Santé
app.get("/health", (_req, res) => res.json({ status: "ok", service: "afribuild-backend", env: config.env }));

// Émission d'un token de démo (en prod : remplacer par une vraie auth Supabase)
app.post("/api/auth/token", (req, res) => {
  const { userId, email } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId requis." });
  const token = jwt.sign({ userId, email }, config.jwtSecret, { expiresIn: "7d" });
  res.json({ token });
});

// Routes principales
app.use("/api/generate", generateRoutes);
app.use("/api/build", buildRoutes);
app.use("/api/apk", apkRoutes);
app.use("/api/infra", infraRoutes);
app.use("/api/pay", payRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/memory", memoryRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/studio", studioRoutes);

// 404
app.use((_req, res) => res.status(404).json({ error: "Route introuvable." }));

// Gestion d'erreurs
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Erreur serveur interne." });
});

app.listen(config.port, () => {
  console.log(`\n  AfriBuild Backend`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Port      : ${config.port}`);
  console.log(`  Env       : ${config.env}`);
  console.log(`  Frontend  : ${config.frontendOrigin}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Endpoints :`);
  console.log(`    POST /api/auth/token`);
  console.log(`    POST /api/generate`);
  console.log(`    POST /api/build        → APK / AAB / IPA`);
  console.log(`    GET  /api/build/:id    → statut build`);
  console.log(`    POST /api/apk/validate → vérifie le code RN`);
  console.log(`    POST /api/apk/preview  → QR Expo Go (test instantané)`);
  console.log(`    POST /api/apk/build    → pipeline APK complet (auto-fix)`);
  console.log(`    POST /api/infra/provision → Supabase DB`);
  console.log(`    POST /api/infra/deploy → Vercel`);
  console.log(`    POST /api/pay/init     → CinetPay/Flutterwave/Kkiapay`);
  console.log(`    POST /api/pay/verify`);
  console.log(`    POST /api/pay/webhook/:gateway`);
  console.log(`    POST /api/github/push  → versioning Git auto`);
  console.log(`    GET/POST /api/memory/:projectId → mémoire IA\n`);
  console.log(`    POST /api/receipts/issue  → reçu Mobile Money signé + email`);
  console.log(`    GET  /api/receipts/verify/:id → vérification publique (QR)\n`);
  console.log(`    POST /api/images/generate → vraie image (logo/photo réaliste)`);
  console.log(`    POST /api/images/analyze-logo → extrait couleurs d'un logo`);
  console.log(`    POST /api/studio/generate → flyers, bannières, posts, mockups (multi-IA)\n`);
});
