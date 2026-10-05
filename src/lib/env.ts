export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. Copiá .env.example a .env.local y completalas (ver README).",
    );
  }
  return { url, anonKey };
}

export const phoneEmailDomain = () => process.env.PHONE_EMAIL_DOMAIN || "celular.comprasengrupo.app";
