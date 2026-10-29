import Proposal from "../../models/Proposal";
import { stripeAdapter } from "../../integrations/stripe/stripe.adapter";
import crypto from "crypto";
import { taskRequestRepository, TaskRequestRepository } from "./task-request.repository";
import { TaskStatusMachine, ActorRole } from "../../services/taskStatusMachine";
import { CreateTaskRequestDTO, ClientTaskTrackingResponseDTO, ITaskRequest, TaskRequestStatus } from "./task-request.types";
import { AppError, ERROR_CODES } from "../../shared/errors/appError";
import Contract from "../../models/Contract";
import ProjectTracker from "../../models/ProjectTracker";
import Payment from "../../models/Payment";
import TaskRequest from "../../models/TaskRequest";
import { sendTaskNotification } from "../../services/email";
import { logger } from "../../lib/logger";

export class TaskRequestService {
  constructor(private repo: TaskRequestRepository = taskRequestRepository) {}

  async submitRequest(dto: CreateTaskRequestDTO): Promise<{ task: ITaskRequest; trackingToken: string }> {
    const trackingToken = crypto.randomBytes(20).toString("hex");
    const task = await this.repo.create({
      ...dto,
      trackingToken,
      selectedPlan: dto.selectedPlan || "",
      planBudget: Number(dto.planBudget) || 0,
    });

    sendTaskNotification({
      name: task.name,
      email: task.email,
      company: task.company,
      service: task.service,
      budget: task.budget,
      priority: task.priority,
      projectTitle: task.projectTitle,
      description: task.description,
      selectedPlan: task.selectedPlan,
    }).catch((err) => logger.error({ err }, "Task notification email failed"));

    return { task, trackingToken };
  }

  async getClientTrackingInfo(token: string): Promise<ClientTaskTrackingResponseDTO> {
    const task = await this.repo.findByTrackingToken(token);
    if (!task) throw new AppError("Request not found", ERROR_CODES.NOT_FOUND);

    return {
      name: task.name || "",
      projectTitle: task.projectTitle || task.name || "",
      service: task.service || "",
      status: task.status as TaskRequestStatus,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      statusTimeline: (task.statusHistory || []).map((h: any) => ({
        status: h.status,
        updatedAt: h.updatedAt,
      })),
    };
  }

  async transitionStatus(
    id: string,
    newStatus: TaskRequestStatus,
    actorRole: ActorRole = "admin",
    note: string = ""
  ): Promise<ITaskRequest> {
    return TaskStatusMachine.transition(id, newStatus, actorRole, note);
  }

  /**
   * Cancels an engagement and everything still open on it: proposals can no
   * longer be accepted, contracts signed or invoices paid (open Stripe sessions
   * are expired). Refused while the client has a paid, un-refunded payment —
   * refund first, or pass force with a reason.
   */
  async cancelEngagement(id: string, note: string, force = false): Promise<ITaskRequest> {
    const paid = await Payment.countDocuments({ taskRequestId: id, status: "paid" });
    if (paid > 0 && !force) {
      throw Object.assign(
        new AppError("This engagement has a paid invoice. Refund it first, or confirm cancelling anyway.", ERROR_CODES.CONFLICT),
        { code: "HAS_PAID_PAYMENTS" }
      );
    }

    const task = await TaskStatusMachine.transition(id, "cancelled", "admin", note || "Cancelled by admin");

    await Proposal.updateMany({ taskRequestId: id, status: { $in: ["draft", "sent", "changes_requested", "processing"] } }, { $set: { status: "rejected" } });
    await Contract.updateMany({ taskRequestId: id, status: "pending" }, { $set: { status: "expired" } });
    const openInvoices = await Payment.find({ taskRequestId: id, status: "pending" }).select("stripeSessionId").lean();
    await Payment.updateMany({ taskRequestId: id, status: "pending" }, { $set: { status: "cancelled" }, $unset: { stripeSessionId: 1, sessionExpiresAt: 1 } });
    for (const p of openInvoices) {
      if (p.stripeSessionId) await stripeAdapter.expireCheckoutSession(p.stripeSessionId);
    }
    return task;
  }

  async getAllTasks(filter: Record<string, unknown> = {}, limit = 100, skip = 0): Promise<{ tasks: ITaskRequest[]; total: number }> {
    return this.repo.findAll(filter, limit, skip);
  }

  async getTaskById(id: string): Promise<ITaskRequest> {
    const task = await this.repo.findById(id);
    if (!task) throw new AppError("Task request not found", ERROR_CODES.NOT_FOUND);
    return task;
  }

  async updateTask(id: string, data: Record<string, unknown>): Promise<ITaskRequest> {
    const task = await this.repo.findById(id);
    if (!task) throw new AppError("Task request not found", ERROR_CODES.NOT_FOUND);
    const updated = await TaskRequest.findOneAndUpdate({ _id: id, deletedAt: null }, { $set: data }, { new: true, runValidators: true });
    if (!updated) throw new AppError("Failed to update task", ERROR_CODES.INTERNAL_SERVER_ERROR);
    return updated;
  }

  async softDeleteTask(id: string, actorId: string): Promise<void> {
    const task = await this.repo.findById(id);
    if (!task) throw new AppError("Task request not found", ERROR_CODES.NOT_FOUND);

    const [hasContract, hasTracker, hasPayment] = await Promise.all([
      Contract.exists({ taskRequestId: task._id }),
      ProjectTracker.exists({ taskRequestId: task._id }),
      Payment.exists({ taskRequestId: task._id, status: "paid" }),
    ]);

    if (hasContract || hasTracker || hasPayment) {
      throw new AppError(
        "Cannot delete task request with active contract, project hub, or confirmed payment.",
        ERROR_CODES.BAD_REQUEST
      );
    }

    await this.repo.softDelete(id, actorId);
  }

  async softDeleteBulkTasks(ids: string[], actorId: string): Promise<number> {
    if (!ids?.length) throw new AppError("IDs required", ERROR_CODES.BAD_REQUEST);

    const [hasContracts, hasTrackers, hasPayments] = await Promise.all([
      Contract.exists({ taskRequestId: { $in: ids } }),
      ProjectTracker.exists({ taskRequestId: { $in: ids } }),
      Payment.exists({ taskRequestId: { $in: ids }, status: "paid" }),
    ]);

    if (hasContracts || hasTrackers || hasPayments) {
      throw new AppError(
        "Cannot delete task requests with active contracts, project hubs, or confirmed payments.",
        ERROR_CODES.BAD_REQUEST
      );
    }

    return this.repo.softDeleteBulk(ids, actorId);
  }
}

export const taskRequestService = new TaskRequestService();
