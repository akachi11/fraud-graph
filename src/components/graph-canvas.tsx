"use client";

import { useEffect, useRef, useCallback } from "react";

interface GraphNode {
  id: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlightedNodes?: string[];
}

const NODE_COLORS: Record<string, string> = {
  Account: "#60a5fa",
  Transaction: "#fbbf24",
  Merchant: "#a78bfa",
  Device: "#94a3b8",
  FraudCase: "#f87171",
  Alert: "#fb923c",
};

const NODE_SIZES: Record<string, number> = {
  Account: 14,
  FraudCase: 16,
  Transaction: 8,
  Merchant: 11,
  Device: 10,
  Alert: 12,
};

export function GraphCanvas({
  nodes,
  edges,
  highlightedNodes = [],
}: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<(GraphNode & { x: number; y: number; vx: number; vy: number })[]>([]);
  const animRef = useRef<number>(0);
  const alphaRef = useRef(1);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({
    nodeId: null, offsetX: 0, offsetY: 0,
  });
  const hoveredRef = useRef<string | null>(null);

  const initPositions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const byType: Record<string, GraphNode[]> = {};
    for (const n of nodes) {
      (byType[n.type] ??= []).push(n);
    }

    const types = Object.keys(byType);
    const positioned: typeof nodesRef.current = [];

    types.forEach((type, ti) => {
      const group = byType[type];
      const ringAngle = (ti / types.length) * Math.PI * 2;
      const ringRadius = type === "FraudCase" ? 0 : 80 + ti * 50;

      group.forEach((n, ni) => {
        const spread = group.length > 1 ? (ni / group.length) * Math.PI * 2 : 0;
        const nodeRadius = Math.min(group.length * 5, 180);
        positioned.push({
          ...n,
          x: cx + Math.cos(ringAngle) * ringRadius + Math.cos(spread) * nodeRadius,
          y: cy + Math.sin(ringAngle) * ringRadius + Math.sin(spread) * nodeRadius,
          vx: 0,
          vy: 0,
        });
      });
    });

    nodesRef.current = positioned;
  }, [nodes]);

  useEffect(() => {
    initPositions();
  }, [initPositions]);

  useEffect(() => {
    alphaRef.current = 1;
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let settled = false;

    const draw = () => {
      const simNodes = nodesRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const hasHL = highlightedNodes.length > 0;
      const hlSet = hasHL ? new Set(highlightedNodes) : null;
      const now = Date.now();

      for (const edge of edges) {
        const source = simNodes.find((n) => n.id === edge.source);
        const target = simNodes.find((n) => n.id === edge.target);
        if (!source || !target) continue;

        const srcHL = hlSet?.has(edge.source);
        const tgtHL = hlSet?.has(edge.target);

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        if (hasHL) {
          if (srcHL && tgtHL) {
            ctx.strokeStyle = "rgba(248, 113, 113, 0.6)";
            ctx.lineWidth = 2.5;
          } else if (srcHL || tgtHL) {
            ctx.strokeStyle = "rgba(248, 113, 113, 0.2)";
            ctx.lineWidth = 1.5;
          } else {
            ctx.strokeStyle = "rgba(148, 163, 184, 0.03)";
            ctx.lineWidth = 1;
          }
        } else {
          ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }

      for (const node of simNodes) {
        const isHighlighted = hlSet?.has(node.id) ?? false;
        const isHovered = hoveredRef.current === node.id;
        const color = NODE_COLORS[node.type] || "#94a3b8";
        const baseRadius = NODE_SIZES[node.type] || 10;

        if (hasHL && !isHighlighted && !isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, baseRadius, 0, Math.PI * 2);
          ctx.fillStyle = `${color}18`;
          ctx.fill();
          continue;
        }

        const radius = isHighlighted ? baseRadius + 4 : isHovered ? baseRadius + 2 : baseRadius;

        if (isHighlighted) {
          const pulse = Math.sin(now / 400) * 3 + 5;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + pulse, 0, Math.PI * 2);
          ctx.fillStyle = node.type === "FraudCase" || node.type === "Alert"
            ? "rgba(248, 113, 113, 0.12)"
            : "rgba(96, 165, 250, 0.12)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 3, 0, Math.PI * 2);
          ctx.fillStyle = node.type === "FraudCase" || node.type === "Alert"
            ? "rgba(248, 113, 113, 0.3)"
            : "rgba(96, 165, 250, 0.3)";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHighlighted ? color : `${color}${isHovered ? "" : "aa"}`;
        ctx.fill();
        ctx.strokeStyle = isHighlighted
          ? (node.type === "FraudCase" ? "#f87171" : "#60a5fa")
          : "rgba(255,255,255,0.2)";
        ctx.lineWidth = isHighlighted ? 2 : 1;
        ctx.stroke();

        if (isHovered || isHighlighted || node.type === "Account" || node.type === "FraudCase") {
          ctx.font = `${isHighlighted || node.type === "FraudCase" ? "bold " : ""}10px system-ui`;
          ctx.fillStyle = isHighlighted ? "#fff" : "#e2e8f0";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label = node.label.length > 20 ? node.label.slice(0, 18) + ".." : node.label;
          ctx.fillText(label, node.x, node.y + radius + 12);

          if (isHovered || isHighlighted) {
            ctx.font = "9px system-ui";
            ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
            ctx.fillText(node.type, node.x, node.y + radius + 24);
          }
        }
      }
    };

    const simulate = () => {
      const simNodes = nodesRef.current;
      if (simNodes.length === 0) {
        animRef.current = requestAnimationFrame(simulate);
        return;
      }

      const alpha = alphaRef.current;

      if (alpha < 0.001 && !dragRef.current.nodeId) {
        if (highlightedNodes.length > 0) {
          draw();
        } else if (!settled) {
          settled = true;
          draw();
        }
        animRef.current = requestAnimationFrame(simulate);
        return;
      }

      settled = false;
      alphaRef.current *= 0.99;

      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const dx = simNodes[j].x - simNodes[i].x;
          const dy = simNodes[j].y - simNodes[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = (1200 * alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          simNodes[i].vx -= fx;
          simNodes[i].vy -= fy;
          simNodes[j].vx += fx;
          simNodes[j].vy += fy;
        }
      }

      for (const edge of edges) {
        const source = simNodes.find((n) => n.id === edge.source);
        const target = simNodes.find((n) => n.id === edge.target);
        if (!source || !target) continue;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 100) * 0.005 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      }

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      for (const node of simNodes) {
        node.vx += (cx - node.x) * 0.001 * alpha;
        node.vy += (cy - node.y) * 0.001 * alpha;
        if (dragRef.current.nodeId !== node.id) {
          node.vx *= 0.85;
          node.vy *= 0.85;
          node.x += node.vx;
          node.y += node.vy;
        }
        node.x = Math.max(30, Math.min(canvas.width - 30, node.x));
        node.y = Math.max(30, Math.min(canvas.height - 30, node.y));
      }

      draw();
      animRef.current = requestAnimationFrame(simulate);
    };

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [edges, highlightedNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getNode = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return nodesRef.current.find(
        (n) => Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < 18
      );
    };

    const onMouseDown = (e: MouseEvent) => {
      const node = getNode(e);
      if (node) {
        const rect = canvas.getBoundingClientRect();
        dragRef.current = {
          nodeId: node.id,
          offsetX: e.clientX - rect.left - node.x,
          offsetY: e.clientY - rect.top - node.y,
        };
        alphaRef.current = 0.3;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (dragRef.current.nodeId) {
        const node = nodesRef.current.find((n) => n.id === dragRef.current.nodeId);
        if (node) {
          node.x = x - dragRef.current.offsetX;
          node.y = y - dragRef.current.offsetY;
          node.vx = 0;
          node.vy = 0;
        }
      }

      const hovered = nodesRef.current.find(
        (n) => Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < 18
      );
      hoveredRef.current = hovered?.id || null;
      canvas.style.cursor = hovered ? "grab" : "default";
    };

    const onMouseUp = () => {
      dragRef.current.nodeId = null;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const displayedTypes = [...new Set(nodes.map((n) => n.type))];

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        width={700}
        height={500}
        className="h-full w-full rounded-xl bg-slate-950/50"
      />
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 text-[10px]">
        {displayedTypes.map((type) => (
          <div key={type} className="flex items-center gap-1">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: NODE_COLORS[type] || "#94a3b8" }}
            />
            <span className="text-slate-400">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
