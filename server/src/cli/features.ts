// Platform operator tool: plans (tiers) and add-ons per organization
// (DEC-023, DEC-024), until the Phase 4 license system replaces it.
// What an organization can use = its plan's features + its own add-ons.
//
//   node server/dist/cli/features.js --list
//   node server/dist/cli/features.js --plans
//   node server/dist/cli/features.js --plan-save <code> --name "<name>" --features courses[,other]
//   node server/dist/cli/features.js --tenant "<organization>" --plan <code|none>
//   node server/dist/cli/features.js --tenant "<organization>" --enable courses
//   node server/dist/cli/features.js --tenant "<organization>" --disable courses
//   node server/dist/cli/features.js --tenant "<organization>" --full      (every add-on; for test organizations)
//
// Inside Docker: docker compose exec structura-app node server/dist/cli/features.js ...
import { parseArgs } from "node:util";
import { FEATURES, uuidv7 } from "@structura/domain";
import { loadConfig } from "../config.js";
import { openDb, type Db } from "../db.js";
import { tenantFeatures } from "../events/maps.js";
import { migrate } from "../migrate.js";

const { values } = parseArgs({
  options: {
    list: { type: "boolean" },
    plans: { type: "boolean" },
    "plan-save": { type: "string" },
    name: { type: "string" },
    features: { type: "string" },
    tenant: { type: "string" },
    plan: { type: "string" },
    enable: { type: "string" },
    disable: { type: "string" },
    full: { type: "boolean" },
  },
});

const known = (list: string[]) => {
  const bad = list.filter((f) => !(FEATURES as readonly string[]).includes(f));
  if (bad.length) throw new Error(`Unknown feature(s): ${bad.join(", ")}. Known: ${FEATURES.join(", ")}`);
  return list;
};
const split = (s: string | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

async function audit(db: Db, tenantId: string, action: string, change: unknown) {
  await db.query(
    `INSERT INTO audit_entries (id, tenant_id, actor_id, deployment_id, action, record_type, record_id, change, occurred_at)
     VALUES ($1, $2, NULL, 'operator', $3, 'tenant', $2, $4, now())`,
    [uuidv7(), tenantId, action, JSON.stringify(change)]
  );
}

async function tenantId(db: Db, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>("SELECT id FROM tenants WHERE display_name = $1", [name]);
  if (!rows[0]) throw new Error(`No organization named "${name}"`);
  return rows[0].id;
}

const config = loadConfig();
const db = await openDb(config.databaseUrl);
try {
  await migrate(db, config.migrationsDir);
  if (values.list) {
    const { rows } = await db.query<{ id: string; display_name: string; plan: string | null; features: string[] }>(
      "SELECT t.id, t.display_name, p.code AS plan, t.features FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id ORDER BY t.display_name"
    );
    for (const r of rows) {
      console.log(`${r.display_name}: plan ${r.plan ?? "(none)"}; add-ons ${r.features.join(", ") || "(none)"}; can use ${(await tenantFeatures(db, r.id)).join(", ") || "(nothing extra)"}`);
    }
  } else if (values.plans) {
    const { rows } = await db.query<{ code: string; name: string; features: string[]; active: boolean }>("SELECT code, name, features, active FROM plans ORDER BY code");
    if (!rows.length) console.log("(no plans defined yet)");
    for (const r of rows) console.log(`${r.code} - ${r.name}${r.active ? "" : " (inactive)"}: ${r.features.join(", ") || "(no extra features)"}`);
  } else if (values["plan-save"]) {
    const code = values["plan-save"];
    const feats = known(split(values.features));
    await db.query(
      `INSERT INTO plans (id, code, name, features) VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET name = coalesce($5, plans.name), features = EXCLUDED.features, updated_at = now()`,
      [uuidv7(), code, values.name ?? code, feats, values.name ?? null]
    );
    console.log(`Plan ${code}: ${feats.join(", ") || "(no extra features)"}`);
  } else if (values.tenant) {
    const id = await tenantId(db, values.tenant);
    if (values.plan) {
      const planId =
        values.plan === "none"
          ? null
          : (await db.query<{ id: string }>("SELECT id FROM plans WHERE code = $1", [values.plan])).rows[0]?.id;
      if (planId === undefined) throw new Error(`No plan with code "${values.plan}"`);
      await db.query("UPDATE tenants SET plan_id = $2 WHERE id = $1", [id, planId]);
      await audit(db, id, "plan.assigned", { plan: values.plan });
    }
    if (values.enable || values.full) {
      const add = values.full ? [...FEATURES] : known(split(values.enable));
      await db.query("UPDATE tenants SET features = array(SELECT DISTINCT unnest(features || $2::text[])) WHERE id = $1", [id, add]);
      await audit(db, id, "feature.enabled", { features: add });
    }
    if (values.disable) {
      const remove = known(split(values.disable));
      await db.query("UPDATE tenants SET features = array(SELECT f FROM unnest(features) AS f WHERE NOT f = ANY($2::text[])) WHERE id = $1", [id, remove]);
      await audit(db, id, "feature.disabled", { features: remove });
    }
    console.log(`${values.tenant} can use: ${(await tenantFeatures(db, id)).join(", ") || "(nothing extra)"}`);
  } else {
    console.error("Nothing to do. See the usage at the top of server/src/cli/features.ts");
    process.exitCode = 2;
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
