import crypto from "crypto";
import { proposalRepository, ProposalRepository } from "./proposal.repository";
import { contractRepository, ContractRepository } from "../contracts/contract.repository";
import { taskRequestService, TaskRequestService } from "../task-requests/task-request.service";
import { AppError, ERROR_CODES } from "../../shared/errors/appError";
import { CreateProposalDTO, IProposal } from "./proposal.types";
import { ProposalStatus } from "../../models/Proposal";
import { getSetting } from "../../lib/configLoader";
import TaskRequest from "../../models/TaskRequest";
import { draftProposalWithAI, generateContractWithAI } from "../../services/groq";
import { sendProposalEmail, sendChangesRequestedNotification, sendContractEmail } from "../../services/email";
import { logger } from "../../lib/logger";

const SENDABLE: ProposalStatus[] = ["draft", "changes_requested", "expired"];
const PROPOSAL_TTL_DAYS = 14;
const CONTRACT_TTL_DAYS = 14;

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
    const { expiresInDays = 14, ...fields } = dto;
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000);

    const proposal = await this.proposalRepo.create({
      ...fields,
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

  /**
   * Sends (or re-sends) a proposal. The task moves first, so a task that can't
   * receive a proposal (e.g. cancelled, already contracted) leaves the proposal
   * untouched; the proposal itself only flips from draft/changes_requested/expired.
   */
  async sendProposal(id: string): Promise<IProposal> {
    const proposal = await this.getById(id);
    if (!SENDABLE.includes(proposal.status)) {
      throw new AppError(`A ${proposal.status} proposal can't be sent.`, ERROR_CODES.CONFLICT);
    }

    const taskId = proposal.taskRequestId.toString();
    const task = await this.taskService.getTaskById(taskId);
    if (task.status === "new") await this.taskService.transitionStatus(taskId, "in_review", "admin", "Proposal prepared");
    await this.taskService.transitionStatus(taskId, "proposal_sent", "admin");

    const expiresAt = new Date(Date.now() + PROPOSAL_TTL_DAYS * 86400000);
    const updated = await this.proposalRepo.transition({ _id: id }, SENDABLE, { status: "sent", expiresAt });
    if (!updated) {
      await this.taskService.transitionStatus(taskId, "in_review", "admin", "Proposal send aborted").catch(() => {});
      throw new AppError("The proposal was changed by someone else — reload and try again.", ERROR_CODES.CONFLICT);
    }
    // A revised proposal replaces earlier ones — they can no longer be accepted
    await this.proposalRepo.supersedeOthers(taskId, id);

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
      expiresAt: expiresAt.toISOString(),
    });

    return updated;
  }

  /**
   * Client accepts: claims the proposal atomically, generates exactly one
   * contract, moves the task to contract_sent. Any failure removes the contract
   * created here and restores the proposal's previous status.
   */
  async acceptProposal(token: string): Promise<{ proposal: IProposal; contractToken: string }> {
    const current = await this.proposalRepo.findByToken(token);
    if (!current) throw new AppError("Proposal not found", ERROR_CODES.NOT_FOUND);
    if (current.status === "accepted" && current.contractToken) {
      return { proposal: current, contractToken: current.contractToken }; // repeat click / refresh
    }
    if (current.status === "processing") {
      throw new AppError("This proposal is being accepted — please wait a moment and refresh.", ERROR_CODES.CONFLICT);
    }
    if (current.expiresAt && current.expiresAt <= new Date()) {
      throw new AppError("This proposal has expired. Please ask us for an updated proposal.", 410);
    }
    const taskStatus = (current.taskRequestId as any)?.status;
    if (taskStatus !== "proposal_sent") {
      throw Object.assign(new AppError("This proposal is no longer open for acceptance.", ERROR_CODES.CONFLICT), { code: "TASK_NOT_ACCEPTING" });
    }

    const previous = await this.proposalRepo.atomicClaimForAcceptance(token);
    if (!previous) throw new AppError("Proposal is not available for acceptance.", ERROR_CODES.CONFLICT);

    let contractId: unknown = null;
    try {
      const contractToken = `contract_${crypto.randomBytes(16).toString("hex")}`;
      const brandName = getSetting("BRAND_NAME", "SunTriX AI Solutions");
      const appUrl = getSetting("FRONTEND_URL", "http://localhost:5173");
      const taskReq = previous.taskRequestId as any;
      const taskId = (taskReq?._id || previous.taskRequestId).toString();

      const fullContractText = await generateContractWithAI({
        brandName,
        clientName: previous.clientName || taskReq?.name || "Client",
        clientEmail: previous.clientEmail,
        projectTitle: previous.title,
        scopeItems: previous.scopeItems || [],
        timeline: previous.timeline || "As specified in project roadmap",
        milestones: (previous.milestones || []).map((m: any) => ({ title: m.title, amount: `$${(m.amount / 100).toFixed(2)}`, dueWeek: m.dueWeek || 1 })),
        totalAmount: `$${(previous.totalAmount / 100).toFixed(2)}`,
        terms: previous.paymentTerms || "50% upfront deposit upon signing",
        techStack: taskReq?.techStack || "",
      });

      const contractExpiresAt = new Date(Date.now() + CONTRACT_TTL_DAYS * 86400000);
      const contract = await this.contractRepo.create({
        contractToken,
        proposalId: previous._id,
        taskRequestId: taskId,
        clientName: previous.clientName || taskReq?.name || "Client",
        clientEmail: previous.clientEmail,
        projectTitle: previous.title,
        fullContractText,
        totalAmount: previous.totalAmount,
        currency: previous.currency || "usd",
        status: "pending",
        expiresAt: contractExpiresAt,
      });
      contractId = contract._id;

      await this.taskService.transitionStatus(taskId, "contract_sent", "system");
      const updated = await this.proposalRepo.updateStatus(previous._id.toString(), "accepted", { acceptedAt: new Date(), contractToken });

      await sendContractEmail({
        clientName: previous.clientName || "Valued Client",
        clientEmail: previous.clientEmail,
        projectTitle: previous.title,
        totalAmount: `$${(previous.totalAmount / 100).toFixed(2)}`,
        contractUrl: `${appUrl}/contract/${contractToken}`,
        expiresAt: contractExpiresAt.toISOString(),
      });

      return { proposal: updated!, contractToken };
    } catch (err) {
      if (contractId) await this.contractRepo.deleteById(contractId).catch(() => {});
      await this.proposalRepo.updateStatus(previous._id.toString(), previous.status);
      throw err;
    }
  }

  /** Client asks for changes to a sent proposal; the request goes back to review. */
  async requestChanges(token: string, clientNote: string): Promise<IProposal> {
    const updated = await this.proposalRepo.transition(
      { proposalToken: token, expiresAt: { $gt: new Date() } },
      ["sent"],
      { status: "changes_requested", clientNote }
    );
    if (!updated) throw new AppError("This proposal can't be changed any more.", ERROR_CODES.CONFLICT);

    await this.taskService
      .transitionStatus(updated.taskRequestId.toString(), "in_review", "client", "Client requested changes to the proposal")
      .catch((err) => logger.error({ err }, "Could not move request back to review"));

    const appUrl = getSetting("FRONTEND_URL", "http://localhost:5173");
    await sendChangesRequestedNotification({
      projectTitle: updated.title,
      clientName: updated.clientName || "Client",
      clientEmail: updated.clientEmail,
      clientNote,
      adminUrl: `${appUrl}/admin/tasks`,
    });

    return updated;
  }
}

export const proposalService = new ProposalService();
