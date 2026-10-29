import { Router, Request, Response, NextFunction } from "express";
import { contractService } from "../modules/contracts/contract.service";
import { validate, ContractSignSchema } from "../middleware/validate";

const router = Router();

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
      contract: result.contract,
      trackerToken: result.trackerToken,
      checkoutUrl: result.checkoutUrl,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
