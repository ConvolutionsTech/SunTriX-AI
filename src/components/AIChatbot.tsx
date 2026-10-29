import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Trash2, Bot, User } from "lucide-react";
import { apiRequest, ENDPOINTS, type GrokChatMessage } from "@/lib/api";
import { useCompanyInfo } from "@/hooks/useCompanyInfo";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const getChatHistory = (): ChatMessage[] => {
  try {
    return JSON.parse(localStorage.getItem("suntrix_chat") || "[]");
  } catch {
    return [];
  }
};

const saveChatMessage = (role: "user" | "assistant", content: string): ChatMessage => {
  const msg: ChatMessage = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    role,
    content,
    timestamp: new Date().toISOString(),
  };
  const current = getChatHistory();
  current.push(msg);
  try {
    localStorage.setItem("suntrix_chat", JSON.stringify(current));
  } catch (_) {}
  return msg;
};

const clearChatHistory = () => {
  try {
    localStorage.removeItem("suntrix_chat");
  } catch (_) {}
};

interface PublicSettings {
  CHATBOT_ENABLED: string;
  CHATBOT_NAME: string;
  CHATBOT_WELCOME_MESSAGE: string;
  CHATBOT_MAX_WORDS: string;
  BRAND_NAME: string;
  BRAND_EMAIL: string;
}

const DEFAULT_SETTINGS: PublicSettings = {
  CHATBOT_ENABLED: "true",
  CHATBOT_NAME: "SunTriX AI",
  CHATBOT_WELCOME_MESSAGE:
    "👋 Hi! I'm the SunTriX AI assistant. Ask me anything about our services, pricing, or how to get started.",
  CHATBOT_MAX_WORDS: "300",
  BRAND_NAME: "SunTriX AI Solutions",
  BRAND_EMAIL: "hello@suntrix.com",
};

const AIChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [config, setConfig] = useState<PublicSettings>(DEFAULT_SETTINGS);
  const companyInfo = useCompanyInfo();
  const [configLoaded, setConfigLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Fetch public settings on mount ─────────────────────────────
  useEffect(() => {
    apiRequest<PublicSettings>(ENDPOINTS.SETTINGS_PUBLIC)
      .then(({ data }) => {
        if (data) setConfig({ ...DEFAULT_SETTINGS, ...data });
      })
      .finally(() => {
        setConfigLoaded(true);
      });
  }, []);

  useEffect(() => {
    setMessages(getChatHistory());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = saveChatMessage("user", input.trim());
    setMessages((prev) => [...prev, userMsg]);
    const userInput = input.trim();
    setInput("");
    setIsTyping(true);

    const { data, error } = await apiRequest<{
      choices: { message: { content: string } }[];
    }>(ENDPOINTS.CHAT_SEND, {
      method: "POST",
      body: {
        messages: [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: userInput },
        ] satisfies GrokChatMessage[],
      },
    });

    let responseText: string;
    if (data && !error) {
      responseText =
        data.choices?.[0]?.message?.content ||
        "I couldn't process that. Please try again.";
    } else {
      // Graceful fallback when backend is unavailable
      await new Promise((r) => setTimeout(r, 600));
      responseText = `Thanks for your message! For immediate assistance, please email us at ${companyInfo.email || config.BRAND_EMAIL} or visit our contact page.`;
    }

    const aiMsg = saveChatMessage("assistant", responseText);
    setMessages((prev) => [...prev, aiMsg]);
    setIsTyping(false);
  };

  const clearChat = () => {
    clearChatHistory();
    setMessages([]);
  };

  // Don't render until config is loaded — prevents flash of disabled widget
  if (!configLoaded) return null;

  // Respect CHATBOT_ENABLED setting from admin
  if (config.CHATBOT_ENABLED === "false") return null;

  const dynamicBrandName = companyInfo.name || config.BRAND_NAME;
  const defaultBotName = dynamicBrandName.includes("SunTriX") ? "SunTriX AI" : `${dynamicBrandName} AI`;
  const chatbotName = config.CHATBOT_NAME || defaultBotName;
  const welcomeMsg = config.CHATBOT_WELCOME_MESSAGE || 
    `👋 Hi! I'm the ${dynamicBrandName} assistant. Ask me anything about our services, pricing, or how to get started.`;

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full gradient-bg flex items-center justify-center shadow-lg glow-orange ${
          isOpen ? "hidden" : ""
        }`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        animate={{
          boxShadow: [
            "0 0 20px hsl(24 100% 50% / 0.3)",
            "0 0 40px hsl(24 100% 50% / 0.5)",
            "0 0 20px hsl(24 100% 50% / 0.3)",
          ],
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <MessageCircle className="h-6 w-6 text-primary-foreground" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 w-[380px] max-h-[600px] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header — uses dynamic chatbot name */}
            <div className="gradient-bg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary-foreground" />
                <div>
                  <p className="text-sm font-bold text-primary-foreground">
                    {chatbotName}
                  </p>
                  <p className="text-xs text-primary-foreground/70">
                    Powered by Groq
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearChat}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4 text-primary-foreground/70" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4 text-primary-foreground" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[420px]">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <Bot className="h-12 w-12 text-primary/30 mx-auto mb-3" />
                  {/* Uses dynamic welcome message from admin settings */}
                  <p className="text-sm text-muted-foreground">{welcomeMsg}</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {[
                      "What services do you offer?",
                      "Tell me about pricing",
                      "How can I contact you?",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => setInput(q)}
                        className="text-xs rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${
                    msg.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === "user" ? "bg-primary/20" : "gradient-bg"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary/10 text-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-2">
                  <div className="h-7 w-7 rounded-full gradient-bg flex items-center justify-center shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                  <div className="bg-muted rounded-xl px-4 py-3">
                    <div className="flex gap-1">
                      <span
                        className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Ask ${chatbotName} anything...`}
                  className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="gradient-bg rounded-lg p-2 text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIChatbot;
