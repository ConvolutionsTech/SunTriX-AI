import { Router, Request, Response, NextFunction } from "express";
import { sendChat } from "../services/groq";
import { getSetting } from "../lib/configLoader";
import { assertAiBudget, consumeChatQuota } from "../lib/aiBudget";

const router = Router();

const MAX_MESSAGE_LENGTH = 5000;
const MAX_MESSAGES = 50;

// POST /chat — public AI chat assistant
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Admin switches: Settings → Chatbot / AI
    if (getSetting("CHATBOT_ENABLED", "true") !== "true" || getSetting("AI_ENABLED", "true") === "false") {
      res.status(503).json({ error: "The chat assistant is turned off.", code: "CHAT_DISABLED" });
      return;
    }

    const { messages } = req.body as { messages: Array<{ role: "user" | "assistant"; content: string }> };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const recentMessages = messages.slice(-MAX_MESSAGES);
    const validRoles = ["user", "assistant"];
    const valid = recentMessages.every(
      (m) => m && typeof m.content === "string" && validRoles.includes(m.role) && m.content.length <= MAX_MESSAGE_LENGTH
    );

    if (!valid) {
      res.status(400).json({ error: `Invalid message format or message content exceeds ${MAX_MESSAGE_LENGTH} characters` });
      return;
    }

    // Cost controls: per-visitor daily cap, then the global daily token budget
    await consumeChatQuota(req.ip ?? "unknown");
    await assertAiBudget();

    // sendChat bounds the context, builds the brand-aware system prompt and
    // turns Groq failures (incl. timeouts) into a friendly fallback message
    const content = await sendChat(recentMessages);

    res.json({
      choices: [{ message: { role: "assistant", content } }],
      usage: {},
    });
  } catch (err) {
    next(err);
  }
});

export default router;
