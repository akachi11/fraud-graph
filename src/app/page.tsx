"use client";

import { useState, useEffect, useCallback } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { GraphCanvas } from "@/components/graph-canvas";
import {
  Network,
  Database,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Shield,
} from "lucide-react";

interface GraphNode {
  id: string;
  type: string;
  label: string;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export default function Home() {
  const [graphData, setGraphData] = useState<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  }>({ nodes: [], edges: [] });
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const [focusNames, setFocusNames] = useState<string[]>([]);

  const fetchGraph = useCallback(async (focus?: string[]) => {
    try {
      const params = focus?.length
        ? `?focus=${encodeURIComponent(focus.join(","))}`
        : "";
      const res = await fetch(`/api/graph${params}`);
      if (res.ok) {
        const data = await res.json();
        setGraphData(data);
        setDbConnected(true);

        if (focus?.length) {
          const matchedIds = data.nodes
            .filter((n: GraphNode) =>
              focus.some((name: string) =>
                n.label.toLowerCase().includes(name.toLowerCase())
              )
            )
            .map((n: GraphNode) => n.id);
          setHighlightedNodes(matchedIds);
        }
      } else {
        setDbConnected(false);
      }
    } catch {
      setDbConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
      });
      if (res.ok) {
        await fetchGraph();
      }
    } finally {
      setSeeding(false);
    }
  };

  const handleToolCall = (toolName: string, args: Record<string, string>) => {
    const extracted: string[] = [];
    if (args.accountName) extracted.push(args.accountName);
    if (args.name) extracted.push(args.name);

    if (extracted.length > 0) {
      setFocusNames((prev) => {
        const next = [...new Set([...prev, ...extracted])];
        fetchGraph(next);
        return next;
      });
    } else if (toolName === "query_graph" || toolName === "get_graph_schema" || toolName === "detect_patterns") {
      setFocusNames((prev) => {
        if (prev.length > 0) fetchGraph(prev);
        return prev;
      });
    }
  };

  const handleSendMessage = () => {
    setFocusNames([]);
    setHighlightedNodes([]);
    fetchGraph();
  };

  return (
    <div className="flex h-screen flex-col bg-[#0a0f1a] text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">FraudGraph</h1>
            <p className="text-[11px] text-slate-500">
              AI Fraud Investigation Agent &middot; Powered by FalkorDB
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Database className="h-3.5 w-3.5" />
            <span
              className={
                dbConnected === true
                  ? "text-green-400"
                  : dbConnected === false
                    ? "text-red-400"
                    : "text-slate-500"
              }
            >
              {dbConnected === true
                ? "FalkorDB Connected"
                : dbConnected === false
                  ? "Not Connected"
                  : "Checking..."}
            </span>
          </div>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-red-800 hover:text-slate-100 disabled:opacity-50"
          >
            {seeding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {seeding ? "Seeding..." : "Seed Data"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[420px] shrink-0 border-r border-slate-800">
          <ChatPanel
            onToolCall={handleToolCall}
            onSendMessage={handleSendMessage}
          />
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">
                {focusNames.length > 0
                  ? `Investigation: ${focusNames.join(" & ")}`
                  : "Fraud Network Graph"}
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                {graphData.nodes.length} nodes &middot;{" "}
                {graphData.edges.length} edges
              </span>
            </div>
            {highlightedNodes.length > 0 && (
              <button
                onClick={() => {
                  setFocusNames([]);
                  setHighlightedNodes([]);
                  fetchGraph();
                }}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex-1 p-4">
            {dbConnected === false ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
                  <h3 className="text-sm font-medium text-slate-300">
                    FalkorDB not connected
                  </h3>
                  <p className="mt-1 max-w-xs text-xs text-slate-500">
                    Start FalkorDB with Docker, then refresh:
                  </p>
                  <code className="mt-2 block rounded bg-slate-900 px-3 py-2 text-xs text-slate-400">
                    docker run -p 6379:6379 -it --rm falkordb/falkordb:latest
                  </code>
                </div>
              </div>
            ) : graphData.nodes.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Database className="mx-auto mb-3 h-8 w-8 text-slate-600" />
                  <h3 className="text-sm font-medium text-slate-300">
                    No data yet
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Click &ldquo;Seed Data&rdquo; to populate the fraud graph
                  </p>
                </div>
              </div>
            ) : (
              <GraphCanvas
                nodes={graphData.nodes}
                edges={graphData.edges}
                highlightedNodes={highlightedNodes}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
