import Contract, { IContract } from "../../models/Contract";

export class ContractRepository {
  async create(data: any): Promise<IContract> {
    return Contract.create(data);
  }

  async deleteById(id: unknown): Promise<void> {
    await Contract.deleteOne({ _id: id });
  }

  async findByToken(token: string): Promise<IContract | null> {
    return Contract.findOne({ contractToken: token }).populate("taskRequestId proposalId");
  }

  async markSigned(id: string, signatureName: string, clientIp?: string, userAgent?: string): Promise<IContract | null> {
    return Contract.findOneAndUpdate(
      { _id: id, status: "pending" },
      {
        $set: {
          status: "signed",
          signedAt: new Date(),
          clientSignatureName: signatureName.trim(),
          clientIp: clientIp || "",
          userAgent: userAgent || "",
        },
      },
      { new: true }
    );
  }
}

export const contractRepository = new ContractRepository();
