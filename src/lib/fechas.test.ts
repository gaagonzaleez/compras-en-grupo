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
