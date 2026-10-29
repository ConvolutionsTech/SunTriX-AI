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

  /** Marks the request's other open proposals as superseded so only the latest can be accepted. */
  async supersedeOthers(taskRequestId: string, keepId: string): Promise<void> {
    await Proposal.updateMany(
      { taskRequestId, _id: { $ne: keepId }, status: { $in: ["draft", "sent", "changes_requested", "expired"] } },
      { $set: { status: "rejected" } }
    );
  }

  async findByTask(taskRequestId: string): Promise<IProposal[]> {
    return Proposal.find({ taskRequestId }).sort({ createdAt: -1 });
  }

  /** Moves an open, unexpired proposal to "processing"; returns it as it was before (null if not claimable). */
  async atomicClaimForAcceptance(token: string): Promise<IProposal | null> {
    return Proposal.findOneAndUpdate(
      { proposalToken: token, status: { $in: ["sent", "changes_requested"] }, expiresAt: { $gt: new Date() } },
      { $set: { status: "processing" } },
      { new: false }
    ).populate("taskRequestId", "projectTitle service name email selectedPlan techStack contractToken status");
  }

  /** Atomic status change that only applies when the proposal is in one of `from`. */
  async transition(filter: Record<string, unknown>, from: ProposalStatus[], set: Record<string, unknown>): Promise<IProposal | null> {
    return Proposal.findOneAndUpdate({ ...filter, status: { $in: from } }, { $set: set }, { new: true });
  }

  async updateStatus(id: string, status: ProposalStatus, extra: Record<string, any> = {}): Promise<IProposal | null> {
    return Proposal.findByIdAndUpdate(id, { $set: { status, ...extra } }, { new: true });
  }
}

export const proposalRepository = new ProposalRepository();
