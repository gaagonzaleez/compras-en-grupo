// Genera claves de prueba (JWT, VAPID, certificado autofirmado) en E2E_CACHE. Solo para el entorno de pruebas.
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import webpush from "web-push";

const cache = process.env.E2E_CACHE;
export const SECRETO_JWT = "e2e-secreto-de-prueba-super-largo-1234567890";
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role) => {
  const h = b({ alg: "HS256", typ: "JWT" }), p = b({ role, iss: "supabase", iat: 1, exp: 4102444800 });
  return `${h}.${p}.${crypto.createHmac("sha256", SECRETO_JWT).update(`${h}.${p}`).digest("base64url")}`;
};
const vapid = webpush.generateVAPIDKeys();

fs.writeFileSync(`${cache}/app.env`, [
  "NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321",
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${jwt("anon")}`,
  `SUPABASE_SERVICE_ROLE_KEY=${jwt("service_role")}`,
  "NEXT_PUBLIC_SITE_URL=http://localhost:3100",
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}`,
  `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
  "VAPID_SUBJECT=mailto:test@example.com",
  "RESEND_API_KEY=re_test",
  "RESEND_API_URL=http://localhost:54321/__resend",
  'EMAIL_FROM="Test <test@example.com>"',
  "CRON_SECRET=secreto-cron-de-prueba",
  "",
].join("\n"));
fs.writeFileSync(`${cache}/pgrst.conf`, [
  `db-uri = "postgres://authenticator@/compras_e2e?host=${process.env.E2E_PG_HOST}&port=${process.env.E2E_PG_PORT}"`,
  'db-schemas = "public"',
  'db-anon-role = "anon"',
  `jwt-secret = "${SECRETO_JWT}"`,
  "server-port = 54320",
  "",
].join("\n"));
if (!fs.existsSync(`${cache}/cert.pem`)) {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${cache}/key.pem`, "-out", `${cache}/cert.pem`, "-days", "30", "-subj", "/CN=localhost"], { stdio: "ignore" });
}
