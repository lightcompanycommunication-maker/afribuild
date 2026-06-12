import { useState, useRef, useEffect, useCallback, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   AFRIBUILD AI — v10 (GitHub + Mémoire de projet)
   Plateforme SaaS de génération d’applications pour l’Afrique.
   Design system complet · Responsive PC / tablette / mobile · Déployable.
   ═══════════════════════════════════════════════════════════════════════════ */

const MODEL = "claude-sonnet-4-20250514";

// ─── CONFIG (remplace par tes clés en production) ───────────────────────────
const SUPABASE_URL    = "https://TON_PROJECT.supabase.co";
const SUPABASE_KEY    = "TON_ANON_KEY";
const VERCEL_TOKEN    = "TON_VERCEL_TOKEN";
const CINETPAY_KEY    = "TON_CINETPAY_APIKEY";
const CINETPAY_SITE   = "TON_CINETPAY_SITEID";
const FLUTTERWAVE_KEY = "FLWPUBK-TON_CLE";
const KKIAPAY_KEY     = "TON_KKIAPAY_KEY";

// ─── BACKEND ─────────────────────────────────────────────────────────────────
// URL de ton backend AfriBuild (déployé sur Railway/Render).
// Laisse vide ("") pour le mode démo (tout marche, mais sans vrai APK ni vrai déploiement).
// Une fois le backend hébergé, mets son URL ici : ex. "https://api.afribuild.app"
const BACKEND_URL = "";

// Client qui parle au backend. Si BACKEND_URL est vide, on bascule en mode démo.
const backend = {
  enabled: () => !!BACKEND_URL,
  token: null,
  async auth(userId, email) {
    if (!BACKEND_URL) return null;
    try {
      const r = await fetch(`${BACKEND_URL}/api/auth/token`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ userId, email }) });
      const d = await r.json(); this.token = d.token; return d.token;
    } catch { return null; }
  },
  headers() { return { "Content-Type":"application/json", ...(this.token?{Authorization:`Bearer ${this.token}`}:{}) }; },
  async post(path, body) {
    const r = await fetch(`${BACKEND_URL}${path}`, { method:"POST", headers:this.headers(), body:JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || `Erreur ${r.status}`);
    return r.json();
  },
  async get(path) {
    const r = await fetch(`${BACKEND_URL}${path}`, { headers:this.headers() });
    if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || `Erreur ${r.status}`);
    return r.json();
  },
  // Suit un build APK jusqu’à la fin
  async waitForBuild(buildId, onProgress) {
    const start = Date.now();
    while (Date.now() - start < 1200000) {
      const s = await this.get(`/api/build/${buildId}`);
      onProgress?.(s);
      if (s.status === "FINISHED") return s;
      if (s.status === "ERRORED" || s.status === "CANCELED") throw new Error(s.error || "Build échoué.");
      await new Promise(r => setTimeout(r, 8000));
    }
    throw new Error("Le build a pris trop de temps.");
  },
  // GitHub
  async githubPush(p){ return this.post("/api/github/push", p); },
  async githubVerify(t){ return this.post("/api/github/verify", { githubToken:t }); },
  async githubHistory(p){ return this.post("/api/github/history", p); },
  // Mémoire de projet
  async getMemory(id){ try{ return await this.get(`/api/memory/${id}`); }catch{ return null; } },
  async saveMemory(id,d){ try{ return await this.post(`/api/memory/${id}`, d); }catch{ return null; } },
};

// ─── DESIGN TOKENS — "Atelier numérique africain" ───────────────────────────
const T = {
  bg:"#0B0E18", surface:"#FFFFFF", surfaceAlt:"#F7F8FC",
  ink:"#0B0E18", inkSoft:"#5A6478", inkFaint:"#9AA3B8",
  line:"#ECEEF4", lineSoft:"#F2F4F9",
  gold:"#E8B23A", goldDeep:"#C8901C", goldSoft:"#FEF6E6",
  indigo:"#4F46E5", indigoDeep:"#3730A3", indigoSoft:"#EEF0FF",
  green:"#16A34A", greenSoft:"#ECFDF3",
  red:"#E5484D", redSoft:"#FEF1F1",
  navBg:"#0F1320", navLine:"#1C2233", navInk:"#C7CDDC", navInkSoft:"#6B7488", navActive:"#1A2030",
};
const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const FONT_DISPLAY = "'Sora','Inter',-apple-system,sans-serif";
const FONT_MONO = "'JetBrains Mono','Fira Code','SF Mono',Consolas,monospace";

// ─── PLANS ───────────────────────────────────────────────────────────────────
// ─── DEVISES (pour les utilisateurs internationaux) ─────────────────────────
const CURRENCIES = {
  XOF: { symbol:"FCFA", rate:1,      label:"FCFA (Afrique de l’Ouest)" },
  XAF: { symbol:"FCFA", rate:1,      label:"FCFA (Afrique centrale)" },
  EUR: { symbol:"€",    rate:0.00152,label:"Euro" },
  USD: { symbol:"$",    rate:0.00166,label:"Dollar US" },
  GBP: { symbol:"£",    rate:0.0013, label:"Livre" },
  NGN: { symbol:"₦",    rate:2.6,    label:"Naira" },
  GHS: { symbol:"GH₵",  rate:0.024,  label:"Cedi" },
  KES: { symbol:"KSh",  rate:0.21,   label:"Shilling" },
};
// Convertit un prix FCFA vers la devise choisie.
const toCurrency = (fcfa, cur="XOF") => {
  const c = CURRENCIES[cur] || CURRENCIES.XOF;
  const v = fcfa * c.rate;
  if (cur==="XOF"||cur==="XAF"||cur==="NGN"||cur==="KES") return `${new Intl.NumberFormat("fr-FR").format(Math.round(v))} ${c.symbol}`;
  return `${c.symbol}${v.toFixed(2)}`;
};

// ─── MODÈLES IA par plan (façon Claude : gratuit = rapide, payant = puissant) ─
const AI_TIERS = {
  fast:     { id:"claude-haiku-4-5-20251001",  label:"Rapide",   desc:"Génération rapide, idéale pour démarrer" },
  balanced: { id:"claude-sonnet-4-20250514",   label:"Avancé",   desc:"Le meilleur équilibre qualité / vitesse" },
  power:    { id:"claude-opus-4-20250514",     label:"Puissant", desc:"Pour les projets les plus complexes" },
};

const PLANS = [
  { id:"free",     name:"Free",       price:0,      priceYear:0,       color:"#5A6478", badge:null,        tagline:"Pour découvrir",
    credits:15,  images:2,   ai:"fast",     imgMaxQ:"720",
    features:["15 crédits pour démarrer","Modèle IA Rapide","Studio graphique · 720p","Logos IA","Idéal pour 1 premier projet"],
    limits:{deploy:0,github:false,custom:false,private:false,team:false} },
  { id:"starter",  name:"Starter",    price:5000,   priceYear:48000,   color:"#16A34A", badge:"Accessible", tagline:"Pour démarrer",
    credits:60,  images:15,  ai:"balanced", imgMaxQ:"1080",
    features:["60 crédits / mois","Modèle IA Avancé","Studio graphique · 1080p","Reçus Mobile Money","Voix en langues africaines"],
    limits:{deploy:2,github:false,custom:false,private:true,team:false} },
  { id:"pro",      name:"Pro",        price:15000,  priceYear:144000,  color:"#E8B23A", badge:"Populaire", tagline:"Pour les pros",
    credits:180, images:50,  ai:"balanced", imgMaxQ:"4k",
    features:["180 crédits / mois","Modèle IA Avancé","Studio graphique · 4K","Génération prioritaire","Export GitHub · 20 agents","Déploiement web"],
    limits:{deploy:-1,github:true,custom:false,private:true,team:false} },
  { id:"business", name:"Business",   price:35000,  priceYear:336000,  color:"#4F46E5", badge:"Recommandé",tagline:"Pour les équipes",
    credits:450, images:150, ai:"power",    imgMaxQ:"8k",
    features:["450 crédits / mois","Modèle IA Puissant (Opus)","Studio graphique · 8K","Gestion d’équipe & crédits partagés","Génération prioritaire","Tout débloqué"],
    limits:{deploy:-1,github:true,custom:true,private:true,team:true} },
];
// Packs APPS — dégressif : plus tu achètes, moins c’est cher l’unité
const CREDIT_PACKS = [
  {credits:15,  price:2000,  label:"Recharge",   per:133},
  {credits:50,  price:6000,  label:"Builder",    per:120, popular:true},
  {credits:120, price:12000, label:"Studio",     per:100, best:true},
];
// Packs VISUELS — dégressif aussi (chaque visuel a son coût réel)
const VISUAL_PACKS = [
  {visuals:10,  price:1000,  label:"10 visuels",  per:100},
  {visuals:30,  price:2500,  label:"30 visuels",  per:83,  popular:true},
  {visuals:100, price:7000,  label:"100 visuels", per:70,  best:true},
];
// ─── COÛT EN CRÉDITS DE CHAQUE ACTION (protège ton argent) ───────────────────
// Générer du code = pas cher. Sortir un vrai APK = lourd → coûte plus de crédits.
const ACTION_COST = {
  generate:   1,   // générer une application
  modify:     1,   // modifier une app (chat itératif)
  deployWeb:  2,   // déployer sur le web
  buildApk:   5,   // sortir un vrai APK / AAB / IPA (le plus coûteux)
};
const ACTION_LABEL = {
  generate:  "Générer une application",
  modify:    "Modifier une application",
  deployWeb: "Déployer sur le web",
  buildApk:  "Générer l’APK / AAB / IPA",
};
const AGENTS = [
  {id:"planner",  label:"Architecte", color:"#E8B23A"},
  {id:"design",   label:"Designer",   color:"#4F46E5"},
  {id:"frontend", label:"Frontend",   color:"#0EA5E9"},
  {id:"backend",  label:"Backend",    color:"#8B5CF6"},
  {id:"qa",       label:"Qualité",    color:"#16A34A"},
];

const TEMPLATES = [
  {icon:"\u25C8", label:"Tontine / Njangi",     accent:"#E8B23A", prompt:"Application web complète de gestion de tontine (njangi/likelemba). Dashboard avec solde collectif et prochain tour. Liste 12 membres avec vrais prénoms africains (Amadou Diallo, Fatou Ndiaye, Kofi Mensah, Ngozi Adeyemi, Wanjiru Kamau, Cheikh Ba). Calendrier des tours. Formulaire ajout membre. Historique transactions FCFA. Design fintech sombre avec accents dorés. Min 3 vues avec sidebar."},
  {icon:"\u25C8", label:"Marketplace Agricole", accent:"#16A34A", prompt:"Marketplace agricole B2C Afrique de l’Ouest. Catalogue produits (riz, mil, igname, cacao, café) avec cards propres, prix FCFA, stock, note étoiles. Filtres par région. Page détail produit. Panier slide-in. Design vert forêt et blanc. Vendeurs dans villes africaines. Min 12 produits."},
  {icon:"\u25C8", label:"Point de Vente",       accent:"#4F46E5", prompt:"Système POS professionnel pour boutique africaine. Interface split: gauche catalogue produits grille avec search, droite ticket. Paiement Espèces/MTN/Orange/Wave. Modal confirmation avec rendu monnaie. Historique ventes du jour. Design style Square POS. 16 produits."},
  {icon:"\u25C8", label:"Dossiers Médicaux",    accent:"#E5484D", prompt:"Système gestion patients clinique africaine style Doctolib. Sidebar navigation. Table patients avec search. Fiche patient complète. Formulaire consultation. Design médical blanc et bleu. 15 patients noms africains."},
  {icon:"\u25C8", label:"Gestion Scolaire",     accent:"#8B5CF6", prompt:"ERP scolaire style PowerSchool pour école africaine. Sidebar: Dashboard, Élèves, Notes, Emploi du temps, Paiements. Stats. Table élèves avec initiales colorées. Bulletins notes. Design violet et blanc. 20 élèves, 8 matières."},
  {icon:"\u25C8", label:"Réservation Transport",accent:"#EA580C", prompt:"App réservation bus inter-villes africains style OuiBus. Recherche trajet (Dakar, Lagos, Accra, Abidjan, Nairobi). Liste bus avec horaires prix FCFA. Plan sièges interactif. Billet numérique. Design travel orange et blanc. Stepper 4 étapes."},
  {icon:"\u25C8", label:"Restaurant & Livraison",accent:"#DC2626", prompt:"App commande restaurant style Uber Eats pour cuisine africaine. Menu par catégories avec cards plats (thiéboudienne, ndolé, jollof, yassa). Panier slide-in. Checkout Mobile Money. Timeline livraison animée. Design sombre luxe."},
  {icon:"\u25C8", label:"Immobilier",           accent:"#0891B2", prompt:"Plateforme immobilière style Seloger pour l’Afrique. Grille annonces 3 colonnes. Sidebar filtres. Page détail bien. Formulaire visite. Design teal et blanc minimaliste. 14 annonces dans villes africaines."},
];


async function payWithCinetPay({ amount, currency, name, email, phone, description, onSuccess, onError }) {
  try {
    const transId = "AB-" + Date.now() + "-" + Math.random().toString(36).slice(2,6).toUpperCase();
    // En production : appel à l’API CinetPay pour créer le paiement
    const payload = {
      apikey: CINETPAY_KEY,
      site_id: CINETPAY_SITE,
      transaction_id: transId,
      amount,
      currency,
      description,
      customer_name: name,
      customer_email: email,
      customer_phone_number: phone,
      notify_url: "https://ton-backend.com/webhooks/cinetpay",
      return_url: window.location.href,
    };
    // Simulation : en production remplace par fetch("https://api-checkout.cinetpay.com/v2/payment", ...)
    console.log("CinetPay payload:", payload);
    await new Promise(r => setTimeout(r, 2000));
    // Simule une réponse réussie
    onSuccess({ transactionId: transId, gateway: "CinetPay", amount, currency, status: "ACCEPTED" });
  } catch(e) { onError(e.message); }
}

// Initialise Flutterwave (pan-africain)
function payWithFlutterwave({ amount, currency, name, email, phone, description, onSuccess, onError }) {
  try {
    const txRef = "AFRIB-FLW-" + Date.now();
    // En production : charger le script Flutterwave et appeler FlutterwaveCheckout()
    // window.FlutterwaveCheckout({ public_key: FLUTTERWAVE_KEY, tx_ref: txRef, amount, currency, ... })
    console.log("Flutterwave:", { txRef, amount, currency, name, email });
    setTimeout(() => {
      onSuccess({ transactionId: txRef, gateway: "Flutterwave", amount, currency, status: "successful" });
    }, 2000);
  } catch(e) { onError(e.message); }
}

// Initialise Kkiapay (Bénin / Togo / Afrique de l’Ouest)
function payWithKkiapay({ amount, phone, onSuccess, onError }) {
  try {
    const txRef = "AFRIB-KKP-" + Date.now();
    // En production : charger le widget Kkiapay
    // openKkiapayWidget({ amount, phone, key: KKIAPAY_KEY, sandbox: false })
    console.log("Kkiapay:", { txRef, amount, phone });
    setTimeout(() => {
      onSuccess({ transactionId: txRef, gateway: "Kkiapay", amount, currency: "XOF", status: "SUCCESS" });
    }, 2000);
  } catch(e) { onError(e.message); }
}

// Dispatcher universel
async function processPayment({ gateway, amount, currency, name, email, phone, description, onSuccess, onError }) {
  const methods = { cinetpay: payWithCinetPay, flutterwave: payWithFlutterwave, kkiapay: payWithKkiapay };
  const fn = methods[gateway];
  if (!fn) { onError("Passerelle inconnue : " + gateway); return; }
  await fn({ amount, currency, name, email, phone, description, onSuccess, onError });
}



// ─── AFRIDATA ────────────────────────────────────────────────
const AFRIDATA = {
  countries: {
    "Sénégal":       { code:"SN", currency:"XOF", capital:"Dakar",        operators:["Orange Money","Wave","Free Money","Expresso"],    gateway:"cinetpay",    banks:["CBAO","Ecobank","BHS","BOA","UBA"] },
    "Côte d’Ivoire": { code:"CI", currency:"XOF", capital:"Abidjan",      operators:["MTN MoMo","Orange Money","Wave","Moov Money"],    gateway:"cinetpay",    banks:["BICICI","SGBCI","Ecobank","BOA","UBA"] },
    "Mali":          { code:"ML", currency:"XOF", capital:"Bamako",       operators:["Orange Money","Moov Money","Wave"],               gateway:"cinetpay",    banks:["BDM","BNDA","BOA","Ecobank"] },
    "Burkina Faso":  { code:"BF", currency:"XOF", capital:"Ouagadougou",  operators:["Orange Money","Moov Money"],                     gateway:"cinetpay",    banks:["BOA","BICIA-B","Ecobank"] },
    "Guinée":        { code:"GN", currency:"GNF", capital:"Conakry",      operators:["Orange Money","MTN MoMo","Cellcom Money"],        gateway:"cinetpay",    banks:["BIG","BICIGUI","Ecobank"] },
    "Cameroun":      { code:"CM", currency:"XAF", capital:"Yaoundé",      operators:["MTN MoMo","Orange Money"],                       gateway:"cinetpay",    banks:["Afriland","SCB","BICEC","Ecobank"] },
    "Congo RDC":     { code:"CD", currency:"CDF", capital:"Kinshasa",     operators:["Airtel Money","Orange Money","M-Pesa"],           gateway:"flutterwave", banks:["RawBank","Equity","TMB","UBA"] },
    "Nigeria":       { code:"NG", currency:"NGN", capital:"Abuja",        operators:["Opay","Palmpay","GTBank","MTN MoMo"],            gateway:"flutterwave", banks:["GTBank","Zenith","Access","UBA","First Bank"] },
    "Ghana":         { code:"GH", currency:"GHS", capital:"Accra",        operators:["MTN MoMo","Vodafone Cash","AirtelTigo Money"],    gateway:"flutterwave", banks:["GCB","Stanbic","Ecobank","Absa"] },
    "Kenya":         { code:"KE", currency:"KES", capital:"Nairobi",      operators:["M-Pesa","Airtel Money","T-Kash"],                gateway:"flutterwave", banks:["Equity","KCB","Co-op","NCBA","Absa"] },
    "Afrique du Sud":{ code:"ZA", currency:"ZAR", capital:"Pretoria",     operators:["MTN MoMo","Vodacom M-Pesa"],                     gateway:"flutterwave", banks:["FNB","Standard","Nedbank","Absa","Capitec"] },
    "Ouganda":       { code:"UG", currency:"UGX", capital:"Kampala",      operators:["MTN MoMo","Airtel Money"],                       gateway:"flutterwave", banks:["Stanbic","dfcu","Equity","Centenary"] },
    "Tanzanie":      { code:"TZ", currency:"TZS", capital:"Dodoma",       operators:["M-Pesa","Tigo Pesa","Airtel Money"],             gateway:"flutterwave", banks:["CRDB","NMB","Exim","Standard Chartered"] },
    "Rwanda":        { code:"RW", currency:"RWF", capital:"Kigali",       operators:["MTN MoMo","Airtel Money"],                       gateway:"flutterwave", banks:["BK","Equity","I&M","Cogebanque"] },
    "Bénin":         { code:"BJ", currency:"XOF", capital:"Cotonou",      operators:["MTN MoMo","Moov Money","Wave","Kkiapay"],        gateway:"kkiapay",     banks:["BOA","BIBE","Ecobank","UBA"] },
    "Togo":          { code:"TG", currency:"XOF", capital:"Lomé",         operators:["TMoney","Flooz","Wave"],                         gateway:"kkiapay",     banks:["BTCI","BOA","Ecobank","UTB"] },
    "Ethiopie":      { code:"ET", currency:"ETB", capital:"Addis-Abeba",  operators:["Telebirr","CBE Birr"],                           gateway:"flutterwave", banks:["CBE","Dashen","Awash","Abyssinia"] },
    "Egypte":        { code:"EG", currency:"EGP", capital:"Le Caire",     operators:["Vodafone Cash","Etisalat Cash","Orange Money"],  gateway:"flutterwave", banks:["CIB","NBE","QNB","HSBC Egypt"] },
    "Maroc":         { code:"MA", currency:"MAD", capital:"Rabat",        operators:["Maroc Telecom","Inwi Money"],                    gateway:"stripe",      banks:["Attijariwafa","BMCE","CIH","BMCI"] },
  },
  cities: ["Dakar","Abidjan","Lagos","Nairobi","Accra","Kinshasa","Douala","Bamako","Ouagadougou","Lomé","Cotonou","Kampala","Dar es Salaam","Addis-Abeba","Kigali","Libreville","Yaoundé","Conakry","Freetown","Monrovia","Niamey","Ndjamena","Bangui","Brazzaville"],
  firstNames: ["Amadou","Fatou","Kofi","Ngozi","Wanjiru","Cheikh","Mariama","Ibrahim","Ama","Oluwaseun","Kemi","Yaw","Aissatou","Moussa","Adjoa","Chioma","Kwame","Bineta","Emeka","Adama","Fanta","Seun","Akosua","Ibrahima"],
  lastNames:  ["Diallo","Ndiaye","Mensah","Okonkwo","Kamau","Ba","Touré","Sow","Asante","Adeyemi","Traoré","Coulibaly","Koné","Cissé","Ouédraogo","Mbaye","Gueye","Sarr","Bah","Konaté"],
};


const AfriPay = {
  detectGateway(country) {
    const data = AFRIDATA.countries[country];
    if (data) return data.gateway;
    // Fallback par timezone/langue navigateur
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.includes("Africa/Dakar") || tz.includes("Africa/Abidjan") || tz.includes("Africa/Bamako")) return "cinetpay";
    if (tz.includes("Africa/Lagos") || tz.includes("Africa/Nairobi") || tz.includes("Africa/Accra")) return "flutterwave";
    if (tz.includes("Africa/Porto-Novo") || tz.includes("Africa/Lome")) return "kkiapay";
    return "flutterwave"; // fallback universel
  },
  async pay({ amount, currency, country, name, email, phone, description, onSuccess, onError }) {
    const gateway = this.detectGateway(country);
    console.log(`AfriPay: routing ${amount} ${currency} via ${gateway} for ${country}`);
    await processPayment({ gateway, amount, currency, name, email, phone, description, onSuccess, onError });
  },
  formatAmount(amount, currency) {
    const symbols = { XOF:"FCFA", XAF:"FCFA", NGN:"₦", GHS:"GH₵", KES:"KSh", ZAR:"R", USD:"$", EUR:"€" };
    return `${new Intl.NumberFormat("fr-FR").format(amount)} ${symbols[currency] || currency}`;
  }
};



const AFRICAN_LANGUAGES = [
  { code:"fr",    name:"Français",       flag:"🇫🇷", hint:"Parlez en français",              bcp47:"fr-FR",  region:"Afrique francophone" },
  { code:"wo",    name:"Wolof",          flag:"🇸🇳", hint:"Waxal ci wolof",                  bcp47:"fr-SN",  region:"Sénégal, Gambie" },
  { code:"dyu",   name:"Dioula",         flag:"🇨🇮", hint:"A fo dioula kan",                 bcp47:"fr-CI",  region:"Côte d’Ivoire, Mali, Burkina" },
  { code:"ha",    name:"Hausa",          flag:"🇳🇬", hint:"Ku yi magana da Hausa",           bcp47:"ha",     region:"Nigeria, Niger, Ghana" },
  { code:"sw",    name:"Swahili",        flag:"🇰🇪", hint:"Sema kwa Kiswahili",              bcp47:"sw",     region:"Kenya, Tanzanie, Ouganda" },
  { code:"pcm",   name:"Pidgin English", flag:"🇳🇬", hint:"Tok Pidgin",                      bcp47:"en-NG",  region:"Nigeria, Cameroun, Ghana" },
  { code:"am",    name:"Amharique",      flag:"🇪🇹", hint:"በአማርኛ ይናገሩ",                    bcp47:"am-ET",  region:"Éthiopie, Érythrée" },
  { code:"yo",    name:"Yoruba",         flag:"🇳🇬", hint:"Sọ ede Yorùbá",                  bcp47:"yo",     region:"Nigeria, Bénin, Togo" },
  { code:"tw",    name:"Twi",            flag:"🇬🇭", hint:"Kasa Twi so",                     bcp47:"ak-GH",  region:"Ghana, Côte d’Ivoire" },
  { code:"en",    name:"English",        flag:"🇬🇧", hint:"Speak in English",                bcp47:"en-GB",  region:"Pan-African" },
];

// Exemples de prompts par langue pour l’aide contextuelle
const VOICE_EXAMPLES = {
  fr:  "Crée une application de gestion de boutique avec paiement Mobile Money",
  wo:  "Dëkk sa app bi ci suukër bi ak Mobile Money",
  dyu: "Ka app dɔ ka sènè dugu kɔnɔ",
  ha:  "Ƙirƙiri app don sarrafa kantin da Mobile Money",
  sw:  "Unda programu ya duka na malipo ya Mobile Money",
  pcm: "Make app for shop wey go take Mobile Money payment",
  am:  "ሱቅ ለማስተዳደር አፕ ፍጠር",
  yo:  "Ṣẹda app fun ile-itaja pẹlu Mobile Money",
  tw:  "Yɛ app wɔ adetɔ ɛdan ho a Mobile Money wɔ mu",
  en:  "Create a shop management app with Mobile Money payment",
};


// Traduction du prompt vocal vers français via Claude
async function translateVoicePrompt(text, sourceLang) {
  if (sourceLang === "fr" || sourceLang === "en") return text;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `Traduis ce texte en français. Langue source: ${sourceLang}. Texte: "${text}"
Réponds UNIQUEMENT avec la traduction en français, rien d’autre.`
        }]
      })
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || text;
  } catch { return text; }
}

// Hook : reconnaissance vocale Web Speech API
function useVoiceRecognition({ onResult, onError, lang }) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const start = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { onError?.("Ton navigateur ne supporte pas la reconnaissance vocale. Utilise Chrome."); return; }
    const rec = new SpeechRecognition();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.onstart = () => setListening(true);
    rec.onend = () => { setListening(false); setInterim(""); };
    rec.onerror = e => { setListening(false); onError?.(e.error); };
    rec.onresult = e => {
      let final = "", inter = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else inter += e.results[i][0].transcript;
      }
      setInterim(inter);
      if (final) { onResult?.(final.trim()); setInterim(""); }
    };
    recRef.current = rec;
    rec.start();
  }, [lang, onResult, onError]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  return { listening, interim, start, stop };
}

// Synthèse vocale (TTS) — lit le résultat à voix haute
function speak(text, lang = "fr-FR") {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = lang;
  utt.rate = 0.9;
  utt.pitch = 1;
  window.speechSynthesis.speak(utt);
}



const AI_MODELS = [
  { id:"fast",     name:"Rapide",   model:"claude-haiku-4-5-20251001", icon:"⚡", desc:"Génération rapide",        minPlan:"free" },
  { id:"balanced", name:"Avancé",   model:"claude-sonnet-4-20250514",  icon:"🧠", desc:"Le meilleur équilibre",   minPlan:"starter" },
  { id:"power",    name:"Puissant", model:"claude-opus-4-20250514",    icon:"🚀", desc:"Pour les projets complexes", minPlan:"business" },
];
// Ordre des plans pour savoir si un modèle est débloqué
const PLAN_RANK = { free:0, starter:1, pro:2, business:3 };

async function callAI(model, systemPrompt, userPrompt, maxTokens = 7000) {
  // model = identifiant Anthropic réel (selon le plan : Haiku/Sonnet/Opus). Défaut Sonnet.
  const chosenModel = (typeof model === "string" && model.startsWith("claude-")) ? model : MODEL;
  // Si le backend est configuré : on passe par lui (clé API protégée côté serveur).
  if (backend.enabled()) {
    const parsed = await backend.post("/api/generate", { prompt: userPrompt, systemPrompt, maxTokens, model: chosenModel });
    return JSON.stringify(parsed); // generate() reparsera le JSON
  }
  // Mode démo : appel direct (clé gérée par l’environnement claude.ai)
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: chosenModel, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.map(b => b.text || "").join("") || "";
}


async function generateBrand(appTitle, description) {
  try {
    const raw = await callAI(
      "claude",
      `Tu génères des identités visuelles professionnelles pour des startups africaines.
Réponds UNIQUEMENT avec du JSON valide:
{
  "primaryColor": "#hexcode",
  "secondaryColor": "#hexcode",
  "accentColor": "#hexcode",
  "bgColor": "#hexcode",
  "fontFamily": "nom de police",
  "slogan": "slogan court et percutant",
  "logoSvg": "...SVG complet en une ligne...",
  "faviconEmoji": "emoji représentatif"
}
Règles: couleurs harmonieuses professionnelles, logo SVG simple et mémorable, slogan en français africain.`,
      `App: ${appTitle}. Description: ${description}`
    );
    const clean = raw.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
    return JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0] || clean);
  } catch { return null; }
}


const FULLSTACK_SYSTEM_PROMPT = `Tu es un architecte full-stack senior. Tu génères des applications complètes.

RÈGLE ABSOLUE: JSON uniquement. Zéro texte. Zéro backtick.

FORMAT:
{
  "title": "Nom de l’app",
  "description": "Description",
  "tagline": "Slogan",
  "features": ["f1","f2","f3","f4","f5"],
  "stack": ["React","Node.js","PostgreSQL","Supabase"],
  "africanContext": "Impact africain",
  "agentLogs": {"planner":"...","architect":"...","frontend":"...","backend":"...","qa":"..."},
  "frontend": "...CODE JSX REACT COMPLET... export default App",
  "backend": "// backend/server.js\nconst express = require('express');\n...CODE NODE.JS COMPLET...",
  "schema": "-- schema.sql\nCREATE TABLE...\n...",
  "envExample": "SUPABASE_URL=\nSUPABASE_KEY=\nJWT_SECRET=\nPORT=3001",
  "apiDocs": "# API Documentation\n## Endpoints:\n..."
}

RÈGLES FRONTEND: JSX valide, export default App, styles inline, min 3 vues, données africaines denses.
RÈGLES BACKEND: Express.js complet avec routes CRUD, auth JWT, middleware CORS, gestion erreurs.
RÈGLES SCHEMA: PostgreSQL valide avec UUID, timestamps, Row Level Security, indexes.
RÈGLES DONNÉES: Prénoms africains, villes africaines, monnaies locales (FCFA, ₦, KSh).`;


const MOBILE_SYSTEM_PROMPT = `Tu génères des applications React Native / Expo complètes pour l’Afrique.

RÈGLE ABSOLUE: JSON uniquement. Zéro texte. Zéro backtick.

FORMAT:
{
  "title": "Nom de l’app",
  "description": "Description",
  "tagline": "Slogan",
  "features": ["f1","f2","f3"],
  "stack": ["React Native","Expo","AsyncStorage"],
  "africanContext": "Impact africain",
  "agentLogs": {"planner":"...","architect":"...","frontend":"...","backend":"...","qa":"..."},
  "code": "...CODE REACT NATIVE EXPO COMPLET...",
  "appJson": {"name":"...","slug":"...","version":"1.0.0","platforms":["ios","android"]},
  "packageJson": {"dependencies":{"expo":"~49.0.0","react-native":"0.72.0"}}
}

RÈGLES CODE RN: StyleSheet API, FlatList, TouchableOpacity, AsyncStorage, SafeAreaView.
Design mobile-first: padding safe areas, tailles tactiles min 44px.
Données africaines réalistes. Min 3 écrans avec navigation Stack.`;


const MARKETPLACE_AGENTS = [
  { id:"pos",         icon:"🏪", name:"Agent POS",           category:"Commerce",  price:0,      description:"Système de caisse complet avec inventaire, Mobile Money, rapports", creator:"AfriBuild", downloads:1240, rating:4.9, color:"#2563eb",
    systemPrompt:"Tu génères des systèmes POS professionnels pour l’Afrique: catalogue produits, caisse, paiement Mobile Money (MTN/Orange/Wave), tickets, rapports. Design style Square POS." },
  { id:"school",      icon:"📚", name:"Agent École",          category:"Éducation", price:0,      description:"ERP scolaire: élèves, notes, emploi du temps, paiements scolarité", creator:"AfriBuild", downloads:892,  rating:4.8, color:"#7c3aed",
    systemPrompt:"Tu génères des ERP scolaires pour l’Afrique: gestion élèves, bulletins notes, emploi du temps, paiements FCFA, communication parents. Style PowerSchool." },
  { id:"hospital",    icon:"🏥", name:"Agent Hôpital",        category:"Santé",     price:0,      description:"Dossiers médicaux, consultations, prescriptions, statistiques santé", creator:"AfriBuild", downloads:654,  rating:4.7, color:"#ef4444",
    systemPrompt:"Tu génères des systèmes de gestion hospitalière: patients, consultations, prescriptions, facturation, stats. Style Doctolib. Noms africains dans les données." },
  { id:"tontine",     icon:"💸", name:"Agent Tontine",        category:"Fintech",   price:0,      description:"Gestion tontine/njangi: membres, tours, paiements FCFA, historique", creator:"AfriBuild", downloads:2103, rating:5.0, color:"#f59e0b",
    systemPrompt:"Tu génères des apps de tontine (njangi/likelemba): membres africains, calendrier tours, paiements FCFA, historique, dashboard. Design fintech sombre style Cash App." },
  { id:"microfinance",icon:"🏦", name:"Agent Microfinance",   category:"Fintech",   price:5000,   description:"Gestion prêts, remboursements, épargne, clients, portefeuille", creator:"AfriBuild", downloads:445,  rating:4.6, color:"#10b981",
    systemPrompt:"Tu génères des systèmes de microfinance africaine: clients, demandes prêts, remboursements, épargne, tableau de bord portefeuille. Montants FCFA." },
  { id:"ecommerce",   icon:"🛒", name:"Agent E-commerce",     category:"Commerce",  price:0,      description:"Marketplace africaine: produits, panier, commandes, Mobile Money", creator:"AfriBuild", downloads:1567, rating:4.8, color:"#f97316",
    systemPrompt:"Tu génères des plateformes e-commerce africaines style Jumia: catalogue, panier, commandes, paiement Mobile Money, vendeurs, livraison. Design professionnel." },
  { id:"immo",        icon:"🏠", name:"Agent Immobilier",     category:"Services",  price:0,      description:"Annonces immobilières africaines: location, vente, agents, recherche", creator:"AfriBuild", downloads:789,  rating:4.7, color:"#0891b2",
    systemPrompt:"Tu génères des plateformes immobilières pour l’Afrique: annonces location/vente, filtres, page détail, contact agent. Style Seloger. Villes africaines." },
  { id:"transport",   icon:"🚌", name:"Agent Transport",      category:"Mobilité",  price:0,      description:"Réservation bus inter-villes: trajets, sièges, Mobile Money, billet", creator:"AfriBuild", downloads:934,  rating:4.9, color:"#ea580c",
    systemPrompt:"Tu génères des apps de réservation transport inter-villes africaines: trajets (Dakar-Lagos etc.), sièges, prix FCFA, paiement Mobile Money, billet numérique." },
  { id:"restaurant",  icon:"🍽️", name:"Agent Restaurant",    category:"Food",      price:0,      description:"Menu, commandes, livraison, cuisine en temps réel, paiement Mobile Money", creator:"AfriBuild", downloads:1102, rating:4.8, color:"#dc2626",
    systemPrompt:"Tu génères des apps restaurant style Uber Eats pour cuisine africaine: menu (thiéboudienne, ndolé, jollof), commandes, livraison, Mobile Money." },
  { id:"agri",        icon:"🌾", name:"Agent Agriculture",    category:"Agriculture",price:0,     description:"Marketplace agricole: produits, prix marché, vendeurs, acheteurs", creator:"AfriBuild", downloads:678,  rating:4.6, color:"#16a34a",
    systemPrompt:"Tu génères des marketplaces agricoles pour l’Afrique: produits (mil, igname, cacao), prix FCFA, vendeurs par région, commandes. Style Jumia Agriculture." },
  { id:"hotel",       icon:"🏨", name:"Agent Hôtel",          category:"Tourisme",  price:5000,   description:"Réservation chambres, check-in/out, services, paiement Mobile Money", creator:"AfriBuild", downloads:312,  rating:4.5, color:"#0ea5e9",
    systemPrompt:"Tu génères des systèmes hôteliers pour l’Afrique: réservation chambres, check-in/out, services, paiement Mobile Money. Design élégant." },
  { id:"rh",          icon:"👥", name:"Agent RH",             category:"Entreprise",price:5000,   description:"Gestion employés, paie, congés, évaluations, organigramme", creator:"AfriBuild", downloads:445,  rating:4.7, color:"#6366f1",
    systemPrompt:"Tu génères des systèmes RH pour entreprises africaines: employés, paie FCFA, congés, évaluations, organigramme. Design professionnel." },
  { id:"pharma",      icon:"💊", name:"Agent Pharmacie",      category:"Santé",     price:5000,   description:"Gestion médicaments, ordonnances, stock, ventes, alertes rupture", creator:"AfriBuild", downloads:267,  rating:4.6, color:"#10b981",
    systemPrompt:"Tu génères des systèmes de gestion pharmacie: stock médicaments, ordonnances, ventes, alertes rupture, historique. Design médical propre." },
  { id:"election",    icon:"🗳️", name:"Agent Vote/Sondage",  category:"Civic",     price:0,      description:"Sondages, votes communautaires, résultats en temps réel", creator:"AfriBuild", downloads:156,  rating:4.4, color:"#f59e0b",
    systemPrompt:"Tu génères des apps de vote et sondages communautaires: questions, options, résultats temps réel, graphiques. Design civique neutre." },
  { id:"event",       icon:"🎪", name:"Agent Événements",     category:"Loisirs",   price:0,      description:"Billetterie, programme, speakers, inscription, QR tickets", creator:"AfriBuild", downloads:523,  rating:4.7, color:"#e879f9",
    systemPrompt:"Tu génères des apps de gestion d’événements africains: billetterie, programme, speakers, inscriptions, QR codes. Design moderne et coloré." },
  { id:"crm",         icon:"📊", name:"Agent CRM",            category:"Entreprise",price:10000,  description:"Clients, prospects, pipeline ventes, factures, historique", creator:"AfriBuild", downloads:389,  rating:4.8, color:"#2563eb",
    systemPrompt:"Tu génères des CRM pour PME africaines: clients, prospects, pipeline, factures FCFA, historique interactions. Style Pipedrive adapté Afrique." },
  { id:"delivery",    icon:"📦", name:"Agent Livraison",      category:"Logistique",price:5000,   description:"Suivi colis, livreurs, zones, status, notification client", creator:"AfriBuild", downloads:612,  rating:4.6, color:"#f97316",
    systemPrompt:"Tu génères des apps de livraison urbaine africaine: commandes, livreurs, zones, statuts en temps réel, notifications. Style Glovo Afrique." },
  { id:"church",      icon:"⛪", name:"Agent Église/Mosquée", category:"Religion",  price:0,      description:"Membres, événements, offrandes, annonces, planning", creator:"AfriBuild", downloads:834,  rating:4.8, color:"#7c3aed",
    systemPrompt:"Tu génères des apps de gestion pour lieux de culte africains: membres, événements, offrandes, annonces, planning. Design sobre et respectueux." },
  { id:"parking",     icon:"🅿️", name:"Agent Parking",        category:"Mobilité",  price:5000,   description:"Gestion places, réservations, paiement Mobile Money, accès", creator:"AfriBuild", downloads:178,  rating:4.5, color:"#475569",
    systemPrompt:"Tu génères des systèmes de gestion parking: places disponibles, réservations, paiement Mobile Money, historique. Design clair et fonctionnel." },
  { id:"water",       icon:"💧", name:"Agent Eau/Électricité", category:"Utilities", price:0,      description:"Relevé compteurs, facturation, paiement Mobile Money, réclamations", creator:"AfriBuild", downloads:445,  rating:4.7, color:"#0ea5e9",
    systemPrompt:"Tu génères des apps de gestion utilities pour l’Afrique: relevés compteurs, facturation FCFA, paiement Mobile Money, réclamations. Design utilitaire." },
];;


// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat("fr-FR").format(n);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);
const ls = {
  get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}},
  del:k=>{try{localStorage.removeItem(k)}catch{}}
};

// ─── SUPABASE (léger) ────────────────────────────────────────────────────────
const sb = {
  async signUp(email,password){try{const r=await fetch(`${SUPABASE_URL}/auth/v1/signup`,{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password})});return await r.json()}catch{return{error:{message:"Erreur réseau"}}}},
  async signIn(email,password){try{const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password})});return await r.json()}catch{return{error:{message:"Erreur réseau"}}}},
};

// ─── VERCEL DEPLOY ───────────────────────────────────────────────────────────
async function deployToVercel(title, code){
  // Si backend configuré : déploiement réel via le serveur
  if (backend.enabled()) {
    const r = await backend.post("/api/infra/deploy", { title, code });
    return { url: r.url, id: r.id };
  }
  const appName = title.toLowerCase().replace(/[^a-z0-9]/g,"-").slice(0,28)+"-"+uid();
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>`+
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></scr`+`ipt>`+
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></scr`+`ipt>`+
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js"></scr`+`ipt>`+
    `<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}</style></head><body><div id="root"></div>`+
    `<script type="text/babel">const {useState,useEffect,useRef,useCallback,useMemo}=React;${code.replace(/export\s+default\s+App\s*;?/g,"").replace(/import\s+.*?from\s+['"][^'"]*['"]\s*;?/g,"")}\nReactDOM.render(React.createElement(App),document.getElementById('root'));</scr`+`ipt></body></html>`;
  try{
    const res=await fetch("https://api.vercel.com/v13/deployments",{method:"POST",headers:{"Authorization":`Bearer ${VERCEL_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({name:appName,files:[{file:"index.html",data:html}],projectSettings:{framework:null},target:"production"})});
    const data=await res.json();
    if(data.url) return {url:`https://${data.url}`,id:data.id};
    throw new Error(data.error?.message||"Déploiement échoué");
  }catch(e){throw new Error(e.message)}
}

// ─── SYSTEM PROMPT (frontend) ────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un développeur React senior de classe mondiale (niveau Stripe, Linear, Vercel).
Tu génères des applications web indistinguables d’une vraie équipe design+dev senior.

AFRIDATA disponible: Pays ${Object.keys(AFRIDATA.countries).join(", ")}. Prénoms ${AFRIDATA.firstNames.slice(0,10).join(", ")}. Noms ${AFRIDATA.lastNames.slice(0,8).join(", ")}.

LOI: JSON uniquement, zéro texte, zéro backtick.
FORMAT: {"title","description","tagline","features":["..."],"stack":["..."],"africanContext","agentLogs":{"planner","design","frontend","backend","qa"},"code":"...JSX export default App"}

INTERDITS (signes d’IA): emojis dans titres, dégradés criards, border-radius>14px sur boutons, ombres énormes, données "Item 1", paddings aléatoires, +4 couleurs.
OBLIGATOIRES (dev senior): sidebar navigation réelle, typo -apple-system hiérarchisée (28/20/15/13px), espacement multiples de 4px, données denses (10-15 entrées, vrais noms africains), palette limitée (1 primaire + grays), tables zebra + hover, formulaires avec focus states, monnaie formatée (1 450 000 FCFA), min 3 vues navigables.
PALETTES: Fintech #0F172A+#22C55E | Santé #FFF+#0EA5E9 | Éducation #FFF+#7C3AED | Transport #FFF+#EA580C | Restaurant #1C1917+#EF4444 | Immobilier #FFF+#0891B2.`;


// ═══════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════
function Icon({ name, size=18, color="currentColor", stroke=1.8 }) {
  const p = {
    spark:"M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z",
    folder:"M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    card:"M2 7h20M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M6 15h4",
    mic:"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3",
    grid:"M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
    rocket:"M5 13l-2 4 4-2m9-13s4 0 6 2-2 6-2 6l-5 5-6-6 5-5z M9 15l-3 3",
    code:"M8 8l-4 4 4 4 M16 8l4 4-4 4 M14 4l-4 16",
    download:"M12 3v12m0 0l-4-4m4 4l4-4 M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
    wand:"M15 4V2m0 8v-2m-4 0H9m12 0h-2M3 21l9-9m0 0l2-2 4 4-2 2m-4-4l4 4",
    share:"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v14",
    chat:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    check:"M20 6L9 17l-5-5",
    chevron:"M9 18l6-6-6-6",
    x:"M18 6L6 18M6 6l12 12",
    plus:"M12 5v14m-7-7h14",
    search:"M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    logout:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
    layers:"M12 2l9 5-9 5-9-5 9-5z M3 12l9 5 9-5 M3 17l9 5 9-5",
    bolt:"M13 2L4.5 12.5h6L9 22l8.5-10.5h-6z",
    globe:"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  }[name] || "";
  const fill = ["spark","bolt"].includes(name);
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill?color:"none"} stroke={fill?"none":color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{p.split(" M").map((d,i)=><path key={i} d={i===0?d:"M"+d}/>)}</svg>;
}

function Avatar({ name, size=32 }) {
  const init = (name||"?")[0].toUpperCase();
  const colors = ["#4F46E5","#E8B23A","#16A34A","#0EA5E9","#8B5CF6","#DC2626"];
  const c = colors[(name||"").charCodeAt(0) % colors.length] || colors[0];
  return <div style={{width:size,height:size,borderRadius:size*0.32,background:`linear-gradient(135deg,${c},${c}CC)`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:size*0.42,flexShrink:0,fontFamily:FONT_DISPLAY}}>{init}</div>;
}

function Badge({ children, color=T.indigo, soft }) {
  return <span style={{padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:600,letterSpacing:"0.01em",background:soft||color+"15",color,border:`1px solid ${color}28`}}>{children}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH SCREEN — premium split hero
// ═══════════════════════════════════════════════════════════════════════════
function AuthScreen({ onAuth }) {
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [name,setName]=useState("");
  const [loading,setLoading]=useState(false); const [error,setError]=useState("");
  const isWide = useWide();

  const inp = {width:"100%",padding:"12px 14px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,fontSize:14,color:T.ink,outline:"none",fontFamily:FONT,transition:"border-color .15s, box-shadow .15s"};
  const focusOn = e=>{e.target.style.borderColor=T.indigo;e.target.style.boxShadow=`0 0 0 4px ${T.indigoSoft}`};
  const focusOff = e=>{e.target.style.borderColor=T.line;e.target.style.boxShadow="none"};

  const submit = async () => {
    if(!email||!password){setError("Renseigne ton email et ton mot de passe.");return;}
    setLoading(true);setError("");
    const fn = mode==="register"?sb.signUp:sb.signIn;
    const res = await fn(email,password);
    if(res.error){setError(res.error.message||"Identifiants incorrects.");setLoading(false);return;}
    onAuth({id:res.user?.id||uid(),email,name:name||email.split("@")[0],token:res.access_token,plan:"free",credits:5,projects:[]});
    setLoading(false);
  };
  const demo = () => onAuth({id:"demo-"+uid(),email:"demo@afribuild.ai",name:"Invité",token:null,plan:"pro",credits:50,projects:[],isDemo:true});

  return (
    <div style={{minHeight:"100vh",display:"flex",fontFamily:FONT,background:T.surface}}>
      {/* Hero */}
      {isWide && (
        <div style={{flex:1,position:"relative",background:T.bg,overflow:"hidden",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"56px 56px 48px"}}>
          {/* ambient grid */}
          <div style={{position:"absolute",inset:0,backgroundImage:`radial-gradient(${T.gold}22 1px, transparent 1px)`,backgroundSize:"32px 32px",opacity:0.4}}/>
          <div style={{position:"absolute",top:"-15%",right:"-10%",width:480,height:480,borderRadius:"50%",background:`radial-gradient(circle,${T.indigo}40,transparent 70%)`,filter:"blur(20px)"}}/>
          <div style={{position:"absolute",bottom:"-20%",left:"-5%",width:420,height:420,borderRadius:"50%",background:`radial-gradient(circle,${T.gold}28,transparent 70%)`,filter:"blur(20px)"}}/>
          <div style={{position:"relative",display:"flex",alignItems:"center",gap:12}}>
            <Logo size={44}/>
            <div>
              <div style={{fontSize:20,fontWeight:800,color:"#fff",fontFamily:FONT_DISPLAY,letterSpacing:"-0.02em"}}>AfriBuild</div>
              <div style={{fontSize:11,color:T.navInkSoft,letterSpacing:"0.18em",textTransform:"uppercase"}}>AI App Studio</div>
            </div>
          </div>
          <div style={{position:"relative",maxWidth:480}}>
            <div style={{fontSize:46,fontWeight:800,color:"#fff",lineHeight:1.08,letterSpacing:"-0.035em",fontFamily:FONT_DISPLAY,marginBottom:22}}>
              Des applications<br/>africaines, <span style={{color:T.gold}}>conçues</span><br/>en quelques secondes.
            </div>
            <div style={{fontSize:16,color:T.navInk,lineHeight:1.7,marginBottom:36,maxWidth:420}}>
              Décris ton idée. Cinq agents IA conçoivent une application professionnelle — frontend, backend, paiement Mobile Money et déploiement en un clic.
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {[["Génération en 30 secondes","Du prompt à l’app fonctionnelle"],["Paiement panafricain","CinetPay · Flutterwave · MTN · Orange · Wave"],["Déploiement instantané","URL publique en un clic"]].map(([t,d],i)=>(
                <div key={i} style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                  <div style={{width:34,height:34,borderRadius:10,background:T.navActive,border:`1px solid ${T.navLine}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:T.gold}}><Icon name={["bolt","card","rocket"][i]} size={16}/></div>
                  <div><div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{t}</div><div style={{fontSize:13,color:T.navInkSoft,marginTop:1}}>{d}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{position:"relative",fontSize:12,color:T.navInkSoft}}>Propulsé par Claude · Conçu en Afrique</div>
        </div>
      )}
      {/* Form */}
      <div style={{width:isWide?500:"100%",display:"flex",flexDirection:"column",justifyContent:"center",padding:isWide?"48px 56px":"32px 24px",background:T.surface}}>
        <div style={{width:"100%",maxWidth:380,margin:"0 auto"}}>
          {!isWide && <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:32}}><Logo size={38} dark/><span style={{fontSize:18,fontWeight:800,fontFamily:FONT_DISPLAY,color:T.ink}}>AfriBuild</span></div>}
          <div style={{fontSize:26,fontWeight:800,color:T.ink,letterSpacing:"-0.03em",fontFamily:FONT_DISPLAY,marginBottom:6}}>{mode==="login"?"Content de te revoir":"Crée ton compte"}</div>
          <div style={{fontSize:14,color:T.inkSoft,marginBottom:28}}>{mode==="login"?"Connecte-toi pour continuer à construire.":"Commence gratuitement, sans carte bancaire."}</div>
          <button onClick={demo} style={{width:"100%",padding:"12px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,fontSize:14,fontWeight:600,color:T.ink,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:18,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background=T.surface}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg>
            Continuer avec Google
          </button>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}><div style={{flex:1,height:1,background:T.line}}/><span style={{fontSize:12,color:T.inkFaint}}>ou</span><div style={{flex:1,height:1,background:T.line}}/></div>
          <div style={{display:"flex",flexDirection:"column",gap:13,marginBottom:18}}>
            {mode==="register" && <div><label style={{fontSize:12.5,fontWeight:600,color:T.inkSoft,display:"block",marginBottom:6}}>Nom complet</label><input placeholder="Amadou Diallo" value={name} onChange={e=>setName(e.target.value)} style={inp} onFocus={focusOn} onBlur={focusOff}/></div>}
            <div><label style={{fontSize:12.5,fontWeight:600,color:T.inkSoft,display:"block",marginBottom:6}}>Email</label><input type="email" placeholder="amadou@exemple.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} style={inp} onFocus={focusOn} onBlur={focusOff}/></div>
            <div><label style={{fontSize:12.5,fontWeight:600,color:T.inkSoft,display:"block",marginBottom:6}}>Mot de passe</label><input type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} style={inp} onFocus={focusOn} onBlur={focusOff}/></div>
          </div>
          {error && <div style={{padding:"10px 13px",background:T.redSoft,border:`1px solid ${T.red}33`,borderRadius:10,fontSize:13,color:T.red,marginBottom:14}}>{error}</div>}
          <button onClick={submit} disabled={loading} style={{width:"100%",padding:"13px",background:loading?T.inkFaint:T.ink,color:"#fff",border:"none",borderRadius:11,fontSize:14.5,fontWeight:700,cursor:loading?"not-allowed":"pointer",transition:"transform .1s, background .15s",marginBottom:18,fontFamily:FONT_DISPLAY}} onMouseDown={e=>!loading&&(e.currentTarget.style.transform="scale(0.985)")} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
            {loading?"Connexion…":mode==="login"?"Se connecter":"Créer mon compte"}
          </button>
          <div style={{textAlign:"center",fontSize:13.5,color:T.inkSoft}}>{mode==="login"?"Pas encore de compte ?":"Déjà inscrit ?"}{" "}<button onClick={()=>{setMode(mode==="login"?"register":"login");setError("")}} style={{background:"none",border:"none",color:T.indigo,cursor:"pointer",fontSize:13.5,fontWeight:700}}>{mode==="login"?"Créer un compte":"Se connecter"}</button></div>
          <div style={{textAlign:"center",marginTop:14}}><button onClick={demo} style={{background:"none",border:"none",color:T.inkFaint,cursor:"pointer",fontSize:12.5,textDecoration:"underline",textUnderlineOffset:3}}>Continuer en mode démo</button></div>
        </div>
      </div>
    </div>
  );
}

function Logo({ size=40, dark }) {
  return (
    <div style={{width:size,height:size,borderRadius:size*0.28,background:dark?T.ink:`linear-gradient(140deg,${T.indigo},${T.indigoDeep})`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",flexShrink:0,boxShadow:dark?"none":`0 6px 20px ${T.indigo}44`}}>
      <div style={{position:"absolute",width:size*0.5,height:size*0.5,borderRadius:"50%",border:`${size*0.06}px solid ${T.gold}`,top:size*0.18,left:size*0.18}}/>
      <div style={{position:"absolute",width:size*0.18,height:size*0.18,borderRadius:"50%",background:T.gold,top:size*0.34,left:size*0.34}}/>
    </div>
  );
}

// responsive hook
function useWide(bp=900){
  const [w,setW]=useState(typeof window!=="undefined"?window.innerWidth>=bp:true);
  useEffect(()=>{const f=()=>setW(window.innerWidth>=bp);window.addEventListener("resize",f);return()=>window.removeEventListener("resize",f)},[bp]);
  return w;
}


// ═══════════════════════════════════════════════════════════════════════════
// LIVE PREVIEW
// ═══════════════════════════════════════════════════════════════════════════
function LivePreview({ code, onError }) {
  const ref = useRef(null);
  const [ready,setReady] = useState(false);
  useEffect(()=>{
    if(!code||!ref.current) return;
    setReady(false);
    const c = code.replace(/export\s+default\s+App\s*;?/g,"").replace(/import\s+.*?from\s+['"][^'"]*['"]\s*;?/g,"");
    const html=`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>`+
    `<scr`+`ipt src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.development.js"></scr`+`ipt>`+
    `<scr`+`ipt src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.development.js"></scr`+`ipt>`+
    `<scr`+`ipt src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js"></scr`+`ipt>`+
    `<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff}::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}</style>`+
    `<scr`+`ipt>window.onerror=function(m){window.parent.postMessage({type:'PREVIEW_ERROR',message:m},'*');return true}</scr`+`ipt>`+
    `</head><body><div id="root" style="height:100%"></div>`+
    `<scr`+`ipt type="text/babel">const {useState,useEffect,useRef,useCallback,useMemo,useReducer}=React;${c}\ntry{ReactDOM.render(React.createElement(App),document.getElementById('root'))}catch(e){window.parent.postMessage({type:'PREVIEW_ERROR',message:e.message},'*');document.getElementById('root').innerHTML='<div style=\"padding:24px;color:#dc2626;font-family:monospace;font-size:13px;white-space:pre-wrap\">'+e.message+'</div>'}</scr`+`ipt></body></html>`;
    const blob=new Blob([html],{type:"text/html"}); const url=URL.createObjectURL(blob);
    ref.current.onload=()=>setReady(true); ref.current.src=url;
    return ()=>URL.revokeObjectURL(url);
  },[code]);
  useEffect(()=>{const h=e=>{if(e.data?.type==="PREVIEW_ERROR")onError?.(e.data.message)};window.addEventListener("message",h);return ()=>window.removeEventListener("message",h)},[onError]);
  return (
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      {!ready && <div style={{position:"absolute",inset:0,background:T.surfaceAlt,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,zIndex:5}}>
        <div style={{width:38,height:38,border:`2.5px solid ${T.line}`,borderTopColor:T.indigo,borderRadius:"50%",animation:"abspin .8s linear infinite"}}/>
        <div style={{color:T.inkFaint,fontSize:13,fontWeight:500}}>Rendu de l’application…</div>
      </div>}
      <iframe ref={ref} title="preview" sandbox="allow-scripts allow-same-origin allow-forms" style={{width:"100%",height:"100%",border:"none",opacity:ready?1:0,transition:"opacity .35s"}}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CODE VIEWER
// ═══════════════════════════════════════════════════════════════════════════
function CodeViewer({ code, fileName }) {
  const [copied,setCopied]=useState(false);
  const copy=()=>{navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),1800)};
  const lines = code.split("\n");
  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"#0C0F1A"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",background:"#11151F",borderBottom:"1px solid #1C2233",flexShrink:0}}>
        <div style={{display:"flex",gap:7,alignItems:"center"}}>
          {["#FF5F57","#FEBC2E","#28C840"].map(c=><div key={c} style={{width:11,height:11,borderRadius:"50%",background:c}}/>)}
          <span style={{marginLeft:10,color:"#6B7488",fontSize:12,fontFamily:FONT_MONO}}>{fileName} · {lines.length} lignes</span>
        </div>
        <button onClick={copy} style={{background:copied?T.green:"#1C2233",color:copied?"#fff":"#9AA3B8",border:`1px solid ${copied?T.green:"#2A3147"}`,borderRadius:8,padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .15s",display:"flex",alignItems:"center",gap:6}}>
          {copied?<><Icon name="check" size={13}/>Copié</>:"Copier"}
        </button>
      </div>
      <div style={{flex:1,overflow:"auto",display:"flex"}}>
        <div style={{padding:"16px 0",background:"#0C0F1A",borderRight:"1px solid #1C2233",userSelect:"none",flexShrink:0}}>
          {lines.map((_,i)=><div key={i} style={{padding:"0 16px 0 14px",fontSize:12.5,lineHeight:"22px",color:"#3A4254",fontFamily:FONT_MONO,textAlign:"right",minWidth:50}}>{i+1}</div>)}
        </div>
        <pre style={{flex:1,margin:0,padding:"16px 20px",color:"#D8DEE9",fontSize:12.5,fontFamily:FONT_MONO,lineHeight:"22px",overflow:"auto",tabSize:2}}>{code}</pre>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT PIPELINE
// ═══════════════════════════════════════════════════════════════════════════
function AgentPanel({ logs, active }) {
  return (
    <div style={{padding:16,display:"flex",flexDirection:"column",gap:9,overflow:"auto",height:"100%"}}>
      <div style={{fontSize:11,fontWeight:700,color:T.inkFaint,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Pipeline de génération</div>
      {AGENTS.map((a,idx)=>{
        const isActive=active.includes(a.id); const isDone=logs?.[a.id];
        return (
          <div key={a.id} style={{background:isDone?T.greenSoft:isActive?T.indigoSoft:T.surfaceAlt,border:`1px solid ${isDone?T.green+"33":isActive?T.indigo+"33":T.line}`,borderRadius:12,padding:"13px 15px",transition:"all .35s"}}>
            <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:isDone?9:0}}>
              <div style={{width:30,height:30,borderRadius:9,background:isDone?T.green+"1F":isActive?T.indigo+"1F":T.line,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",flexShrink:0,fontFamily:FONT_DISPLAY,fontWeight:800,fontSize:13,color:isDone?T.green:isActive?T.indigo:T.inkFaint}}>
                {idx+1}
                {isActive&&<div style={{position:"absolute",inset:-3,borderRadius:11,border:`2px solid ${a.color}`,borderTopColor:"transparent",animation:"abspin 1s linear infinite"}}/>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13.5,fontWeight:700,color:isDone?T.green:isActive?T.ink:T.inkFaint}}>{a.label}</div>
                <div style={{fontSize:11.5,color:isDone?T.green:isActive?T.inkSoft:T.inkFaint}}>{isDone?"Terminé":isActive?"En cours…":"En attente"}</div>
              </div>
              {isDone&&<div style={{color:T.green}}><Icon name="check" size={17}/></div>}
            </div>
            {isDone&&logs[a.id]&&<div style={{fontSize:12,color:T.green,background:"#fff",borderRadius:8,padding:"9px 11px",lineHeight:1.6,border:`1px solid ${T.green}22`}}>{logs[a.id]}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE BUTTON
// ═══════════════════════════════════════════════════════════════════════════
function VoiceButton({ onTranscript, onTranslating, currentLang, onLangChange, compact }) {
  const [showPicker,setShowPicker]=useState(false);
  const [translating,setTranslating]=useState(false);
  const [voiceError,setVoiceError]=useState("");
  const lang = AFRICAN_LANGUAGES.find(l=>l.code===currentLang)||AFRICAN_LANGUAGES[0];
  const { listening, interim, start, stop } = useVoiceRecognition({
    lang:lang.bcp47,
    onResult: async (text)=>{
      if(currentLang!=="fr"&&currentLang!=="en"){setTranslating(true);onTranslating?.(true);const tr=await translateVoicePrompt(text,currentLang);setTranslating(false);onTranslating?.(false);onTranscript?.(tr,text,currentLang);}
      else onTranscript?.(text,text,currentLang);
    },
    onError:(e)=>{setVoiceError(e==="not-allowed"?"Micro refusé — autorise l’accès.":e==="no-speech"?"Aucune voix détectée.":"Erreur micro");setTimeout(()=>setVoiceError(""),3000);}
  });
  return (
    <div style={{position:"relative",flexShrink:0}}>
      {showPicker && <>
        <div onClick={()=>setShowPicker(false)} style={{position:"fixed",inset:0,zIndex:90}}/>
        <div style={{position:"absolute",bottom:"calc(100% + 10px)",right:0,background:T.surface,border:`1px solid ${T.line}`,borderRadius:14,boxShadow:"0 16px 48px rgba(11,14,24,0.18)",width:264,zIndex:100,overflow:"hidden"}}>
          <div style={{padding:"11px 15px",borderBottom:`1px solid ${T.lineSoft}`,fontSize:11,fontWeight:700,color:T.inkFaint,textTransform:"uppercase",letterSpacing:"0.08em"}}>Langue de dictée</div>
          <div style={{maxHeight:300,overflow:"auto",padding:6}}>
            {AFRICAN_LANGUAGES.map(l=>(
              <button key={l.code} onClick={()=>{onLangChange?.(l.code);setShowPicker(false)}} style={{width:"100%",padding:"10px 11px",background:currentLang===l.code?T.indigoSoft:"transparent",border:"none",borderRadius:9,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:11,transition:"background .12s"}} onMouseEnter={e=>{if(currentLang!==l.code)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>{if(currentLang!==l.code)e.currentTarget.style.background="transparent"}}>
                <span style={{fontSize:19}}>{l.flag}</span>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:currentLang===l.code?700:500,color:currentLang===l.code?T.indigo:T.ink}}>{l.name}</div><div style={{fontSize:11,color:T.inkFaint}}>{l.region}</div></div>
                {currentLang===l.code&&<div style={{color:T.indigo}}><Icon name="check" size={15}/></div>}
              </button>
            ))}
          </div>
        </div>
      </>}
      {voiceError && <div style={{position:"absolute",bottom:"calc(100% + 10px)",right:0,background:T.redSoft,border:`1px solid ${T.red}33`,borderRadius:9,padding:"8px 12px",fontSize:12,color:T.red,whiteSpace:"nowrap",zIndex:100}}>{voiceError}</div>}
      {(interim||translating) && <div style={{position:"absolute",bottom:"calc(100% + 10px)",right:0,background:T.ink,color:"#fff",borderRadius:9,padding:"9px 13px",fontSize:12.5,maxWidth:240,zIndex:100,lineHeight:1.5}}>{translating?"Traduction…":<>{lang.flag} {interim}</>}</div>}
      <div style={{display:"flex",gap:7}}>
        <button onClick={()=>setShowPicker(s=>!s)} style={{height:46,padding:"0 11px",background:showPicker?T.indigoSoft:T.surfaceAlt,border:`1.5px solid ${showPicker?T.indigo+"44":T.line}`,borderRadius:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5,transition:"all .15s"}} title="Choisir la langue">
          <span style={{fontSize:17}}>{lang.flag}</span>{!compact&&<span style={{fontSize:11.5,color:T.inkSoft,fontWeight:600}}>{lang.name}</span>}<Icon name="chevron" size={13} color={T.inkFaint}/>
        </button>
        <button onClick={listening?stop:start} disabled={translating} title={listening?"Arrêter":`Dicter en ${lang.name}`} style={{width:46,height:46,background:listening?T.red:translating?T.inkFaint:T.surfaceAlt,border:`1.5px solid ${listening?T.red:T.line}`,borderRadius:12,cursor:translating?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",animation:listening?"abmic 1.5s infinite":"none"}}>
          {translating?<div style={{width:15,height:15,border:"2px solid #fff",borderTopColor:"transparent",borderRadius:"50%",animation:"abspin .8s linear infinite"}}/>:<Icon name="mic" size={17} color={listening?"#fff":T.inkSoft}/>}
        </button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// PRICING MODAL
// ═══════════════════════════════════════════════════════════════════════════
function PricingModal({ currentPlan, onClose, onSelectPlan }) {
  const [billing,setBilling]=useState("monthly");
  const [currency,setCurrency]=useState("XOF");
  const [step,setStep]=useState(null);
  const [method,setMethod]=useState("cinetpay");
  const [card,setCard]=useState({number:"",expiry:"",cvv:"",name:"",email:""});
  const [mmo,setMmo]=useState({phone:"",op:"MTN"});
  const [processing,setProcessing]=useState(false);
  const [success,setSuccess]=useState(false);
  const plan = PLANS.find(p=>p.id===step);
  const isWide = useWide(720);
  const inp={width:"100%",padding:"11px 13px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:10,fontSize:14,color:T.ink,outline:"none",fontFamily:FONT,transition:"border-color .15s"};
  const fOn=e=>e.target.style.borderColor=T.indigo; const fOff=e=>e.target.style.borderColor=T.line;
  const pay=async()=>{setProcessing(true);await sleep(2200);setProcessing(false);setSuccess(true);await sleep(1500);onSelectPlan(step);onClose();};

  if(step&&plan){
    const amt = billing==="monthly"?plan.price:plan.priceYear;
    const periodLabel = billing==="monthly"?"/ mois":"/ an";
    return (
      <Overlay onClose={onClose}>
        <div style={{background:T.surface,borderRadius:20,padding:32,width:480,maxWidth:"94vw"}}>
          {success?(
            <div style={{textAlign:"center",padding:"28px 0"}}>
              <div style={{width:68,height:68,borderRadius:"50%",background:T.greenSoft,border:`2px solid ${T.green}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",color:T.green}}><Icon name="check" size={30}/></div>
              <div style={{fontSize:21,fontWeight:800,color:T.ink,marginBottom:6,fontFamily:FONT_DISPLAY}}>Paiement confirmé</div>
              <div style={{fontSize:14,color:T.inkSoft}}>Bienvenue dans le plan <strong>{plan.name}</strong></div>
            </div>
          ):(
            <>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:22}}>
                <div><div style={{fontSize:19,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY}}>Plan {plan.name}</div><div style={{fontSize:14,color:T.gold,fontWeight:600,marginTop:2}}>{fmt(amt)} FCFA {periodLabel}</div></div>
                <button onClick={()=>setStep(null)} style={{background:T.surfaceAlt,border:`1px solid ${T.line}`,color:T.inkSoft,borderRadius:9,padding:"7px 13px",cursor:"pointer",fontSize:13,fontWeight:600}}>Retour</button>
              </div>
              <div style={{fontSize:11,fontWeight:700,color:T.inkFaint,letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:10}}>Moyen de paiement</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                {[{id:"cinetpay",n:"CinetPay",s:"Afrique francophone",f:"\u{1F1E8}\u{1F1EE}"},{id:"flutterwave",n:"Flutterwave",s:"Panafricain",f:"\u{1F30D}"},{id:"kkiapay",n:"Kkiapay",s:"Bénin · Togo",f:"\u{1F1E7}\u{1F1EF}"},{id:"mobile",n:"Mobile Money",s:"MTN · Orange · Wave",f:"\u{1F4F1}"}].map(g=>(
                  <button key={g.id} onClick={()=>setMethod(g.id)} style={{padding:"11px 13px",background:method===g.id?T.indigoSoft:T.surfaceAlt,border:`1.5px solid ${method===g.id?T.indigo:T.line}`,borderRadius:11,cursor:"pointer",textAlign:"left",transition:"all .15s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}><span style={{fontSize:15}}>{g.f}</span><span style={{fontSize:13,fontWeight:700,color:method===g.id?T.indigo:T.ink}}>{g.n}</span></div>
                    <div style={{fontSize:10.5,color:T.inkFaint}}>{g.s}</div>
                  </button>
                ))}
              </div>
              <button onClick={()=>setMethod("card")} style={{width:"100%",padding:"11px 14px",background:method==="card"?T.indigoSoft:T.surfaceAlt,border:`1.5px solid ${method==="card"?T.indigo:T.line}`,borderRadius:11,cursor:"pointer",display:"flex",alignItems:"center",gap:11,marginBottom:18,transition:"all .15s"}}>
                <Icon name="card" size={18} color={method==="card"?T.indigo:T.inkSoft}/>
                <div style={{textAlign:"left"}}><div style={{fontSize:13,fontWeight:700,color:method==="card"?T.indigo:T.ink}}>Carte internationale</div><div style={{fontSize:10.5,color:T.inkFaint}}>Visa · Mastercard · Amex</div></div>
              </button>
              {(method==="cinetpay"||method==="flutterwave")&&(
                <div style={{display:"flex",flexDirection:"column",gap:11,marginBottom:18}}>
                  <input placeholder="Nom complet" value={card.name} onChange={e=>setCard({...card,name:e.target.value})} style={inp} onFocus={fOn} onBlur={fOff}/>
                  <input type="email" placeholder="Email" value={card.email} onChange={e=>setCard({...card,email:e.target.value})} style={inp} onFocus={fOn} onBlur={fOff}/>
                  <input placeholder="Téléphone (+221 …)" value={mmo.phone} onChange={e=>setMmo({...mmo,phone:e.target.value})} style={inp} onFocus={fOn} onBlur={fOff}/>
                </div>
              )}
              {method==="kkiapay"&&<div style={{marginBottom:18}}><input placeholder="Numéro Mobile Money (+229 …)" value={mmo.phone} onChange={e=>setMmo({...mmo,phone:e.target.value})} style={inp} onFocus={fOn} onBlur={fOff}/></div>}
              {method==="mobile"&&(
                <div style={{display:"flex",flexDirection:"column",gap:11,marginBottom:18}}>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["MTN","Orange","Wave","M-Pesa","Airtel"].map(o=><button key={o} onClick={()=>setMmo({...mmo,op:o})} style={{padding:"7px 13px",background:mmo.op===o?T.indigoSoft:T.surfaceAlt,border:`1.5px solid ${mmo.op===o?T.indigo:T.line}`,borderRadius:8,color:mmo.op===o?T.indigo:T.inkSoft,cursor:"pointer",fontSize:12.5,fontWeight:mmo.op===o?700:500}}>{o}</button>)}</div>
                  <input placeholder="Numéro de téléphone" value={mmo.phone} onChange={e=>setMmo({...mmo,phone:e.target.value})} style={inp} onFocus={fOn} onBlur={fOff}/>
                </div>
              )}
              {method==="card"&&(
                <div style={{display:"flex",flexDirection:"column",gap:11,marginBottom:18}}>
                  <input placeholder="Nom sur la carte" value={card.name} onChange={e=>setCard({...card,name:e.target.value})} style={inp} onFocus={fOn} onBlur={fOff}/>
                  <input placeholder="0000 0000 0000 0000" value={card.number} onChange={e=>setCard({...card,number:e.target.value.replace(/\D/g,"").replace(/(.{4})/g,"$1 ").trim().slice(0,19)})} style={{...inp,fontFamily:FONT_MONO,letterSpacing:1.5}} onFocus={fOn} onBlur={fOff}/>
                  <div style={{display:"flex",gap:10}}>
                    <input placeholder="MM / AA" value={card.expiry} onChange={e=>{let v=e.target.value.replace(/\D/g,"");if(v.length>2)v=v.slice(0,2)+" / "+v.slice(2,4);setCard({...card,expiry:v})}} style={inp} onFocus={fOn} onBlur={fOff}/>
                    <input placeholder="CVV" type="password" value={card.cvv} onChange={e=>setCard({...card,cvv:e.target.value.slice(0,4)})} style={inp} onFocus={fOn} onBlur={fOff}/>
                  </div>
                </div>
              )}
              <button onClick={pay} disabled={processing} style={{width:"100%",padding:"14px",background:processing?T.inkFaint:T.ink,color:"#fff",border:"none",borderRadius:12,fontSize:14.5,fontWeight:700,cursor:processing?"not-allowed":"pointer",fontFamily:FONT_DISPLAY}}>{processing?"Traitement…":`Payer ${fmt(amt)} FCFA`}</button>
            </>
          )}
        </div>
      </Overlay>
    );
  }
  return (
    <Overlay onClose={onClose} scroll>
      <div style={{background:T.surface,borderRadius:22,padding:isWide?"36px 34px":"26px 20px",width:"100%",maxWidth:960}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:26,flexWrap:"wrap",gap:12}}>
          <div><div style={{fontSize:25,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY,letterSpacing:"-0.03em"}}>Choisis ton plan</div><div style={{fontSize:14,color:T.inkSoft,marginTop:4}}>Paiement en FCFA, Visa ou Mobile Money. Annule quand tu veux.</div></div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{display:"flex",background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:10,overflow:"hidden"}}>{[["monthly","Mensuel"],["yearly","Annuel · 2 mois offerts"]].map(([id,l])=><button key={id} onClick={()=>setBilling(id)} style={{padding:"8px 15px",background:billing===id?T.ink:"transparent",color:billing===id?"#fff":T.inkSoft,border:"none",cursor:"pointer",fontSize:12.5,fontWeight:billing===id?700:500}}>{l}</button>)}</div>
            <select value={currency} onChange={e=>setCurrency(e.target.value)} style={{padding:"8px 12px",background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:10,fontSize:12.5,color:T.ink,outline:"none",fontFamily:FONT,cursor:"pointer",fontWeight:600}}>{Object.entries(CURRENCIES).map(([code,c])=><option key={code} value={code}>{c.symbol} {code}</option>)}</select>
            <button onClick={onClose} style={{width:38,height:38,background:T.surfaceAlt,border:`1px solid ${T.line}`,color:T.inkSoft,borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="x" size={17}/></button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isWide?"repeat(5,1fr)":"1fr 1fr",gap:10}}>
          {PLANS.map(plan=>{
            const price=billing==="monthly"?plan.price:Math.round(plan.priceYear/12);
            const cur=currentPlan===plan.id; const hl=plan.id==="pro";
            return (
              <div key={plan.id} style={{background:hl?T.ink:T.surface,border:`1.5px solid ${hl?T.ink:cur?T.indigo:T.line}`,borderRadius:16,padding:"22px 18px",display:"flex",flexDirection:"column",position:"relative"}}>
                {plan.badge&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:plan.color,color:plan.id==="pro"?T.ink:"#fff",fontSize:10,fontWeight:800,padding:"4px 11px",borderRadius:20,whiteSpace:"nowrap",letterSpacing:"0.02em"}}>{plan.badge}</div>}
                <div style={{fontSize:15,fontWeight:800,color:hl?"#fff":T.ink,fontFamily:FONT_DISPLAY}}>{plan.name}</div>
                <div style={{fontSize:12,color:hl?T.navInkSoft:T.inkFaint,marginBottom:14}}>{plan.tagline}</div>
                <div style={{marginBottom:14}}>{price===0?<span style={{fontSize:24,fontWeight:800,color:hl?"#fff":T.ink,fontFamily:FONT_DISPLAY}}>Gratuit</span>:<><span style={{fontSize:22,fontWeight:800,color:hl?"#fff":T.ink,fontFamily:FONT_DISPLAY}}>{toCurrency(price,currency)}</span><span style={{fontSize:12,color:hl?T.navInkSoft:T.inkFaint}}> /mois</span></>}
                {billing==="yearly"&&plan.price>0&&<div style={{fontSize:11,color:hl?"#86EFAC":T.green,fontWeight:600,marginTop:4}}>Soit {toCurrency(plan.priceYear,currency)}/an · économise {toCurrency(plan.price*12-plan.priceYear,currency)}</div>}</div>
                <div style={{fontSize:12,color:plan.color,fontWeight:700,marginBottom:14}}>{plan.price===0?"10 crédits pour tester":`${fmt(plan.credits)} crédits inclus / mois`}</div>
                <div style={{flex:1,display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>{plan.features.map((f,i)=><div key={i} style={{fontSize:12.5,color:hl?T.navInk:T.inkSoft,display:"flex",gap:8,alignItems:"flex-start"}}><span style={{color:plan.color,flexShrink:0,marginTop:1}}><Icon name="check" size={14}/></span>{f}</div>)}</div>
                <button onClick={()=>plan.id!=="free"?setStep(plan.id):(onSelectPlan("free"),onClose())} style={{padding:"11px",background:cur?(hl?T.navActive:T.indigoSoft):hl?T.gold:plan.price===0?T.surfaceAlt:T.ink,color:cur?(hl?"#fff":T.indigo):hl?T.ink:plan.price===0?T.inkSoft:"#fff",border:"none",borderRadius:10,cursor:cur?"default":"pointer",fontSize:13,fontWeight:700,fontFamily:FONT_DISPLAY}}>{cur?"Plan actuel":plan.price===0?"Commencer":"Choisir"}</button>
              </div>
            );
          })}
        </div>
        <div style={{marginTop:20,padding:"16px 18px",background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:14}}>
          <div style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>À quoi servent les crédits</div>
          <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>
            {[["Générer une app","1 crédit"],["Modifier une app","1 crédit"],["Un visuel / flyer","1 crédit"],["Déployer sur le web","2 crédits"],["Sortir un APK","5 crédits"]].map(([a,c])=>(
              <div key={a} style={{fontSize:12.5,color:T.inkSoft}}><span style={{color:T.ink,fontWeight:600}}>{c}</span> · {a}</div>
            ))}
          </div>
          <div style={{fontSize:12,color:T.inkFaint,marginTop:10}}>Les crédits se rechargent chaque mois. Tu peux aussi en acheter à tout moment — ils n’expirent jamais.</div>
        </div>
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPLOY MODAL
// ═══════════════════════════════════════════════════════════════════════════
function DeployModal({ title, code, onClose, onDeployed }) {
  const [step,setStep]=useState("confirm");
  const [url,setUrl]=useState(""); const [err,setErr]=useState(""); const [copied,setCopied]=useState(false);
  const slug = (title||"app").toLowerCase().replace(/[^a-z0-9]/g,"-").slice(0,18);
  const deploy=async()=>{setStep("deploying");try{const r=await deployToVercel(title,code);setUrl(r.url);setStep("done");onDeployed?.(r.url);}catch(e){setErr(e.message);setStep("error");}};
  return (
    <Overlay onClose={onClose}>
      <div style={{background:T.surface,borderRadius:20,padding:32,width:460,maxWidth:"94vw"}}>
        {step==="confirm"&&<>
          <div style={{width:48,height:48,borderRadius:13,background:T.indigoSoft,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,color:T.indigo}}><Icon name="rocket" size={22}/></div>
          <div style={{fontSize:20,fontWeight:800,color:T.ink,marginBottom:6,fontFamily:FONT_DISPLAY}}>Déployer en ligne</div>
          <div style={{fontSize:14,color:T.inkSoft,marginBottom:22,lineHeight:1.65}}>Ton application <strong>{title}</strong> sera publiée et accessible partout dans le monde en moins d’une minute.</div>
          <div style={{padding:"16px 18px",background:T.surfaceAlt,borderRadius:13,border:`1px solid ${T.line}`,marginBottom:22}}>{[["Hébergeur","Vercel · CDN mondial"],["Adresse",`${slug}.afribuild.app`],["HTTPS","Activé automatiquement"]].map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:8}}><span style={{color:T.inkFaint}}>{k}</span><span style={{color:T.ink,fontWeight:600,fontFamily:k==="Adresse"?FONT_MONO:FONT,fontSize:k==="Adresse"?12:13}}>{v}</span></div>)}</div>
          <div style={{display:"flex",gap:10}}><button onClick={onClose} style={{flex:1,padding:"12px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,color:T.inkSoft,cursor:"pointer",fontSize:14,fontWeight:600}}>Annuler</button><button onClick={deploy} style={{flex:2,padding:"12px",background:T.ink,border:"none",borderRadius:11,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:FONT_DISPLAY}}>Déployer maintenant</button></div>
        </>}
        {step==="deploying"&&<div style={{textAlign:"center",padding:"24px 0"}}>
          <div style={{position:"relative",width:72,height:72,margin:"0 auto 20px"}}><div style={{position:"absolute",inset:0,border:`3px solid ${T.line}`,borderTopColor:T.indigo,borderRadius:"50%",animation:"abspin .8s linear infinite"}}/><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:T.indigo}}><Icon name="rocket" size={26}/></div></div>
          <div style={{fontSize:18,fontWeight:700,color:T.ink,marginBottom:6,fontFamily:FONT_DISPLAY}}>Déploiement en cours…</div>
          <div style={{fontSize:13,color:T.inkSoft}}>Build · Upload CDN · Activation HTTPS</div>
        </div>}
        {step==="done"&&<div style={{textAlign:"center"}}>
          <div style={{width:64,height:64,borderRadius:"50%",background:T.greenSoft,border:`2px solid ${T.green}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",color:T.green}}><Icon name="check" size={28}/></div>
          <div style={{fontSize:20,fontWeight:800,color:T.ink,marginBottom:6,fontFamily:FONT_DISPLAY}}>En ligne !</div>
          <div style={{fontSize:14,color:T.inkSoft,marginBottom:20}}>Ton application est accessible partout dans le monde.</div>
          <div style={{display:"flex",gap:8,background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:11,padding:"11px 14px",marginBottom:20,alignItems:"center"}}><div style={{flex:1,fontSize:13,color:T.indigo,fontFamily:FONT_MONO,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{url}</div><button onClick={()=>{navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1800)}} style={{background:copied?T.greenSoft:T.surface,border:`1px solid ${T.line}`,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,color:copied?T.green:T.inkSoft,fontWeight:600,flexShrink:0}}>{copied?"Copié":"Copier"}</button></div>
          <div style={{display:"flex",gap:10}}><button onClick={()=>window.open(url,"_blank")} style={{flex:1,padding:"12px",background:T.ink,border:"none",borderRadius:11,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:FONT_DISPLAY}}>Ouvrir l’app</button><button onClick={onClose} style={{flex:1,padding:"12px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,color:T.inkSoft,cursor:"pointer",fontSize:14,fontWeight:600}}>Fermer</button></div>
        </div>}
        {step==="error"&&<div style={{textAlign:"center"}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:T.redSoft,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",color:T.red,fontSize:24,fontWeight:800}}>!</div>
          <div style={{fontSize:18,fontWeight:700,color:T.ink,marginBottom:6,fontFamily:FONT_DISPLAY}}>Échec du déploiement</div>
          <div style={{fontSize:13,color:T.inkSoft,marginBottom:8,lineHeight:1.6}}>{err}</div>
          <div style={{fontSize:12,color:T.inkFaint,marginBottom:20}}>Vérifie ton token Vercel dans la configuration.</div>
          <div style={{display:"flex",gap:10}}><button onClick={()=>setStep("confirm")} style={{flex:1,padding:"12px",background:T.ink,border:"none",borderRadius:11,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700}}>Réessayer</button><button onClick={onClose} style={{flex:1,padding:"12px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,color:T.inkSoft,cursor:"pointer",fontSize:14,fontWeight:600}}>Fermer</button></div>
        </div>}
      </div>
    </Overlay>
  );
}

// Brand modal
function BrandModal({ brand, title, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div style={{background:T.surface,borderRadius:20,padding:32,width:480,maxWidth:"94vw"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontSize:19,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY}}>Identité de marque</div>
          <button onClick={onClose} style={{width:36,height:36,background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.inkSoft}}><Icon name="x" size={16}/></button>
        </div>
        {brand?(
          <>
            <div style={{padding:22,background:T.surfaceAlt,borderRadius:14,marginBottom:16,border:`1px solid ${T.line}`}}>
              <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18}}>
                <div style={{width:58,height:58,borderRadius:15,background:brand.primaryColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>{brand.faviconEmoji}</div>
                <div><div style={{fontSize:19,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY}}>{title}</div><div style={{fontSize:13,color:T.inkSoft,fontStyle:"italic"}}>“{brand.slogan}”</div></div>
              </div>
              <div style={{display:"flex",gap:9,marginBottom:14}}>{[brand.primaryColor,brand.secondaryColor,brand.accentColor,brand.bgColor].filter(Boolean).map((c,i)=><div key={i} style={{flex:1,height:44,background:c,borderRadius:9,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:5}}><span style={{fontSize:9,fontFamily:FONT_MONO,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,0.6)"}}>{c}</span></div>)}</div>
              <div style={{fontSize:13,color:T.inkSoft}}>Police · <strong>{brand.fontFamily}</strong></div>
            </div>
            <div style={{display:"flex",gap:10}}><button onClick={()=>{navigator.clipboard.writeText(JSON.stringify(brand,null,2))}} style={{flex:1,padding:"11px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,color:T.inkSoft,cursor:"pointer",fontSize:13,fontWeight:600}}>Copier le JSON</button><button onClick={onClose} style={{flex:1,padding:"11px",background:T.ink,border:"none",borderRadius:11,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}>Appliquer</button></div>
          </>
        ):<div style={{textAlign:"center",padding:"28px 0"}}><div style={{width:38,height:38,border:`2.5px solid ${T.line}`,borderTopColor:T.indigo,borderRadius:"50%",animation:"abspin .8s linear infinite",margin:"0 auto 14px"}}/><div style={{fontSize:14,color:T.inkSoft}}>Génération de l’identité…</div></div>}
      </div>
    </Overlay>
  );
}

// Iterative chat
function IterativeChat({ code, title, onUpdate, onClose }) {
  const [msgs,setMsgs]=useState([{role:"ai",text:`Prêt à modifier ${title}. Que veux-tu changer ?`}]);
  const [input,setInput]=useState(""); const [loading,setLoading]=useState(false);
  const bottomRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"})},[msgs]);
  const send=async()=>{
    if(!input.trim()||loading)return; const msg=input.trim(); setInput(""); setLoading(true);
    setMsgs(m=>[...m,{role:"user",text:msg}]);
    try{
      const raw=await callAI("claude",`Dev React senior. Modifie l’app. JSON: {"message":"…","code":"…JSX complet…"}. Garde export default App, styles inline, design pro.`,`App "${title}":\n${code.slice(0,8000)}\nModification: ${msg}`,6000);
      const m=raw.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim().match(/\{[\s\S]*\}/);
      const parsed=JSON.parse(m?m[0]:raw);
      setMsgs(x=>[...x,{role:"ai",text:parsed.message||"Modification appliquée."}]);
      if(parsed.code)onUpdate(parsed.code);
    }catch{setMsgs(x=>[...x,{role:"ai",text:"Erreur. Reformule ta demande."}])}
    setLoading(false);
  };
  return (
    <div style={{position:"fixed",bottom:20,right:20,width:370,maxWidth:"calc(100vw - 32px)",height:500,maxHeight:"calc(100vh - 100px)",background:T.surface,border:`1px solid ${T.line}`,borderRadius:18,display:"flex",flexDirection:"column",zIndex:600,boxShadow:"0 24px 70px rgba(11,14,24,0.22)",animation:"abslide .25s ease"}}>
      <div style={{padding:"15px 17px",borderBottom:`1px solid ${T.lineSoft}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}><div style={{color:T.indigo}}><Icon name="chat" size={18}/></div><div><div style={{fontSize:14,fontWeight:700,color:T.ink}}>Modifier l’app</div><div style={{fontSize:11.5,color:T.inkFaint}}>{title}</div></div></div>
        <button onClick={onClose} style={{width:32,height:32,background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.inkSoft}}><Icon name="x" size={15}/></button>
      </div>
      <div style={{flex:1,overflow:"auto",padding:15,display:"flex",flexDirection:"column",gap:11}}>
        {msgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}><div style={{maxWidth:"84%",padding:"10px 13px",borderRadius:m.role==="user"?"13px 13px 4px 13px":"13px 13px 13px 4px",background:m.role==="user"?T.ink:T.surfaceAlt,border:m.role==="user"?"none":`1px solid ${T.line}`,fontSize:13,color:m.role==="user"?"#fff":T.ink,lineHeight:1.6}}>{m.text}</div></div>)}
        {loading&&<div style={{display:"flex",gap:5,padding:"4px 2px"}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:T.inkFaint,animation:`abpulse 1s ${i*0.15}s infinite`}}/>)}</div>}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:13,borderTop:`1px solid ${T.lineSoft}`,display:"flex",gap:9}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ex : ajoute un graphique des ventes…" style={{flex:1,background:T.surfaceAlt,border:`1.5px solid ${T.line}`,borderRadius:10,padding:"10px 13px",fontSize:13,color:T.ink,outline:"none",fontFamily:FONT}} onFocus={e=>e.target.style.borderColor=T.indigo} onBlur={e=>e.target.style.borderColor=T.line}/>
        <button onClick={send} disabled={loading||!input.trim()} style={{width:40,height:40,background:loading?T.inkFaint:T.ink,color:"#fff",border:"none",borderRadius:10,cursor:loading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon name="chevron" size={17} stroke={2.4}/></button>
      </div>
    </div>
  );
}

// Overlay wrapper
function Overlay({ children, onClose, scroll }) {
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose?.()} style={{position:"fixed",inset:0,background:"rgba(11,14,24,0.55)",display:"flex",alignItems:scroll?"flex-start":"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",overflowY:scroll?"auto":"hidden",padding:scroll?"40px 20px":20,animation:"abfade .2s ease"}}>
      {children}
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════
// v8 — TEMPLATES PRÊTS À L’EMPLOI (apps pré-remplies en 1 clic)
// ═══════════════════════════════════════════════════════════════════════════
const STARTER_TEMPLATES = [
  { id:"pos-pro",    icon:"\u25C8", name:"POS Boutique Pro",   cat:"Commerce",   color:"#4F46E5", desc:"Caisse complète : inventaire, ventes, Mobile Money, rapports journaliers", popular:true,
    prompt:"Système POS professionnel complet pour boutique africaine. Interface caisse split-screen, catalogue 16 produits avec catégories, panier temps réel, paiement Espèces/MTN/Orange/Wave avec rendu monnaie, ticket imprimable, dashboard ventes du jour avec graphique, gestion stock avec alertes rupture. Design Square POS bleu/blanc. Données africaines." },
  { id:"shop-mkt",   icon:"\u25C8", name:"Marketplace E-commerce", cat:"Commerce", color:"#EA580C", desc:"Boutique en ligne : catalogue, panier, commandes, paiement, suivi livraison",
    prompt:"Marketplace e-commerce africaine style Jumia. Hero, catalogue 14 produits avec cards (photo, prix FCFA, note, badge promo), filtres catégorie/prix, page détail, panier slide-in, checkout Mobile Money, suivi commande. Design pro orange/blanc. Vendeurs villes africaines." },
  { id:"school-erp", icon:"\u25C8", name:"École Numérique",    cat:"Éducation",  color:"#8B5CF6", desc:"ERP scolaire : élèves, notes, bulletins, paiements scolarité, emploi du temps", popular:true,
    prompt:"ERP scolaire complet style PowerSchool. Sidebar (Dashboard, Élèves, Notes, Emploi du temps, Paiements). Dashboard avec stats animées. Table 20 élèves avec photos initiales. Bulletins avec moyennes calculées. Emploi du temps grille 5j. Statuts paiements colorés. Design violet/blanc pro." },
  { id:"clinic",     icon:"\u25C8", name:"Clinique Santé",     cat:"Santé",      color:"#E5484D", desc:"Dossiers patients, consultations, ordonnances, rendez-vous, statistiques",
    prompt:"Système clinique style Doctolib. Sidebar (Dashboard, Patients, Consultations, Ordonnances, Stats). Table 15 patients avec recherche/filtres. Fiche patient complète (antécédents, consultations). Formulaire consultation avec diagnostic+prescription. Dashboard KPI santé. Design médical blanc/bleu." },
  { id:"crm-pro",    icon:"\u25C8", name:"CRM Commercial",     cat:"Entreprise", color:"#0EA5E9", desc:"Clients, prospects, pipeline ventes, factures, suivi des interactions",
    prompt:"CRM pour PME africaine style Pipedrive. Sidebar (Dashboard, Contacts, Pipeline, Factures). Pipeline kanban drag-feel avec deals FCFA. Table contacts. Dashboard avec funnel de ventes et chiffre d’affaires. Factures listées. Design pro bleu/blanc. Données africaines." },
  { id:"realestate",icon:"\u25C8", name:"Immobilier",         cat:"Services",   color:"#0891B2", desc:"Annonces location/vente, filtres, fiches détaillées, demandes de visite",
    prompt:"Plateforme immobilière style Seloger. Barre recherche, grille 14 annonces (photo, prix FCFA/mois, quartier, surface, badges), sidebar filtres, page détail avec galerie et contact agent, formulaire visite, favoris. Design teal/blanc minimaliste. Villes africaines." },
  { id:"hotel",      icon:"\u25C8", name:"Hôtel & Réservation",cat:"Tourisme",   color:"#16A34A", desc:"Chambres, réservations, check-in/out, services, paiement Mobile Money",
    prompt:"Système hôtelier africain. Dashboard occupation, grille chambres avec statuts (libre/occupée/nettoyage), formulaire réservation avec dates, check-in/out, services additionnels, paiement Mobile Money, facture. Design élégant vert/blanc." },
  { id:"resto",      icon:"\u25C8", name:"Restaurant",         cat:"Food",       color:"#DC2626", desc:"Menu, commandes tables, cuisine temps réel, livraison, paiement",
    prompt:"App restaurant cuisine africaine style Uber Eats. Menu catégorisé (thiéboudienne, ndolé, jollof, yassa) avec cards, panier slide-in, commande table ou livraison, timeline cuisine→livraison animée, paiement Mobile Money, rapport ventes. Design sombre chaleureux." },
];

// ─── PROMPTS SPÉCIALISÉS v8 ──────────────────────────────────────────────────
// Admin panel auto-généré
const ADMIN_PANEL_DIRECTIVE = `
GÉNÈRE AUSSI un panneau d’administration complet intégré : tableau de bord avec KPIs et graphiques CSS, gestion des utilisateurs (table CRUD), rôles & permissions (Admin/Manager/Employé), journal d’activité (logs horodatés), statistiques visuelles. Navigation entre la vue publique et l’admin.`;

// Mode Business (factures, devis, QR, etc.)
const BUSINESS_DIRECTIVE = `
INTÈGRE un module business africain : génération de factures et devis (mise en page pro imprimable, numéro, TVA, total FCFA), QR code de paiement (carré stylisé avec motif), bouton "Imprimer" (format ticket thermique 80mm pour le POS), zone de signature électronique (canvas). Tout en FCFA avec coordonnées d’entreprise africaine réalistes.`;

// Reçu Mobile Money infalsifiable (AfriReçu)
const RECEIPT_DIRECTIVE = `
Si l’app gère des paiements (POS, commerce, tontine, école, restaurant...) : après chaque paiement Mobile Money confirmé, génère un REÇU INFALSIFIABLE affiché à l’écran avec : numéro de reçu unique (format AFR-AAAAMMJJ-XXXXXX), montant en FCFA, opérateur (MTN/Orange/Wave...), date et heure, nom du payeur, un QR code de vérification (carré stylisé), un code court de vérification à 8 caractères, et un badge vert "✓ PAIEMENT CONFIRMÉ". Ajoute deux boutons : "Imprimer le reçu" et "Envoyer par email". Mentionne que le reçu est vérifiable en ligne. Design propre, professionnel, façon ticket.`;

// Documentation auto
const DOC_DIRECTIVE = `
Ajoute dans agentLogs un champ "documentation" décrivant : cahier des charges résumé, endpoints API si backend, structure des données, guide utilisateur en 3 étapes.`;

// Visuels intégrés — l’app demande automatiquement ses images au studio
const VISUAL_DIRECTIVE = `
VISUELS DE L’APP : ajoute dans le JSON un champ "visualNeeds" qui liste les images dont l’app a besoin (logo + 2 à 6 images selon le secteur). Format :
"visualNeeds": [
  {"slot":"logo","type":"logo","brief":"description du logo selon le business"},
  {"slot":"hero","type":"photo","brief":"image principale / bannière"},
  {"slot":"product1","type":"product","brief":"photo produit réaliste"}
]
Dans le CODE de l’app, utilise des balises <img src={VISUALS.logo}/>, <img src={VISUALS.hero}/> etc. aux bons endroits, et déclare en haut une constante VISUALS (objet) qui sera remplie automatiquement par les images générées. Si une image n’est pas encore prête, affiche un joli placeholder (fond dégradé + icône). Ainsi l’app a son identité visuelle complète, prête à l’emploi.`;

// Agent Expert Afrique — enrichit le contexte selon le pays détecté
function buildAfricaExpertContext(text) {
  const country = Object.keys(AFRIDATA.countries).find(c => text.toLowerCase().includes(c.toLowerCase()));
  if (!country) return "";
  const d = AFRIDATA.countries[country];
  return `
EXPERT AFRIQUE — Contexte ${country} détecté :
- Devise : ${d.currency} (affiche les montants dans cette devise)
- Opérateurs Mobile Money locaux : ${d.operators.join(", ")}
- Passerelle de paiement recommandée : ${d.gateway}
- Banques principales : ${d.banks.join(", ")}
- Capitale : ${d.capital}
Adapte l’app à ces réalités locales (paiement, devise, fiscalité, langue).`;
}

// ─── GÉNÉRATION D’IMAGES IA ───────────────────────────────────────────────────
// Génère un logo/bannière SVG via Claude (vectoriel, déployable, zéro coût API image)
async function generateImageSVG(kind, subject) {
  try {
    const sys = `Tu es un directeur artistique. Génère une image vectorielle SVG complète et belle.
Réponds UNIQUEMENT avec un objet JSON : {"svg":"<svg viewBox='0 0 400 400'>...</svg>","palette":["#hex","#hex"],"label":"description"}
Le SVG doit être moderne, professionnel, sans texte parasite, optimisé. Type demandé : ${kind}.`;
    const raw = await callAI("claude", sys, `Crée un ${kind} pour : ${subject}. Style africain moderne, couleurs riches.`, 2000);
    const clean = raw.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
    return JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0] || clean);
  } catch { return null; }
}

// ─── EXPORT EXCEL / CSV / PDF (côté client, sans dépendance) ──────────────────
function exportCSV(rows, filename) {
  const esc = c => '"' + String(c).split('"').join('""') + '"';
  const csv = rows.map(r => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=filename+".csv"; a.click(); URL.revokeObjectURL(url);
}
function printPDF(htmlContent, title) {
  const w = window.open("", "_blank");
  if(!w) return;
  w.document.write(`<html><head><title>${title}</title><style>body{font-family:-apple-system,sans-serif;padding:40px;color:#0B0E18}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ECEEF4;padding:10px 12px;text-align:left;font-size:13px}th{background:#F7F8FC}</style></head><body>${htmlContent}</body></html>`);
  w.document.close(); setTimeout(()=>w.print(), 300);
}

// ─── BUILD MOBILE (APK/AAB/IPA) — workflow EAS ────────────────────────────────
// Le build natif réel nécessite EAS Build (serveur Expo). Ici : workflow complet + simulation.
async function requestNativeBuild({ platform, format, title, code, onProgress, onDone, onError }) {
  // Si le backend est configuré : VRAI build APK/AAB/IPA via Expo EAS.
  if (backend.enabled()) {
    try {
      onProgress?.(8, "Validation du code React Native…");
      const { buildId, autoFixed } = await backend.post("/api/apk/build", { title, code, format });
      if (autoFixed) onProgress?.(20, "Code converti en React Native natif…");
      const map = { NEW:30, IN_QUEUE:45, IN_PROGRESS:75, FINISHED:100 };
      const done = await backend.waitForBuild(buildId, (s) => onProgress?.(map[s.status] || 60, `Compilation ${platform}… (${s.status})`));
      const ext = format === "aab" ? "aab" : format === "ipa" ? "ipa" : "apk";
      onDone?.({ url: done.artifactUrl, size: "—", format: ext });
    } catch (e) { onError?.(e.message); }
    return;
  }
  // Mode démo : simulation (pas de vrai fichier)
  const steps = ["Préparation du projet Expo…","Installation des dépendances…",`Compilation ${platform}…`,"Signature du package…","Optimisation et upload…"];
  try {
    for (let i=0;i<steps.length;i++){ onProgress?.(Math.round(((i+1)/steps.length)*92), steps[i]); await sleep(1400); }
    onProgress?.(100, "Build terminé (démo)");
    const ext = format==="aab"?"aab":format==="ipa"?"ipa":"apk";
    const slug = (title||"app").toLowerCase().replace(/[^a-z0-9]/g,"-").slice(0,20);
    onDone?.({ url:`https://build.afribuild.app/${slug}-${uid()}.${ext}`, size:`${(8+Math.random()*14).toFixed(1)} Mo`, format:ext, demo:true });
  } catch(e){ onError?.(e.message); }
}


// ═══════════════════════════════════════════════════════════════════════════
// v8 — NATIVE BUILD MODAL (APK / AAB / IPA)
// ═══════════════════════════════════════════════════════════════════════════
function BuildModal({ title, code, onClose }) {
  const [platform,setPlatform]=useState("android");
  const [format,setFormat]=useState("apk");
  const [step,setStep]=useState("config");
  const [prog,setProg]=useState(0); const [stepMsg,setStepMsg]=useState("");
  const [result,setResult]=useState(null); const [err,setErr]=useState("");
  const formats = platform==="android"?[["apk","APK","Installation directe"],["aab","AAB","Google Play Store"]]:[["ipa","IPA","Apple App Store"]];
  const start=async()=>{setStep("building");await requestNativeBuild({platform,format,title,code,onProgress:(p,m)=>{setProg(p);setStepMsg(m)},onDone:r=>{setResult(r);setStep("done")},onError:e=>{setErr(e);setStep("error")}});};
  return (
    <Overlay onClose={onClose}>
      <div style={{background:T.surface,borderRadius:20,padding:32,width:480,maxWidth:"94vw"}}>
        {step==="config"&&<>
          <div style={{width:48,height:48,borderRadius:13,background:T.greenSoft,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,color:T.green}}><Icon name="rocket" size={22}/></div>
          <div style={{fontSize:20,fontWeight:800,color:T.ink,marginBottom:6,fontFamily:FONT_DISPLAY}}>Générer l’application native</div>
          <div style={{fontSize:14,color:T.inkSoft,marginBottom:22,lineHeight:1.6}}>Compile <strong>{title}</strong> en application installable, signée et prête à publier.</div>
          <div style={{fontSize:11,fontWeight:700,color:T.inkFaint,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:9}}>Plateforme</div>
          <div style={{display:"flex",gap:8,marginBottom:18}}>
            {[["android","Android"],["ios","iOS"]].map(([id,l])=><button key={id} onClick={()=>{setPlatform(id);setFormat(id==="android"?"apk":"ipa")}} style={{flex:1,padding:"12px",background:platform===id?T.indigoSoft:T.surfaceAlt,border:`1.5px solid ${platform===id?T.indigo:T.line}`,borderRadius:11,cursor:"pointer",fontSize:14,fontWeight:platform===id?700:500,color:platform===id?T.indigo:T.ink}}>{l}</button>)}
          </div>
          <div style={{fontSize:11,fontWeight:700,color:T.inkFaint,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:9}}>Format</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:22}}>
            {formats.map(([id,l,d])=><button key={id} onClick={()=>setFormat(id)} style={{padding:"12px 14px",background:format===id?T.indigoSoft:T.surfaceAlt,border:`1.5px solid ${format===id?T.indigo:T.line}`,borderRadius:11,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div><div style={{fontSize:14,fontWeight:700,color:format===id?T.indigo:T.ink}}>{l}</div><div style={{fontSize:12,color:T.inkFaint}}>{d}</div></div>{format===id&&<div style={{color:T.indigo}}><Icon name="check" size={18}/></div>}</button>)}
          </div>
          <div style={{padding:"11px 14px",background:T.goldSoft,border:`1px solid ${T.gold}33`,borderRadius:10,fontSize:12.5,color:T.goldDeep,marginBottom:20,lineHeight:1.6}}>La signature et le build natif sont effectués via le service de compilation. Première compilation : 2–5 min.</div>
          <div style={{display:"flex",gap:10}}><button onClick={onClose} style={{flex:1,padding:"12px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,color:T.inkSoft,cursor:"pointer",fontSize:14,fontWeight:600}}>Annuler</button><button onClick={start} style={{flex:2,padding:"12px",background:T.ink,border:"none",borderRadius:11,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:FONT_DISPLAY}}>Compiler le {format.toUpperCase()}</button></div>
        </>}
        {step==="building"&&<div style={{textAlign:"center",padding:"20px 0"}}>
          <div style={{position:"relative",width:72,height:72,margin:"0 auto 20px"}}><div style={{position:"absolute",inset:0,border:`3px solid ${T.line}`,borderTopColor:T.green,borderRadius:"50%",animation:"abspin .8s linear infinite"}}/><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:T.green,fontSize:13,fontWeight:800,fontFamily:FONT_DISPLAY}}>{prog}%</div></div>
          <div style={{fontSize:17,fontWeight:700,color:T.ink,marginBottom:8,fontFamily:FONT_DISPLAY}}>Compilation en cours…</div>
          <div style={{fontSize:13,color:T.inkSoft,marginBottom:16}}>{stepMsg}</div>
          <div style={{height:5,background:T.line,borderRadius:3,overflow:"hidden",maxWidth:280,margin:"0 auto"}}><div style={{height:"100%",background:`linear-gradient(90deg,${T.green},${T.indigo})`,width:`${prog}%`,transition:"width .5s ease",borderRadius:3}}/></div>
        </div>}
        {step==="done"&&result&&<div style={{textAlign:"center"}}>
          <div style={{width:64,height:64,borderRadius:"50%",background:T.greenSoft,border:`2px solid ${T.green}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",color:T.green}}><Icon name="check" size={28}/></div>
          <div style={{fontSize:20,fontWeight:800,color:T.ink,marginBottom:6,fontFamily:FONT_DISPLAY}}>{result.format.toUpperCase()} prêt !</div>
          <div style={{fontSize:14,color:T.inkSoft,marginBottom:20}}>Ton application native est signée et prête à installer · {result.size}</div>
          <div style={{display:"flex",gap:8,background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:11,padding:"11px 14px",marginBottom:18,alignItems:"center"}}><Icon name="download" size={16} color={T.green}/><div style={{flex:1,fontSize:12.5,color:T.indigo,fontFamily:FONT_MONO,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"left"}}>{result.url}</div></div>
          <div style={{display:"flex",gap:10}}><button onClick={()=>window.open(result.url,"_blank")} style={{flex:1,padding:"12px",background:T.ink,border:"none",borderRadius:11,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:7,fontFamily:FONT_DISPLAY}}><Icon name="download" size={16}/>Télécharger</button><button onClick={onClose} style={{flex:1,padding:"12px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,color:T.inkSoft,cursor:"pointer",fontSize:14,fontWeight:600}}>Fermer</button></div>
        </div>}
        {step==="error"&&<div style={{textAlign:"center"}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:T.redSoft,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",color:T.red,fontSize:24,fontWeight:800}}>!</div>
          <div style={{fontSize:18,fontWeight:700,color:T.ink,marginBottom:6,fontFamily:FONT_DISPLAY}}>Échec de la compilation</div>
          <div style={{fontSize:13,color:T.inkSoft,marginBottom:20}}>{err}</div>
          <button onClick={()=>setStep("config")} style={{padding:"12px 28px",background:T.ink,border:"none",borderRadius:11,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700}}>Réessayer</button>
        </div>}
      </div>
    </Overlay>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// v8 — DATABASE DESIGNER (visuel)
// ═══════════════════════════════════════════════════════════════════════════
function DBDesigner() {
  const [tables,setTables]=useState([
    {id:"t1",name:"utilisateurs",x:40,y:40,fields:[{n:"id",t:"uuid",pk:true},{n:"nom",t:"text"},{n:"email",t:"text"},{n:"téléphone",t:"text"},{n:"créé_le",t:"timestamp"}]},
    {id:"t2",name:"commandes",x:380,y:120,fields:[{n:"id",t:"uuid",pk:true},{n:"utilisateur_id",t:"uuid",fk:"utilisateurs"},{n:"montant",t:"numeric"},{n:"statut",t:"text"},{n:"créé_le",t:"timestamp"}]},
  ]);
  const [sel,setSel]=useState(null);
  const isWide=useWide(720);
  const TYPES=["uuid","text","numeric","integer","boolean","timestamp","date","jsonb"];
  const genSQL=()=>tables.map(t=>`CREATE TABLE ${t.name} (\n${t.fields.map(f=>`  ${f.n} ${f.t.toUpperCase()}${f.pk?" PRIMARY KEY DEFAULT gen_random_uuid()":""}${f.fk?` REFERENCES ${f.fk}(id)`:""}`).join(",\n")}\n);`).join("\n\n");
  const addTable=()=>setTables(t=>[...t,{id:uid(),name:"nouvelle_table",x:60+Math.random()*200,y:60+Math.random()*150,fields:[{n:"id",t:"uuid",pk:true}]}]);
  const addField=(tid)=>setTables(ts=>ts.map(t=>t.id===tid?{...t,fields:[...t.fields,{n:"champ",t:"text"}]}:t));
  const updField=(tid,fi,key,val)=>setTables(ts=>ts.map(t=>t.id===tid?{...t,fields:t.fields.map((f,i)=>i===fi?{...f,[key]:val}:f)}:t));
  const updName=(tid,val)=>setTables(ts=>ts.map(t=>t.id===tid?{...t,name:val}:t));
  const delTable=(tid)=>setTables(ts=>ts.filter(t=>t.id!==tid));
  return (
    <div style={{flex:1,overflow:"auto",background:T.surfaceAlt}}>
      <div style={{maxWidth:1140,margin:"0 auto",padding:isWide?"32px 36px":"24px 18px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:12}}>
          <div><div style={{fontSize:24,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY,letterSpacing:"-0.03em"}}>Concepteur de base de données</div><div style={{fontSize:14,color:T.inkSoft,marginTop:3}}>Crée tes tables visuellement — le SQL PostgreSQL est généré automatiquement.</div></div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addTable} style={{padding:"10px 18px",background:T.ink,color:"#fff",border:"none",borderRadius:10,fontSize:13.5,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:7,fontFamily:FONT_DISPLAY}}><Icon name="plus" size={16}/>Table</button>
            <button onClick={()=>{const rows=[["Table","Champ","Type"]];tables.forEach(t=>t.fields.forEach(f=>rows.push([t.name,f.n,f.t])));exportCSV(rows,"schema-db")}} style={{padding:"10px 16px",background:T.surface,color:T.inkSoft,border:`1px solid ${T.line}`,borderRadius:10,fontSize:13.5,fontWeight:600,cursor:"pointer"}}>Export CSV</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isWide?"1fr 1fr":"1fr",gap:16}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {tables.map(t=>(
              <div key={t.id} style={{background:T.surface,border:`1.5px solid ${sel===t.id?T.indigo:T.line}`,borderRadius:13,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"11px 14px",background:T.indigoSoft,borderBottom:`1px solid ${T.line}`}}>
                  <Icon name="layers" size={15} color={T.indigo}/>
                  <input value={t.name} onChange={e=>updName(t.id,e.target.value)} style={{flex:1,background:"transparent",border:"none",outline:"none",fontSize:14,fontWeight:700,color:T.indigo,fontFamily:FONT_MONO}}/>
                  <button onClick={()=>addField(t.id)} style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:7,padding:"3px 9px",cursor:"pointer",fontSize:11,color:T.inkSoft,fontWeight:600}}>+ champ</button>
                  <button onClick={()=>delTable(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:T.inkFaint,display:"flex"}}><Icon name="x" size={15}/></button>
                </div>
                <div style={{padding:"6px 0"}}>
                  {t.fields.map((f,fi)=>(
                    <div key={fi} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 14px"}}>
                      <input value={f.n} onChange={e=>updField(t.id,fi,"n",e.target.value)} style={{flex:1,background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:7,padding:"6px 9px",fontSize:12.5,color:T.ink,outline:"none",fontFamily:FONT_MONO}}/>
                      <select value={f.t} onChange={e=>updField(t.id,fi,"t",e.target.value)} style={{background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:7,padding:"6px 9px",fontSize:12,color:T.inkSoft,outline:"none",fontFamily:FONT_MONO}}>{TYPES.map(ty=><option key={ty}>{ty}</option>)}</select>
                      {f.pk&&<span style={{fontSize:9,fontWeight:700,color:T.gold,background:T.goldSoft,padding:"2px 6px",borderRadius:5}}>PK</span>}
                      {f.fk&&<span style={{fontSize:9,fontWeight:700,color:T.indigo,background:T.indigoSoft,padding:"2px 6px",borderRadius:5}}>FK</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{background:"#0C0F1A",borderRadius:13,overflow:"hidden",alignSelf:"flex-start",position:"sticky",top:0}}>
            <div style={{padding:"11px 16px",background:"#11151F",borderBottom:"1px solid #1C2233",display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{color:"#6B7488",fontSize:12,fontFamily:FONT_MONO}}>schema.sql</span><button onClick={()=>navigator.clipboard.writeText(genSQL())} style={{background:"#1C2233",border:"1px solid #2A3147",color:"#9AA3B8",borderRadius:7,padding:"4px 12px",cursor:"pointer",fontSize:11.5,fontWeight:600}}>Copier</button></div>
            <pre style={{margin:0,padding:"16px 18px",color:"#D8DEE9",fontSize:12.5,fontFamily:FONT_MONO,lineHeight:1.7,overflow:"auto",maxHeight:480}}>{genSQL()}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// v8 — IMAGE STUDIO (génération SVG IA)
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// MODEL PICKER — bouton premium pour choisir le modèle IA (selon le plan)
// ═══════════════════════════════════════════════════════════════════════════
function ModelPicker({ models, selected, onSelect, userPlan, onUpgrade, compact }) {
  const [open,setOpen]=useState(false);
  const cur=models.find(m=>m.id===selected)||models[0];
  const rank={free:0,starter:1,pro:2,business:3};
  return (
    <div style={{position:"relative",flexShrink:0}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:8,padding:compact?"7px 12px":"9px 14px",background:"#fff",border:`1.5px solid ${open?T.indigo:T.line}`,borderRadius:11,cursor:"pointer",transition:"all .15s",boxShadow:open?`0 0 0 4px ${T.indigoSoft}`:"none"}}>
        <span style={{width:22,height:22,borderRadius:7,background:T.indigoSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>{cur.icon}</span>
        <div style={{textAlign:"left"}}><div style={{fontSize:12.5,fontWeight:700,color:T.ink,lineHeight:1.1}}>{cur.name}</div>{!compact&&<div style={{fontSize:10,color:T.inkFaint}}>{cur.desc}</div>}</div>
        <span style={{color:T.inkFaint,fontSize:11,marginLeft:2}}>▾</span>
      </button>
      {open&&<>
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:90}}/>
        <div style={{position:"absolute",top:"calc(100% + 8px)",left:0,background:"#fff",border:`1px solid ${T.line}`,borderRadius:14,boxShadow:"0 16px 48px rgba(11,14,24,0.16)",width:280,zIndex:100,overflow:"hidden",padding:6}}>
          <div style={{padding:"9px 12px 6px",fontSize:11,fontWeight:700,color:T.inkFaint,textTransform:"uppercase",letterSpacing:"0.06em"}}>Modèle de génération</div>
          {models.map(m=>{const unlocked=(rank[userPlan]??0)>=(rank[m.minPlan]??0);return(
            <button key={m.id} onClick={()=>{ if(unlocked){onSelect(m.id);setOpen(false);} else {setOpen(false);onUpgrade?.();} }} style={{width:"100%",display:"flex",alignItems:"center",gap:11,padding:"10px 11px",background:selected===m.id&&unlocked?T.indigoSoft:"transparent",border:"none",borderRadius:9,cursor:"pointer",textAlign:"left",transition:"background .12s"}} onMouseEnter={e=>{if(selected!==m.id)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>{if(selected!==m.id)e.currentTarget.style.background="transparent"}}>
              <span style={{width:30,height:30,borderRadius:8,background:unlocked?T.indigoSoft:T.surfaceAlt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{m.icon}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:unlocked?(selected===m.id?T.indigo:T.ink):T.inkFaint}}>{m.name}</div><div style={{fontSize:11,color:T.inkFaint}}>{m.desc}</div></div>
              {!unlocked&&<span style={{fontSize:9,fontWeight:700,color:T.gold,background:T.goldSoft,padding:"3px 8px",borderRadius:20,flexShrink:0}}>🔒 {m.minPlan}</span>}
              {unlocked&&selected===m.id&&<span style={{color:T.indigo}}><Icon name="check" size={15}/></span>}
            </button>
          );})}
        </div>
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STUDIO HEADER — bannière premium pour identifier le studio
// ═══════════════════════════════════════════════════════════════════════════
function StudioHeader({ kicker, title, subtitle, tagline, badges, accent=T.indigo }) {
  return (
    <div style={{position:"relative",borderRadius:18,overflow:"hidden",marginBottom:22,background:T.navBg}}>
      <div style={{position:"absolute",inset:0,backgroundImage:`radial-gradient(${accent}33 1.2px,transparent 1.2px)`,backgroundSize:"22px 22px",opacity:0.5}}/>
      <div style={{position:"absolute",top:"-40%",right:"-5%",width:280,height:280,borderRadius:"50%",background:`radial-gradient(circle,${accent}55,transparent 70%)`,filter:"blur(10px)"}}/>
      <div style={{position:"relative",padding:"26px 28px"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:7,padding:"5px 13px",background:"rgba(255,255,255,0.08)",border:`1px solid ${accent}55`,borderRadius:30,marginBottom:14}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:accent}}/><span style={{fontSize:11,fontWeight:700,color:"#fff",letterSpacing:"1.5px",textTransform:"uppercase"}}>{kicker}</span>
        </div>
        <div style={{fontSize:28,fontWeight:800,color:"#fff",fontFamily:FONT_DISPLAY,letterSpacing:"-0.03em",lineHeight:1.1,marginBottom:8}}>{title}</div>
        <div style={{fontSize:14.5,color:"#C7CDDC",maxWidth:560,lineHeight:1.6,marginBottom:tagline?12:0}}>{subtitle}</div>
        {tagline&&<div style={{fontSize:13,color:accent,fontWeight:600,fontStyle:"italic"}}>{tagline}</div>}
        {badges&&<div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:16}}>{badges.map(b=><span key={b} style={{padding:"5px 12px",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:20,fontSize:11,color:"#C7CDDC",fontWeight:600}}>{b}</span>)}</div>}
      </div>
    </div>
  );
}

function ImageStudio({ userPlan="free" }) {
  // Qualité maximale selon le plan (gratuit = 720p seulement)
  const MAX_Q_BY_PLAN={ free:"720", starter:"1080", visual:"8k", pro:"4k", business:"8k" };
  const Q_ORDER=["720","1080","4k","8k"];
  const Q_LABELS={ "720":"HD 720p","1080":"Full HD","4k":"4K Ultra","8k":"8K Pro" };
  const maxIdx=Q_ORDER.indexOf(MAX_Q_BY_PLAN[userPlan]||"720");
  const allowedQualities=Q_ORDER.slice(0,maxIdx+1);

  const [kind,setKind]=useState("Logo");
  const [subject,setSubject]=useState("");
  const [quality,setQuality]=useState(allowedQualities[allowedQualities.length-1]||"720");
  const [loading,setLoading]=useState(false);
  const [results,setResults]=useState([]);
  const [error,setError]=useState("");
  const isWide=useWide(720);
  const KINDS=[
    {label:"Logo",real:false,k:"logo"},
    {label:"Flyer",real:true,k:"flyer"},
    {label:"Bannière",real:true,k:"banner"},
    {label:"Post réseaux",real:true,k:"social"},
    {label:"Affiche",real:true,k:"poster"},
    {label:"Carte de visite",real:true,k:"card"},
    {label:"Photo produit",real:true,k:"product"},
    {label:"Photo réaliste",real:true,k:"photo"},
    {label:"Mockup",real:true,k:"mockup"},
  ];
  const QUALITIES=allowedQualities.map(id=>[id,Q_LABELS[id]]);
  const active=KINDS.find(x=>x.label===kind)||KINDS[0];

  const gen=async()=>{
    if(!subject.trim())return; setLoading(true); setError("");
    try{
      if(active.real && backend.enabled()){
        const r=await backend.post("/api/studio/generate",{ type:active.k, brief:subject, quality, plan:userPlan });
        setResults(prev=>[{type:"img",url:r.url,base64:r.base64,kind:active.label,subject,quality:r.qualityLabel||quality,id:uid()},...prev]);
      } else if(active.real && !backend.enabled()){
        setError("Les visuels HD nécessitent le backend (mode démo : seuls les logos SVG sont générés ici).");
      } else {
        const r=await generateImageSVG(active.k,subject);
        if(r)setResults(prev=>[{type:"svg",svg:r.svg,kind:active.label,subject,id:uid()},...prev]);
      }
    }catch(e){ setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{flex:1,overflow:"auto",background:T.surfaceAlt}}>
      <div style={{maxWidth:1000,margin:"0 auto",padding:isWide?"32px 36px":"24px 18px"}}>
        <StudioHeader kicker="Studio Graphique" accent={T.gold}
          title="Ton graphiste, propulsé par l’IA"
          subtitle="Flyers, logos, affiches, photos produits, mockups… Décris, et le meilleur moteur IA s’occupe du reste."
          tagline="Crée en 30 secondes ce qui te prendrait des heures."
          badges={["Ideogram V3","Flux Pro","Recraft","Nano Banana","720p → 8K"]}/>
        <div style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:16,padding:22,marginTop:22,marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:T.inkFaint,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>Type de visuel</div>
          <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>{KINDS.map(k=><button key={k.label} onClick={()=>setKind(k.label)} style={{padding:"8px 14px",background:kind===k.label?T.ink:T.surfaceAlt,color:kind===k.label?"#fff":T.inkSoft,border:`1px solid ${kind===k.label?T.ink:T.line}`,borderRadius:9,fontSize:12.5,fontWeight:kind===k.label?700:500,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>{k.label}{k.real&&<span style={{fontSize:9,background:kind===k.label?"#ffffff22":T.greenSoft,color:kind===k.label?"#fff":T.green,padding:"1px 6px",borderRadius:10,fontWeight:700}}>HD</span>}</button>)}</div>
          {active.real&&<><div style={{fontSize:11,fontWeight:700,color:T.inkFaint,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>Qualité</div>
          <div style={{display:"flex",gap:8,marginBottom:maxIdx<3?8:18,flexWrap:"wrap",alignItems:"center"}}>{QUALITIES.map(([id,lbl])=><button key={id} onClick={()=>setQuality(id)} style={{padding:"7px 14px",background:quality===id?T.indigoSoft:T.surfaceAlt,color:quality===id?T.indigo:T.inkSoft,border:`1.5px solid ${quality===id?T.indigo:T.line}`,borderRadius:9,fontSize:12.5,fontWeight:quality===id?700:500,cursor:"pointer"}}>{lbl}</button>)}
          {maxIdx<3&&Q_ORDER.slice(maxIdx+1).map(id=><div key={id} title="Disponible dans un plan supérieur" style={{padding:"7px 14px",background:T.surfaceAlt,color:T.inkFaint,border:`1.5px dashed ${T.line}`,borderRadius:9,fontSize:12.5,fontWeight:500,display:"flex",alignItems:"center",gap:5,opacity:0.7}}>🔒 {Q_LABELS[id]}</div>)}</div>
          {maxIdx<3&&<div style={{fontSize:11.5,color:T.inkFaint,marginBottom:14}}>Les qualités supérieures (4K, 8K) sont incluses dans les plans Pro et Business.</div>}</>}
          <div style={{fontSize:11,fontWeight:700,color:T.inkFaint,letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>Description</div>
          <div style={{display:"flex",gap:10}}>
            <input value={subject} onChange={e=>setSubject(e.target.value)} onKeyDown={e=>e.key==="Enter"&&gen()} placeholder={active.real?`Décris ton ${active.label.toLowerCase()} : ex. promo boutique wax, fond coloré, prix FCFA…`:`Décris ton logo : ex. fintech tontine, or et indigo…`} style={{flex:1,background:T.surfaceAlt,border:`1.5px solid ${T.line}`,borderRadius:11,padding:"12px 15px",fontSize:14,color:T.ink,outline:"none",fontFamily:FONT}} onFocus={e=>e.target.style.borderColor=T.indigo} onBlur={e=>e.target.style.borderColor=T.line}/>
            <button onClick={gen} disabled={loading||!subject.trim()} style={{padding:"0 22px",background:loading?T.inkFaint:T.ink,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:FONT_DISPLAY,display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap"}}>{loading?"…":<><Icon name="wand" size={16}/>Générer</>}</button>
          </div>
        </div>
        {active.real&&<div style={{margin:"-8px 2px 18px",fontSize:12,color:T.inkFaint}}>💎 Visuel {QUALITIES.find(q=>q[0]===quality)?.[1]} · consomme 1 crédit visuel</div>}
        {error&&<div style={{margin:"0 2px 16px",padding:"10px 13px",background:T.redSoft,border:`1px solid ${T.red}33`,borderRadius:9,fontSize:12.5,color:T.red}}>{error}</div>}
        {results.length===0&&!loading&&<div style={{textAlign:"center",padding:"56px 0"}}><div style={{width:60,height:60,borderRadius:15,background:T.surface,border:`1px solid ${T.line}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",color:T.inkFaint}}><Icon name="wand" size={26}/></div><div style={{fontSize:15,fontWeight:600,color:T.ink,fontFamily:FONT_DISPLAY}}>Aucun visuel encore</div><div style={{fontSize:13.5,color:T.inkSoft,marginTop:6}}>Choisis un type, une qualité, et décris ce que tu veux.</div></div>}
        <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${isWide?220:150}px,1fr))`,gap:16}}>
          {results.map(r=>(
            <div key={r.id} style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:14,overflow:"hidden"}}>
              {r.type==="svg"
                ? <div style={{aspectRatio:"1",background:T.surfaceAlt,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} dangerouslySetInnerHTML={{__html:r.svg}}/>
                : <div style={{aspectRatio:"1",background:T.surfaceAlt,overflow:"hidden"}}><img src={r.url||`data:image/webp;base64,${r.base64}`} alt={r.subject} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>}
              <div style={{padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontSize:13,fontWeight:600,color:T.ink}}>{r.kind}</div>{r.quality&&<span style={{fontSize:10,color:T.indigo,fontWeight:700,background:T.indigoSoft,padding:"1px 7px",borderRadius:10}}>{r.quality}</span>}</div>
                <div style={{fontSize:11.5,color:T.inkFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{r.subject}</div>
                <button onClick={()=>{ const a=document.createElement("a"); if(r.type==="svg"){const b=new Blob([r.svg],{type:"image/svg+xml"});a.href=URL.createObjectURL(b);a.download=`visuel-${r.id}.svg`;}else{a.href=r.url||`data:image/webp;base64,${r.base64}`;a.download=`visuel-${r.id}.webp`;} a.click(); }} style={{marginTop:10,width:"100%",padding:"7px",background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:8,color:T.inkSoft,cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Icon name="download" size={13}/>Télécharger</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// v10 — GITHUB MODAL (push / versioning)
// ═══════════════════════════════════════════════════════════════════════════
function GithubModal({ title, code, fullstack, token, setToken, onClose }) {
  const [step,setStep]=useState(token?"ready":"connect");
  const [input,setInput]=useState(token||"");
  const [user,setUser]=useState(null);
  const [isPrivate,setIsPrivate]=useState(true);
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);
  const [err,setErr]=useState("");
  const inp={width:"100%",padding:"11px 13px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:10,fontSize:14,color:T.ink,outline:"none",fontFamily:FONT};

  const connect=async()=>{
    if(!input.trim()){setErr("Colle ton token GitHub.");return;}
    setBusy(true);setErr("");
    if(!backend.enabled()){ setErr("Le backend n’est pas configuré — GitHub nécessite le serveur."); setBusy(false); return; }
    try{ const u=await backend.githubVerify(input.trim()); setUser(u); setToken(input.trim()); setStep("ready"); }
    catch(e){ setErr(e.message); }
    setBusy(false);
  };
  const push=async()=>{
    setBusy(true);setErr("");
    try{
      const files={ [`${(title||"App").replace(/\s+/g,"-")}.jsx`]: code };
      if(fullstack?.backend) files["server.js"]=fullstack.backend;
      if(fullstack?.schema) files["schema.sql"]=fullstack.schema;
      if(fullstack?.apiDocs) files["API.md"]=fullstack.apiDocs;
      files["README.md"]=`# ${title}\n\nGénéré avec AfriBuild AI.`;
      const r=await backend.githubPush({ githubToken:token, appName:title||"afribuild-app", description:`${title} — généré avec AfriBuild`, files, message:msg||"Mise à jour via AfriBuild AI", isPrivate });
      setResult(r); setStep("done");
    }catch(e){ setErr(e.message); }
    setBusy(false);
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{background:T.surface,borderRadius:20,padding:32,width:460,maxWidth:"94vw"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{color:T.ink}}><Icon name="code" size={22}/></div><div style={{fontSize:19,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY}}>GitHub</div></div>
          <button onClick={onClose} style={{width:36,height:36,background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:T.inkSoft}}><Icon name="x" size={16}/></button>
        </div>
        {step==="connect"&&<>
          <div style={{fontSize:14,color:T.inkSoft,marginBottom:18,lineHeight:1.6}}>Connecte ton compte GitHub avec un <strong>token personnel</strong>. Crée-le sur github.com → Settings → Developer settings → Personal access tokens (scope <code style={{background:T.surfaceAlt,padding:"1px 5px",borderRadius:4,fontFamily:FONT_MONO,fontSize:12}}>repo</code>).</div>
          <input type="password" placeholder="ghp_xxxxxxxxxxxx" value={input} onChange={e=>setInput(e.target.value)} style={inp}/>
          {err&&<div style={{padding:"9px 12px",background:T.redSoft,border:`1px solid ${T.red}33`,borderRadius:9,fontSize:12.5,color:T.red,marginTop:12}}>{err}</div>}
          <button onClick={connect} disabled={busy} style={{marginTop:18,width:"100%",padding:"13px",background:busy?T.inkFaint:T.ink,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:busy?"not-allowed":"pointer",fontFamily:FONT_DISPLAY}}>{busy?"Vérification…":"Connecter GitHub"}</button>
        </>}
        {step==="ready"&&<>
          {user&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:T.surfaceAlt,borderRadius:11,marginBottom:16}}><Avatar name={user.login} size={30}/><div><div style={{fontSize:13,fontWeight:600,color:T.ink}}>{user.name||user.login}</div><div style={{fontSize:11.5,color:T.inkFaint}}>@{user.login}</div></div><button onClick={()=>{setToken("");setStep("connect");setInput("")}} style={{marginLeft:"auto",background:"none",border:"none",color:T.inkFaint,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>Changer</button></div>}
          <div style={{fontSize:13,color:T.inkSoft,marginBottom:14}}>Pousse <strong>{title}</strong> sur GitHub. Le dépôt est créé automatiquement, chaque génération crée un commit.</div>
          <input placeholder="Message de commit (optionnel)" value={msg} onChange={e=>setMsg(e.target.value)} style={{...inp,marginBottom:12}}/>
          <label style={{display:"flex",alignItems:"center",gap:9,fontSize:13,color:T.inkSoft,cursor:"pointer",marginBottom:18}}><input type="checkbox" checked={isPrivate} onChange={e=>setIsPrivate(e.target.checked)} style={{width:16,height:16,accentColor:T.indigo}}/>Dépôt privé</label>
          {err&&<div style={{padding:"9px 12px",background:T.redSoft,border:`1px solid ${T.red}33`,borderRadius:9,fontSize:12.5,color:T.red,marginBottom:14}}>{err}</div>}
          <button onClick={push} disabled={busy} style={{width:"100%",padding:"13px",background:busy?T.inkFaint:T.ink,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:busy?"not-allowed":"pointer",fontFamily:FONT_DISPLAY,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>{busy?"Push en cours…":<><Icon name="code" size={16}/>Pousser sur GitHub</>}</button>
        </>}
        {step==="done"&&result&&<div style={{textAlign:"center"}}>
          <div style={{width:60,height:60,borderRadius:"50%",background:T.greenSoft,border:`2px solid ${T.green}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",color:T.green}}><Icon name="check" size={26}/></div>
          <div style={{fontSize:19,fontWeight:800,color:T.ink,marginBottom:6,fontFamily:FONT_DISPLAY}}>Poussé sur GitHub !</div>
          <div style={{fontSize:13.5,color:T.inkSoft,marginBottom:18}}>{result.commits?.length||0} fichier(s) commités dans <strong>{result.owner}/{result.repo}</strong></div>
          <div style={{display:"flex",gap:10}}><button onClick={()=>window.open(result.repoUrl,"_blank")} style={{flex:1,padding:"12px",background:T.ink,border:"none",borderRadius:11,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:FONT_DISPLAY}}>Voir le dépôt</button><button onClick={onClose} style={{flex:1,padding:"12px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,color:T.inkSoft,cursor:"pointer",fontSize:14,fontWeight:600}}>Fermer</button></div>
        </div>}
      </div>
    </Overlay>
  );
}

// ─── GLOBAL STYLE ────────────────────────────────────────────────────────────
function GlobalStyle() {
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box}
    html,body,#root{margin:0;padding:0;height:100%}
    body{font-family:${FONT};-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    button{font-family:inherit}
    textarea,input{font-family:inherit}
    textarea::placeholder,input::placeholder{color:#9AA3B8}
    ::-webkit-scrollbar{width:8px;height:8px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:#D4D9E4;border-radius:4px}
    ::-webkit-scrollbar-thumb:hover{background:#B4BBCB}
    @keyframes abspin{to{transform:rotate(360deg)}}
    @keyframes abpulse{0%,100%{opacity:1}50%{opacity:0.35}}
    @keyframes abfade{from{opacity:0}to{opacity:1}}
    @keyframes abslide{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes abmic{0%,100%{box-shadow:0 0 0 4px rgba(229,72,77,0.16)}50%{box-shadow:0 0 0 9px rgba(229,72,77,0.05)}}
  `}</style>;
}


// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD VIEW
// ═══════════════════════════════════════════════════════════════════════════
function DashboardView({ user, projects, onOpen, onDelete, onNew }) {
  const [search,setSearch]=useState("");
  const isWide=useWide(720);
  const filtered=projects.filter(p=>p.title.toLowerCase().includes(search.toLowerCase()));
  const stats=[
    {label:"Projets",value:projects.length,color:T.indigo},
    {label:"En ligne",value:projects.filter(p=>p.deployUrl).length,color:T.green},
    {label:"Crédits",value:user.credits,color:T.gold},
    {label:"Plan",value:PLANS.find(p=>p.id===user.plan)?.name||"Découverte",color:"#8B5CF6"},
  ];
  return (
    <div style={{flex:1,overflow:"auto",background:T.surfaceAlt}}>
      <div style={{maxWidth:1140,margin:"0 auto",padding:isWide?"32px 36px":"24px 18px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:26,flexWrap:"wrap",gap:14}}>
          <div><div style={{fontSize:24,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY,letterSpacing:"-0.03em"}}>Tes projets</div><div style={{fontSize:14,color:T.inkSoft,marginTop:3}}>{projects.length} application{projects.length!==1?"s":""}</div></div>
          <button onClick={onNew} style={{padding:"11px 20px",background:T.ink,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontFamily:FONT_DISPLAY}}><Icon name="plus" size={17}/>Nouveau projet</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isWide?"repeat(5,1fr)":"1fr 1fr",gap:10,marginBottom:26}}>
          {stats.map(s=><div key={s.label} style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:15,padding:"18px 20px"}}><div style={{fontSize:11.5,color:T.inkFaint,fontWeight:600,marginBottom:9,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.label}</div><div style={{fontSize:27,fontWeight:800,color:s.color,fontFamily:FONT_DISPLAY}}>{s.value}</div></div>)}
        </div>
        <div style={{position:"relative",marginBottom:20,maxWidth:380}}>
          <div style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:T.inkFaint}}><Icon name="search" size={17}/></div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un projet…" style={{width:"100%",padding:"11px 14px 11px 40px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,fontSize:14,color:T.ink,outline:"none",fontFamily:FONT}} onFocus={e=>e.target.style.borderColor=T.indigo} onBlur={e=>e.target.style.borderColor=T.line}/>
        </div>
        {filtered.length===0?(
          <div style={{textAlign:"center",padding:"72px 0"}}>
            <div style={{width:64,height:64,borderRadius:16,background:T.surface,border:`1px solid ${T.line}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",color:T.inkFaint}}><Icon name="folder" size={28}/></div>
            <div style={{fontSize:16,fontWeight:700,color:T.ink,marginBottom:7,fontFamily:FONT_DISPLAY}}>{search?"Aucun résultat":"Aucun projet"}</div>
            <div style={{fontSize:14,color:T.inkSoft,marginBottom:24}}>{search?"Essaie un autre terme.":"Crée ta première application africaine."}</div>
            {!search&&<button onClick={onNew} style={{padding:"11px 24px",background:T.ink,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:FONT_DISPLAY}}>Commencer</button>}
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${isWide?280:150}px,1fr))`,gap:16}}>
            {filtered.map(p=>(
              <div key={p.id} style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:15,overflow:"hidden",transition:"box-shadow .2s, transform .2s",cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 28px rgba(11,14,24,0.1)";e.currentTarget.style.transform="translateY(-2px)"}} onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="translateY(0)"}}>
                <div onClick={()=>onOpen(p)} style={{height:130,background:`linear-gradient(135deg,${T.indigoSoft},${T.goldSoft})`,borderBottom:`1px solid ${T.line}`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
                  <div style={{color:T.indigo,opacity:0.5}}><Icon name="layers" size={36}/></div>
                  {p.deployUrl&&<div style={{position:"absolute",top:10,right:10}}><Badge color={T.green} soft={T.greenSoft}>En ligne</Badge></div>}
                </div>
                <div style={{padding:"14px 16px"}}>
                  <div style={{fontSize:14,fontWeight:700,color:T.ink,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title}</div>
                  <div style={{fontSize:12,color:T.inkFaint,marginBottom:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.prompt?.slice(0,52)}…</div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{fontSize:11,color:T.inkFaint}}>{p.time}</span>
                    <div style={{display:"flex",gap:6}}><button onClick={()=>onOpen(p)} style={{padding:"5px 13px",background:T.indigoSoft,border:"none",borderRadius:8,color:T.indigo,cursor:"pointer",fontSize:12,fontWeight:600}}>Ouvrir</button><button onClick={()=>onDelete(p.id)} style={{width:28,height:28,background:T.surface,border:`1px solid ${T.line}`,borderRadius:8,color:T.inkFaint,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="x" size={13}/></button></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user,setUser]=useState(()=>ls.get("ab7_user",null));
  const [view,setView]=useState("builder");
  const [navOpen,setNavOpen]=useState(false);
  const [prompt,setPrompt]=useState("");
  const [phase,setPhase]=useState("idle");
  const [result,setResult]=useState(null);
  const [liveCode,setLiveCode]=useState(null);
  const [error,setError]=useState("");
  const [tab,setTab]=useState("preview");
  const [previewMode,setPreviewMode]=useState("desktop");
  const [projects,setProjects]=useState(()=>ls.get("ab7_projects",[]));
  const [activeAgents,setActiveAgents]=useState([]);
  const [agentLogs,setAgentLogs]=useState(null);
  const [progress,setProgress]=useState(0);
  const [sidebarTab,setSidebarTab]=useState("templates");
  const [showPricing,setShowPricing]=useState(false);
  const [noCreditsFor,setNoCreditsFor]=useState(null); // action bloquée faute de crédits
  // Dépense des crédits pour une action. Retourne false (et bloque) si pas assez.
  const spendCredits=useCallback((action)=>{
    const cost=ACTION_COST[action]||1;
    if((user?.credits||0)<cost){ setNoCreditsFor({action,cost}); return false; }
    setUser(u=>({...u,credits:Math.max(0,(u?.credits||0)-cost)}));
    return true;
  },[user]);
  const [showChat,setShowChat]=useState(false);
  const [showDeploy,setShowDeploy]=useState(false);
  const [showBrand,setShowBrand]=useState(false);
  const [brandData,setBrandData]=useState(null);
  const [previewError,setPreviewError]=useState(null);
  const [autoFixing,setAutoFixing]=useState(false);
  const [autoFixAttempts,setAutoFixAttempts]=useState(0);
  const [voiceLang,setVoiceLang]=useState("fr");
  const [voiceTranslating,setVoiceTranslating]=useState(false);
  const [originalVoice,setOriginalVoice]=useState("");
  const [selectedModel,setSelectedModel]=useState("balanced");
  const [genMode,setGenMode]=useState("frontend");
  const [fullstack,setFullstack]=useState(null);
  const [showBuild,setShowBuild]=useState(false);
  const [showGithub,setShowGithub]=useState(false);
  const [githubToken,setGithubToken]=useState(()=>ls.get("ab_ghtoken",""));
  const [projectMemory,setProjectMemory]=useState(null);
  const [selectedAgent,setSelectedAgent]=useState(null);
  const isWide=useWide(900);
  const planData=PLANS.find(p=>p.id===user?.plan)||PLANS[0];

  useEffect(()=>{if(user)ls.set("ab7_user",user)},[user]);
  useEffect(()=>{ if(user && backend.enabled() && !backend.token){ backend.auth(user.id,user.email); } },[user]);
  useEffect(()=>{ ls.set("ab_ghtoken",githubToken); },[githubToken]);
  useEffect(()=>{ls.set("ab7_projects",projects)},[projects]);
  useEffect(()=>{if(!isWide)setNavOpen(false)},[view,isWide]);

  useEffect(()=>{
    if(phase!=="generating"){setActiveAgents([]);setProgress(0);return;}
    const seq=[{a:["planner"],p:14,d:0},{a:["planner","design"],p:30,d:1400},{a:["design","frontend"],p:52,d:3200},{a:["frontend","backend"],p:72,d:5200},{a:["backend","qa"],p:88,d:7200},{a:["qa"],p:96,d:9000}];
    const t=seq.map(s=>setTimeout(()=>{setActiveAgents(s.a);setProgress(s.p)},s.d));
    return ()=>t.forEach(clearTimeout);
  },[phase]);

  const handlePreviewError=useCallback(async(msg)=>{
    if(autoFixing||!liveCode||autoFixAttempts>=3)return;
    setAutoFixing(true);setAutoFixAttempts(n=>n+1);
    try{
      const raw=await callAI("claude",`Dev React senior. Corrige l’erreur. JSON: {"code":"…corrigé complet…"}`,`Erreur: ${msg}\nCode:\n${liveCode.slice(0,8000)}`,6000);
      const m=raw.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim().match(/\{[\s\S]*\}/);
      const parsed=JSON.parse(m?m[0]:raw);
      if(parsed.code){setLiveCode(parsed.code);setPreviewError(null);}
    }catch{}
    setAutoFixing(false);
  },[liveCode,autoFixing,autoFixAttempts]);

  const generate=useCallback(async(override)=>{
    const p=override||prompt;
    if(!p.trim()||phase==="generating")return;
    if((user?.credits||0)<ACTION_COST.generate){setNoCreditsFor({action:"generate",cost:ACTION_COST.generate});return;}
    setPhase("generating");setResult(null);setLiveCode(null);setError("");setTab("preview");setAgentLogs(null);setPreviewError(null);setFullstack(null);setAutoFixAttempts(0);
    try{
      const sys=genMode==="fullstack"?FULLSTACK_SYSTEM_PROMPT:genMode==="mobile"?MOBILE_SYSTEM_PROMPT:SYSTEM_PROMPT;
      const ctx=selectedAgent?`\n\nAGENT SPÉCIALISÉ: ${selectedAgent.systemPrompt}`:"";
      const africa=buildAfricaExpertContext(p);
      const mem=projectMemory?`\n\nMÉMOIRE DU PROJET (garde la cohérence):\n${projectMemory.summary||""}${(projectMemory.history||[]).slice(-3).map(h=>"\n- "+h).join("")}`:"";
      const extras=ADMIN_PANEL_DIRECTIVE+BUSINESS_DIRECTIVE+RECEIPT_DIRECTIVE+VISUAL_DIRECTIVE+DOC_DIRECTIVE;
      const planModel=AI_MODELS.find(m=>m.id===selectedModel)?.model||AI_TIERS[planData?.ai||"balanced"]?.id||MODEL;
      const raw=await callAI(planModel,sys,`Génère une app PROFESSIONNELLE indistinguable d’une équipe senior. Min 3 vues, données africaines denses, vraies interactions.\n\n${p}${ctx}${africa}${mem}${extras}`,genMode==="fullstack"?8000:7000);
      const clean=raw.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
      const parsed=JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0]||clean);
      if(genMode==="fullstack"){if(!parsed.frontend)throw new Error("Pas de frontend généré.");setFullstack(parsed);parsed.code=parsed.frontend;}
      if(!parsed.code)throw new Error("Aucun code généré. Précise ta demande.");
      setResult(parsed);setLiveCode(parsed.code);setAgentLogs(parsed.agentLogs);setProgress(100);setActiveAgents([]);
      setUser(u=>({...u,credits:Math.max(0,(u?.credits||0)-ACTION_COST.generate)}));
      const entry={id:uid(),title:parsed.title,prompt:p,result:parsed,code:parsed.code,time:new Date().toLocaleString("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}),deployUrl:null};
      setProjects(prev=>[entry,...prev.slice(0,19)]);setPhase("done");
      // Mémoire : on retient ce qui vient d’être généré
      const newMem={ summary:`App "${parsed.title}" — ${parsed.description||""}. Stack: ${(parsed.stack||[]).join(", ")}.`, decisions:parsed.stack||[], history:[...(projectMemory?.history||[]),`Généré: ${p.slice(0,80)}`] };
      setProjectMemory(newMem);
      if(backend.enabled()){ backend.saveMemory(entry.id,newMem); }
      // VISUELS AUTO : si l’app a déclaré des besoins en images, on les génère et on les injecte
      if(backend.enabled() && Array.isArray(parsed.visualNeeds) && parsed.visualNeeds.length){
        (async()=>{
          try{
            const visuals={};
            for(const need of parsed.visualNeeds.slice(0,6)){
              try{
                const r=await backend.post("/api/studio/generate",{ type:need.type||"photo", brief:need.brief||parsed.title, quality:"1080", plan:user?.plan||"free" });
                if(r.url||r.base64) visuals[need.slot]=r.url||`data:image/webp;base64,${r.base64}`;
              }catch{}
            }
            if(Object.keys(visuals).length){
              // Injecte les vraies URLs dans la constante VISUALS du code généré
              const inject=`const VISUALS=${JSON.stringify(visuals)};`;
              let newCode=parsed.code;
              if(/const\s+VISUALS\s*=/.test(newCode)) newCode=newCode.replace(/const\s+VISUALS\s*=\s*\{[^}]*\}\s*;?/, inject);
              else newCode=inject+"\n"+newCode;
              setLiveCode(newCode);
              setProjects(prev=>prev.map(x=>x.id===entry.id?{...x,code:newCode}:x));
            }
          }catch{}
        })();
      }
    }catch(e){setError(e.message);setPhase("error");}
  },[prompt,phase,user,genMode,selectedModel,selectedAgent]);

  const openProject=p=>{setResult(p.result);setLiveCode(p.code);setAgentLogs(p.result?.agentLogs);setPrompt(p.prompt);setFullstack(p.result?.frontend?p.result:null);setPhase("done");setTab("preview");setView("builder");};
  const downloadCode=()=>{if(!liveCode)return;const b=new Blob([liveCode],{type:"text/javascript"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`${result?.title?.replace(/\s+/g,"-")||"App"}.jsx`;a.click();URL.revokeObjectURL(u);};
  const doBrand=async()=>{setShowBrand(true);setBrandData(null);const b=await generateBrand(result?.title||"App",result?.description||"");setBrandData(b);};
  const pw=previewMode==="mobile"?390:previewMode==="tablet"?768:"100%";

  if(!user) return <><GlobalStyle/><AuthScreen onAuth={async u=>{ if(backend.enabled()){ await backend.auth(u.id,u.email); } setUser(u); ls.set("ab7_user",u); }}/></>;

  const NAV=[["builder","spark","Studio"],["templates","layers","Modèles"],["dashboard","folder","Projets"],["database","grid","Base de données"],["images","wand","Studio graphique"],["marketplace","grid","Agents"],["voice","mic","Voix"],["payments","card","Paiements"]];

  return (
    <div style={{display:"flex",height:"100vh",background:T.surfaceAlt,fontFamily:FONT,overflow:"hidden",color:T.ink}}>
      <GlobalStyle/>
      {/* mobile nav overlay */}
      {navOpen && !isWide && <div onClick={()=>setNavOpen(false)} style={{position:"fixed",inset:0,background:"rgba(11,14,24,0.5)",zIndex:80,backdropFilter:"blur(2px)"}}/>}

      {/* SIDEBAR */}
      <div style={{width:248,background:T.navBg,display:"flex",flexDirection:"column",flexShrink:0,position:isWide?"relative":"fixed",left:isWide?0:navOpen?0:-260,top:0,bottom:0,zIndex:85,transition:"left .25s ease",boxShadow:!isWide&&navOpen?"0 0 60px rgba(0,0,0,0.4)":"none"}}>
        <div style={{padding:"18px 16px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:16}}>
            <Logo size={38}/>
            <div><div style={{fontSize:16,fontWeight:800,color:"#fff",fontFamily:FONT_DISPLAY,letterSpacing:"-0.02em"}}>AfriBuild</div><div style={{fontSize:9.5,color:T.navInkSoft,letterSpacing:"0.16em",textTransform:"uppercase"}}>AI Studio</div></div>
          </div>
          <button onClick={()=>setShowPricing(true)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:T.navActive,border:`1px solid ${T.navLine}`,borderRadius:11,cursor:"pointer",transition:"border-color .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.gold+"66"} onMouseLeave={e=>e.currentTarget.style.borderColor=T.navLine}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:7,height:7,borderRadius:"50%",background:planData.color}}/><span style={{fontSize:12.5,fontWeight:600,color:T.navInk}}>{planData.name}</span></div>
            <span style={{fontSize:12,color:T.gold,fontWeight:700}}>{user.credits} ⚡</span>
          </button>
          <button onClick={()=>{setView("payments");}} style={{width:"100%",marginTop:7,padding:"8px 12px",background:"transparent",border:`1px solid ${T.gold}55`,borderRadius:10,cursor:"pointer",color:T.gold,fontSize:11.5,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.gold+"15"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>+ Acheter des crédits</button>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"4px 10px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:16}}>
            {NAV.map(([id,icon,label])=>(
              <button key={id} onClick={()=>setView(id)} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 12px",background:view===id?T.navActive:"transparent",border:"none",borderRadius:10,color:view===id?"#fff":T.navInk,cursor:"pointer",fontSize:13.5,fontWeight:view===id?600:500,transition:"all .15s",position:"relative"}} onMouseEnter={e=>{if(view!==id)e.currentTarget.style.background=T.navActive+"99"}} onMouseLeave={e=>{if(view!==id)e.currentTarget.style.background="transparent"}}>
                {view===id&&<div style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:18,background:T.gold,borderRadius:3}}/>}
                <span style={{color:view===id?T.gold:T.navInkSoft}}><Icon name={icon} size={18}/></span>{label}
                {id==="dashboard"&&projects.length>0&&<span style={{marginLeft:"auto",fontSize:10.5,background:T.navLine,color:T.navInk,padding:"1px 7px",borderRadius:10,fontWeight:700}}>{projects.length}</span>}
              </button>
            ))}
          </div>
          {view==="builder"&&(
            <div style={{borderTop:`1px solid ${T.navLine}`,paddingTop:14}}>
              <div style={{display:"flex",gap:4,marginBottom:8,padding:"0 2px"}}>
                {[["templates","Secteurs"],["history","Récents"]].map(([id,l])=><button key={id} onClick={()=>setSidebarTab(id)} style={{flex:1,padding:"7px",background:sidebarTab===id?T.navActive:"transparent",border:"none",borderRadius:8,color:sidebarTab===id?"#fff":T.navInkSoft,cursor:"pointer",fontSize:11.5,fontWeight:sidebarTab===id?600:500}}>{l}</button>)}
              </div>
              {sidebarTab==="templates"?(
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {TEMPLATES.map(t=><button key={t.label} onClick={()=>{setPrompt(t.prompt);generate(t.prompt);}} style={{background:"transparent",border:"none",borderRadius:9,padding:"9px 11px",color:T.navInk,cursor:"pointer",textAlign:"left",fontSize:12.5,display:"flex",alignItems:"center",gap:10,transition:"background .12s",width:"100%"}} onMouseEnter={e=>e.currentTarget.style.background=T.navActive} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{color:t.accent,fontSize:9}}>{t.icon}</span>{t.label}</button>)}
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {projects.slice(0,8).map(p=><button key={p.id} onClick={()=>openProject(p)} style={{background:"transparent",border:"none",borderRadius:9,padding:"9px 11px",cursor:"pointer",textAlign:"left",transition:"background .12s",width:"100%"}} onMouseEnter={e=>e.currentTarget.style.background=T.navActive} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{fontSize:12.5,fontWeight:500,color:T.navInk,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title}</div><div style={{fontSize:10,color:T.navInkSoft,marginTop:1}}>{p.time}</div></button>)}
                  {projects.length===0&&<div style={{fontSize:12,color:T.navInkSoft,padding:"12px 6px",fontStyle:"italic"}}>Aucun projet</div>}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{padding:"12px 12px",borderTop:`1px solid ${T.navLine}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:11,background:T.navActive}}>
            <Avatar name={user.name||user.email} size={32}/>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name||user.email}</div><div style={{fontSize:10.5,color:T.navInkSoft}}>{user.isDemo?"Mode démo":planData.name}</div></div>
            <button onClick={()=>{setUser(null);ls.del("ab7_user")}} title="Déconnexion" style={{background:"none",border:"none",color:T.navInkSoft,cursor:"pointer",padding:4,display:"flex"}}><Icon name="logout" size={16}/></button>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        {/* mobile topbar */}
        {!isWide && (
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:T.surface,borderBottom:`1px solid ${T.line}`,flexShrink:0}}>
            <button onClick={()=>setNavOpen(true)} style={{width:38,height:38,background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:3}}>
              {[0,1,2].map(i=><div key={i} style={{width:16,height:2,background:T.ink,borderRadius:2}}/>)}
            </button>
            <span style={{fontSize:15,fontWeight:700,fontFamily:FONT_DISPLAY,color:T.ink}}>{NAV.find(n=>n[0]===view)?.[2]}</span>
          </div>
        )}
        {view==="templates"?(
          <div style={{flex:1,overflow:"auto",background:T.surfaceAlt}}>
            <div style={{maxWidth:1140,margin:"0 auto",padding:isWide?"32px 36px":"24px 18px"}}>
              <div style={{marginBottom:6}}><div style={{fontSize:24,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY,letterSpacing:"-0.03em"}}>Modèles prêts à l’emploi</div><div style={{fontSize:14,color:T.inkSoft,marginTop:3}}>Clique sur un modèle, l’application est générée et pré-remplie.</div></div>
              <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${isWide?300:160}px,1fr))`,gap:16,marginTop:22}}>
                {STARTER_TEMPLATES.map(t=>(
                  <div key={t.id} onClick={()=>{setView("builder");setPrompt(t.prompt);setTimeout(()=>generate(t.prompt),60);}} style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:15,overflow:"hidden",cursor:"pointer",transition:"box-shadow .2s, transform .2s",position:"relative"}} onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 28px rgba(11,14,24,0.1)";e.currentTarget.style.transform="translateY(-2px)"}} onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="translateY(0)"}}>
                    {t.popular&&<div style={{position:"absolute",top:12,right:12,zIndex:2}}><Badge color={T.gold} soft={T.goldSoft}>Populaire</Badge></div>}
                    <div style={{height:96,background:`linear-gradient(135deg,${t.color}18,${t.color}07)`,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:48,height:48,borderRadius:13,background:t.color+"22",display:"flex",alignItems:"center",justifyContent:"center",color:t.color,fontSize:11}}>{t.icon}</div></div>
                    <div style={{padding:"15px 17px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}><span style={{fontSize:15,fontWeight:700,color:T.ink,fontFamily:FONT_DISPLAY}}>{t.name}</span></div>
                      <div style={{fontSize:11,color:T.inkFaint,marginBottom:8}}>{t.cat}</div>
                      <div style={{fontSize:12.5,color:T.inkSoft,lineHeight:1.6,marginBottom:14}}>{t.desc}</div>
                      <div style={{display:"flex",alignItems:"center",gap:7,color:t.color,fontSize:13,fontWeight:700}}><Icon name="spark" size={15}/>Générer cette app</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ):view==="database"?(
          <DBDesigner/>
        ):view==="images"?(
          <ImageStudio userPlan={user?.plan||"free"}/>
        ):view==="dashboard"?(
          <DashboardView user={user} projects={projects} onOpen={openProject} onDelete={id=>setProjects(prev=>prev.filter(p=>p.id!==id))} onNew={()=>{setView("builder");setPhase("idle");setResult(null);setLiveCode(null);setPrompt("");}}/>
        ):view==="marketplace"?(
          <div style={{flex:1,overflow:"auto",background:T.surfaceAlt}}>
            <div style={{maxWidth:1140,margin:"0 auto",padding:isWide?"32px 36px":"24px 18px"}}>
              <div style={{marginBottom:6}}><div style={{fontSize:24,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY,letterSpacing:"-0.03em"}}>Marketplace d’agents</div><div style={{fontSize:14,color:T.inkSoft,marginTop:3}}>{MARKETPLACE_AGENTS.length} agents spécialisés pour chaque secteur africain</div></div>
              <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${isWide?280:160}px,1fr))`,gap:14,marginTop:22}}>
                {MARKETPLACE_AGENTS.map(a=>(
                  <div key={a.id} style={{background:T.surface,border:`1px solid ${selectedAgent?.id===a.id?T.indigo:T.line}`,borderRadius:15,overflow:"hidden",transition:"box-shadow .2s, transform .2s"}} onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 28px rgba(11,14,24,0.1)";e.currentTarget.style.transform="translateY(-2px)"}} onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="translateY(0)"}}>
                    <div style={{height:70,background:`linear-gradient(135deg,${a.color}14,${a.color}06)`,display:"flex",alignItems:"center",padding:"0 18px",gap:13}}>
                      <div style={{width:42,height:42,borderRadius:12,background:a.color+"1F",display:"flex",alignItems:"center",justifyContent:"center",fontSize:21,flexShrink:0}}>{a.icon}</div>
                      <div style={{flex:1,minWidth:0}}><div style={{fontSize:13.5,fontWeight:700,color:T.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div><div style={{fontSize:11,color:T.inkFaint}}>{a.category}</div></div>
                      {a.price===0?<Badge color={T.green} soft={T.greenSoft}>Gratuit</Badge>:<span style={{fontSize:12,fontWeight:700,color:a.color}}>{fmt(a.price)} F</span>}
                    </div>
                    <div style={{padding:"13px 16px"}}>
                      <div style={{fontSize:12,color:T.inkSoft,lineHeight:1.6,marginBottom:11,minHeight:38}}>{a.description}</div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,fontSize:11,color:T.inkFaint}}><span style={{color:T.gold}}>★ {a.rating}</span><span>·</span><span>{fmt(a.downloads)} usages</span></div>
                      <button onClick={()=>{setSelectedAgent(a);setView("builder");}} style={{width:"100%",padding:"9px",background:selectedAgent?.id===a.id?T.indigoSoft:T.ink,color:selectedAgent?.id===a.id?T.indigo:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontSize:12.5,fontWeight:700,fontFamily:FONT_DISPLAY}}>{selectedAgent?.id===a.id?"Sélectionné ✓":"Utiliser cet agent"}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ):view==="voice"?(
          <div style={{flex:1,overflow:"auto",background:T.surfaceAlt}}>
            <div style={{maxWidth:820,margin:"0 auto",padding:isWide?"32px 36px":"24px 18px"}}>
              <div style={{marginBottom:6}}><div style={{fontSize:24,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY,letterSpacing:"-0.03em"}}>Dictée vocale africaine</div><div style={{fontSize:14,color:T.inkSoft,marginTop:3}}>Décris ton application dans ta langue. AfriBuild comprend et traduit.</div></div>
              <div style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:16,padding:24,marginTop:22,marginBottom:18}}>
                <div style={{fontSize:15,fontWeight:700,color:T.ink,marginBottom:4,fontFamily:FONT_DISPLAY}}>Essaie maintenant</div>
                <div style={{fontSize:13,color:T.inkSoft,marginBottom:16}}>Appuie sur le micro et parle. Ton prompt sera traduit automatiquement.</div>
                <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{padding:"13px 15px",background:T.surfaceAlt,border:`1.5px solid ${T.line}`,borderRadius:12,fontSize:14,color:prompt?T.ink:T.inkFaint,minHeight:58,lineHeight:1.6}}>{prompt||(AFRICAN_LANGUAGES.find(l=>l.code===voiceLang)?.hint||"Parle…")}</div>
                    {originalVoice&&<div style={{marginTop:8,fontSize:12,color:T.inkSoft}}><strong>{AFRICAN_LANGUAGES.find(l=>l.code===voiceLang)?.name}:</strong> “{originalVoice}”</div>}
                  </div>
                  <VoiceButton currentLang={voiceLang} onLangChange={setVoiceLang} onTranslating={setVoiceTranslating} onTranscript={(tr,or,lg)=>{setPrompt(tr);setOriginalVoice(lg!=="fr"&&lg!=="en"?or:"");}}/>
                </div>
                {prompt&&<button onClick={()=>{setView("builder");setTimeout(()=>generate(),100);}} style={{marginTop:15,padding:"11px 24px",background:T.ink,color:"#fff",border:"none",borderRadius:11,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:FONT_DISPLAY}}>Générer cette app →</button>}
              </div>
              <div style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:16,padding:24}}>
                <div style={{fontSize:15,fontWeight:700,color:T.ink,marginBottom:16,fontFamily:FONT_DISPLAY}}>{AFRICAN_LANGUAGES.length} langues supportées</div>
                <div style={{display:"grid",gridTemplateColumns:isWide?"1fr 1fr":"1fr",gap:10}}>
                  {AFRICAN_LANGUAGES.map(l=>(
                    <button key={l.code} onClick={()=>setVoiceLang(l.code)} style={{padding:"14px 16px",background:voiceLang===l.code?T.indigoSoft:T.surfaceAlt,border:`1.5px solid ${voiceLang===l.code?T.indigo:T.line}`,borderRadius:12,cursor:"pointer",textAlign:"left",transition:"all .15s"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}><span style={{fontSize:21}}>{l.flag}</span><span style={{fontSize:14,fontWeight:700,color:voiceLang===l.code?T.indigo:T.ink}}>{l.name}</span>{voiceLang===l.code&&<span style={{marginLeft:"auto"}}><Badge color={T.indigo} soft={T.indigoSoft}>Actif</Badge></span>}</div>
                      <div style={{fontSize:11.5,color:T.inkFaint}}>{l.region}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ):view==="payments"?(
          <div style={{flex:1,overflow:"auto",background:T.surfaceAlt}}>
            <div style={{maxWidth:820,margin:"0 auto",padding:isWide?"32px 36px":"24px 18px"}}>
              <div style={{marginBottom:6}}><div style={{fontSize:24,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY,letterSpacing:"-0.03em"}}>Paiements & facturation</div><div style={{fontSize:14,color:T.inkSoft,marginTop:3}}>Gère ton abonnement, tes crédits et tes moyens de paiement.</div></div>
              <div style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:16,padding:24,marginTop:22,marginBottom:18}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
                  <div style={{fontSize:15,fontWeight:700,color:T.ink,fontFamily:FONT_DISPLAY}}>Abonnement actuel</div>
                  <button onClick={()=>setShowPricing(true)} style={{padding:"8px 16px",background:T.ink,color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer"}}>Changer de plan</button>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:180}}><div style={{fontSize:21,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY}}>Plan {planData.name}</div><div style={{fontSize:13,color:T.inkSoft,marginTop:4}}>{user.credits} crédits restants</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:22,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY}}>{fmt(planData.price)} F</div><div style={{fontSize:12,color:T.inkFaint}}>par mois</div></div>
                </div>
              </div>
              <div style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:16,padding:24,marginBottom:18}}>
                <div style={{fontSize:15,fontWeight:700,color:T.ink,marginBottom:16,fontFamily:FONT_DISPLAY}}>Passerelles disponibles</div>
                {[["CinetPay","Côte d’Ivoire · Sénégal · Mali · Cameroun","\u{1F1E8}\u{1F1EE}",T.indigo],["Flutterwave","Nigeria · Ghana · Kenya · +30 pays","\u{1F30D}","#EA580C"],["Kkiapay","Bénin · Togo · Afrique de l’Ouest","\u{1F1E7}\u{1F1EF}","#8B5CF6"],["Mobile Money","MTN · Orange · Wave · M-Pesa","\u{1F4F1}",T.green],["Visa / Mastercard","International","\u{1F4B3}",T.ink]].map(([n,r,f,c])=>(
                  <div key={n} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 15px",background:T.surfaceAlt,borderRadius:11,marginBottom:9}}>
                    <span style={{fontSize:21}}>{f}</span>
                    <div style={{flex:1}}><div style={{fontSize:13.5,fontWeight:700,color:c}}>{n}</div><div style={{fontSize:11.5,color:T.inkFaint,marginTop:1}}>{r}</div></div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:T.green}}/><span style={{fontSize:12,color:T.green,fontWeight:600}}>Actif</span></div>
                  </div>
                ))}
              </div>
              <div style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:16,padding:24,marginBottom:18}}>
                <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:6}}><div style={{fontSize:15,fontWeight:700,color:T.ink,fontFamily:FONT_DISPLAY}}>Recharger en crédits d’apps</div><span style={{fontSize:12,color:T.green,fontWeight:600}}>Plus tu prends, moins c’est cher · n’expirent jamais</span></div>
                <div style={{fontSize:12.5,color:T.inkSoft,marginBottom:16}}>1 crédit = 1 génération d’application.</div>
                <div style={{display:"grid",gridTemplateColumns:isWide?"repeat(3,1fr)":"1fr",gap:12}}>
                  {CREDIT_PACKS.map(pk=><div key={pk.credits} style={{padding:18,background:pk.best?T.indigoSoft:T.surfaceAlt,border:`1.5px solid ${pk.best?T.indigo:pk.popular?T.indigo+"66":T.line}`,borderRadius:13,cursor:"pointer",position:"relative"}}>{pk.best&&<div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)"}}><Badge color={T.indigo} soft={T.surface}>Meilleure offre</Badge></div>}{pk.popular&&!pk.best&&<div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)"}}><Badge color={T.green} soft={T.surface}>Populaire</Badge></div>}<div style={{fontSize:28,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY}}>{pk.credits}</div><div style={{fontSize:12,color:T.inkFaint,marginBottom:8}}>générations</div><div style={{fontSize:16,fontWeight:700,color:T.ink}}>{fmt(pk.price)} F</div><div style={{fontSize:11,color:pk.best?T.indigo:T.inkFaint,marginTop:4,fontWeight:pk.best?700:400}}>{pk.per} F / app{pk.per<133?` · −${Math.round((1-pk.per/133)*100)}%`:""}</div></div>)}
                </div>
              </div>
              <div style={{background:T.surface,border:`1px solid ${T.line}`,borderRadius:16,padding:24}}>
                <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:6}}><div style={{fontSize:15,fontWeight:700,color:T.ink,fontFamily:FONT_DISPLAY}}>Recharger en crédits visuels</div><span style={{fontSize:12,color:T.green,fontWeight:600}}>Flyers, logos, photos · n’expirent jamais</span></div>
                <div style={{fontSize:12.5,color:T.inkSoft,marginBottom:16}}>1 visuel chez un graphiste coûte 5 000 à 15 000 FCFA. Ici, à partir de 70 F.</div>
                <div style={{display:"grid",gridTemplateColumns:isWide?"repeat(3,1fr)":"1fr",gap:12}}>
                  {VISUAL_PACKS.map(pk=><div key={pk.visuals} style={{padding:18,background:pk.best?"#FCEEFF":T.surfaceAlt,border:`1.5px solid ${pk.best?"#E879F9":pk.popular?"#E879F966":T.line}`,borderRadius:13,cursor:"pointer",position:"relative"}}>{pk.best&&<div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)"}}><Badge color="#C026D3" soft={T.surface}>Meilleure offre</Badge></div>}{pk.popular&&!pk.best&&<div style={{position:"absolute",top:-9,left:"50%",transform:"translateX(-50%)"}}><Badge color={T.green} soft={T.surface}>Populaire</Badge></div>}<div style={{fontSize:28,fontWeight:800,color:T.ink,fontFamily:FONT_DISPLAY}}>{pk.visuals}</div><div style={{fontSize:12,color:T.inkFaint,marginBottom:8}}>visuels</div><div style={{fontSize:16,fontWeight:700,color:T.ink}}>{fmt(pk.price)} F</div><div style={{fontSize:11,color:pk.best?"#C026D3":T.inkFaint,marginTop:4,fontWeight:pk.best?700:400}}>{pk.per} F / visuel{pk.per<100?` · −${Math.round((1-pk.per/100)*100)}%`:""}</div></div>)}
                </div>
              </div>
            </div>
          </div>
        ):(
          /* BUILDER */
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
            <div style={{padding:isWide?"16px 22px":"14px 16px",background:T.surface,borderBottom:`1px solid ${T.line}`,flexShrink:0}}>
              <div style={{display:"flex",gap:8,marginBottom:11,flexWrap:"wrap",alignItems:"center"}}>
                <div style={{display:"flex",background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:10,overflow:"hidden"}}>
                  {[["frontend","Web"],["fullstack","Full-Stack"],["mobile","Mobile"]].map(([m,l])=><button key={m} onClick={()=>setGenMode(m)} style={{padding:"7px 14px",background:genMode===m?T.ink:"transparent",color:genMode===m?"#fff":T.inkSoft,border:"none",cursor:"pointer",fontSize:12.5,fontWeight:genMode===m?700:500}}>{l}</button>)}
                </div>
                <ModelPicker models={AI_MODELS} selected={selectedModel} onSelect={setSelectedModel} userPlan={planData?.id||"free"} onUpgrade={()=>setShowPricing(true)} compact/>
                {selectedAgent&&<div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 12px",background:T.indigoSoft,border:`1px solid ${T.indigo}33`,borderRadius:9,fontSize:12.5,color:T.indigo}}><span>{selectedAgent.icon}</span><span style={{fontWeight:700}}>{selectedAgent.name}</span><button onClick={()=>setSelectedAgent(null)} style={{background:"none",border:"none",color:T.indigo,cursor:"pointer",display:"flex",padding:0,marginLeft:2}}><Icon name="x" size={13}/></button></div>}
              </div>
              {originalVoice&&<div style={{display:"flex",alignItems:"center",gap:9,padding:"8px 13px",background:T.greenSoft,border:`1px solid ${T.green}33`,borderRadius:10,marginBottom:9,fontSize:12.5}}><span style={{fontSize:16}}>{AFRICAN_LANGUAGES.find(l=>l.code===voiceLang)?.flag}</span><span style={{color:T.inkSoft}}>Dicté :</span><span style={{color:T.green,fontStyle:"italic",flex:1}}>“{originalVoice}”</span><button onClick={()=>setOriginalVoice("")} style={{background:"none",border:"none",color:T.inkFaint,cursor:"pointer",display:"flex"}}><Icon name="x" size={13}/></button></div>}
              <div style={{fontSize:11,fontWeight:600,color:T.inkFaint,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:8}}>
                Décris ton application
                {(user?.credits||0)<=3&&(user?.credits||0)>0&&<span style={{marginLeft:10,color:T.gold,textTransform:"none",letterSpacing:0}}>· {user.credits} crédit{user.credits>1?"s":""} restant{user.credits>1?"s":""}</span>}
                {(user?.credits||0)===0&&<span style={{marginLeft:10,color:T.red,textTransform:"none",letterSpacing:0}}>· Plus de crédits — <button onClick={()=>setShowPricing(true)} style={{background:"none",border:"none",color:T.indigo,cursor:"pointer",fontSize:11,fontWeight:700,textDecoration:"underline",padding:0}}>Recharger</button></span>}
                {autoFixing&&<span style={{marginLeft:10,color:T.indigo,textTransform:"none",letterSpacing:0}}>· Correction auto…</span>}
              </div>
              <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
                <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))generate();}} placeholder={AFRICAN_LANGUAGES.find(l=>l.code===voiceLang)?.hint||"Ex : un système de tontine avec 12 membres et paiement Mobile Money…"} rows={3} style={{flex:1,background:T.surfaceAlt,border:`1.5px solid ${T.line}`,borderRadius:12,padding:"12px 15px",color:T.ink,fontSize:14,resize:"none",outline:"none",lineHeight:1.6,fontFamily:FONT,transition:"border-color .15s"}} onFocus={e=>e.target.style.borderColor=T.indigo} onBlur={e=>e.target.style.borderColor=T.line}/>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={()=>generate()} disabled={phase==="generating"||!prompt.trim()||(user?.credits||0)===0} style={{padding:"0 22px",height:52,background:phase==="generating"||(user?.credits||0)===0?T.line:T.ink,color:phase==="generating"||(user?.credits||0)===0?T.inkFaint:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:phase==="generating"||(user?.credits||0)===0?"not-allowed":"pointer",whiteSpace:"nowrap",fontFamily:FONT_DISPLAY,display:"flex",alignItems:"center",gap:8}}>{phase==="generating"?"Génération…":<><Icon name="spark" size={16}/>Générer</>}</button>
                  {!isWide?null:<VoiceButton compact currentLang={voiceLang} onLangChange={setVoiceLang} onTranslating={setVoiceTranslating} onTranscript={(tr,or,lg)=>{setPrompt(tr);setOriginalVoice(lg!=="fr"&&lg!=="en"?or:"");}}/>}
                </div>
              </div>
              {phase==="generating"&&<div style={{marginTop:11}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.inkSoft,fontWeight:500}}>{AGENTS.find(a=>activeAgents.includes(a.id))?.label||"Initialisation"}…</span><span style={{fontSize:12,color:T.inkFaint}}>{progress}%</span></div><div style={{height:4,background:T.line,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:`linear-gradient(90deg,${T.indigo},${T.gold})`,borderRadius:3,width:`${progress}%`,transition:"width .5s ease"}}/></div></div>}
            </div>
            <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
              {phase==="idle"&&(
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:22,padding:isWide?48:24,animation:"abfade .5s ease"}}>
                  <Logo size={56}/>
                  <div style={{textAlign:"center"}}><div style={{fontSize:isWide?27:22,fontWeight:800,color:T.ink,marginBottom:9,letterSpacing:"-0.035em",fontFamily:FONT_DISPLAY}}>Que veux-tu construire aujourd’hui ?</div><div style={{fontSize:14.5,color:T.inkSoft,maxWidth:480,lineHeight:1.7}}>Décris ton projet en une phrase. Cinq agents IA conçoivent l’application complète — code, design et visuels inclus.</div></div>
                  <div style={{display:"flex",flexDirection:"column",gap:8,width:"100%",maxWidth:540}}>
                    {[["Tontine digitale","Gérer une tontine de 12 membres à Dakar avec Mobile Money"],["Boutique en ligne","Vendre des vêtements wax avec paiement Wave et livraison"],["Clinique","Suivi des patients, rendez-vous et ordonnances"]].map(([t,ex])=>(
                      <button key={t} onClick={()=>{setPrompt(ex);}} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:T.surface,border:`1px solid ${T.line}`,borderRadius:12,cursor:"pointer",textAlign:"left",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.indigo+"66";e.currentTarget.style.background=T.indigoSoft;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.line;e.currentTarget.style.background=T.surface;}}>
                        <div style={{width:32,height:32,borderRadius:8,background:T.indigoSoft,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:T.indigo}}><Icon name="spark" size={15}/></div>
                        <div style={{minWidth:0}}><div style={{fontSize:13.5,fontWeight:700,color:T.ink}}>{t}</div><div style={{fontSize:12.5,color:T.inkFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ex}</div></div>
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:12.5,color:T.inkFaint}}>ou choisis un secteur dans le menu de gauche</div>
                </div>
              )}
              {phase==="generating"&&(
                <div style={{flex:1,display:"flex",overflow:"hidden"}}>
                  <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24,padding:40}}>
                    <div style={{position:"relative",width:84,height:84}}><div style={{position:"absolute",inset:0,borderRadius:"50%",border:`2.5px solid ${T.line}`,borderTopColor:T.indigo,animation:"abspin 1s linear infinite"}}/><div style={{position:"absolute",inset:9,borderRadius:"50%",border:`2.5px solid ${T.line}`,borderTopColor:T.gold,animation:"abspin 1.5s linear infinite reverse"}}/><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Logo size={36}/></div></div>
                    <div style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:700,color:T.ink,marginBottom:4,fontFamily:FONT_DISPLAY}}>Construction en cours…</div><div style={{fontSize:13,color:T.inkSoft}}>Cinq agents conçoivent ton application</div></div>
                  </div>
                  {isWide&&<div style={{width:284,background:T.surface,borderLeft:`1px solid ${T.line}`,overflow:"auto"}}><AgentPanel logs={null} active={activeAgents}/></div>}
                </div>
              )}
              {phase==="error"&&(
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
                  <div style={{background:T.surface,border:`1px solid ${T.red}33`,borderRadius:16,padding:32,maxWidth:420,textAlign:"center"}}>
                    <div style={{width:52,height:52,borderRadius:"50%",background:T.redSoft,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",color:T.red,fontSize:24,fontWeight:800}}>!</div>
                    <div style={{fontSize:16,fontWeight:700,color:T.ink,marginBottom:6,fontFamily:FONT_DISPLAY}}>Erreur de génération</div>
                    <div style={{fontSize:13,color:T.inkSoft,lineHeight:1.6,marginBottom:20}}>{error}</div>
                    <button onClick={()=>{setPhase("idle");setError("")}} style={{padding:"11px 24px",background:T.ink,color:"#fff",border:"none",borderRadius:11,cursor:"pointer",fontSize:14,fontWeight:700}}>Réessayer</button>
                  </div>
                </div>
              )}
              {phase==="done"&&result&&(
                <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",animation:"abfade .3s ease"}}>
                  <div style={{padding:isWide?"10px 22px":"10px 14px",background:T.surface,borderBottom:`1px solid ${T.line}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
                    <div style={{flex:1,minWidth:0}}><span style={{fontSize:14.5,fontWeight:700,color:T.ink}}>{result.title}</span>{isWide&&<span style={{fontSize:12.5,color:T.inkFaint,marginLeft:10}}>{result.tagline||result.description}</span>}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",background:T.surface,borderBottom:`1px solid ${T.line}`,flexShrink:0,overflow:"auto"}}>
                    {[["preview","Aperçu"],["code","Code"],...(fullstack?[["backend","Backend"],["schema","Base"],["apidocs","API"]]:[]),["agents","Agents"]].map(([id,l])=><button key={id} onClick={()=>setTab(id)} style={{padding:"12px 18px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===id?T.ink:"transparent"}`,color:tab===id?T.ink:T.inkSoft,cursor:"pointer",fontSize:13,fontWeight:tab===id?700:500,whiteSpace:"nowrap"}}>{l}</button>)}
                    <div style={{flex:1}}/>
                    <div style={{display:"flex",gap:7,padding:"0 14px",alignItems:"center"}}>
                      {tab==="preview"&&isWide&&<div style={{display:"flex",background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:9,overflow:"hidden"}}>{[["desktop","Bureau"],["tablet","Tablette"],["mobile","Mobile"]].map(([m,l])=><button key={m} onClick={()=>setPreviewMode(m)} style={{padding:"5px 11px",background:previewMode===m?T.ink:"transparent",border:"none",color:previewMode===m?"#fff":T.inkSoft,cursor:"pointer",fontSize:11.5,fontWeight:previewMode===m?700:500}}>{l}</button>)}</div>}
                      <button onClick={downloadCode} title="Exporter le code .jsx" style={{width:36,height:36,background:T.surface,border:`1px solid ${T.line}`,borderRadius:9,color:T.inkSoft,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="download" size={16}/></button>
                      <button onClick={()=>setShowChat(c=>!c)} title="Modifier" style={{width:36,height:36,background:showChat?T.indigoSoft:T.surface,border:`1px solid ${showChat?T.indigo+"44":T.line}`,borderRadius:9,color:showChat?T.indigo:T.inkSoft,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="chat" size={16}/></button>
                      <button onClick={doBrand} title="Marque" style={{width:36,height:36,background:T.surface,border:`1px solid ${T.line}`,borderRadius:9,color:T.inkSoft,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="wand" size={16}/></button>
                      <button onClick={()=>setShowGithub(true)} title="Pousser sur GitHub" style={{width:36,height:36,background:T.surface,border:`1px solid ${T.line}`,borderRadius:9,color:T.inkSoft,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="code" size={16}/></button>
                      <button onClick={()=>{ if(spendCredits("buildApk")) setShowBuild(true); }} title={`Générer APK / IPA (${ACTION_COST.buildApk} crédits)`} style={{width:36,height:36,background:T.surface,border:`1px solid ${T.line}`,borderRadius:9,color:T.inkSoft,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="download" size={16}/></button>
                      <button onClick={()=>{ if(spendCredits("deployWeb")) setShowDeploy(true); }} style={{padding:"8px 16px",background:T.ink,border:"none",borderRadius:9,color:"#fff",cursor:"pointer",fontSize:12.5,fontWeight:700,display:"flex",alignItems:"center",gap:6,fontFamily:FONT_DISPLAY}}><Icon name="rocket" size={15}/>{isWide?"Déployer":""}</button>
                    </div>
                  </div>
                  <div style={{flex:1,overflow:"hidden"}}>
                    {tab==="preview"&&(
                      <div style={{height:"100%",display:"flex",flexDirection:"column",background:T.surfaceAlt}}>
                        {previewError&&<div style={{padding:"8px 16px",background:T.redSoft,borderBottom:`1px solid ${T.red}33`,fontSize:12.5,color:T.red,display:"flex",alignItems:"center",gap:8,flexShrink:0}}><span>Erreur détectée — {autoFixing?"correction auto en cours…":"corrigée"}</span></div>}
                        <div style={{flex:1,display:"flex",justifyContent:"center",padding:previewMode!=="desktop"&&isWide?20:0}}>
                          <div style={{width:isWide?pw:"100%",maxWidth:"100%",height:"100%",transition:"width .3s",background:"#fff",borderRadius:previewMode!=="desktop"&&isWide?16:0,overflow:"hidden",boxShadow:previewMode!=="desktop"&&isWide?"0 12px 50px rgba(11,14,24,0.15)":"none"}}><LivePreview code={liveCode} onError={msg=>{setPreviewError(msg);handlePreviewError(msg);}}/></div>
                        </div>
                      </div>
                    )}
                    {tab==="code"&&<CodeViewer code={liveCode} fileName={(result.title?.replace(/\s+/g,"-")||"App")+".jsx"}/>}
                    {tab==="backend"&&fullstack?.backend&&<CodeViewer code={fullstack.backend} fileName="server.js"/>}
                    {tab==="schema"&&fullstack?.schema&&<CodeViewer code={fullstack.schema} fileName="schema.sql"/>}
                    {tab==="apidocs"&&fullstack?.apiDocs&&<div style={{height:"100%",overflow:"auto",padding:24,background:T.surface}}><pre style={{fontFamily:FONT_MONO,fontSize:13,lineHeight:1.8,color:T.ink,whiteSpace:"pre-wrap"}}>{fullstack.apiDocs}</pre></div>}
                    {tab==="agents"&&<div style={{height:"100%",overflow:"auto",background:T.surfaceAlt}}><AgentPanel logs={agentLogs} active={[]}/></div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {noCreditsFor&&<Overlay onClose={()=>setNoCreditsFor(null)}>
        <div style={{background:T.surface,borderRadius:20,padding:32,width:420,maxWidth:"94vw",textAlign:"center"}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:T.goldSoft,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",color:T.goldDeep,fontSize:24}}>⚡</div>
          <div style={{fontSize:19,fontWeight:800,color:T.ink,marginBottom:8,fontFamily:FONT_DISPLAY}}>Crédits insuffisants</div>
          <div style={{fontSize:14,color:T.inkSoft,lineHeight:1.65,marginBottom:8}}>L’action « <strong>{ACTION_LABEL[noCreditsFor.action]}</strong> » coûte <strong>{noCreditsFor.cost} crédit{noCreditsFor.cost>1?"s":""}</strong>.</div>
          <div style={{fontSize:13.5,color:T.inkSoft,marginBottom:20}}>Il te reste <strong>{user?.credits||0} crédit{(user?.credits||0)>1?"s":""}</strong>. Recharge pour continuer.</div>
          <div style={{background:T.surfaceAlt,border:`1px solid ${T.line}`,borderRadius:12,padding:"12px 14px",marginBottom:20,fontSize:12.5,color:T.inkSoft,textAlign:"left"}}>
            <div style={{fontWeight:700,color:T.ink,marginBottom:8,fontSize:12,textTransform:"uppercase",letterSpacing:"0.05em"}}>Coût des actions</div>
            {Object.keys(ACTION_COST).map(a=><div key={a} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span>{ACTION_LABEL[a]}</span><span style={{fontWeight:600,color:T.ink}}>{ACTION_COST[a]} crédit{ACTION_COST[a]>1?"s":""}</span></div>)}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setNoCreditsFor(null)} style={{flex:1,padding:"12px",background:T.surface,border:`1.5px solid ${T.line}`,borderRadius:11,color:T.inkSoft,cursor:"pointer",fontSize:14,fontWeight:600}}>Plus tard</button>
            <button onClick={()=>{setNoCreditsFor(null);setShowPricing(true);}} style={{flex:2,padding:"12px",background:T.ink,border:"none",borderRadius:11,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:FONT_DISPLAY}}>Recharger mes crédits</button>
          </div>
        </div>
      </Overlay>}
      {showPricing&&<PricingModal currentPlan={user?.plan} onClose={()=>setShowPricing(false)} onSelectPlan={pid=>{const p=PLANS.find(x=>x.id===pid);setUser(u=>({...u,plan:pid,credits:p?p.credits:u.credits}));}}/>}
      {showChat&&result&&liveCode&&<IterativeChat code={liveCode} title={result.title} onUpdate={c=>setLiveCode(c)} onClose={()=>setShowChat(false)}/>}
      {showDeploy&&liveCode&&<DeployModal title={result?.title||"App"} code={liveCode} onClose={()=>setShowDeploy(false)} onDeployed={url=>setProjects(prev=>prev.map((p,i)=>i===0?{...p,deployUrl:url}:p))}/>}
      {showBrand&&<BrandModal brand={brandData} title={result?.title||"App"} onClose={()=>setShowBrand(false)}/>}
      {showBuild&&liveCode&&<BuildModal title={result?.title||"App"} code={liveCode} onClose={()=>setShowBuild(false)}/>}
      {showGithub&&liveCode&&<GithubModal title={result?.title||"App"} code={liveCode} fullstack={fullstack} token={githubToken} setToken={setGithubToken} onClose={()=>setShowGithub(false)}/>}
    </div>
  );
}
