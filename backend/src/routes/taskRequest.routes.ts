import TaskRequest from "../models/TaskRequest";
import { Router, Request, Response, NextFunction } from "express";
import { writable } from "../middleware/bodyPolicy";
import { taskRequestService } from "../modules/task-requests/task-request.service";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate, TaskRequestSchema } from "../middleware/validate";
import { logAudit } from "../lib/audit";

const router = Router();

// POST /task-requests — public submission
router.post("/", validate(TaskRequestSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await taskRequestService.submitRequest(req.body);
    res.status(201).json({
      message: "Task request submitted successfully",
      id: result.task._id,
      trackingToken: result.trackingToken,
    });
  } catch (err) {
    next(err);
  }
});

// GET /task-requests/track/:token — PUBLIC client portal
router.get("/track/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = await taskRequestService.getClientTrackingInfo(req.params.token);
    res.json(dto);
  } catch (err) {
    next(err);
  }
});

// GET /task-requests — admin only
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit = 100, skip = 0 } = req.query;
    const filter = status ? { status: String(status) } : {};
    const result = await taskRequestService.getAllTasks(filter, Number(limit), Number(skip));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /task-requests/:id — admin only
router.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await taskRequestService.getTaskById(req.params.id);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// PUT /task-requests/:id/status — admin status update
router.put("/:id/status", requireAuth, requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, note } = req.body;
    const task = await taskRequestService.transitionStatus(req.params.id, status, "admin", note);
    await logAudit(req, "status_change", "task", task._id.toString(), task.projectTitle || task.name, { newStatus: status });
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// PUT /task-requests/:id — admin edit of descriptive fields. Workflow state
// (status, tokens, linked documents, soft-delete) only changes through its own endpoints.
const TASK_WORKFLOW_FIELDS = [
  "status", "statusHistory", "trackingToken", "contractToken", "proposalId",
  "contractSignedAt", "contractClientName", "deletedAt", "deletedBy",
];
router.put("/:id", requireAuth, requireRole("admin"), writable(TaskRequest, { protect: TASK_WORKFLOW_FIELDS }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await taskRequestService.updateTask(req.params.id, req.body);
    await logAudit(req, "update", "task", task._id.toString(), task.projectTitle || task.name);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// DELETE /task-requests/bulk — admin bulk soft delete
router.delete("/bulk", requireAuth, requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids }: { ids: string[] } = req.body;
    const count = await taskRequestService.softDeleteBulkTasks(ids, (req as any).user?.id || "admin");
    await logAudit(req, "bulk_delete", "task", "", `${count} tasks`);
    res.json({ message: `Soft deleted ${count} tasks` });
  } catch (err) {
    next(err);
  }
});

// DELETE /task-requests/:id — admin soft delete
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await taskRequestService.softDeleteTask(req.params.id, (req as any).user?.id || "admin");
    await logAudit(req, "delete", "task", req.params.id, "Task Request");
    res.json({ message: "Task request soft deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
