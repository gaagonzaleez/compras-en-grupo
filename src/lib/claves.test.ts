import { describe, expect, it } from "vitest";
import { claveTemporal } from "./claves";

describe("claveTemporal", () => {
  it("tiene el largo pedido y solo caracteres legibles", () => {
    const c = claveTemporal();
    expect(c).toHaveLength(10);
    expect(c).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
  });
  it("no se repite", () => {
    expect(new Set(Array.from({ length: 50 }, () => claveTemporal())).size).toBe(50);
  });
});
