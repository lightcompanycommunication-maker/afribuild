# AfriBuild Backend

Le serveur qui transforme AfriBuild d'un générateur front-end en **vraie plateforme SaaS** : build APK natif réel, provisioning de bases de données, déploiement, et paiements africains — le tout avec les clés secrètes protégées côté serveur.

---

## Ce que fait ce backend

| Endpoint | Rôle |
|---|---|
| `POST /api/generate` | Génère du code via Claude (clé API protégée) |
| `POST /api/apk/validate` | Vérifie que le code est du **vrai React Native** |
| `POST /api/apk/preview` | **QR Expo Go** — teste l'app sur téléphone en 5 s, sans build |
| `POST /api/apk/build` | Pipeline complet : valide → corrige → **APK/AAB/IPA installable** |
| `POST /api/build` | Build natif EAS bas niveau |
| `GET /api/build/:id` | Statut du build + URL de l'artefact |
| `POST /api/infra/provision` | Crée une **vraie base Supabase** + exécute le schéma SQL |
| `POST /api/infra/deploy` | Déploie l'app web sur Vercel |
| `POST /api/pay/init` | Paiement CinetPay / Flutterwave / Kkiapay (routage auto par pays) |
| `POST /api/pay/verify` | Vérifie le statut d'un paiement |
| `POST /api/pay/webhook/:gateway` | Reçoit les confirmations des passerelles |
| `POST /api/receipts/issue` | **Reçu Mobile Money infalsifiable** (signé HMAC) + email au client et au commerçant |
| `GET /api/receipts/verify/:id` | Vérification publique d'un reçu (ce que le QR code ouvre) |
| `GET /api/receipts/list` | Historique des reçus d'un commerçant |

---

## 🧾 AFRIREÇU — Reçus Mobile Money infalsifiables

Le différenciateur africain : une preuve de paiement que **personne ne peut truquer**.

**Comment ça marche (3 piliers) :**
1. **Signature cryptographique** (HMAC-SHA256) — la clé secrète reste sur le serveur. Modifier 1 chiffre du montant invalide la signature.
2. **QR code de vérification** — n'importe qui scanne → page qui confirme "✓ reçu authentique : 5 000 FCFA, payé le …". La vérité est sur le serveur, pas sur le papier.
3. **Confirmation passerelle** — un reçu n'est émis QUE si CinetPay/Flutterwave/Kkiapay confirme que l'argent est passé (anti-fraude).

**Traçabilité par email :** chaque reçu est envoyé automatiquement au **client** ET au **commerçant** (via Resend). Les deux ont une copie pour leur comptabilité.

**À configurer dans `.env` :**
- `RECEIPT_SECRET` — chaîne aléatoire longue (signature des reçus)
- `RESEND_API_KEY` — clé Resend (gratuit ~3000 emails/mois, resend.com)
- `MAIL_FROM` — l'expéditeur

**SQL à exécuter :** `sql/receipts.sql`

**Flux complet :**
```
Client paie via Mobile Money
   → passerelle confirme "paid"
   → POST /api/receipts/issue
   → reçu signé créé + sauvegardé
   → email envoyé au client + au commerçant
   → reçu affiché avec QR de vérification
```


---

## 🎯 LE PIPELINE APK (priorité n°1 — livrer comme Emergent)

C'est le maillon qui transforme « génère du code React Native » en « télécharge ton APK installable ». Trois étapes pour le client final :

### Étape 1 — Tester instantanément (QR Expo Go, ~5 secondes)
```js
const { qrData } = await api.previewExpoGo({ title, code });
// Affiche qrData en QR code → l'utilisateur scanne avec l'app Expo Go
// et voit son app tourner sur son vrai téléphone, immédiatement.
```
Pas de build, pas d'attente. Idéal pour itérer avant de compiler.

### Étape 2 — Compiler l'APK installable (~2-5 min)
```js
const { buildId, autoFixed } = await api.buildAPK({ title, code, format: "apk" });
// Le pipeline valide d'abord le code :
//   - balises HTML web (div, span...) → converties en View, Text...
//   - localStorage → AsyncStorage
//   - document/window → supprimés
// Si le code n'était pas du vrai RN, Claude le corrige automatiquement (autoFixed:true)
```

### Étape 3 — Récupérer le fichier
```js
const result = await api.waitForBuild(buildId, { onProgress: s => console.log(s.status) });
// result.artifactUrl = le vrai .apk signé, téléchargeable et installable
```

**Formats supportés :**
- `apk` → installation directe (partage, sideload)
- `aab` → publication sur Google Play Store
- `ipa` → publication sur Apple App Store (nécessite compte Apple Developer)

**Pourquoi ça marche maintenant alors que ça ne marchait pas avant :**
Le problème n'était pas le build EAS (qui existait déjà) mais le fait que le code généré pouvait contenir du React DOM (web) au lieu de React Native. Le pipeline `apkPipeline.js` valide et **convertit automatiquement** le code en vrai React Native avant de compiler — donc l'APK fonctionne à coup sûr.



---

## Installation

```bash
cd afribuild-backend
npm install
cp .env.example .env   # puis remplis tes clés
npm start
```

Le serveur démarre sur `http://localhost:3001`.

---

## Configuration des clés (.env)

### 1. Anthropic (génération)
- Crée une clé sur https://console.anthropic.com
- `ANTHROPIC_API_KEY=sk-ant-...`

### 2. Expo EAS (build APK réel) — LE point crucial
C'est ce qui produit un **vrai fichier .apk installable**.

```bash
npm install -g eas-cli
eas login
eas init        # crée le projet, récupère EAS_PROJECT_ID
```
- Token : https://expo.dev → Account Settings → Access Tokens
- `EXPO_TOKEN=...` et `EAS_PROJECT_ID=...`

Le build tourne sur les serveurs d'Expo (cloud) — pas besoin d'Android SDK ni de Xcode sur ton serveur. Premier build Android ~5-10 min, ensuite ~2-3 min. iOS nécessite un compte Apple Developer (99 $/an) pour signer.

**Coût** : EAS offre un quota gratuit limité ; au-delà, ~30 $/mois pour des builds illimités.

### 3. Supabase (provisioning auto)
- Token : https://supabase.com/dashboard/account/tokens
- `SUPABASE_ACCESS_TOKEN=sbp_...`
- `SUPABASE_ORG_ID=...` (dans l'URL de ton organisation)

Chaque app full-stack générée obtient sa propre base PostgreSQL réelle.

### 4. Vercel (déploiement web)
- Token : https://vercel.com/account/tokens
- `VERCEL_TOKEN=...`

### 5. Paiements africains
- **CinetPay** : https://cinetpay.com → API key + Site ID
- **Flutterwave** : https://flutterwave.com → Secret key (`FLWSECK-...`)
- **Kkiapay** : https://kkiapay.me → clés privée + secret

---

## Comment le front (v8) s'y connecte

Copie `client-integration.js` dans ton app, puis remplace les appels directs :

```js
import { createApiClient } from "./client-integration.js";

// 1. Obtiens un token au login
const { token } = await fetch(API + "/api/auth/token", {
  method: "POST", headers: {"Content-Type":"application/json"},
  body: JSON.stringify({ userId: user.id, email: user.email })
}).then(r => r.json());

const api = createApiClient("https://api.afribuild.app", token);

// 2. Génération (au lieu d'appeler Anthropic directement)
const app = await api.generate(prompt, SYSTEM_PROMPT);

// 3. Build APK réel (remplace requestNativeBuild simulé)
const { buildId } = await api.startBuild({ title, code, format: "apk" });
const result = await api.waitForBuild(buildId, {
  onProgress: s => console.log(s.status)
});
// result.artifactUrl = le vrai .apk téléchargeable

// 4. Provisioning base de données (full-stack)
const infra = await api.provision({ appName: "ma-tontine", schemaSql });
// infra.url + infra.anonKey à injecter dans l'app générée

// 5. Déploiement web
const { url } = await api.deploy({ title, code });

// 6. Paiement
const pay = await api.initPayment({
  amount: 12000, currency: "XOF", country: "SN",
  customer: { name, email, phone }, returnUrl, notifyUrl
});
window.location.href = pay.checkoutUrl;
```

---

## Déploiement du backend

### Option A — Railway (le plus simple)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```
Ajoute tes variables d'environnement dans le dashboard Railway. ~5 $/mois.

### Option B — Render
- Connecte ton repo GitHub
- Build command : `npm install`
- Start command : `npm start`
- Ajoute les variables d'environnement

### Option C — VPS (Ubuntu)
```bash
# installe Node 18+
git clone <ton-repo> && cd afribuild-backend
npm install
npm install -g pm2
pm2 start src/server.js --name afribuild
pm2 save
```
Mets un Nginx en reverse proxy + Certbot pour le HTTPS.

---

## Sécurité

- Toutes les clés secrètes restent côté serveur (jamais dans le front)
- JWT pour authentifier chaque requête
- Rate limiting sur les endpoints coûteux (build, provision)
- Vérifie les signatures des webhooks de paiement avant de créditer un compte

---

## Architecture

```
Front (v8)  ──JWT──►  Backend (ce projet)  ──►  Anthropic   (génération)
                                            ──►  Expo EAS    (build natif APK/IPA)
                                            ──►  Supabase    (provisioning DB)
                                            ──►  Vercel      (déploiement web)
                                            ──►  CinetPay / Flutterwave / Kkiapay
```

Le front ne connaît aucune clé secrète : il parle uniquement à ce backend.
