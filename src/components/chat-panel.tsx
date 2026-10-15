"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart } from "ai";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Send, Bot, User, Loader2, Shield } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatPanelProps {
  onToolCall?: (toolName: string, args: Record<string, string>) => void;
  onSendMessage?: () => void;
}

export function ChatPanel(props: ChatPanelProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
      </div>
    );
  }
  return <ChatPanelInner {...props} />;
}

function ChatPanelInner({ onToolCall, onSendMessage }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    []
  );
  const { messages, sendMessage, status } = useChat({ transport });
  const scrollRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(new Set<string>());
  const isLoading = status === "streaming" || status === "submitted";

  const stableOnToolCall = useCallback(
    (name: string, args: Record<string, string>) => onToolCall?.(name, args),
    [onToolCall]
  );

  useEffect(() => {
    for (const m of messages) {
      for (const part of m.parts) {
        if (isToolUIPart(part)) {
          const tp = part as {
            toolCallId: string;
            state: string;
            input?: unknown;
            type: string;
          };
          if (
            tp.state === "output-available" &&
            !processedRef.current.has(tp.toolCallId)
          ) {
            processedRef.current.add(tp.toolCallId);
            const name = tp.type.startsWith("tool-")
              ? tp.type.slice(5)
              : "tool";
            stableOnToolCall(
              name,
              (tp.input as Record<string, string>) ?? {}
            );
          }
        }
      }
    }
  }, [messages, stableOnToolCall]);

  const suggestions = [
    "Show me all open fraud cases",
    "Investigate accounts sharing devices",
    "Are there any money laundering patterns?",
    "Which accounts have the highest risk scores?",
  ];

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage?.();
    sendMessage({ text: input });
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    onSendMessage?.();
    sendMessage({ text });
  };

  const TOOL_LABELS: Record<string, string> = {
    investigate_account: "Investigating account",
    trace_money_flow: "Tracing money flow",
    detect_patterns: "Scanning for patterns",
    flag_account: "Flagging account",
    escalate_case: "Escalating case",
    query_graph: "Querying graph",
    get_graph_schema: "Reading schema",
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20">
            <Shield className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              FraudGraph Agent
            </h2>
            <p className="text-[11px] text-slate-500">
              AI fraud investigator powered by FalkorDB
            </p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4 pt-8">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800">
                <Shield className="h-6 w-6 text-red-400" />
              </div>
              <h3 className="text-sm font-medium text-slate-300">
                Fraud Investigation Console
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                I traverse the graph to detect fraud patterns and take action
              </p>
            </div>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-left text-xs text-slate-400 transition-colors hover:border-red-900/50 hover:text-slate-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className="flex gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                m.role === "user" ? "bg-blue-500/20" : "bg-red-500/20"
              }`}
            >
              {m.role === "user" ? (
                <User className="h-3.5 w-3.5 text-blue-400" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-red-400" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {m.parts.map((part, i) => {
                if (part.type === "text" && part.text) {
                  return (
                    <div key={i} className="chat-markdown text-sm text-slate-300">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {part.text}
                      </ReactMarkdown>
                    </div>
                  );
                }
                if (isToolUIPart(part)) {
                  const toolPart = part as {
                    toolCallId: string;
                    state: string;
                    type: string;
                  };
                  const toolName = toolPart.type.startsWith("tool-")
                    ? toolPart.type.slice(5)
                    : "tool";
                  const label = TOOL_LABELS[toolName] || toolName;
                  const isAction = toolName === "flag_account" || toolName === "escalate_case";
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                        isAction
                          ? "border-red-900/50 bg-red-950/30"
                          : "border-slate-800 bg-slate-900/50"
                      }`}
                    >
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${
                          toolPart.state === "output-available"
                            ? isAction ? "bg-red-400" : "bg-green-400"
                            : "bg-amber-400 animate-pulse"
                        }`}
                      />
                      <span className={`font-mono ${isAction ? "text-red-400" : "text-blue-400"}`}>
                        {label}
                      </span>
                      <span className="text-slate-600">
                        {toolPart.state === "output-available"
                          ? isAction ? "action taken" : "completed"
                          : "running..."}
                      </span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/20">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" />
            </div>
            <div className="text-sm text-slate-500">Investigating...</div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-800 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Investigate an account, trace money flows..."
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-red-800"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500 text-white transition-colors hover:bg-red-400 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
