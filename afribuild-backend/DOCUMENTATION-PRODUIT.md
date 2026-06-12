# AfriBuild AI — Documentation Produit

**Version 10 · Plateforme de création numérique pour l'Afrique**

---

## 1. Qu'est-ce qu'AfriBuild ?

AfriBuild AI est une plateforme tout-en-un qui permet à n'importe qui — sans
compétences techniques — de créer, habiller, déployer et monétiser des
applications et des visuels professionnels, à partir d'une simple description
en langage naturel.

Pensée pour le marché africain (Mobile Money, langues locales, données
africaines, prix en FCFA) mais ouverte au monde (multi-devises).

**En une phrase :** *décris ton projet → obtiens une application complète, avec
ses visuels, prête à déployer et à encaisser des paiements.*

---

## 2. Ce que la plateforme fait, concrètement

### 2.1 — Génération d'applications
- Décrire une app en français (ou par la voix en langue africaine)
- 5 agents IA collaborent (Architecte, Designer, Frontend, Backend, Qualité)
- 3 modes : **Web App**, **Full-Stack** (frontend + backend + base de données),
  **Mobile** (React Native / Expo)
- Aperçu en direct, modification par chat, export du code
- Le modèle IA s'adapte au plan : Rapide (Haiku) en gratuit, Avancé (Sonnet) en
  Pro, Puissant (Opus) en Business

### 2.2 — Visuels intégrés automatiquement
- Quand une app est générée, l'IA crée **automatiquement** son identité visuelle
  (logo + photos + bannières selon le secteur) et les **insère dans l'app**
- L'app livrée est donc complète et habillée, prête à l'emploi

### 2.3 — Studio graphique (utilisable seul)
- Flyers, affiches, bannières, posts réseaux sociaux, logos, cartes de visite,
  photos produits, mockups, menus
- Qualités 720p / 1080p / 4K / 8K (selon le plan)
- **Sélection automatique du meilleur moteur** selon le besoin :
  - Flyers/affiches → Ideogram (texte parfait)
  - Logos → Recraft (vectoriel net)
  - Photos → Flux / Flux Pro
  - Retouche → Nano Banana (Gemini)
- Un client peut venir **juste pour des visuels**, sans créer d'app

### 2.4 — Déploiement
- Mise en ligne web en 1 clic (Vercel) → URL publique
- Provisioning automatique de base de données (Supabase) en mode full-stack

### 2.5 — Application mobile native (APK / AAB / IPA)
- Génère un **vrai fichier installable** via Expo EAS
- APK (installation directe), AAB (Google Play), IPA (App Store)
- Test instantané sur téléphone via QR code Expo Go (avant le build complet)
- Validation + conversion automatique du code en React Native si nécessaire

### 2.6 — Paiements africains
- Reçus Mobile Money **infalsifiables** (signature cryptographique + QR de
  vérification + envoi par email au client et au commerçant)
- Passerelles intégrées : CinetPay, Flutterwave, Kkiapay, MTN, Orange, Wave,
  M-Pesa — choisies automatiquement selon le pays

### 2.7 — Outils professionnels
- Voix en 10 langues africaines (Wolof, Dioula, Hausa, Swahili...)
- Mémoire de projet IA (se souvient des choix, couleurs, pays, historique)
- Versioning GitHub intégré (création de repo, commits, historique)
- Base de données visuelle (concevoir des tables → SQL généré)
- Marketplace de 20 agents spécialisés (POS, École, Hôpital, Tontine...)
- Import du logo du client → l'app est générée à ses couleurs

---

## 3. Comment fonctionne le système de crédits

Chaque action consomme des crédits. Les crédits se rechargent chaque mois selon
le plan, et peuvent être rachetés à tout moment (ils n'expirent jamais).

| Action | Coût |
|---|---|
| Générer une application | 1 crédit |
| Modifier une application | 1 crédit |
| Générer un visuel (flyer, logo, photo) | 1 crédit |
| Déployer sur le web | 2 crédits |
| Générer l'APK / AAB / IPA | 5 crédits |

Quand les crédits sont épuisés, l'utilisateur est invité à recharger.

---

## 4. Les plans

| Plan | Prix/mois | Modèle IA | Crédits | Qualité image |
|---|---|---|---|---|
| **Free** | Gratuit | Rapide | 15 | 720p |
| **Starter** | 5 000 FCFA | Avancé | 60 | 1080p |
| **Pro** | 15 000 FCFA | Avancé | 180 | 4K |
| **Business** | 35 000 FCFA | Puissant (Opus) | 450 | 8K |

- Facturation mensuelle ou annuelle (**2 mois offerts** en annuel)
- Multi-devises : FCFA, €, $, £, ₦, GH₵, KSh
- Packs de crédits supplémentaires (dégressifs : plus on achète, moins c'est cher)

---

## 5. Le parcours utilisateur type

```
1. Le client s'inscrit (gratuit, 15 crédits)
2. Il décrit son projet ("une boutique de wax à Dakar")
3. AfriBuild génère l'app + son logo + ses photos automatiquement
4. Il modifie par chat si besoin ("ajoute une page contact")
5. Il déploie en ligne (URL publique) ou génère l'APK
6. Il connecte le Mobile Money → l'app encaisse des paiements
7. Ses crédits s'épuisent → il passe à un plan payant ou recharge
8. Il a lancé son entreprise numérique, sans coder une ligne
```

---

## 6. Ce qui rend AfriBuild unique

1. **App + visuels en un seul flux** — l'app arrive déjà habillée
2. **100% africain** — Mobile Money, langues locales, données réelles, FCFA
3. **Reçus infalsifiables** — la confiance dans les transactions
4. **Voix en langues africaines** — personne d'autre ne le fait
5. **Les meilleurs moteurs IA** orchestrés automatiquement
6. **Ouvert au monde** — multi-devises pour les internationaux

---

## 7. Architecture technique (pour le développeur)

```
Front (afribuild-v10.jsx)
   │  parle uniquement au backend (aucune clé secrète côté client)
   ▼
Backend (afribuild-backend/)
   ├── /api/generate        → génération de code (Claude)
   ├── /api/studio/generate → visuels (Flux, Ideogram, Gemini, Recraft...)
   ├── /api/apk/build       → APK/AAB/IPA réel (Expo EAS)
   ├── /api/infra/deploy    → déploiement (Vercel)
   ├── /api/infra/provision → base de données (Supabase)
   ├── /api/receipts/issue  → reçus signés + email
   ├── /api/pay/init        → paiements (CinetPay/Flutterwave/Kkiapay)
   ├── /api/github/push     → versioning Git
   └── /api/memory          → mémoire de projet IA
```

Voir `GUIDE-TEST-DEV.md` pour l'ordre de configuration et de test.

---

*AfriBuild AI — Construire l'Afrique numérique, une application à la fois.*
