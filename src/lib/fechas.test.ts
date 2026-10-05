import { describe, expect, it } from "vitest";
import { hoyAR } from "./fechas";

describe("hoyAR", () => {
  it("usa la hora de Argentina (UTC-3), no la de UTC", () => {
    expect(hoyAR(new Date("2026-10-06T01:30:00Z"))).toBe("2026-10-05");
    expect(hoyAR(new Date("2026-10-05T12:00:00Z"))).toBe("2026-10-05");
    expect(hoyAR(new Date("2026-10-05T03:00:00Z"))).toBe("2026-10-05");
    expect(hoyAR(new Date("2026-10-05T02:59:00Z"))).toBe("2026-10-04");
  });
});

import { fechaHora } from "./fechas";
describe("fechaHora", () => {
  it("muestra día, mes y hora en horario de Argentina", () => {
    const f = fechaHora("2026-10-05T17:32:00Z"); // 14:32 en Buenos Aires
    expect(f).toMatch(/^5 oct,? 14:32$/);
  });
});
