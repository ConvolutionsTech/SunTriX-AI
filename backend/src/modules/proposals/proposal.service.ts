import crypto from "crypto";
import { proposalRepository, ProposalRepository } from "./proposal.repository";
import { contractRepository, ContractRepository } from "../contracts/contract.repository";
import { taskRequestService, TaskRequestService } from "../task-requests/task-request.service";
import { AppError, ERROR_CODES } from "../../shared/errors/appError";
import { CreateProposalDTO, IProposal } from "./proposal.types";
import { getSetting } from "../../lib/configLoader";
import TaskRequest from "../../models/TaskRequest";
import { draftProposalWithAI, generateContractWithAI } from "../../services/groq";
import { sendProposalEmail, sendChangesRequestedNotification, sendContractEmail } from "../../services/email";

export class ProposalService {
  constructor(
    private proposalRepo: ProposalRepository = proposalRepository,
    private contractRepo: ContractRepository = contractRepository,
    private taskService: TaskRequestService = taskRequestService
  ) {}

  async generateAiDraft(taskRequestId: string): Promise<Record<string, any>> {
    const task = await this.taskService.getTaskById(taskRequestId);
    const brandName = getSetting("BRAND_NAME", "SunTriX AI Solutions");

    return draftProposalWithAI({
      projectTitle: task.projectTitle || "",
      description: task.description || "",
      service: task.service || "",
      budget: task.budget || "",
      techStack: task.techStack || "",
      timeline: task.timeline || "",
      selectedPlan: task.selectedPlan || "",
      brandName,
    });
  }

  async createProposal(dto: CreateProposalDTO): Promise<IProposal> {
    const proposalToken = `prop_${crypto.randomBytes(16).toString("hex")}`;
    const expiresInDays = dto.expiresInDays || 14;
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000);

    const proposal = await this.proposalRepo.create({
      ...dto,
      milestones: (dto.milestones || []).map((m, order) => ({ ...m, order })),
      proposalToken,
      expiresAt,
      status: "draft",
    });

    await TaskRequest.findByIdAndUpdate(dto.taskRequestId, { proposalId: proposal._id });
    // Drafting a proposal means the request is being reviewed
    const task = await this.taskService.getTaskById(dto.taskRequestId);
    if (task.status === "new") await this.taskService.transitionStatus(dto.taskRequestId, "in_review", "admin", "Proposal drafted");
    return proposal;
  }

  async listForTask(taskRequestId: string): Promise<IProposal[]> {
    return this.proposalRepo.findByTask(taskRequestId);
  }

  async getByToken(token: string): Promise<IProposal> {
    const proposal = await this.proposalRepo.findByToken(token);
    if (!proposal) throw new AppError("Proposal not found", ERROR_CODES.NOT_FOUND);
    return proposal;
  }

  async getById(id: string): Promise<IProposal> {
    const proposal = await this.proposalRepo.findById(id);
    if (!proposal) throw new AppError("Proposal not found", ERROR_CODES.NOT_FOUND);
    return proposal;
  }

  async sendProposal(id: string): Promise<IProposal> {
    const proposal = await this.getById(id);
    const updated = await this.proposalRepo.updateStatus(id, "sent");
    if (!updated) throw new AppError("Failed to update proposal status", ERROR_CODES.INTERNAL_SERVER_ERROR);

    await this.taskService.transitionStatus(proposal.taskRequestId.toString(), "proposal_sent", "admin");

    const appUrl = getSetting("FRONTEND_URL", "http://localhost:5173");
    const proposalUrl = `${appUrl}/proposal/${proposal.proposalToken}`;
    await sendProposalEmail({
      clientName: proposal.clientName || "Valued Client",
      clientEmail: proposal.clientEmail,
      proposalTitle: proposal.title,
      introduction: proposal.executiveSummary || "",
      totalAmount: `$${(proposal.totalAmount / 100).toFixed(2)}`,
      milestones: (proposal.milestones || []).map((m: any) => ({ title: m.title, amount: `$${(m.amount / 100).toFixed(2)}` })),
      proposalUrl,
      expiresAt: proposal.expiresAt ? proposal.expiresAt.toISOString() : "",
    });

    return updated;
  }

  async acceptProposal(token: string): Promise<{ proposal: IProposal; contractToken: string }> {
    const claimed = await this.proposalRepo.atomicClaimForAcceptance(token);
    if (!claimed) {
      const existing = await this.proposalRepo.findByToken(token);
      if (existing && (existing.status === "accepted" || existing.status === "processing")) {
        let contractToken = (existing as any).contractToken;
        if (!contractToken) {
          const linkedContract = await this.contractRepo.findByToken(`contract_${existing.proposalToken}`);
          if (linkedContract) contractToken = linkedContract.contractToken;
        }
        return { proposal: existing, contractToken: contractToken || "" };
      }
      throw new AppError("Proposal is not available for acceptance.", ERROR_CODES.CONFLICT);
    }

    try {
      const contractToken = `contract_${crypto.randomBytes(16).toString("hex")}`;
      const brandName = getSetting("BRAND_NAME", "SunTriX AI Solutions");
      const appUrl = getSetting("FRONTEND_URL", "http://localhost:5173");

      const taskReq = claimed.taskRequestId as any;
      const fullContractText = await generateContractWithAI({
        brandName,
        clientName: claimed.clientName || taskReq?.name || "Client",
        clientEmail: claimed.clientEmail,
        projectTitle: claimed.title,
        scopeItems: claimed.scopeItems || [],
        timeline: claimed.timeline || "As specified in project roadmap",
        milestones: (claimed.milestones || []).map((m: any) => ({ title: m.title, amount: `$${(m.amount / 100).toFixed(2)}`, dueWeek: m.dueWeek || 1 })),
        totalAmount: `$${(claimed.totalAmount / 100).toFixed(2)}`,
        terms: claimed.paymentTerms || "50% upfront deposit upon signing",
        techStack: taskReq?.techStack || "",
      });

      await this.contractRepo.create({
        contractToken,
        proposalId: claimed._id,
        taskRequestId: claimed.taskRequestId._id || claimed.taskRequestId,
        clientName: claimed.clientName || taskReq?.name || "Client",
        clientEmail: claimed.clientEmail,
        projectTitle: claimed.title,
        fullContractText,
        totalAmount: claimed.totalAmount,
        currency: claimed.currency || "USD",
        status: "pending",
        expiresAt: new Date(Date.now() + 14 * 86400000),
      });

      const updated = await this.proposalRepo.updateStatus(claimed._id.toString(), "accepted", {
        acceptedAt: new Date(),
        contractToken,
      });

      await this.taskService.transitionStatus((claimed.taskRequestId._id || claimed.taskRequestId).toString(), "contract_sent", "system");

      const contractUrl = `${appUrl}/contract/${contractToken}`;
      await sendContractEmail({
        clientName: claimed.clientName || "Valued Client",
        clientEmail: claimed.clientEmail,
        projectTitle: claimed.title,
        totalAmount: `$${(claimed.totalAmount / 100).toFixed(2)}`,
        contractUrl,
        expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      });

      return { proposal: updated!, contractToken };
    } catch (err) {
      await this.proposalRepo.updateStatus(claimed._id.toString(), "sent");
      throw err;
    }
  }

  async requestChanges(token: string, notes: string): Promise<IProposal> {
    const proposal = await this.getByToken(token);
    const updated = await this.proposalRepo.updateStatus(proposal._id.toString(), "changes_requested", {
      $push: { clientNotes: { note: notes, date: new Date() } },
    });

    const appUrl = getSetting("FRONTEND_URL", "http://localhost:5173");
    await sendChangesRequestedNotification({
      projectTitle: proposal.title,
      clientName: proposal.clientName || "Client",
      clientEmail: proposal.clientEmail,
      clientNote: notes,
      adminUrl: `${appUrl}/admin/tasks`,
    });

    return updated!;
  }
}

export const proposalService = new ProposalService();
