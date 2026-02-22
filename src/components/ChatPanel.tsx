"use client";

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

// ─── Message Renderer (parses markdown links into clickable chips) ─────────────

function MessageRenderer({ content }: { content: string }) {
    const parts = content.split(/(\[[^\]]+\]\([^)]+\))/g);
    return (
        <>
            {parts.map((part, i) => {
                const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                if (match) {
                    const [, label, href] = match;
                    const isOrderLink = href.startsWith("/orders/");
                    if (isOrderLink) {
                        return (
                            <a
                                key={i}
                                href={href}
                                className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[12px] font-semibold hover:bg-indigo-100 transition-colors no-underline"
                            >
                                {label} <span className="text-indigo-400 text-[10px]">↗</span>
                            </a>
                        );
                    }
                    return <a key={i} href={href} className="underline text-indigo-600 hover:text-indigo-800 transition-colors">{label}</a>;
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

interface ChatPanelProps {
    /** Suggested prompts shown before any conversation starts */
    suggestions?: string[];
    /** Label shown on the floating button */
    buttonLabel?: string;
}

const DEFAULT_SUGGESTIONS = [
    "What needs attention first?",
    "Which VIP orders are at risk?",
    "What's the biggest bottleneck today?",
    "Show me all rush orders without proof",
];

export function ChatPanel({
    suggestions = DEFAULT_SUGGESTIONS,
    buttonLabel = "Ask about your shop",
}: ChatPanelProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [open, setOpen] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sending]);

    async function send(text?: string) {
        const content = (text ?? input).trim();
        if (!content || sending) return;
        setInput("");
        setSending(true);
        const updated: ChatMessage[] = [...messages, { role: "user", content }];
        setMessages(updated);
        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: updated }),
            });
            const data = await res.json();
            setMessages([...updated, { role: "assistant", content: data.reply ?? data.error ?? "No response." }]);
        } catch {
            setMessages([...updated, { role: "assistant", content: "Error reaching server." }]);
        }
        setSending(false);
    }

    return (
        <>
            {/* Float button */}
            <button
                id="chat-toggle-btn"
                onClick={() => setOpen(o => !o)}
                className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gray-900 hover:bg-gray-800 text-white text-[13px] font-semibold shadow-lg transition-all hover:scale-105 active:scale-95"
                aria-label="Toggle chat"
            >
                <span className="text-[15px]">{open ? "✕" : "✦"}</span>
                {!open && <span>{buttonLabel}</span>}
            </button>

            {/* Slide-in panel */}
            <div
                className={`fixed bottom-20 right-6 z-40 w-[380px] max-h-[560px] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-300 ${open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"}`}
            >
                {/* Panel header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                    <div>
                        <p className="text-[14px] font-bold text-gray-900 leading-none">Ask about your shop</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Based on today's orders</p>
                    </div>
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
                    {messages.length === 0 && (
                        <div className="space-y-2">
                            <p className="text-[12px] text-gray-400 text-center py-1">Try asking:</p>
                            {suggestions.map(q => (
                                <button
                                    key={q}
                                    onClick={() => send(q)}
                                    className="w-full text-left text-[13px] text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 transition-colors"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}

                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === "user"
                                ? "bg-gray-900 text-white rounded-br-md"
                                : "bg-gray-50 text-gray-800 rounded-bl-md border border-gray-200"
                                }`}>
                                {m.role === "assistant"
                                    ? <MessageRenderer content={m.content} />
                                    : m.content
                                }
                            </div>
                        </div>
                    ))}

                    {sending && (
                        <div className="flex justify-start">
                            <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
                                <div className="flex gap-1 items-center">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="px-4 py-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2 focus-within:border-gray-400 transition-colors">
                        <input
                            id="chat-input"
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && send()}
                            placeholder="Ask a question…"
                            className="flex-1 bg-transparent text-[13px] text-gray-800 placeholder-gray-400 outline-none"
                        />
                        <button
                            onClick={() => send()}
                            disabled={!input.trim() || sending}
                            className="w-7 h-7 rounded-lg bg-gray-900 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all text-white text-[12px]"
                        >
                            ↑
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
