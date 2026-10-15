import { NextResponse } from "next/server";
import { getGraph } from "@/lib/falkordb";

interface GNode {
  id: string;
  type: string;
  label: string;
}
interface GEdge {
  source: string;
  target: string;
  type: string;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const focus = searchParams.get("focus");

  try {
    const graph = await getGraph();

    if (!focus) {
      return defaultGraph(graph);
    }

    return focusedGraph(graph, focus.split(",").map((n) => n.trim()));
  } catch (error) {
    console.error("Graph fetch error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

async function defaultGraph(graph: Awaited<ReturnType<typeof getGraph>>) {
  const seen = new Set<string>();
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];

  const addNode = (id: string, type: string, label: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      nodes.push({ id, type, label });
    }
  };

  const accountsResult = await graph.query(
    `MATCH (a:Account) RETURN a.id AS id, a.name AS name`
  );
  for (const row of accountsResult.data ?? []) {
    const r = row as Record<string, unknown>;
    addNode(`Account:${r.id}`, "Account", String(r.name));
  }

  const casesResult = await graph.query(
    `MATCH (f:FraudCase) RETURN f.id AS id, f.type AS type, f.severity AS sev`
  );
  for (const row of casesResult.data ?? []) {
    const r = row as Record<string, unknown>;
    addNode(`FraudCase:${r.id}`, "FraudCase", `${r.type} (${r.sev})`);
  }

  const alertsResult = await graph.query(
    `MATCH (al:Alert) RETURN al.id AS id, al.type AS type, al.severity AS sev`
  );
  for (const row of alertsResult.data ?? []) {
    const r = row as Record<string, unknown>;
    addNode(`Alert:${r.id}`, "Alert", `${r.type} (${r.sev})`);
  }

  const flaggedResult = await graph.query(
    `MATCH (a:Account)-[:FLAGGED_IN]->(f:FraudCase)
     RETURN a.id AS aid, f.id AS fid`
  );
  for (const row of flaggedResult.data ?? []) {
    const r = row as Record<string, unknown>;
    const src = `Account:${r.aid}`;
    const tgt = `FraudCase:${r.fid}`;
    if (seen.has(src) && seen.has(tgt)) edges.push({ source: src, target: tgt, type: "FLAGGED_IN" });
  }

  const alertEdgeResult = await graph.query(
    `MATCH (a:Account)-[:HAS_ALERT]->(al:Alert)
     RETURN a.id AS aid, al.id AS alid`
  );
  for (const row of alertEdgeResult.data ?? []) {
    const r = row as Record<string, unknown>;
    const src = `Account:${r.aid}`;
    const tgt = `Alert:${r.alid}`;
    if (seen.has(src) && seen.has(tgt)) edges.push({ source: src, target: tgt, type: "HAS_ALERT" });
  }

  const sharedResult = await graph.query(
    `MATCH (a1:Account)-[:SHARES_DEVICE]->(a2:Account)
     RETURN a1.id AS a1id, a2.id AS a2id`
  );
  for (const row of sharedResult.data ?? []) {
    const r = row as Record<string, unknown>;
    const src = `Account:${r.a1id}`;
    const tgt = `Account:${r.a2id}`;
    if (seen.has(src) && seen.has(tgt)) edges.push({ source: src, target: tgt, type: "SHARES_DEVICE" });
  }

  return NextResponse.json({ nodes, edges });
}

async function focusedGraph(
  graph: Awaited<ReturnType<typeof getGraph>>,
  names: string[]
) {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();

  const addNode = (id: string, type: string, label: string) => {
    if (!seenNodes.has(id)) {
      seenNodes.add(id);
      nodes.push({ id, type, label });
    }
  };
  const addEdge = (source: string, target: string, type: string) => {
    const key = `${source}->${type}->${target}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      edges.push({ source, target, type });
    }
  };

  for (const name of names) {
    // Find the account
    const accResult = await graph.query(
      `MATCH (a:Account)
       WHERE toLower(a.name) CONTAINS toLower($name) OR a.id = $name
       RETURN a.id AS id, a.name AS name, a.risk_score AS risk, a.status AS status
       LIMIT 1`,
      { params: { name } }
    );

    const acc = accResult.data?.[0] as Record<string, unknown> | undefined;
    if (!acc) continue;

    const accId = String(acc.id);
    const riskLabel = `${acc.name} (Risk: ${acc.risk})`;
    addNode(`Account:${accId}`, "Account", riskLabel);

    // Get transactions sent
    const sentResult = await graph.query(
      `MATCH (a:Account {id: $id})-[:SENT]->(tx:Transaction)-[:RECEIVED_BY]->(recv:Account)
       OPTIONAL MATCH (tx)-[:AT]->(m:Merchant)
       RETURN tx.id AS txId, tx.amount AS amount, tx.type AS txType, tx.status AS txStatus,
              recv.id AS recvId, recv.name AS recvName,
              m.id AS merId, m.name AS merName, m.category AS merCat
       ORDER BY tx.timestamp DESC LIMIT 10`,
      { params: { id: accId } }
    );

    for (const row of sentResult.data ?? []) {
      const r = row as Record<string, unknown>;
      const txId = String(r.txId);
      const txLabel = `$${Number(r.amount).toLocaleString()} ${r.txType}`;
      addNode(`Transaction:${txId}`, "Transaction", txLabel);
      addEdge(`Account:${accId}`, `Transaction:${txId}`, "SENT");

      const recvId = String(r.recvId);
      addNode(`Account:${recvId}`, "Account", String(r.recvName));
      addEdge(`Transaction:${txId}`, `Account:${recvId}`, "RECEIVED_BY");

      if (r.merId) {
        const merId = String(r.merId);
        const merLabel = `${r.merName} [${r.merCat}]`;
        addNode(`Merchant:${merId}`, "Merchant", merLabel);
        addEdge(`Transaction:${txId}`, `Merchant:${merId}`, "AT");
      }
    }

    // Get devices
    const devResult = await graph.query(
      `MATCH (a:Account {id: $id})-[:USES]->(d:Device)
       RETURN d.id AS did, d.type AS dtype, d.country AS country, d.is_vpn AS vpn`,
      { params: { id: accId } }
    );

    for (const row of devResult.data ?? []) {
      const r = row as Record<string, unknown>;
      const devId = String(r.did);
      const vpnTag = Number(r.vpn) ? " [VPN]" : "";
      addNode(`Device:${devId}`, "Device", `${r.dtype} (${r.country})${vpnTag}`);
      addEdge(`Account:${accId}`, `Device:${devId}`, "USES");
    }

    // Get fraud cases
    const caseResult = await graph.query(
      `MATCH (a:Account {id: $id})-[:FLAGGED_IN]->(f:FraudCase)
       RETURN f.id AS fid, f.type AS ftype, f.severity AS sev, f.status AS fstatus`,
      { params: { id: accId } }
    );

    for (const row of caseResult.data ?? []) {
      const r = row as Record<string, unknown>;
      const fid = String(r.fid);
      addNode(`FraudCase:${fid}`, "FraudCase", `${r.ftype} (${r.sev})`);
      addEdge(`Account:${accId}`, `FraudCase:${fid}`, "FLAGGED_IN");
    }

    // Get alerts
    const alertResult = await graph.query(
      `MATCH (a:Account {id: $id})-[:HAS_ALERT]->(al:Alert)
       RETURN al.id AS alid, al.type AS altype, al.severity AS sev`,
      { params: { id: accId } }
    );

    for (const row of alertResult.data ?? []) {
      const r = row as Record<string, unknown>;
      const alid = String(r.alid);
      addNode(`Alert:${alid}`, "Alert", `${r.altype} (${r.sev})`);
      addEdge(`Account:${accId}`, `Alert:${alid}`, "HAS_ALERT");
    }

    // Get SHARES_DEVICE connections
    const sharedResult = await graph.query(
      `MATCH (a:Account {id: $id})-[:SHARES_DEVICE]->(other:Account)
       RETURN other.id AS oid, other.name AS oname, other.risk_score AS orisk`,
      { params: { id: accId } }
    );

    for (const row of sharedResult.data ?? []) {
      const r = row as Record<string, unknown>;
      const oid = String(r.oid);
      addNode(`Account:${oid}`, "Account", `${r.oname} (Risk: ${r.orisk})`);
      addEdge(`Account:${accId}`, `Account:${oid}`, "SHARES_DEVICE");
    }
  }

  return NextResponse.json({ nodes, edges });
}
