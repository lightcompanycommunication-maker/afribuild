import { config } from "../config.js";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Service de build natif via Expo EAS.
 *
 * Deux modes :
 *  1. EAS Cloud (recommandé) — délègue la compilation aux serveurs Expo.
 *     Pas besoin d'Android SDK / Xcode sur ta machine.
 *  2. Si tu veux compiler localement, il faut Android SDK + Java (voir README).
 *
 * Flux EAS Cloud :
 *   - On écrit un projet Expo minimal dans un dossier temporaire
 *   - app.json + eas.json + package.json + App.js (le code généré)
 *   - On lance `eas build --platform android --profile production --non-interactive --json`
 *   - EAS renvoie un build ID ; on poll le statut jusqu'à obtenir l'URL de l'artefact (.apk/.aab/.ipa)
 */

const PROFILES = {
  apk: { platform: "android", buildType: "apk" },
  aab: { platform: "android", buildType: "app-bundle" },
  ipa: { platform: "ios", buildType: "archive" },
};

function appJson(name, slug) {
  return {
    expo: {
      name,
      slug,
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "light",
      splash: { image: "./assets/splash.png", resizeMode: "contain", backgroundColor: "#0B0E18" },
      assetBundlePatterns: ["**/*"],
      ios: { supportsTablet: true, bundleIdentifier: `app.afribuild.${slug.replace(/[^a-z0-9]/g, "")}` },
      android: { package: `app.afribuild.${slug.replace(/[^a-z0-9]/g, "")}`, versionCode: 1 },
      extra: { eas: { projectId: config.expo.projectId } },
    },
  };
}

function easJson(buildType, platform) {
  // Profil "production" qui produit un artefact installable et signé par EAS (managed credentials)
  const androidCfg = platform === "android" ? { buildType } : undefined;
  return {
    cli: { version: ">= 5.0.0", appVersionSource: "remote" },
    build: {
      production: {
        autoIncrement: true,
        android: androidCfg,
        ios: platform === "ios" ? { simulator: false } : undefined,
      },
    },
  };
}

function packageJson(slug) {
  return {
    name: slug,
    version: "1.0.0",
    main: "node_modules/expo/AppEntry.js",
    dependencies: {
      expo: "~51.0.0",
      react: "18.2.0",
      "react-native": "0.74.0",
      "@react-native-async-storage/async-storage": "1.23.1",
    },
  };
}

/**
 * Lance un build EAS réel. Retourne { buildId } immédiatement (build async).
 */
export async function startEasBuild({ title, code, format = "apk" }) {
  if (!config.expo.token) throw new Error("EXPO_TOKEN non configuré — impossible de lancer un build EAS.");
  const profile = PROFILES[format];
  if (!profile) throw new Error(`Format inconnu : ${format}`);

  const slug = (title || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 28) || "afribuild-app";
  const dir = await mkdtemp(join(tmpdir(), "afribuild-eas-"));

  try {
    // Code RN nettoyé : on retire les imports/exports parasites et on garantit un App par défaut
    const appCode = sanitizeReactNative(code);

    await writeFile(join(dir, "App.js"), appCode, "utf8");
    await writeFile(join(dir, "app.json"), JSON.stringify(appJson(title, slug), null, 2), "utf8");
    await writeFile(join(dir, "eas.json"), JSON.stringify(easJson(profile.buildType, profile.platform), null, 2), "utf8");
    await writeFile(join(dir, "package.json"), JSON.stringify(packageJson(slug), null, 2), "utf8");

    const env = { ...process.env, EXPO_TOKEN: config.expo.token };
    // --no-wait : on ne bloque pas le serveur ; on récupère le buildId et on poll ensuite
    const args = [
      "eas-cli@latest", "build",
      "--platform", profile.platform,
      "--profile", "production",
      "--non-interactive",
      "--no-wait",
      "--json",
    ];

    const { stdout } = await exec("npx", args, { cwd: dir, env, maxBuffer: 1024 * 1024 * 10 });
    const parsed = JSON.parse(stdout.trim().split("\n").filter(Boolean).pop());
    const build = Array.isArray(parsed) ? parsed[0] : parsed;
    return { buildId: build.id, status: build.status, platform: profile.platform, format };
  } finally {
    // nettoyage du dossier temporaire
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Interroge le statut d'un build EAS. Retourne l'URL de l'artefact quand c'est fini.
 */
export async function getEasBuildStatus(buildId) {
  if (!config.expo.token) throw new Error("EXPO_TOKEN non configuré.");
  const env = { ...process.env, EXPO_TOKEN: config.expo.token };
  const { stdout } = await exec("npx", ["eas-cli@latest", "build:view", buildId, "--json"], { env, maxBuffer: 1024 * 1024 * 10 });
  const build = JSON.parse(stdout.trim());
  // build.status : NEW | IN_QUEUE | IN_PROGRESS | FINISHED | ERRORED | CANCELED
  return {
    id: build.id,
    status: build.status,
    artifactUrl: build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl || null,
    platform: build.platform,
    error: build.error?.message || null,
  };
}

/**
 * Nettoie le code généré pour qu'il soit un module Expo valide.
 */
function sanitizeReactNative(code) {
  let c = code.trim();
  // S'assurer qu'il y a les imports React Native standards si absents
  if (!/from\s+['"]react['"]/.test(c)) {
    c = `import React, { useState, useEffect, useRef } from 'react';\n` + c;
  }
  if (!/from\s+['"]react-native['"]/.test(c)) {
    c = `import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, FlatList, SafeAreaView } from 'react-native';\n` + c;
  }
  // Garantir un export default
  if (!/export\s+default/.test(c)) {
    c += `\nexport default App;`;
  }
  return c;
}
