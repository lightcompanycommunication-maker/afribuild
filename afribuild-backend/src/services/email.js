import { config } from "../config.js";

/**
 * ════════════════════════════════════════════════════════════════════════
 * EMAIL — Envoi des reçus pour traçabilité
 * ════════════════════════════════════════════════════════════════════════
 *
 * Utilise Resend (https://resend.com) — le plus simple à brancher.
 * Gratuit jusqu'à ~3000 emails/mois. Une seule clé API.
 *
 * Pour changer de fournisseur (SendGrid, Brevo, Mailgun...), il suffit de
 * réécrire la fonction sendEmail() — le reste du code ne change pas.
 *
 * Config .env :
 *   RESEND_API_KEY=re_...
 *   MAIL_FROM="AfriBuild <recus@tondomaine.com>"
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || "AfriBuild <onboarding@resend.dev>";

/** Envoi générique d'un email HTML. */
export async function sendEmail({ to, subject, html, replyTo }) {
  if (!RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY non configurée — email non envoyé (mode démo).");
    return { sent: false, demo: true };
  }
  if (!to) return { sent: false, reason: "Destinataire manquant." };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Email: envoi échoué — ${await res.text()}`);
  const data = await res.json();
  return { sent: true, id: data.id };
}

/**
 * Envoie le reçu au CLIENT et au COMMERÇANT (double traçabilité).
 * receiptHtmlContent = le HTML généré par receiptHtml() du service receipts.
 */
export async function sendReceiptEmails({ receipt, receiptHtmlContent }) {
  const results = {};
  const sym = { XOF: "FCFA", XAF: "FCFA", NGN: "₦", GHS: "GH₵", KES: "KSh" }[receipt.currency] || receipt.currency;
  const amount = new Intl.NumberFormat("fr-FR").format(receipt.amount);
  const subject = `Reçu de paiement — ${amount} ${sym} (${receipt.id})`;

  // Au client
  if (receipt.payer_email) {
    try {
      results.client = await sendEmail({
        to: receipt.payer_email,
        subject,
        html: receiptHtmlContent,
        replyTo: receipt.merchant_email || undefined,
      });
    } catch (e) { results.client = { sent: false, error: e.message }; }
  }

  // Au commerçant (copie pour sa comptabilité)
  if (receipt.merchant_email) {
    try {
      results.merchant = await sendEmail({
        to: receipt.merchant_email,
        subject: `[Copie] ${subject}`,
        html: receiptHtmlContent,
      });
    } catch (e) { results.merchant = { sent: false, error: e.message }; }
  }

  return results;
}
