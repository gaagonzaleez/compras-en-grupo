import { describe, expect, it } from "vitest";
import { aEntero, aEnteroOCero } from "./numeros";

describe("aEntero", () => {
  it("acepta enteros con separador de miles", () => {
    expect(aEntero("1200")).toBe(1200);
    expect(aEntero("1.200")).toBe(1200);
    expect(aEntero(" 57 600 ")).toBe(57600);
  });
  it("rechaza decimales, negativos y basura", () => {
    for (const s of ["12,5", "-3", "abc", "", "1e3"]) expect(aEntero(s)).toBeNaN();
  });
  it("vacío es 0 solo en aEnteroOCero", () => {
    expect(aEnteroOCero("")).toBe(0);
    expect(aEnteroOCero("  ")).toBe(0);
    expect(aEnteroOCero("4")).toBe(4);
  });
});
