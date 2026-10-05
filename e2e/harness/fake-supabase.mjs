// Supabase de mentira para pruebas e2e locales: GoTrue mínimo + proxy a PostgREST. NO es para producción.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";

const SECRET = "e2e-secreto-de-prueba-super-largo-1234567890";
const db = new pg.Pool({ host: process.env.E2E_PG_HOST, port: Number(process.env.E2E_PG_PORT ?? 54329), user: process.env.E2E_PG_USER ?? "postgres", database: "compras_e2e" });
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const firmar = (payload) => {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(payload);
  return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
};
const leer = (jwt) => {
  const [h, p, s] = (jwt || "").split(".");
  if (!s || crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null;
  const c = JSON.parse(Buffer.from(p, "base64url").toString());
  return c.exp * 1000 > Date.now() ? c : null;
};
const sink = { push: [], resend: [] };
const archivos = new Map(); // bucket/path -> {tipo, datos}
const claves = new Map(); // email -> password
const refresh = new Map(); // token -> userId

async function usuario(id) {
  const { rows } = await db.query("select id, email, raw_user_meta_data from auth.users where id=$1", [id]);
  const u = rows[0];
  return u && { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, app_metadata: {}, user_metadata: u.raw_user_meta_data ?? {}, created_at: new Date().toISOString() };
}
function sesion(u) {
  const now = Math.floor(Date.now() / 1000);
  const rt = crypto.randomUUID();
  refresh.set(rt, u.id);
  return {
    access_token: firmar({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, iat: now, exp: now + 3600 }),
    token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: rt, user: u,
  };
}
const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
const cuerpo = (req) => new Promise((ok) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });

const manejar = async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/__push/")) {
      await cuerpo(req);
      sink.push.push({ ruta: url.pathname, auth: req.headers.authorization, enc: req.headers["content-encoding"], ttl: req.headers.ttl });
      res.writeHead(url.pathname.endsWith("/gone") ? 410 : 201); return res.end();
    }
    if (url.pathname === "/__resend") {
      sink.resend.push({ auth: req.headers.authorization, ...JSON.parse((await cuerpo(req)).toString()) });
      return json(res, 200, { id: "x" });
    }
    if (url.pathname === "/__sink") return json(res, 200, { ...sink, archivos: [...archivos.keys()] });
    if (url.pathname.startsWith("/storage/v1/object/")) {
      const resto = decodeURIComponent(url.pathname.slice("/storage/v1/object/".length));
      const firmado = resto.startsWith("sign/");
      if (req.method === "POST" && !firmado) {
        const crudo = await cuerpo(req);
        const fd = await new Request("http://x", { method: "POST", headers: { "content-type": req.headers["content-type"] }, body: crudo }).formData();
        const f = [...fd.values()].find((v) => typeof v !== "string");
        archivos.set(resto, { tipo: f.type, datos: Buffer.from(await f.arrayBuffer()) });
        return json(res, 200, { Key: resto, Id: crypto.randomUUID() });
      }
      if (req.method === "POST" && firmado) {
        const bucket = resto.slice(5).split("/")[0];
        const b = JSON.parse((await cuerpo(req)).toString());
        return json(res, 200, (b.paths ?? []).map((path) => ({ error: null, path, signedURL: `/object/sign/${bucket}/${path}?token=t` })));
      }
      if (req.method === "GET" && firmado) {
        const a = archivos.get(resto.slice(5));
        if (!a) return json(res, 404, { error: "not_found" });
        res.writeHead(200, { "content-type": a.tipo }); return res.end(a.datos);
      }
      if (req.method === "DELETE") {
        const bucket = resto;
        const b = JSON.parse((await cuerpo(req)).toString());
        (b.prefixes ?? []).forEach((pf) => archivos.delete(`${bucket}/${pf}`));
        return json(res, 200, []);
      }
    }
    if (url.pathname === "/__reset") {
      sink.push.length = 0; sink.resend.length = 0; archivos.clear();
      claves.clear(); refresh.clear();
      await db.query("truncate public.orders, public.profiles, auth.users cascade");
      return json(res, 200, { ok: true });
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const body = await cuerpo(req);
      const headers = { ...req.headers, host: "localhost:54320" };
      delete headers["content-length"];
      const r = await fetch(`http://localhost:54320${url.pathname.slice(8)}${url.search}`, {
        method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      });
      const buf = Buffer.from(await r.arrayBuffer());
      const h = Object.fromEntries([...r.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k)));
      res.writeHead(r.status, h); return res.end(buf);
    }
    if (url.pathname === "/auth/v1/signup" && req.method === "POST") {
      const { email, password, data } = JSON.parse((await cuerpo(req)).toString());
      if (claves.has(email)) return json(res, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
      try {
        const { rows } = await db.query("insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id", [email, data ?? {}]);
        claves.set(email, password);
        return json(res, 200, sesion(await usuario(rows[0].id)));
      } catch { return json(res, 500, { code: 500, error_code: "unexpected_failure", msg: "Database error saving new user" }); }
    }
    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      const b = JSON.parse((await cuerpo(req)).toString());
      if (url.searchParams.get("grant_type") === "password") {
        const { rows } = await db.query("select id from auth.users where email=$1", [b.email]);
        if (!rows[0] || claves.get(b.email) !== b.password) return json(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return json(res, 200, sesion(await usuario(rows[0].id)));
      }
      const id = refresh.get(b.refresh_token);
      if (!id) return json(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      return json(res, 200, sesion(await usuario(id)));
    }
    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      const c = leer((req.headers.authorization || "").replace("Bearer ", ""));
      if (!c) return json(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      return json(res, 200, await usuario(c.sub));
    }
    if (url.pathname === "/auth/v1/user" && req.method === "PUT") {
      const c = leer((req.headers.authorization || "").replace("Bearer ", ""));
      if (!c) return json(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      const b = JSON.parse((await cuerpo(req)).toString());
      const u = await usuario(c.sub);
      if (b.password) claves.set(u.email, b.password);
      return json(res, 200, u);
    }
    const adminUser = url.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/);
    if (adminUser && req.method === "PUT") {
      const c = leer((req.headers.authorization || "").replace("Bearer ", ""));
      if (!c || c.role !== "service_role") return json(res, 403, { code: 403, msg: "not_admin" });
      const b = JSON.parse((await cuerpo(req)).toString());
      const u = await usuario(adminUser[1]);
      if (!u) return json(res, 404, { code: 404, msg: "User not found" });
      if (b.password) claves.set(u.email, b.password);
      return json(res, 200, u);
    }
    if (url.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
    json(res, 404, { msg: `no implementado: ${req.method} ${url.pathname}` });
  } catch (e) { console.error(e); json(res, 500, { msg: String(e) }); }
};
http.createServer(manejar).listen(54321, () => console.log("fake supabase en :54321"));
https.createServer({ key: fs.readFileSync(`${process.env.E2E_CACHE}/key.pem`), cert: fs.readFileSync(`${process.env.E2E_CACHE}/cert.pem`) }, manejar).listen(54322, () => console.log("push sink https en :54322"));
