import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DomainError, uuidv7 } from "@structura/domain";
import { executeCommand, type CommandContext, type CommandOutcome } from "../src/commands.js";
import type { Db } from "../src/db.js";
import { addTenant, count, freshDb } from "./helpers.js";

let db: Db;
let ctx: CommandContext;

beforeEach(async () => {
  db = await freshDb();
  ctx = { tenantId: await addTenant(db), actorId: null, deploymentId: "test" };
});
afterEach(async () => {
  await db.close();
});

function input(payload: unknown, commandId = uuidv7()) {
  return { commandId, commandType: "test.rename", occurredAt: new Date().toISOString(), payload };
}

// A stand-in for a real business command: counts how often it actually ran.
function makeRun() {
  let runs = 0;
  const run = async (): Promise<CommandOutcome<{ ran: number }>> => {
    runs += 1;
    const recordId = uuidv7();
    return {
      result: { ran: runs },
      audit: [{ action: "renamed", recordType: "test", recordId, change: { to: "B" } }],
      outbox: [{ aggregateType: "test", aggregateId: recordId, payload: { to: "B" } }],
    };
  };
  return { run, runs: () => runs };
}

describe("executeCommand (spec 11.2)", () => {
  it("records the command, its audit entry and its outbox row together", async () => {
    const { run } = makeRun();
    const res = await executeCommand(db, ctx, input({ to: "B" }), run);
    expect(res.replayed).toBe(false);
    expect(await count(db, "command_log")).toBe(1);
    expect(await count(db, "audit_entries")).toBe(1);
    expect(await count(db, "outbox")).toBe(1);
    const { rows } = await db.query<{ state: string }>("SELECT state FROM outbox");
    expect(rows[0]!.state).toBe("pending");
  });

  it("a retry with the same ID returns the stored result and changes nothing (AT-15, AT-20)", async () => {
    const { run, runs } = makeRun();
    const cmd = input({ to: "B" });
    const first = await executeCommand(db, ctx, cmd, run);
    const retry = await executeCommand(db, ctx, { ...cmd, payload: { to: "B" } }, run);
    expect(retry.replayed).toBe(true);
    expect(retry.result).toEqual(first.result);
    expect(runs()).toBe(1);
    expect(await count(db, "audit_entries")).toBe(1);
    expect(await count(db, "outbox")).toBe(1);
  });

  it("key order in the payload does not matter for a retry", async () => {
    const { run } = makeRun();
    const id = uuidv7();
    await executeCommand(db, ctx, input({ a: 1, b: 2 }, id), run);
    const retry = await executeCommand(db, ctx, input({ b: 2, a: 1 }, id), run);
    expect(retry.replayed).toBe(true);
  });

  it("the same ID with different data is refused", async () => {
    const { run } = makeRun();
    const id = uuidv7();
    await executeCommand(db, ctx, input({ to: "B" }, id), run);
    await expect(executeCommand(db, ctx, input({ to: "C" }, id), run)).rejects.toMatchObject({
      kind: "idempotency_conflict",
    });
  });

  it("another tenant cannot reuse or read a command ID", async () => {
    const { run } = makeRun();
    const id = uuidv7();
    await executeCommand(db, ctx, input({ to: "B" }, id), run);
    const other = { ...ctx, tenantId: await addTenant(db, "Other") };
    await expect(executeCommand(db, other, input({ to: "B" }, id), run)).rejects.toMatchObject({
      kind: "idempotency_conflict",
    });
  });

  it("a failing command leaves nothing behind", async () => {
    const failing = async (t: Db): Promise<CommandOutcome<null>> => {
      await t.query("INSERT INTO users (id, email, display_name) VALUES ($1, 'x@example.com', 'X')", [uuidv7()]);
      throw new DomainError("insufficient_availability", "Not enough stock");
    };
    await expect(executeCommand(db, ctx, input({}), failing)).rejects.toBeInstanceOf(DomainError);
    expect(await count(db, "users")).toBe(0);
    expect(await count(db, "command_log")).toBe(0);
    expect(await count(db, "audit_entries")).toBe(0);
    expect(await count(db, "outbox")).toBe(0);
  });
});
