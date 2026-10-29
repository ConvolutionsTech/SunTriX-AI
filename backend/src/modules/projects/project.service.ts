import { projectRepository, ProjectRepository } from "./project.repository";
import { AppError, ERROR_CODES } from "../../shared/errors/appError";
import { IProjectTracker } from "./project.types";
import ProjectTracker from "../../models/ProjectTracker";
import TrackerMessage from "../../models/TrackerMessage";
import { sendTrackerClientActionToAdminEmail } from "../../services/email";
import { getSetting } from "../../lib/configLoader";
import { logger } from "../../lib/logger";

export class ProjectService {
  constructor(private projectRepo: ProjectRepository = projectRepository) {}

  async listAdminTrackers(): Promise<any[]> {
    return ProjectTracker.find()
      .populate("taskRequestId", "name projectTitle company service status")
      .sort({ createdAt: -1 })
      .lean();
  }

  async getTrackerByToken(token: string): Promise<IProjectTracker> {
    const tracker = await this.projectRepo.findByTrackerToken(token);
    if (!tracker) throw new AppError("Tracker workspace not found", ERROR_CODES.NOT_FOUND);
    return tracker;
  }

  async getTrackerByTaskRequestId(taskRequestId: string): Promise<IProjectTracker> {
    const tracker = await this.projectRepo.findByTaskRequestId(taskRequestId);
    if (!tracker) throw new AppError("Tracker workspace not found for this task request", ERROR_CODES.NOT_FOUND);
    return tracker;
  }

  async addMessage(trackerToken: string, sender: "admin" | "client", messageText: string, attachments: any[] = []): Promise<any> {
    const tracker = await this.getTrackerByToken(trackerToken);
    const msg = await TrackerMessage.create({
      trackerId: tracker._id,
      sender,
      senderName: sender === "admin" ? "SunTriX Engineering" : (tracker as any).clientName,
      message: messageText,
      attachments,
    });

    if (sender === "client") {
      const appUrl = getSetting("FRONTEND_URL", "http://localhost:5173");
      sendTrackerClientActionToAdminEmail({
        actionStr: "New Client Message",
        projectTitle: (tracker as any).projectTitle,
        targetName: (tracker as any).clientName,
        adminUrl: `${appUrl}/admin/tasks`,
      }).catch((err) => logger.error({ err }, "Tracker client-action email failed"));
    }

    return msg;
  }
}

export const projectService = new ProjectService();
