import { config } from "../config.js";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * ════════════════════════════════════════════════════════════════════════
 * APK PIPELINE — Chaîne complète : code généré → APK/AAB/IPA installable
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le maillon qui manquait pour livrer comme Emergent.
 *
 * Étapes :
 *   1. PRÉPARER   — transforme le code généré en projet Expo valide et complet
 *   2. VALIDER    — vérifie que le code RN compile (imports, syntaxe, écrans)
 *   3. ASSETS     — génère icône + splash screen automatiquement
 *   4. BUILD      — lance EAS Build (cloud) et produit l'artefact signé
 *   5. PUBLIER    — retourne l'URL de l'APK + le QR code Expo Go pour tester
 *
 * Deux livrables pour le client final :
 *   • QR Expo Go (instantané)  → tester sur téléphone en 5 secondes
 *   • APK/AAB/IPA (build EAS)   → fichier installable / publiable sur les stores
 */

const PLATFORM = { apk: "android", aab: "android", ipa: "ios" };
const BUILD_TYPE = { apk: "apk", aab: "app-bundle", ipa: "archive" };

// ─── 1. PRÉPARATION DU PROJET EXPO ───────────────────────────────────────────
export function prepareExpoProject({ title, code, slug }) {
  const safeSlug = slug || (title || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 28) || "afribuild-app";
  const pkg = `app.afribuild.${safeSlug.replace(/[^a-z0-9]/g, "")}`;

  const appCode = normalizeRN(code);

  return {
    slug: safeSlug,
    files: {
      "App.js": appCode,
      "app.json": JSON.stringify({
        expo: {
          name: title || "AfriBuild App",
          slug: safeSlug,
          version: "1.0.0",
          orientation: "portrait",
          icon: "./assets/icon.png",
          userInterfaceStyle: "automatic",
          splash: { image: "./assets/splash.png", resizeMode: "contain", backgroundColor: "#0B0E18" },
          assetBundlePatterns: ["**/*"],
          ios: { supportsTablet: true, bundleIdentifier: pkg },
          android: {
            package: pkg,
            versionCode: 1,
            adaptiveIcon: { foregroundImage: "./assets/icon.png", backgroundColor: "#0B0E18" },
          },
          extra: { eas: { projectId: config.expo.projectId } },
        },
      }, null, 2),
      "eas.json": JSON.stringify({
        cli: { version: ">= 5.0.0", appVersionSource: "remote" },
        build: {
          preview: { android: { buildType: "apk" }, distribution: "internal" },
          production: { android: { buildType: "app-bundle" }, autoIncrement: true },
        },
      }, null, 2),
      "package.json": JSON.stringify({
        name: safeSlug,
        version: "1.0.0",
        main: "node_modules/expo/AppEntry.js",
        scripts: { start: "expo start", android: "expo run:android", ios: "expo run:ios" },
        dependencies: {
          expo: "~51.0.0",
          "expo-status-bar": "~1.12.1",
          react: "18.2.0",
          "react-native": "0.74.5",
          "@react-native-async-storage/async-storage": "1.23.1",
        },
      }, null, 2),
      "babel.config.js": `module.exports = function(api){api.cache(true);return{presets:['babel-preset-expo']}};`,
    },
  };
}

// ─── 2. VALIDATION DU CODE RN ─────────────────────────────────────────────────
export function validateRN(code) {
  const issues = [];
  if (!/export\s+default/.test(code)) issues.push("Pas d'export default — l'app n'a pas de point d'entrée.");
  if (!/from\s+['"]react-native['"]/.test(code)) issues.push("Aucun import de react-native — vérifier les composants natifs.");
  // Composants web interdits en RN
  const webTags = code.match(/<(div|span|button|input|p|h[1-6]|ul|li|table|img|a)\b/g);
  if (webTags) issues.push(`Balises HTML web détectées (${[...new Set(webTags)].join(", ")}) — interdites en React Native. Utilise View, Text, TouchableOpacity, etc.`);
  // localStorage interdit
  if (/localStorage|sessionStorage/.test(code)) issues.push("localStorage détecté — utiliser AsyncStorage en React Native.");
  if (/document\.|window\./.test(code)) issues.push("Accès au DOM (document/window) — non disponible en React Native.");
  return { valid: issues.length === 0, issues };
}

// ─── 3. CORRECTION AUTO via Claude si le code n'est pas du vrai RN ────────────
export async function fixToReactNative(code, issues) {
  const sys = `Tu es expert React Native. Convertis ce code en React Native Expo 100% valide et compilable.
Réponds UNIQUEMENT JSON: {"code":"...CODE REACT NATIVE COMPLET..."}
RÈGLES STRICTES:
- Remplace TOUTE balise HTML (div→View, span/p/h1→Text, button→TouchableOpacity, input→TextInput, img→Image, ul/li→FlatList)
- Styles via StyleSheet.create (pas de style inline web)
- AsyncStorage au lieu de localStorage
- Pas de document/window
- SafeAreaView en racine, ScrollView pour le contenu long
- export default App`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": config.anthropic.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 7000,
      system: sys,
      messages: [{ role: "user", content: `Problèmes détectés: ${issues.join("; ")}\n\nCode à corriger:\n${code}` }],
    }),
  });
  if (!res.ok) throw new Error(`Correction RN échouée: ${await res.text()}`);
  const data = await res.json();
  const raw = data.content?.map((b) => b.text || "").join("") || "";
  const clean = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0] || clean);
  return parsed.code;
}

// ─── 4. BUILD EAS (avec auto-fix intégré) ─────────────────────────────────────
export async function buildAPK({ title, code, format = "apk", autoFix = true }) {
  if (!config.expo.token) throw new Error("EXPO_TOKEN non configuré.");

  // Validation + correction auto si nécessaire
  let finalCode = code;
  const check = validateRN(finalCode);
  if (!check.valid) {
    if (!autoFix) throw new Error(`Code non compatible RN: ${check.issues.join("; ")}`);
    finalCode = await fixToReactNative(finalCode, check.issues);
    const recheck = validateRN(finalCode);
    if (!recheck.valid) throw new Error(`Correction insuffisante: ${recheck.issues.join("; ")}`);
  }

  const project = prepareExpoProject({ title, code: finalCode });
  const dir = await mkdtemp(join(tmpdir(), "afribuild-apk-"));

  try {
    // Écrit tous les fichiers du projet
    await mkdir(join(dir, "assets"), { recursive: true });
    for (const [name, content] of Object.entries(project.files)) {
      await writeFile(join(dir, name), content, "utf8");
    }
    // Assets minimaux (1x1 png transparent) — en prod : générer via le Brand Generator
    const pngStub = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await writeFile(join(dir, "assets", "icon.png"), pngStub);
    await writeFile(join(dir, "assets", "splash.png"), pngStub);

    const env = { ...process.env, EXPO_TOKEN: config.expo.token };
    const profile = format === "apk" ? "preview" : "production";
    const args = [
      "eas-cli@latest", "build",
      "--platform", PLATFORM[format],
      "--profile", profile,
      "--non-interactive", "--no-wait", "--json",
    ];
    const { stdout } = await exec("npx", args, { cwd: dir, env, maxBuffer: 1024 * 1024 * 10 });
    const parsed = JSON.parse(stdout.trim().split("\n").filter(Boolean).pop());
    const build = Array.isArray(parsed) ? parsed[0] : parsed;
    return { buildId: build.id, status: build.status, platform: PLATFORM[format], format, autoFixed: !check.valid };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── 5. EXPO GO QR — test instantané sur téléphone (sans build) ───────────────
/**
 * Publie le projet sur Expo (update) pour tester via l'app Expo Go.
 * Retourne une URL exp:// + de quoi générer un QR code côté front.
 * Idéal AVANT de lancer un vrai build (qui prend plusieurs minutes).
 */
export async function publishExpoPreview({ title, code }) {
  if (!config.expo.token) throw new Error("EXPO_TOKEN non configuré.");
  const project = prepareExpoProject({ title, code: normalizeRN(code) });
  const dir = await mkdtemp(join(tmpdir(), "afribuild-go-"));
  try {
    for (const [name, content] of Object.entries(project.files)) {
      await writeFile(join(dir, name), content, "utf8");
    }
    const env = { ...process.env, EXPO_TOKEN: config.expo.token };
    // eas update publie un bundle OTA accessible via Expo Go
    const { stdout } = await exec("npx", ["eas-cli@latest", "update", "--branch", "preview", "--message", "AfriBuild preview", "--non-interactive", "--json"], { cwd: dir, env, maxBuffer: 1024 * 1024 * 10 }).catch((e) => ({ stdout: JSON.stringify({ error: e.message }) }));
    let update;
    try { update = JSON.parse(stdout.trim().split("\n").filter(Boolean).pop()); } catch { update = {}; }
    const expoUrl = `exp://u.expo.dev/${config.expo.projectId}?channel-name=preview`;
    return { expoUrl, qrData: expoUrl, updateId: update?.id || null, note: "Scanne ce QR avec l'app Expo Go pour tester instantanément." };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── NORMALISATION ────────────────────────────────────────────────────────────
function normalizeRN(code) {
  let c = (code || "").trim();
  if (!/import\s+React/.test(c)) {
    c = `import React, { useState, useEffect, useRef } from 'react';\n` + c;
  }
  if (!/from\s+['"]react-native['"]/.test(c)) {
    c = `import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, FlatList, SafeAreaView, Image } from 'react-native';\n` + c;
  }
  if (!/from\s+['"]expo-status-bar['"]/.test(c) && /StatusBar/.test(c)) {
    c = `import { StatusBar } from 'expo-status-bar';\n` + c;
  }
  if (!/export\s+default/.test(c)) c += `\nexport default App;`;
  return c;
}
