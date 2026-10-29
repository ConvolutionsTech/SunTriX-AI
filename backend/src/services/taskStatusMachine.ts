import TaskRequest, { TaskRequestStatus, ITaskRequest } from "../models/TaskRequest";
import { AppError, ERROR_CODES } from "../shared/errors/appError";

export type ActorRole = "admin" | "system" | "client";

// Define allowed state transitions map: currentStatus -> array of allowed target statuses
const ALLOWED_TRANSITIONS: Record<TaskRequestStatus, TaskRequestStatus[]> = {
  new: ["in_review", "cancelled"],
  in_review: ["proposal_sent", "cancelled"],
  proposal_sent: ["in_review", "contract_sent", "cancelled"],
  contract_sent: ["contract_signed", "cancelled"],
  contract_signed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [], // Terminal
  cancelled: [], // Terminal
};

// Define actor permission rules for transitions
const ACTOR_ALLOWED_TRANSITIONS: Record<ActorRole, Record<TaskRequestStatus, TaskRequestStatus[]>> = {
  admin: ALLOWED_TRANSITIONS, // Admin can execute any valid transition
  system: {
    new: ["in_review"],
    in_review: ["proposal_sent"],
    proposal_sent: ["contract_sent"],
    contract_sent: ["contract_signed"],
    contract_signed: ["in_progress"],
    in_progress: ["completed"],
    completed: [],
    cancelled: [],
  },
  client: {
    new: [],
    in_review: [],
    proposal_sent: ["in_review", "contract_sent"],
    contract_sent: ["contract_signed"],
    contract_signed: [],
    in_progress: ["completed"], // client approves final sign-off
    completed: [],
    cancelled: [],
  },
};

export class TaskStatusMachine {
  /**
   * Validate if a transition from currentStatus to newStatus is valid for actorRole.
   */
  static isValidTransition(
    currentStatus: TaskRequestStatus,
    newStatus: TaskRequestStatus,
    actorRole: ActorRole = "system"
  ): boolean {
    if (currentStatus === newStatus) return true;

    const validNextStates = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!validNextStates.includes(newStatus)) {
      return false;
    }

    const actorAllowed = ACTOR_ALLOWED_TRANSITIONS[actorRole]?.[currentStatus] || [];
    return actorAllowed.includes(newStatus);
  }

  /**
   * The single authoritative status transition. The write is conditional on the
   * status that was validated, so a concurrent change (e.g. an admin cancel while
   * a payment webhook moves the task on) fails with 409 instead of overwriting.
   * Moving to the current status is a no-op.
   */
  static async transition(
    taskId: string | ITaskRequest["_id"],
    newStatus: TaskRequestStatus,
    actorRole: ActorRole = "system",
    note: string = ""
  ): Promise<ITaskRequest> {
    const task = await TaskRequest.findOne({ _id: taskId, deletedAt: null });
    if (!task) throw new AppError("Task request not found", ERROR_CODES.NOT_FOUND);

    const currentStatus = task.status as TaskRequestStatus;
    if (currentStatus === newStatus) return task;

    if (!this.isValidTransition(currentStatus, newStatus, actorRole)) {
      throw new AppError(`Invalid status transition from '${currentStatus}' to '${newStatus}' by ${actorRole}.`, ERROR_CODES.BAD_REQUEST);
    }

    const updated = await TaskRequest.findOneAndUpdate(
      { _id: taskId, deletedAt: null, status: currentStatus },
      {
        $set: { status: newStatus },
        $push: { statusHistory: { status: newStatus, note: note || `Status transitioned to ${newStatus} by ${actorRole}`, updatedAt: new Date() } },
      },
      { new: true }
    );
    if (!updated) {
      throw new AppError("This request was just changed by someone else — reload and try again.", ERROR_CODES.CONFLICT);
    }
    return updated;
  }
}
