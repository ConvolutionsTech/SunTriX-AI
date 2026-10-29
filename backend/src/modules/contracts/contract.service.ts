import { contractRepository, ContractRepository } from "./contract.repository";
import { projectRepository, ProjectRepository } from "../projects/project.repository";
import { taskRequestService, TaskRequestService } from "../task-requests/task-request.service";
import { AppError, ERROR_CODES } from "../../shared/errors/appError";
import { IContract, SignContractDTO } from "./contract.types";
import { getSetting } from "../../lib/configLoader";
import { sendContractSignedNotification } from "../../services/email";

export class ContractService {
  constructor(
    private contractRepo: ContractRepository = contractRepository,
    private projectRepo: ProjectRepository = projectRepository,
    private taskService: TaskRequestService = taskRequestService
  ) {}

  async getByToken(token: string): Promise<IContract> {
    const contract = await this.contractRepo.findByToken(token);
    if (!contract) throw new AppError("Contract not found", ERROR_CODES.NOT_FOUND);

    if (contract.status === "expired" || (contract.status === "pending" && new Date() > contract.expiresAt)) {
      throw new AppError("This contract link has expired. Please contact us.", 410);
    }
    return contract;
  }

  /**
   * Client signs. The task moves first (contract_sent → contract_signed), then the
   * contract is marked signed atomically; a concurrent or repeated sign gets 409
   * and sends nothing. The project tracker is created here from the proposal.
   */
  async signContract(dto: SignContractDTO): Promise<{ contract: IContract; trackerToken: string }> {
    const existing = await this.contractRepo.findByToken(dto.token);
    if (!existing) throw new AppError("Contract not found", ERROR_CODES.NOT_FOUND);
    if (existing.status === "signed") throw new AppError("This contract has already been signed.", ERROR_CODES.CONFLICT);
    if (existing.status === "expired" || existing.expiresAt <= new Date()) {
      throw new AppError("This contract link has expired. Please contact us.", 410);
    }

    const task = existing.taskRequestId as any;
    const proposal = existing.proposalId as any;
    if (!task?._id || task.deletedAt || !proposal?._id) {
      throw new AppError("This engagement is no longer available. Please contact us.", 410);
    }
    const taskRequestId = task._id.toString();

    await this.taskService.transitionStatus(taskRequestId, "contract_signed", "client");

    const contract = await this.contractRepo.markSigned(existing._id.toString(), dto.clientSignatureName, dto.clientIp, dto.userAgent);
    if (!contract) throw new AppError("This contract has already been signed.", ERROR_CODES.CONFLICT);

    const now = Date.now();
    const tracker = await this.projectRepo.findOrCreateTracker(taskRequestId, proposal._id.toString(), {
      currentPhase: "Discovery",
      phases: [{ name: "Discovery", enteredAt: new Date(now) }],
      milestones: (proposal.milestones || []).map((m: any, idx: number) => ({
        title: m.title,
        amount: m.amount, // cents
        linkedPhase: "Discovery",
        dueDate: new Date(now + (m.dueWeek || idx + 1) * 7 * 86400000),
      })),
      deliverables: (proposal.scopeItems || []).map((title: string) => ({ title, status: "Pending" })),
    });

    const appUrl = getSetting("FRONTEND_URL", "http://localhost:5173");
    sendContractSignedNotification({
      projectTitle: contract.projectTitle,
      clientName: contract.clientName,
      clientEmail: contract.clientEmail,
      signedAt: (contract.signedAt || new Date()).toISOString(),
      adminUrl: `${appUrl}/admin/tasks`,
    }).catch(console.error);

    return { contract, trackerToken: tracker.trackerToken };
  }
}

export const contractService = new ContractService();
