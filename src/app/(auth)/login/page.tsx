import type { Metadata } from "next";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-center text-xl font-bold text-stone-900">Ingresá a tu cuenta</h1>
      <LoginForm avisoLink={error === "link"} />
    </>
  );
}
