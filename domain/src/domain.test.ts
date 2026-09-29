import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  DomainError,
  dec,
  isLocale,
  isUuid,
  parseCommand,
  roundTo,
  sum,
  toText,
  uuidv7,
} from "./index.js";

describe("uuidv7", () => {
  it("produces valid version-7 UUIDs", () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
  });

  it("sorts by creation time", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a < b).toBe(true);
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(1_700_000_000_000)));
    expect(ids.size).toBe(1000);
  });
});

describe("decimals (spec 8.3, AT-16)", () => {
  it("adds exactly where JS numbers drift", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sum([dec("0.1"), dec("0.2")]).equals(dec("0.3"))).toBe(true);
  });

  it("refuses JS numbers and malformed text", () => {
    expect(() => dec(0.1 as unknown as string)).toThrow(DomainError);
    expect(() => dec("1,5")).toThrow(DomainError);
    expect(() => dec("abc")).toThrow(DomainError);
  });

  it("rounds only with an explicitly named mode", () => {
    expect(toText(dec("2.345"), 2, "half_up")).toBe("2.35");
    expect(toText(dec("2.345"), 2, "half_even")).toBe("2.34");
    expect(toText(dec("10"), 2, "half_up")).toBe("10.00");
    expect(() => roundTo(dec("1"), -1, "half_up")).toThrow(DomainError);
  });
});

describe("command envelope", () => {
  const payload = z.object({ designation: z.string().min(1) });
  const valid = {
    commandId: uuidv7(),
    occurredAt: "2026-09-29T10:00:00-05:00",
    payloadVersion: 1,
    expectedVersion: null,
    payload: { designation: "Internal Quote" },
  };

  it("accepts a well-formed command", () => {
    expect(parseCommand(payload, valid).payload.designation).toBe("Internal Quote");
  });

  it("rejects a bad command with a validation error listing the fields", () => {
    try {
      parseCommand(payload, { ...valid, commandId: "nope", payload: { designation: "" } });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      const e = err as DomainError;
      expect(e.kind).toBe("validation");
      const paths = (e.details?.issues as { path: string }[]).map((i) => i.path);
      expect(paths).toEqual(expect.arrayContaining(["commandId", "payload.designation"]));
    }
  });

  it("ignores any tenant or actor a client tries to send", () => {
    const parsed = parseCommand(payload, { ...valid, tenantId: uuidv7(), actorId: uuidv7() });
    expect(parsed).not.toHaveProperty("tenantId");
    expect(parsed).not.toHaveProperty("actorId");
  });
});

describe("locales (DEC-012)", () => {
  it("knows Spanish and English only", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
