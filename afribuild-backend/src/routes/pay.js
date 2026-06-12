import { Router } from "express";
import { initPayment, verifyPayment, detectGateway } from "../services/payments.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/pay/init
 * Initie un paiement (choisit la passerelle selon le pays).
 * Body: { amount, currency, country, customer, description, returnUrl, notifyUrl }
 * Réponse: { gateway, ref, checkoutUrl | widget }
 */
router.post("/init", requireAuth, async (req, res) => {
  try {
    const result = await initPayment(req.body || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/pay/verify
 * Vérifie le statut d'un paiement.
 * Body: { gateway, ref, transactionId }
 */
router.post("/verify", requireAuth, async (req, res) => {
  try {
    const result = await verifyPayment(req.body || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/pay/webhook/:gateway
 * Reçoit les notifications des passerelles (paiement confirmé).
 * À configurer comme notify_url dans chaque passerelle.
 */
router.post("/webhook/:gateway", async (req, res) => {
  const { gateway } = req.params;
  // Ici : vérifier la signature du webhook, mettre à jour la transaction en base,
  // créditer le compte utilisateur, etc.
  console.log(`Webhook ${gateway} reçu :`, JSON.stringify(req.body).slice(0, 500));
  res.json({ received: true });
});

/** GET /api/pay/gateway?country=SN — retourne la passerelle recommandée. */
router.get("/gateway", (req, res) => {
  res.json({ gateway: detectGateway(req.query.country) });
});

export default router;
