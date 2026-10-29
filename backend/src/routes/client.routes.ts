import { Router, Request, Response, NextFunction } from "express";
import Client from "../models/Client";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { createError } from "../middleware/errorHandler";
import { writable, idsBody, bulkItems } from "../middleware/bodyPolicy";
import { logAudit } from "../lib/audit";

// Curated lists stay small; the cap only guards against runaway data
const MAX_LIST = 500;

const router = Router();

// GET /clients — public (enabled only) or admin all
router.get("/", optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Hidden/draft items only for a verified staff token — never for a bare Bearer header
    const showAll = !!req.user;
    const filter = showAll ? {} : { isVisible: true };
    const clients = await Client.find(filter).sort({ order: 1, createdAt: 1 }).limit(MAX_LIST);
    res.json({ clients });
  } catch (err) { next(err); }
});

// PUT /clients/reorder — admin bulk reorder
router.put("/reorder", requireAuth, idsBody, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids }: { ids: string[] } = req.body;
    if (!ids || !Array.isArray(ids)) return next(createError("Array of IDs required", 400));
    
    const updates = ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { order: index } }
    }));
    await Client.bulkWrite(updates);
    await logAudit(req, "reorder", "client", "", `Reordered ${ids.length} clients`);
    res.json({ message: "Reordered successfully" });
  } catch (err) { next(err); }
});

// POST /clients — admin
router.post("/", requireAuth, writable(Client), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await Client.create(req.body);
    await logAudit(req, "create", "client", client._id.toString(), client.name);
    res.status(201).json(client);
  } catch (err) { next(err); }
});

// PUT /clients/:id — admin
router.put("/:id", requireAuth, writable(Client), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!client) return next(createError("Client not found", 404));
    await logAudit(req, "update", "client", client._id.toString(), client.name);
    res.json(client);
  } catch (err) { next(err); }
});

// DELETE /clients/bulk — admin bulk delete
router.delete("/bulk", requireAuth, idsBody, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids }: { ids: string[] } = req.body;
    if (!ids?.length) return next(createError("IDs required", 400));
    await Client.deleteMany({ _id: { $in: ids } });
    await logAudit(req, "bulk_delete", "client", "", `${ids.length} clients`);
    res.json({ message: `Deleted ${ids.length} clients` });
  } catch (err) { next(err); }
});

// DELETE /clients/:id — admin
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return next(createError("Client not found", 404));
    await logAudit(req, "delete", "client", req.params.id, client.name);
    res.json({ message: "Client deleted" });
  } catch (err) { next(err); }
});

// POST /clients/bulk/import — admin bulk import
router.post("/bulk/import", requireAuth, bulkItems(Client), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return next(createError("Array of items required", 400));
    
    const result = await Client.insertMany(items);
    await logAudit(req, "bulk_import", "client", "", `Imported ${result.length} clients`);
    res.status(201).json({ message: `Imported ${result.length} clients`, count: result.length });
  } catch (err) { next(err); }
});

export default router;
