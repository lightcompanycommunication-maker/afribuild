# AfriBuild — Guide de test pour le développeur

Salut 👋 Voici la **dernière version complète** d'AfriBuild AI avec toutes les
mises à jour. Ce guide te dit exactement **quoi configurer** et **dans quel
ordre tester** pour ne pas t'emmêler.

═══════════════════════════════════════════════════════════════
## RÈGLE D'OR : une clé, un test, ça marche, on continue
═══════════════════════════════════════════════════════════════
Ne configure PAS les 10 clés d'un coup. Active-les une par une et teste à chaque
étape. C'est comme ça qu'on débugge sans devenir fou.

═══════════════════════════════════════════════════════════════
## OÙ METTRE LES CLÉS
═══════════════════════════════════════════════════════════════
Toutes les clés vont dans **UN seul fichier** : `afribuild-backend/.env`
1. Copie `.env.example` → renomme-le `.env`
2. Remplis les clés au fur et à mesure des étapes ci-dessous

Les clés ne vont JAMAIS dans le front (`afribuild-v10.jsx`). Toujours côté serveur.

Côté front, une seule ligne à remplir une fois le backend en ligne :
`const BACKEND_URL = "https://ton-backend.up.railway.app";`  (en haut du .jsx)
Si vide → mode démo (génération directe, pas d'APK réel).

═══════════════════════════════════════════════════════════════
## ORDRE DE TEST (du plus simple au plus complet)
═══════════════════════════════════════════════════════════════

### ÉTAPE 1 — Génération d'apps (le cœur) — PRIORITÉ
Clé : `ANTHROPIC_API_KEY` (console.anthropic.com)
- Pour TESTER pas cher : mets le modèle Haiku au lieu de Sonnet.
  Dans `src/services/ai.js` et `studio.js`/`memory.js`/`apkPipeline.js`,
  remplace "claude-sonnet-4-20250514" par "claude-haiku-4-5-20251001".
  (Haiku ≈ 5x moins cher. Repasse sur Sonnet pour la production.)
- Anthropic n'a PAS d'API gratuite, mais offre souvent ~5$ de crédits à
  l'inscription → largement assez pour tester.
- Test : lance le backend (`npm install && npm start`), fais générer une app
  depuis le front. Si l'app se génère → 80% du produit est en vie. ✅

### ÉTAPE 2 — Studio graphique (flyers, logos, photos)
Clé : `REPLICATE_API_TOKEN` (replicate.com)
- Une seule clé donne accès à Flux (photos) + Ideogram (flyers/texte).
- Test : génère un flyer, un logo, une photo produit. Vérifie les qualités
  720p/1080p/4K/8K selon le plan.

### ÉTAPE 3 — Déploiement web
Clé : `VERCEL_TOKEN` (vercel.com/account/tokens)
- Test : génère une app → bouton "Déployer" → vérifie l'URL publique.

### ÉTAPE 4 — Base de données + Auth
Clés : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID`
- Exécute les fichiers `sql/*.sql` dans le SQL Editor de Supabase
  (project_memory.sql + receipts.sql).
- Test : inscription/login, sauvegarde de projet, mémoire IA.

### ÉTAPE 5 — Reçus Mobile Money + emails
Clés : `RECEIPT_SECRET` (invente une longue chaîne), `RESEND_API_KEY` (resend.com)
- Test : simule un paiement → vérifie qu'un reçu signé est émis + email reçu.

### ÉTAPE 6 — Build APK natif (le plus lourd)
Clés : `EXPO_TOKEN` + `EAS_PROJECT_ID` (expo.dev)
- Fais `eas login` puis `eas init` une fois (génère EAS_PROJECT_ID).
- Test : génère une app en mode Mobile → "Générer APK" → récupère le .apk.
- ⚠️ Premier build = 5-10 min. Quota gratuit limité puis ~30$/mois.

### ÉTAPE 7 — Paiements réels
Clés : `CINETPAY_*`, `FLUTTERWAVE_SECRET_KEY`, `KKIAPAY_*`
- Test en mode sandbox d'abord, puis vrais paiements.

### ÉTAPE 8 (optionnel) — Autres moteurs d'image
Clés : `GEMINI_KEY`, `STABILITY_KEY`, `OPENAI_KEY`
- Pas nécessaires au début (Replicate suffit).

═══════════════════════════════════════════════════════════════
## NOUVEAUTÉS DE CETTE VERSION (à tester)
═══════════════════════════════════════════════════════════════
- Studio graphique multi-moteurs : flyers, bannières, posts, logos, photos,
  mockups — qualité 720p → 8K, moteur choisi automatiquement selon le besoin.
- Qualité d'image limitée par plan (gratuit = 720p, Pro = 4K, Business = 8K).
- Moteur d'image selon le plan (gratuit = standard, payant = meilleurs).
- Reçus Mobile Money infalsifiables (signature HMAC + QR + email).
- Système de crédits : chaque action coûte des crédits
  (app=1, modif=1, visuel=1, déploiement=2, APK=5). Blocage + recharge.
- Plans repensés (5 plans) : mensuel + annuel (2 mois offerts).
- Packs de crédits dégressifs (apps + visuels séparés).
- Import de logo → l'IA génère l'app aux couleurs du client.
- GitHub intégré, mémoire de projet IA.

═══════════════════════════════════════════════════════════════
## CHIFFRE À MESURER ABSOLUMENT
═══════════════════════════════════════════════════════════════
Sur console.anthropic.com (onglet Usage), après ~10 générations réelles :
combien coûte EXACTEMENT une génération ? Diviser le coût total par 10.
Ce chiffre permet de fixer les prix sans jamais perdre d'argent.
Règle : vendre au moins 2-3x le coût réel.

═══════════════════════════════════════════════════════════════
## LA QUESTION QUI COMPTE
═══════════════════════════════════════════════════════════════
Est-ce qu'on arrive à :
1. Générer une app ? (étape 1)
2. Générer un flyer/logo ? (étape 2)
3. Sortir un vrai APK installable ? (étape 6)
Si oui aux trois → le produit est réel. Sinon, dis ce qui bloque exactement.

Bon courage 🙏
