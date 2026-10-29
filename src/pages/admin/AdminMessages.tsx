import { useState, useEffect } from "react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { Trash2, Mail, MailOpen, Reply, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ContactMessage {
  _id: string;
  name: string;
  email: string;
  company: string;
  subject: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const AdminMessages = () => {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  
  // Reply State
  const [replying, setReplying] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const fetchMessages = async () => {
    const { data } = await apiRequest<ContactMessage[]>(ENDPOINTS.ADMIN_CONTACTS);
    if (data) setMessages(data);
  };

  useEffect(() => { fetchMessages(); }, []);

  const markRead = async (id: string) => {
    await apiRequest(`${ENDPOINTS.ADMIN_CONTACTS}/${id}/read`, { method: "PUT" });
    setMessages((prev) => prev.map((m) => m._id === id ? { ...m, read: true } : m));
  };

  const deleteMessage = async (id: string) => {
    await apiRequest(`${ENDPOINTS.ADMIN_CONTACTS}/${id}`, { method: "DELETE" });
    fetchMessages();
    if (selected?._id === id) {
      setSelected(null);
      setReplying(false);
    }
  };

  const handleSelect = (msg: ContactMessage) => {
    setSelected(msg);
    setReplying(false);
    setReplySubject(`Re: ${msg.subject}`);
    setReplyBody(`\n\n----------\nOn ${new Date(msg.createdAt).toLocaleString()}, ${msg.name} wrote:\n${msg.message}`);
    if (!msg.read) markRead(msg._id);
  };

  const handleSendReply = async () => {
    if (!selected) return;
    if (!replySubject || !replyBody) {
      return toast({ title: "Validation Error", description: "Subject and body are required.", variant: "destructive" });
    }
    
    setSending(true);
    const { error } = await apiRequest(ENDPOINTS.CONTACT_REPLY, {
      method: "POST",
      body: { messageId: selected._id, subject: replySubject, body: replyBody }
    });
    setSending(false);
    
    if (error) {
      toast({ title: "Failed to send reply", description: error, variant: "destructive" });
    } else {
      toast({ title: "Reply Sent", description: "Your email has been sent successfully." });
      setReplying(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-foreground">Messages</h1>
        <p className="text-sm text-muted-foreground">Contact form submissions</p>
      </div>

      <div className="flex gap-6 relative items-start">
        {/* List */}
        <div className="flex-1 rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {messages.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No messages yet</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg._id}
                onClick={() => handleSelect(msg)}
                className={`p-4 cursor-pointer hover:bg-muted/30 transition-colors ${selected?._id === msg._id ? "bg-muted/40 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className={`text-sm flex items-center gap-2 ${msg.read ? "text-muted-foreground" : "text-foreground font-semibold"}`}>
                    {msg.read ? <MailOpen className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5 text-primary" />}
                    {msg.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(msg.createdAt).toLocaleDateString()}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteMessage(msg._id); }} className="p-1 rounded hover:bg-destructive/10">
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </div>
                <p className={`text-xs ${msg.read ? "text-muted-foreground" : "text-foreground font-medium"}`}>{msg.subject}</p>
              </div>
            ))
          )}
        </div>

        {/* Detail */}
        {selected && (
          <div className="w-[500px] rounded-xl border border-border bg-card p-6 shrink-0 sticky top-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">{selected.subject}</h3>
                <p className="text-xs text-muted-foreground">From: <span className="font-medium text-foreground">{selected.name}</span> ({selected.email})</p>
                {selected.company && <p className="text-xs text-muted-foreground mt-0.5">Company: {selected.company}</p>}
              </div>
              {!replying && (
                <button onClick={() => setReplying(true)} className="p-2 border border-border rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 text-xs font-medium">
                  <Reply className="h-3.5 w-3.5" /> Reply
                </button>
              )}
            </div>
            
            <div className="border-t border-border pt-4 max-h-[300px] overflow-y-auto mb-4">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{selected.message}</p>
            </div>
            <p className="text-xs text-muted-foreground/50 mb-6">{new Date(selected.createdAt).toLocaleString()}</p>

            {replying && (
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Reply className="h-4 w-4" /> Compose Reply</p>
                  <button onClick={() => setReplying(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                </div>
                <input 
                  value={replySubject} 
                  onChange={e => setReplySubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <textarea 
                  value={replyBody} 
                  onChange={e => setReplyBody(e.target.value)}
                  rows={8}
                  placeholder="Type your response here... (HTML enabled)"
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <div className="flex justify-end pt-1">
                  <button 
                    onClick={handleSendReply}
                    disabled={sending}
                    className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {sending ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMessages;
