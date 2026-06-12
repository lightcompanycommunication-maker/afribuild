/**
 * AfriBuild — Client API (à coller dans le front v8)
 * ───────────────────────────────────────────────────
 * Remplace les appels directs (Anthropic, Vercel, EAS simulé) par des appels
 * sécurisés vers ton backend. Les clés secrètes ne sont plus jamais dans le front.
 *
 * Usage :
 *   const api = createApiClient("https://api.afribuild.app", token);
 *   const app = await api.generate(prompt, systemPrompt);
 *   const { buildId } = await api.startBuild({ title, code, format: "apk" });
 *   const status = await api.buildStatus(buildId);
 */

export function createApiClient(baseUrl, token) {
  const headers = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const post = async (path, body) => {
    const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
    return res.json();
  };
  const get = async (path) => {
    const res = await fetch(`${baseUrl}${path}`, { headers: headers() });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
    return res.json();
  };

  return {
    // Auth
    getToken: (userId, email) => post("/api/auth/token", { userId, email }),

    // Génération
    generate: (prompt, systemPrompt, maxTokens) => post("/api/generate", { prompt, systemPrompt, maxTokens }),

    // Build natif
    startBuild: ({ title, code, format }) => post("/api/build", { title, code, format }),
    buildStatus: (buildId) => get(`/api/build/${buildId}`),

    // Pipeline APK complet (le maillon qui livre comme Emergent)
    validateRN: (code) => post("/api/apk/validate", { code }),
    previewExpoGo: ({ title, code }) => post("/api/apk/preview", { title, code }),
    buildAPK: ({ title, code, format = "apk", autoFix = true }) => post("/api/apk/build", { title, code, format, autoFix }),

    // Sonde le build jusqu'à la fin (utilitaire)
    async waitForBuild(buildId, { onProgress, intervalMs = 8000, timeoutMs = 1200000 } = {}) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const s = await this.buildStatus(buildId);
        onProgress?.(s);
        if (s.status === "FINISHED") return s;
        if (s.status === "ERRORED" || s.status === "CANCELED") throw new Error(s.error || "Build échoué.");
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      throw new Error("Timeout du build.");
    },

    // Infrastructure
    provision: ({ appName, schemaSql }) => post("/api/infra/provision", { appName, schemaSql }),
    deploy: ({ title, code, env }) => post("/api/infra/deploy", { title, code, env }),

    // Paiements
    initPayment: (payload) => post("/api/pay/init", payload),
    verifyPayment: (payload) => post("/api/pay/verify", payload),
    recommendedGateway: (country) => get(`/api/pay/gateway?country=${country}`),

    // GitHub (versioning intégré)
    verifyGithub: (githubToken) => post("/api/github/verify", { githubToken }),
    pushToGithub: ({ githubToken, appName, description, files, message, isPrivate }) =>
      post("/api/github/push", { githubToken, appName, description, files, message, isPrivate }),
    githubHistory: ({ githubToken, owner, repo }) => post("/api/github/history", { githubToken, owner, repo }),
    githubRollback: ({ githubToken, owner, repo, path, sha }) => post("/api/github/rollback", { githubToken, owner, repo, path, sha }),

    // Mémoire de projet IA
    getMemory: (projectId) => get(`/api/memory/${projectId}`),
    saveMemory: (projectId, data) => post(`/api/memory/${projectId}`, data),
    summarizeMemory: (projectId, payload) => post(`/api/memory/${projectId}/summarize`, payload),

    // AfriReçu — reçus Mobile Money infalsifiables
    issueReceipt: (payload) => post("/api/receipts/issue", payload),
    verifyReceipt: (id) => get(`/api/receipts/verify/${id}`),
    listReceipts: () => get("/api/receipts/list"),

    // AfriMage — images réelles (logos + photos réalistes)
    generateImage: (payload) => post("/api/images/generate", payload),
    analyzeLogo: (imageBase64) => post("/api/images/analyze-logo", { imageBase64 }),
    imagePacks: () => get("/api/images/packs"),

    // AfriStudio — studio graphique pro (flyers, bannières, posts, mockups...)
    generateVisual: (payload) => post("/api/studio/generate", payload),
    studioTypes: () => get("/api/studio/types"),
    studioEngines: () => get("/api/studio/engines"),
    studioPacks: () => get("/api/studio/packs"),
  };
}
