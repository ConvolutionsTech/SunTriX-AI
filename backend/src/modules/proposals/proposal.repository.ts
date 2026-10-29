import Proposal, { IProposal, ProposalStatus } from "../../models/Proposal";

export class ProposalRepository {
  async create(data: any): Promise<IProposal> {
    return Proposal.create(data);
  }

  async findByToken(token: string): Promise<IProposal | null> {
    return Proposal.findOne({ proposalToken: token }).populate("taskRequestId");
  }

  async findById(id: string): Promise<IProposal | null> {
    return Proposal.findById(id);
  }

  async findByTask(taskRequestId: string): Promise<IProposal[]> {
    return Proposal.find({ taskRequestId }).sort({ createdAt: -1 });
  }

  async atomicClaimForAcceptance(token: string): Promise<IProposal | null> {
    return Proposal.findOneAndUpdate(
      { proposalToken: token, status: { $in: ["sent", "changes_requested"] } },
      { $set: { status: "processing" } },
      { new: true }
    ).populate("taskRequestId", "projectTitle service name email selectedPlan techStack contractToken");
  }

  async updateStatus(id: string, status: ProposalStatus, extra: Record<string, any> = {}): Promise<IProposal | null> {
    return Proposal.findByIdAndUpdate(id, { $set: { status, ...extra } }, { new: true });
  }
}

export const proposalRepository = new ProposalRepository();
