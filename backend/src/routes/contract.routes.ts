import { Router, Request, Response, NextFunction } from "express";
import { contractService } from "../modules/contracts/contract.service";
import { validate, ContractSignSchema } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /contracts/admin/by-task/:taskId — contracts for a request, newest first (admin workspace)
router.get("/admin/by-task/:taskId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ contracts: await contractService.listForTask(req.params.taskId) });
  } catch (err) {
    next(err);
  }
});

// GET /contracts/:token — PUBLIC client views contract
router.get("/:token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await contractService.getByToken(req.params.token);
    res.json(contract);
  } catch (err) {
    next(err);
  }
});

// POST /contracts/:token/sign — PUBLIC client signs contract
router.post("/:token/sign", validate(ContractSignSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Resolved by Express according to TRUST_PROXY — never the raw, client-controlled header
    const clientIp = req.ip || req.socket.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";

    const result = await contractService.signContract({
      token: req.params.token,
      clientSignatureName: req.body.clientSignatureName,
      clientIp,
      userAgent,
    });

    res.json({
      message: "Contract signed successfully! Your project workspace has been set up.",
      contract: {
        status: result.contract.status,
        signedAt: result.contract.signedAt,
        clientSignatureName: result.contract.clientSignatureName,
      },
      trackerToken: result.trackerToken,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
