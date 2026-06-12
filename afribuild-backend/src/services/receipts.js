import { config } from "../config.js";
import crypto from "node:crypto";

/**
 * ════════════════════════════════════════════════════════════════════════
 * AFRIREÇU — Reçus de paiement Mobile Money infalsifiables
 * ════════════════════════════════════════════════════════════════════════
 *
 * Principe de l'infalsifiabilité (3 piliers) :
 *
 *   1. SIGNATURE CRYPTOGRAPHIQUE
 *      Chaque reçu est signé avec une clé secrète (HMAC-SHA256) qui ne quitte
 *      JAMAIS le serveur. Si on modifie 1 chiffre du montant, la signature ne
 *      correspond plus → reçu détecté comme faux.
 *
 *   2. VÉRIFICATION EN LIGNE (QR code)
 *      Le reçu porte un QR qui pointe vers /verify/:id. La vérité est sur le
 *      serveur, pas sur le papier. Impossible à truquer côté client.
 *
 *   3. CONFIRMATION DE LA PASSERELLE
 *      Un reçu n'est émis QUE si CinetPay/Flutterwave/Kkiapay a confirmé que
 *      l'argent est réellement passé (statut "paid" vérifié).
 *
 * Stockage : table Supabase `receipts`.
 */

// La clé de signature des reçus. DOIT être secrète et stable.
// En prod : mettre RECEIPT_SECRET dans le .env (chaîne aléatoire longue).
const RECEIPT_SECRET = process.env.RECEIPT_SECRET || config.jwtSecret || "change_moi_secret_recus";

function sbHeaders() {
  return {
    apikey: config.supabase.serviceKey,
    Authorization: `Bearer ${config.supabase.serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

/** Identifiant lisible d'un reçu : AFR-AAAAMMJJ-XXXXXX */
function receiptId() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `AFR-${ymd}-${rand}`;
}

/**
 * Calcule la signature infalsifiable d'un reçu.
 * On signe les champs critiques : tout changement invalide la signature.
 */
function signReceipt({ id, amount, currency, gateway, gatewayTxId, payerPhone, merchantId, paidAt }) {
  const payload = [id, amount, currency, gateway, gatewayTxId, payerPhone, merchantId, paidAt].join("|");
  return crypto.createHmac("sha256", RECEIPT_SECRET).update(payload).digest("hex");
}

/**
 * Crée un reçu APRÈS confirmation réelle du paiement.
 * Doit être appelé seulement quand la passerelle confirme "paid".
 */
export async function createReceipt({
  amount, currency = "XOF", gateway, gatewayTxId,
  payerName, payerPhone, payerEmail,
  merchantId, merchantName, merchantEmail,
  description, items,
}) {
  if (!gatewayTxId) throw new Error("Transaction de passerelle manquante — impossible d'émettre un reçu non vérifié.");

  const id = receiptId();
  const paidAt = new Date().toISOString();
  const signature = signReceipt({ id, amount, currency, gateway, gatewayTxId, payerPhone: payerPhone || "", merchantId: merchantId || "", paidAt });
  const shortCode = signature.slice(0, 8).toUpperCase(); // code court affiché sur le reçu

  const receipt = {
    id, amount, currency, gateway, gateway_tx_id: gatewayTxId,
    payer_name: payerName || "", payer_phone: payerPhone || "", payer_email: payerEmail || "",
    merchant_id: merchantId || "", merchant_name: merchantName || "", merchant_email: merchantEmail || "",
    description: description || "", items: items || [],
    paid_at: paidAt, signature, short_code: shortCode,
    verify_url: `${config.frontendOrigin?.split(",")[0] || ""}/verify/${id}`,
    created_at: paidAt,
  };

  // Sauvegarde en base si Supabase configuré
  if (config.supabase.url && config.supabase.serviceKey) {
    const res = await fetch(`${config.supabase.url}/rest/v1/receipts`, {
      method: "POST", headers: sbHeaders(), body: JSON.stringify(receipt),
    });
    if (!res.ok) throw new Error(`Reçu: sauvegarde échouée — ${await res.text()}`);
  }
  return receipt;
}

/**
 * Vérifie qu'un reçu est authentique.
 * Recalcule la signature et la compare. Retourne authentique: true/false.
 */
export async function verifyReceipt(id) {
  if (!config.supabase.url || !config.supabase.serviceKey) {
    return { authentic: false, reason: "Base de données non configurée." };
  }
  const res = await fetch(`${config.supabase.url}/rest/v1/receipts?id=eq.${encodeURIComponent(id)}`, { headers: sbHeaders() });
  if (!res.ok) return { authentic: false, reason: "Erreur de lecture." };
  const rows = await res.json();
  const r = rows[0];
  if (!r) return { authentic: false, reason: "Aucun reçu avec cet identifiant." };

  const expected = signReceipt({
    id: r.id, amount: r.amount, currency: r.currency, gateway: r.gateway,
    gatewayTxId: r.gateway_tx_id, payerPhone: r.payer_phone || "", merchantId: r.merchant_id || "", paidAt: r.paid_at,
  });
  const authentic = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(r.signature));

  return {
    authentic,
    reason: authentic ? "Reçu authentique et vérifié." : "Signature invalide — ce reçu a été modifié ou est faux.",
    receipt: authentic ? {
      id: r.id, amount: r.amount, currency: r.currency, gateway: r.gateway,
      merchantName: r.merchant_name, payerPhone: maskPhone(r.payer_phone), paidAt: r.paid_at, description: r.description,
    } : null,
  };
}

/** Liste les reçus d'un commerçant (comptabilité / historique). */
export async function listReceipts(merchantId, { limit = 50 } = {}) {
  if (!config.supabase.url || !config.supabase.serviceKey) return [];
  const res = await fetch(`${config.supabase.url}/rest/v1/receipts?merchant_id=eq.${encodeURIComponent(merchantId)}&order=created_at.desc&limit=${limit}`, { headers: sbHeaders() });
  if (!res.ok) return [];
  return await res.json();
}

/** Masque un numéro pour l'affichage public : +221 77 *** ** 45 */
function maskPhone(p) {
  if (!p || p.length < 4) return p || "";
  return p.slice(0, p.length - 5).replace(/\d/g, (d, i) => (i > 3 ? "*" : d)) + p.slice(-2);
}

/** Génère le HTML d'un reçu (pour PDF / email / impression ticket). */
export function receiptHtml(r) {
  const sym = { XOF: "FCFA", XAF: "FCFA", NGN: "₦", GHS: "GH₵", KES: "KSh" }[r.currency] || r.currency;
  const amount = new Intl.NumberFormat("fr-FR").format(r.amount);
  const date = new Date(r.paid_at).toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(r.verify_url)}`;
  const itemsRows = (r.items || []).map(it => `<tr><td>${it.name}</td><td style="text-align:right">${new Intl.NumberFormat("fr-FR").format(it.price)} ${sym}</td></tr>`).join("");
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<style>
  body{font-family:-apple-system,'Segoe UI',sans-serif;color:#0B0E18;max-width:420px;margin:0 auto;padding:28px}
  .head{text-align:center;border-bottom:2px solid #0B0E18;padding-bottom:16px;margin-bottom:18px}
  .badge{display:inline-block;background:#ECFDF3;color:#16A34A;border:1px solid #16A34A33;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-top:8px}
  .row{display:flex;justify-content:space-between;font-size:14px;margin:7px 0}
  .row .k{color:#5A6478}.row .v{font-weight:600}
  .total{font-size:24px;font-weight:800;text-align:center;margin:18px 0;padding:14px;background:#F7F8FC;border-radius:12px}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
  td{padding:6px 0;border-bottom:1px solid #F2F4F9}
  .verify{text-align:center;margin-top:20px;padding-top:18px;border-top:1px dashed #ECEEF4}
  .code{font-family:monospace;font-size:16px;letter-spacing:2px;font-weight:700;color:#4F46E5}
  .foot{text-align:center;font-size:11px;color:#9AA3B8;margin-top:16px}
</style></head><body>
  <div class="head">
    <div style="font-size:20px;font-weight:800">${r.merchant_name || "Reçu de paiement"}</div>
    <div style="font-size:12px;color:#5A6478;margin-top:2px">Reçu Mobile Money · ${r.gateway}</div>
    <div class="badge">✓ PAIEMENT CONFIRMÉ</div>
  </div>
  <div class="row"><span class="k">N° de reçu</span><span class="v" style="font-family:monospace">${r.id}</span></div>
  <div class="row"><span class="k">Date</span><span class="v">${date}</span></div>
  ${r.payer_name ? `<div class="row"><span class="k">Payé par</span><span class="v">${r.payer_name}</span></div>` : ""}
  ${r.payer_phone ? `<div class="row"><span class="k">Téléphone</span><span class="v">${maskPhone(r.payer_phone)}</span></div>` : ""}
  ${r.description ? `<div class="row"><span class="k">Motif</span><span class="v">${r.description}</span></div>` : ""}
  ${itemsRows ? `<table>${itemsRows}</table>` : ""}
  <div class="total">${amount} ${sym}</div>
  <div class="verify">
    <img src="${qrUrl}" alt="QR vérification" width="140" height="140"/>
    <div style="font-size:12px;color:#5A6478;margin-top:8px">Scanne pour vérifier l'authenticité</div>
    <div class="code">${r.short_code}</div>
    <div style="font-size:11px;color:#9AA3B8">Code de vérification</div>
  </div>
  <div class="foot">Reçu sécurisé et infalsifiable · Généré par AfriBuild AI<br/>Vérifiable sur ${r.verify_url}</div>
</body></html>`;
}
