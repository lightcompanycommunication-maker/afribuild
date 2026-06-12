import dotenv from "dotenv";
dotenv.config();

const required = (key, fallback = undefined) => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) console.warn(`⚠️  Variable d'environnement manquante : ${key}`);
  return v;
};

export const config = {
  port: process.env.PORT || 3001,
  env: process.env.NODE_ENV || "development",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "*",
  jwtSecret: required("JWT_SECRET", "dev_secret_change_me"),

  openai:   { apiKey: required("OPENAI_KEY") },
  gemini:   { apiKey: required("GEMINI_KEY") },
  anthropic:{ apiKey: process.env.ANTHROPIC_API_KEY },

  expo: {
    token: required("EXPO_TOKEN"),
    projectId: process.env.EAS_PROJECT_ID,
  },

  supabase: {
    accessToken: required("SUPABASE_ACCESS_TOKEN"),
    orgId: process.env.SUPABASE_ORG_ID,
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },

  vercel: {
    token: required("VERCEL_TOKEN"),
    teamId: process.env.VERCEL_TEAM_ID || "",
  },

  payments: {
    cinetpay:    { apiKey: process.env.CINETPAY_API_KEY, siteId: process.env.CINETPAY_SITE_ID },
    flutterwave: { secretKey: process.env.FLUTTERWAVE_SECRET_KEY },
    kkiapay:     { privateKey: process.env.KKIAPAY_PRIVATE_KEY, secret: process.env.KKIAPAY_SECRET },
  },

  storage: { bucket: process.env.BUILD_STORAGE_BUCKET || "builds" },
};
