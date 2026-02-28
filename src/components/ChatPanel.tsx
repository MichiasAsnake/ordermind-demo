"use client";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";

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
                                className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-mono text-[12px] font-semibold hover:bg-blue-50 transition-colors no-underline"
                            >
                                {label} <span className="text-blue-400 text-[10px]">↗</span>
                            </a>
                        );
                    }
                    return <a key={i} href={href} className="underline text-blue-600 hover:text-blue-800 transition-colors">{label}</a>;
                }
                return <span key={i}>{part}</span>;
            })}
        </>
    );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export interface ChatPanelProps {
    /** Suggested prompts shown before any conversation starts */
    suggestions?: string[];
    /** Label shown on the floating button */
    buttonLabel?: string;
    /** Controlled open state (optional — uncontrolled if omitted) */
    open?: boolean;
    onOpenChange?: Dispatch<SetStateAction<boolean>>;
    /** Pre-fill the input and auto-send when set */
    prefillMessage?: string;
    onPrefillConsumed?: () => void;
}

const DEFAULT_SUGGESTIONS = [
    "What needs attention first?",
    "Which VIP orders are at risk?",
    "What's the biggest bottleneck today?",
    "Show me all rush orders without proof",
];

export function ChatPanel({
    suggestions = DEFAULT_SUGGESTIONS,
    buttonLabel = "Ask AI",
    open: openProp,
    onOpenChange,
    prefillMessage,
    onPrefillConsumed,
}: ChatPanelProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [openInternal, setOpenInternal] = useState(false);
    const open = openProp !== undefined ? openProp : openInternal;
    const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof v === "function" ? v(open) : v;
        if (onOpenChange) onOpenChange(next as SetStateAction<boolean>);
        else setOpenInternal(next);
    };
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sending]);

    // Handle prefill: open panel and auto-send the prefill message
    useEffect(() => {
        if (!prefillMessage) return;
        setOpen(true);
        const t = setTimeout(() => {
            sendText(prefillMessage);
            onPrefillConsumed?.();
        }, 120);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillMessage]);

    async function sendText(text: string) {
        const content = text.trim();
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

    async function send(text?: string) {
        await sendText(text ?? input);
    }

    return (
        <>
            {/* Float button */}
            <button
                id="chat-toggle-btn"
                onClick={() => setOpen((o) => !o)}
                className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-[13px] font-semibold shadow-lg transition-all hover:scale-105 active:scale-95"
                aria-label="Toggle chat"
            >
                <span className="text-[15px]">{open ? "✕" : "✦"}</span>
                {!open && (
                    <span className="flex items-center gap-1.5">
                        {buttonLabel}
                        <span className="text-[10px] text-neutral-400 font-normal border border-gray-700 rounded px-1 py-0.5 leading-none">ad-hoc</span>
                    </span>
                )}
            </button>

            {/* Slide-in panel */}
            <div
                className={`fixed bottom-20 right-6 z-40 w-[380px] max-h-[560px] flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl transition-all duration-300 ${open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"}`}
            >
                {/* Panel header */}
                <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                    <div>
                        <p className="text-[14px] font-bold text-zinc-900 leading-none">Ask about your shop</p>
                        <p className="text-[11px] text-neutral-400 mt-0.5">Ad-hoc AI chat · based on today&apos;s orders</p>
                    </div>
                    <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-600 text-[20px] leading-none transition-colors">✕</button>
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
                    {messages.length === 0 && (
                        <div className="space-y-2">
                            <p className="text-[12px] text-neutral-400 text-center py-1">Try asking:</p>
                            {suggestions.map((q) => (
                                <button
                                    key={q}
                                    onClick={() => send(q)}
                                    className="w-full text-left text-[13px] text-zinc-700 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl px-4 py-2.5 transition-colors"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}

                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === "user"
                                ? "bg-zinc-900 text-white rounded-br-md"
                                : "bg-neutral-50 text-zinc-800 rounded-bl-md border border-neutral-200"
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
                            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl rounded-bl-md px-4 py-3">
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
                <div className="px-4 py-3 border-t border-neutral-100">
                    <div className="flex items-center gap-2 bg-neutral-50 rounded-xl border border-neutral-200 px-3 py-2 focus-within:border-neutral-400 transition-colors">
                        <input
                            id="chat-input"
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && send()}
                            placeholder="Ask a question…"
                            className="flex-1 bg-transparent text-[13px] text-zinc-800 placeholder-gray-400 outline-none"
                        />
                        <button
                            onClick={() => send()}
                            disabled={!input.trim() || sending}
                            className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all text-white text-[12px]"
                        >
                            ↑
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
