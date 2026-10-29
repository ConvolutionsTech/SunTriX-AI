import TaskRequest, { ITaskRequest } from "../../models/TaskRequest";
import { CreateTaskRequestDTO } from "./task-request.types";

export class TaskRequestRepository {
  async create(data: CreateTaskRequestDTO & { trackingToken: string }): Promise<ITaskRequest> {
    return TaskRequest.create(data);
  }

  async findById(id: string): Promise<ITaskRequest | null> {
    return TaskRequest.findOne({ _id: id, deletedAt: null });
  }

  async findByTrackingToken(token: string): Promise<ITaskRequest | null> {
    return TaskRequest.findOne({ trackingToken: token, deletedAt: null });
  }

  async findAll(filter: Record<string, unknown> = {}, limit = 100, skip = 0): Promise<{ tasks: ITaskRequest[]; total: number }> {
    const query = { ...filter, deletedAt: null };
    const tasks = await TaskRequest.find(query).sort({ createdAt: -1 }).limit(limit).skip(skip);
    const total = await TaskRequest.countDocuments(query);
    return { tasks, total };
  }

  async softDelete(id: string, deletedBy: string): Promise<ITaskRequest | null> {
    return TaskRequest.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy } },
      { new: true }
    );
  }

  async softDeleteBulk(ids: string[], deletedBy: string): Promise<number> {
    const res = await TaskRequest.updateMany(
      { _id: { $in: ids }, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy } }
    );
    return res.modifiedCount;
  }
}

export const taskRequestRepository = new TaskRequestRepository();
