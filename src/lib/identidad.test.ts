import { describe, expect, it } from "vitest";
import { normalizarCelular, parseIdentificador } from "./identidad";

describe("normalizarCelular", () => {
  it.each([
    ["11 5555-1234", "1155551234"],
    ["(011) 5555-1234", "1155551234"],
    ["+54 9 11 5555 1234", "1155551234"],
    ["5491155551234", "1155551234"],
    ["0351 4123456", "3514123456"],
  ])("%s -> %s", (entrada, esperado) => {
    expect(normalizarCelular(entrada)).toBe(esperado);
  });
  it("rechaza lo que no es un celular", () => {
    expect(normalizarCelular("1234")).toBeNull();
    expect(normalizarCelular("")).toBeNull();
    expect(normalizarCelular("abc")).toBeNull();
  });
});

describe("parseIdentificador", () => {
  it("email", () => {
    expect(parseIdentificador("  Ana@Mail.com ")).toEqual({ tipo: "email", email: "ana@mail.com" });
    expect(parseIdentificador("ana@")).toBeNull();
  });
  it("celular -> email técnico estable", () => {
    const a = parseIdentificador("11 5555-1234");
    const b = parseIdentificador("+54 9 11 5555 1234");
    expect(a).toMatchObject({ tipo: "celular", celular: "1155551234" });
    expect(a).toEqual(b);
    expect(a?.email).toMatch(/^1155551234@/);
  });
});
