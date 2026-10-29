import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { extractFields } from "../services/groq";

const router = Router();

// Bounds prompt size (and Groq cost) — the body limit alone is 10 MB
const MAX_EXTRACT_CHARS = 20_000;

// POST /v1/ai/extract — admin-only
router.post(
  "/extract",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const module = req.body.module;
      const text = (req.body.text || req.body.prompt || "").toString().trim();

      if (!module || !text) {
        res.status(400).json({ error: "module and text (or prompt) are required" });
        return;
      }
      if (text.length > MAX_EXTRACT_CHARS) {
        res.status(400).json({ error: `Text is too long (max ${MAX_EXTRACT_CHARS.toLocaleString()} characters)` });
        return;
      }

      const fields = await extractFields(module, text);
      res.json({
        fields,
        html: typeof fields === "string" ? fields : (fields as any)?.html || JSON.stringify(fields),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
