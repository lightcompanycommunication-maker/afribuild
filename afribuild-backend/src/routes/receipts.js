import { Router } from "express";
import { createReceipt, verifyReceipt, listReceipts, receiptHtml } from "../services/receipts.js";
import { sendReceiptEmails } from "../services/email.js";
import { verifyPayment } from "../services/payments.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/receipts/issue
 * Émet un reçu APRÈS avoir vérifié le paiement auprès de la passerelle.
 * Envoie le reçu par email au client ET au commerçant.
 *
 * Body: {
 *   gateway, ref, gatewayTxId,          // pour vérifier le paiement
 *   amount, currency,
 *   payerName, payerPhone, payerEmail,
 *   merchantId, merchantName, merchantEmail,
 *   description, items
 * }
 */
router.post("/issue", requireAuth, async (req, res) => {
  const b = req.body || {};
  try {
    // 1. Vérifier que le paiement est RÉELLEMENT passé (anti-fraude)
    if (b.gateway && b.gatewayTxId) {
      const check = await verifyPayment({ gateway: b.gateway, ref: b.ref, transactionId: b.gatewayTxId });
      if (check.status !== "paid") {
        return res.status(402).json({ error: "Paiement non confirmé — aucun reçu émis." });
      }
    }
    // 2. Créer le reçu signé
    const receipt = await createReceipt(b);
    // 3. Générer le HTML + envoyer les emails (traçabilité)
    const html = receiptHtml({ ...receipt, payer_name: b.payerName, payer_phone: b.payerPhone, merchant_name: b.merchantName, description: b.description, items: b.items });
    const emails = await sendReceiptEmails({
      receipt: { ...receipt, payer_email: b.payerEmail, merchant_email: b.merchantEmail },
      receiptHtmlContent: html,
    });
    res.json({ receipt, emails });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/receipts/verify/:id
 * Vérification PUBLIQUE (pas d'auth) — c'est ce que le QR code ouvre.
 * Retourne si le reçu est authentique.
 */
router.get("/verify/:id", async (req, res) => {
  try {
    res.json(await verifyReceipt(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/receipts/pdf/:id  (en pratique HTML imprimable → PDF côté navigateur)
 * Renvoie le HTML du reçu, prêt à imprimer ou enregistrer en PDF.
 */
router.get("/html/:id", async (req, res) => {
  try {
    const v = await verifyReceipt(req.params.id);
    if (!v.authentic) return res.status(404).send("Reçu introuvable ou invalide.");
    // On reconstruit depuis la base via verify (qui renvoie les champs publics)
    res.set("Content-Type", "text/html").send(receiptHtml({
      id: v.receipt.id, amount: v.receipt.amount, currency: v.receipt.currency, gateway: v.receipt.gateway,
      merchant_name: v.receipt.merchantName, payer_phone: v.receipt.payerPhone, paid_at: v.receipt.paidAt,
      description: v.receipt.description, short_code: req.params.id.slice(-8).toUpperCase(),
      verify_url: `${req.protocol}://${req.get("host")}/verify/${v.receipt.id}`, items: [],
    }));
  } catch (e) {
    res.status(500).send(e.message);
  }
});

/**
 * GET /api/receipts/list
 * Historique des reçus du commerçant connecté (comptabilité).
 */
router.get("/list", requireAuth, async (req, res) => {
  try {
    res.json({ receipts: await listReceipts(req.user.userId) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
