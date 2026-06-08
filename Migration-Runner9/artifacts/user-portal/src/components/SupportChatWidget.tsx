import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Bot, Send, Loader2, X, Sparkles, MessageSquare, ExternalLink } from "lucide-react";
import { post, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK = [
  "Deposit pending",
  "How to do KYC?",
  "Withdraw issue",
  "Add bank",
  "Trading fees?",
];

/**
 * Floating support chat bubble visible across the user portal once logged in.
 * Stateless against the backend — just calls /support/ai-chat with rolling
 * history. For persistent tickets, the user can jump to /support → Tickets.
 */
export default function SupportChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize greeting once user is known
  useEffect(() => {
    if (!user || messages.length > 0) return;
    setMessages([{
      role: "assistant",
      content: `Hi ${user.fullName?.split(" ")[0] || "there"}! I'm Zara. Ask me anything — KYC, deposits, withdrawals, bank, trading, referrals…`,
    }]);
  }, [user, messages.length]);

  useEffect(() => {
    if (open) {
      setHasUnread(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }, [open, messages, sending]);

  if (!user) return null;

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: msg }];
    setMessages(next);
    try {
      const history = next.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const r = await post<{ reply: string }>("/support/ai-chat", { message: msg, history });
      setMessages((curr) => [...curr, { role: "assistant", content: r.reply }]);
      if (!open) setHasUnread(true);
    } catch (e: any) {
      const errMsg = e instanceof ApiError ? (e.data?.reply || e.message) : "Network error. Please try again.";
      setMessages((curr) => [...curr, { role: "assistant", content: errMsg }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 text-black shadow-2xl shadow-amber-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          data-testid="floating-chat-button"
          aria-label="Open support chat"
        >
          <Bot className="h-6 w-6" />
          {hasUnread && (
            <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-rose-500 border-2 border-zinc-950 animate-pulse" />
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-2.5rem)] rounded-2xl border border-amber-500/30 bg-zinc-950 shadow-2xl shadow-amber-500/10 flex flex-col overflow-hidden"
          data-testid="floating-chat-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-gradient-to-r from-amber-500/10 to-transparent">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-black">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-zinc-950" />
              </div>
              <div>
                <div className="font-semibold text-sm">Zara · AI Support</div>
                <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-8 w-8 rounded-md hover:bg-zinc-800 flex items-center justify-center text-muted-foreground"
              data-testid="floating-chat-close"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} />
            ))}
            {sending && <Bubble role="assistant" content="" typing />}
          </div>

          {/* Suggestions row (only if conversation is fresh) */}
          {messages.length <= 1 && (
            <div className="px-3 py-2 border-t border-zinc-800/60">
              <div className="flex flex-wrap gap-1.5">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    disabled={sending}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-zinc-800 hover:border-amber-500/40 hover:bg-amber-500/5 text-zinc-300 transition-colors"
                    data-testid={`floating-suggest-${q.slice(0, 10)}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-end gap-2 px-3 py-2.5 border-t border-zinc-800 bg-zinc-950/50"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              placeholder="Type a message…"
              rows={1}
              className="min-h-[36px] max-h-24 resize-none bg-zinc-900 border-zinc-800 text-sm"
              disabled={sending}
              data-testid="floating-chat-input"
            />
            <Button
              type="submit"
              disabled={sending || !input.trim()}
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 h-9 px-3"
              data-testid="floating-chat-send"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>

          {/* Footer link */}
          <Link href="/support" className="px-3 py-2 border-t border-zinc-800 text-[11px] text-muted-foreground hover:text-amber-400 flex items-center justify-between transition-colors" onClick={() => setOpen(false)} data-testid="floating-chat-fullpage">
            <span className="flex items-center gap-1.5"><MessageSquare className="h-3 w-3" /> Open full Support page or create a ticket</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
    </>
  );
}

function Bubble({ role, content, typing }: { role: "user" | "assistant"; content: string; typing?: boolean }) {
  const isAi = role === "assistant";
  return (
    <div className={`flex ${isAi ? "justify-start" : "justify-end"}`} data-testid={`floating-bubble-${role}`}>
      {isAi && (
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-black flex-shrink-0 mr-1.5">
          <Bot className="h-3 w-3" />
        </div>
      )}
      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${isAi ? "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-sm" : "bg-gradient-to-br from-amber-500 to-orange-500 text-black font-medium rounded-tr-sm"}`}>
        {typing ? (
          <span className="inline-flex gap-1 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        ) : content}
      </div>
    </div>
  );
}
