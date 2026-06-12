import { config } from "../config.js";

/**
 * AfriPay — couche de paiement unifiée côté serveur.
 * Les clés secrètes restent ici (jamais exposées au front).
 *
 * Chaque fonction initie un paiement et retourne une URL de checkout
 * (ou un statut) que le front affiche à l'utilisateur.
 */

const GATEWAY_BY_COUNTRY = {
  SN: "cinetpay", CI: "cinetpay", ML: "cinetpay", BF: "cinetpay", CM: "cinetpay", GN: "cinetpay",
  NG: "flutterwave", GH: "flutterwave", KE: "flutterwave", ZA: "flutterwave", UG: "flutterwave",
  TZ: "flutterwave", RW: "flutterwave", CD: "flutterwave", ET: "flutterwave", EG: "flutterwave",
  BJ: "kkiapay", TG: "kkiapay",
};

export function detectGateway(countryCode) {
  return GATEWAY_BY_COUNTRY[(countryCode || "").toUpperCase()] || "flutterwave";
}

/** Point d'entrée unifié : choisit la passerelle selon le pays. */
export async function initPayment({ amount, currency, country, customer, description, returnUrl, notifyUrl }) {
  const gateway = detectGateway(country);
  const ref = `AFRIB-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const ctx = { amount, currency, customer, description, ref, returnUrl, notifyUrl };
  switch (gateway) {
    case "cinetpay": return { gateway, ...(await initCinetPay(ctx)) };
    case "flutterwave": return { gateway, ...(await initFlutterwave(ctx)) };
    case "kkiapay": return { gateway, ...(await initKkiapay(ctx)) };
    default: throw new Error(`Passerelle non supportée : ${gateway}`);
  }
}

// ─── CinetPay (Afrique francophone) ──────────────────────────────────────────
async function initCinetPay({ amount, currency, customer, description, ref, returnUrl, notifyUrl }) {
  const { apiKey, siteId } = config.payments.cinetpay;
  if (!apiKey || !siteId) throw new Error("CinetPay non configuré.");
  const res = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: apiKey,
      site_id: siteId,
      transaction_id: ref,
      amount,
      currency: currency || "XOF",
      description: description || "Paiement AfriBuild",
      customer_name: customer?.name || "Client",
      customer_email: customer?.email || "",
      customer_phone_number: customer?.phone || "",
      notify_url: notifyUrl,
      return_url: returnUrl,
      channels: "ALL",
    }),
  });
  const data = await res.json();
  if (data.code !== "201") throw new Error(`CinetPay: ${data.message || "erreur"}`);
  return { ref, checkoutUrl: data.data?.payment_url, token: data.data?.payment_token };
}

// ─── Flutterwave (panafricain) ───────────────────────────────────────────────
async function initFlutterwave({ amount, currency, customer, description, ref, returnUrl }) {
  const { secretKey } = config.payments.flutterwave;
  if (!secretKey) throw new Error("Flutterwave non configuré.");
  const res = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: ref,
      amount,
      currency: currency || "NGN",
      redirect_url: returnUrl,
      customer: { email: customer?.email || "client@afribuild.app", phonenumber: customer?.phone, name: customer?.name },
      customizations: { title: "AfriBuild", description: description || "Paiement" },
    }),
  });
  const data = await res.json();
  if (data.status !== "success") throw new Error(`Flutterwave: ${data.message || "erreur"}`);
  return { ref, checkoutUrl: data.data?.link };
}

// ─── Kkiapay (Bénin / Togo) ──────────────────────────────────────────────────
async function initKkiapay({ amount, ref, customer }) {
  const { privateKey } = config.payments.kkiapay;
  if (!privateKey) throw new Error("Kkiapay non configuré.");
  // Kkiapay fonctionne surtout via widget front ; côté serveur on vérifie les transactions.
  // Ici on renvoie les infos pour que le front ouvre le widget.
  return {
    ref,
    widget: { amount, phone: customer?.phone || "", key: process.env.KKIAPAY_PUBLIC_KEY || "" },
    note: "Ouvre le widget Kkiapay côté front avec ces paramètres.",
  };
}

/** Vérifie le statut d'un paiement (appelé par le webhook ou en polling). */
export async function verifyPayment({ gateway, ref, transactionId }) {
  if (gateway === "flutterwave") {
    const { secretKey } = config.payments.flutterwave;
    const res = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = await res.json();
    return { status: data.data?.status === "successful" ? "paid" : "pending", raw: data.data };
  }
  if (gateway === "cinetpay") {
    const { apiKey, siteId } = config.payments.cinetpay;
    const res = await fetch("https://api-checkout.cinetpay.com/v2/payment/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey, site_id: siteId, transaction_id: ref }),
    });
    const data = await res.json();
    return { status: data.data?.status === "ACCEPTED" ? "paid" : "pending", raw: data.data };
  }
  if (gateway === "kkiapay") {
    const { privateKey, secret } = config.payments.kkiapay;
    const res = await fetch("https://api.kkiapay.me/api/v1/transactions/status", {
      method: "POST",
      headers: { "x-api-key": privateKey, "x-secret-key": secret, "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId }),
    });
    const data = await res.json();
    return { status: data.status === "SUCCESS" ? "paid" : "pending", raw: data };
  }
  throw new Error(`Passerelle inconnue : ${gateway}`);
}
