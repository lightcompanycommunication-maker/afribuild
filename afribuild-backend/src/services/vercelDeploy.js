import { config } from "../config.js";

/**
 * Déploiement web sur Vercel via l'API v13.
 * Produit une URL publique (https://<slug>-xxx.vercel.app) ou un domaine custom *.afribuild.app.
 */

export async function deployWeb({ title, code, env = {} }) {
  if (!config.vercel.token) throw new Error("VERCEL_TOKEN non configuré.");

  const slug = (title || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 28) || "afribuild-app";
  const appName = `${slug}-${Math.random().toString(36).slice(2, 8)}`;

  const cleaned = code
    .replace(/export\s+default\s+App\s*;?/g, "")
    .replace(/import\s+.*?from\s+['"][^'"]*['"]\s*;?/g, "");

  // Pages statiques : un index.html autonome avec React via CDN + Babel
  const indexHtml = buildHtml(title, cleaned);

  const teamQuery = config.vercel.teamId ? `?teamId=${config.vercel.teamId}` : "";
  const res = await fetch(`https://api.vercel.com/v13/deployments${teamQuery}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.vercel.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: appName,
      files: [{ file: "index.html", data: indexHtml }],
      projectSettings: { framework: null },
      target: "production",
    }),
  });

  if (!res.ok) throw new Error(`Vercel: déploiement échoué — ${await res.text()}`);
  const data = await res.json();
  return { url: `https://${data.url}`, id: data.id, name: appName };
}

function buildHtml(title, code) {
  const tag = "scr" + "ipt";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <${tag} src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></${tag}>
  <${tag} src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></${tag}>
  <${tag} src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js"></${tag}>
  <style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}</style>
</head>
<body>
  <div id="root"></div>
  <${tag} type="text/babel">
    const { useState, useEffect, useRef, useCallback, useMemo } = React;
    ${code}
    ReactDOM.render(React.createElement(App), document.getElementById('root'));
  </${tag}>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
