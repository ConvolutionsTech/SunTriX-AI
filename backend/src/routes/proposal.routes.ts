import { Router, Request, Response, NextFunction } from "express";
import { proposalService } from "../modules/proposals/proposal.service";
import { requireAuth } from "../middleware/auth";
import { validate, ProposalRequestChangesSchema, ProposalGenerateSchema, ProposalCreateSchema } from "../middleware/validate";
import { logAudit } from "../lib/audit";

const router = Router();

// POST /proposals/admin/ai-draft — AI generates proposal draft
router.post("/admin/ai-draft", requireAuth, validate(ProposalGenerateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const draft = await proposalService.generateAiDraft(req.body.taskRequestId);
    res.json({ draft });
  } catch (err) {
    next(err);
  }
});

// GET /proposals/admin/by-task/:taskId — every proposal for a request, newest first
router.get("/admin/by-task/:taskId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ proposals: await proposalService.listForTask(req.params.taskId) });
  } catch (err) {
    next(err);
  }
});

// POST /proposals — create a proposal draft (amounts in integer cents)
router.post("/", requireAuth, validate(ProposalCreateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await proposalService.createProposal(req.body);
    await logAudit(req, "create", "proposal", proposal._id.toString(), proposal.title);
    res.status(201).json(proposal);
  } catch (err) {
    next(err);
  }
});

// POST /proposals/:id/send — send proposal to client via email
router.post("/:id/send", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await proposalService.sendProposal(req.params.id);
    await logAudit(req, "update", "proposal", proposal._id.toString(), proposal.title);
    res.json({ message: "Proposal sent to client via email", proposal });
  } catch (err) {
    next(err);
  }
});

// GET /proposals/view/:token — PUBLIC client views proposal
router.get("/view/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await proposalService.getByToken(req.params.token);
    res.json(proposal);
  } catch (err) {
    next(err);
  }
});

// POST /proposals/accept/:token — PUBLIC client accepts proposal
router.post("/accept/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await proposalService.acceptProposal(req.params.token);
    res.json({
      message: "Proposal accepted successfully. Legal contract generated.",
      contractToken: result.contractToken,
      proposal: result.proposal,
    });
  } catch (err) {
    next(err);
  }
});

// POST /proposals/request-changes/:token — PUBLIC client requests changes
router.post("/request-changes/:token", validate(ProposalRequestChangesSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposal = await proposalService.requestChanges(req.params.token, req.body.notes);
    res.json({ message: "Change request submitted. Our team will review and update the proposal.", proposal });
  } catch (err) {
    next(err);
  }
});

export default router;
