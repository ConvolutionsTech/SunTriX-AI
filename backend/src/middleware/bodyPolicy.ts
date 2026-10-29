import { Request, Response, NextFunction } from "express";
import { Model } from "mongoose";
import { z } from "zod";
import { validate } from "./validate";

/**
 * Mass-assignment guards for admin CRUD routes.
 *
 * Mongoose already drops fields that aren't in the schema; the risk is
 * clients writing schema fields they must not control (counters, workflow
 * status, tokens, soft-delete markers) or smuggling update operators.
 */
const ALWAYS_PROTECTED = ["_id", "__v", "id", "createdAt", "updatedAt"];
const MAX_BULK = 500;

function topLevelFields(model: Model<any>): Set<string> {
  return new Set(Object.keys(model.schema.paths).map((p) => p.split(".")[0]));
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Keeps only real schema fields; throws on protected ones; never passes operators. */
function pick(fields: Set<string>, protectedFields: Set<string>, body: unknown): Record<string, unknown> {
  if (!isPlainObject(body)) throw new Error("Request body must be a JSON object");
  const out: Record<string, unknown> = {};
  const blocked: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith("$") || key.includes(".")) continue;
    if (protectedFields.has(key)) {
      if (!ALWAYS_PROTECTED.includes(key)) blocked.push(key);
      continue;
    }
    if (fields.has(key)) out[key] = value;
  }
  if (blocked.length) throw new Error(`These fields can't be set here: ${blocked.join(", ")}`);
  return out;
}

/** Body of a create/update: schema fields only, `protect` fields rejected with 400. */
export function writable(model: Model<any>, opts: { protect?: string[] } = {}) {
  const fields = topLevelFields(model);
  const protectedFields = new Set([...ALWAYS_PROTECTED, ...(opts.protect ?? [])]);
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = pick(fields, protectedFields, req.body);
      next();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  };
}

/** Body `{ items: [...] }` for bulk import: ≤ 500 items, each filtered like `writable`. */
export function bulkItems(model: Model<any>, opts: { protect?: string[] } = {}) {
  const fields = topLevelFields(model);
  const protectedFields = new Set([...ALWAYS_PROTECTED, ...(opts.protect ?? [])]);
  return (req: Request, res: Response, next: NextFunction): void => {
    const items = (req.body as { items?: unknown })?.items;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Array of items required" });
      return;
    }
    if (items.length > MAX_BULK) {
      res.status(400).json({ error: `At most ${MAX_BULK} items per import` });
      return;
    }
    try {
      req.body = { items: items.map((item) => pick(fields, protectedFields, item)) };
      next();
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  };
}

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const IdsSchema = z.object({ ids: z.array(objectId).min(1, "IDs required").max(MAX_BULK, `At most ${MAX_BULK} ids`) });

/** Body `{ ids: [...] }` for bulk delete / reorder: valid ObjectIds, 1–500. */
export const idsBody = validate(IdsSchema);

/** Body `{ ids, update }` for bulk edits: `update` may only touch the listed fields. */
export function bulkUpdate(allowed: string[]) {
  const shape = Object.fromEntries(allowed.map((k) => [k, z.unknown().optional()]));
  return validate(
    z.object({
      ids: IdsSchema.shape.ids,
      update: z.strictObject(shape).refine((u) => Object.keys(u).length > 0, "Nothing to update"),
    })
  );
}
