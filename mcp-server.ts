import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FalkorDB } from "falkordb";

let db: FalkorDB | null = null;

async function getDB() {
  if (!db) {
    db = await FalkorDB.connect({
      socket: {
        host: process.env.FALKORDB_HOST || "localhost",
        port: Number(process.env.FALKORDB_PORT) || 6379,
      },
    });
  }
  return db;
}

async function getGraph() {
  const database = await getDB();
  return database.selectGraph("fraud");
}

const GRAPH_SCHEMA = `# FraudGraph Schema

## Node Types
- **Account**: id, name, email, phone, account_type, created_date, kyc_verified (1/0), risk_score (0-100), status, country, city, income_bracket, avg_monthly_volume
- **Transaction**: id, amount, currency, timestamp, type (transfer/payment/withdrawal/deposit), channel (mobile/web/atm/pos/wire), status, is_international (1/0), description, ip_address, latitude, longitude
- **Merchant**: id, name, category, risk_level, country, is_shell_company (1/0), mcc_code
- **Device**: id, fingerprint, type, os, browser, ip_address, country, city, is_vpn (1/0), is_emulator (1/0)
- **FraudCase**: id, severity, status, type (identity_theft/account_takeover/money_laundering/card_fraud/synthetic_identity), description, assigned_to, total_loss
- **Alert**: id, type (velocity/geo_anomaly/amount_anomaly/pattern_match/network_risk), severity, timestamp, description

## Relationships
- (Account)-[:SENT]->(Transaction)-[:RECEIVED_BY]->(Account)
- (Transaction)-[:AT]->(Merchant)
- (Account)-[:USES]->(Device)
- (Device)-[:USED_IN]->(Transaction)
- (Account)-[:FLAGGED_IN]->(FraudCase)
- (FraudCase)-[:INVOLVES]->(Transaction)
- (Account)-[:HAS_ALERT]->(Alert)
- (Alert)-[:TRIGGERED_BY]->(Transaction)
- (Account)-[:SHARES_DEVICE]->(Account)

## Cypher Notes (FalkorDB)
- round() takes only 1 argument
- No EXISTS {} subquery syntax
- Use toLower() + CONTAINS for fuzzy matching
- Boolean values stored as 1/0, not true/false
`;

const server = new McpServer({
  name: "fraudgraph",
  version: "1.0.0",
});

server.resource("graph-schema", "fraudgraph://schema", async (uri) => ({
  contents: [{ uri: uri.href, mimeType: "text/markdown", text: GRAPH_SCHEMA }],
}));

server.resource("investigation-guide", "fraudgraph://guide", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      mimeType: "text/markdown",
      text: `# Fraud Investigation Guide

## Red Flags
- Amounts just below $5,000 or $10,000 (structuring/smurfing)
- New accounts with no KYC making large transfers
- VPN + emulator device combinations
- Transactions from unexpected countries
- Rapid small test charges followed by large purchases (card testing)
- Multiple accounts sharing a single device
- Money flowing in circles between accounts
- Transactions at shell companies or high-risk merchants
- Activity volume far exceeding avg_monthly_volume

## Investigation Protocol
1. Start with the subject — look up the account or alert
2. Traverse connections — who sent money to whom? What devices were used?
3. Identify patterns — use detect_patterns for broad surveillance
4. Trace money flow — use trace_money_flow for multi-hop analysis
5. Take action — flag_account or escalate_case based on findings
`,
    },
  ],
}));

server.tool(
  "query_graph",
  "Run a Cypher query against the FalkorDB fraud graph. Use this to traverse accounts, transactions, merchants, devices, fraud cases, and alerts.",
  { query: z.string().describe("Cypher query to execute"), params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Query parameters") },
  async ({ query, params }) => {
    try {
      const graph = await getGraph();
      const result = await graph.query(query, { params: (params ?? {}) as Record<string, string | number | boolean> });
      const rows = result.data ?? [];
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, data: rows.slice(0, 50), count: rows.length }, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: String(e), hint: "Check Cypher syntax. round() takes 1 arg. No EXISTS {}. Booleans are 1/0." }) }] };
    }
  }
);

server.tool(
  "investigate_account",
  "Deep investigation of an account — returns account details, recent transactions, connected devices, fraud cases, alerts, and accounts sharing devices.",
  { accountName: z.string().describe("Account name or ID to investigate") },
  async ({ accountName }) => {
    try {
      const graph = await getGraph();

      const accResult = await graph.query(
        `MATCH (a:Account)
         WHERE toLower(a.name) CONTAINS toLower($name) OR a.id = $name
         RETURN a.id AS id, a.name AS name, a.email AS email, a.phone AS phone,
                a.account_type AS account_type, a.created_date AS created_date,
                a.kyc_verified AS kyc_verified, a.risk_score AS risk_score,
                a.status AS status, a.country AS country, a.city AS city,
                a.income_bracket AS income_bracket, a.avg_monthly_volume AS avg_monthly_volume
         LIMIT 1`,
        { params: { name: accountName } }
      );

      const account = accResult.data?.[0] as Record<string, unknown> | undefined;
      if (!account) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Account not found" }) }] };

      const accId = account.id as string;

      const [txResult, devResult, caseResult, alertResult, sharedDevResult] = await Promise.all([
        graph.query(
          `MATCH (a:Account {id: $id})-[:SENT]->(tx:Transaction)-[:RECEIVED_BY]->(recv:Account)
           OPTIONAL MATCH (tx)-[:AT]->(m:Merchant)
           RETURN tx.id AS txId, tx.amount AS amount, tx.type AS type, tx.channel AS channel,
                  tx.timestamp AS timestamp, tx.status AS status, tx.is_international AS intl,
                  recv.name AS receiver, m.name AS merchant, m.category AS merchant_category
           ORDER BY tx.timestamp DESC LIMIT 15`,
          { params: { id: accId } }
        ),
        graph.query(
          `MATCH (a:Account {id: $id})-[:USES]->(d:Device)
           RETURN d.id AS id, d.type AS type, d.os AS os, d.ip_address AS ip,
                  d.country AS country, d.city AS city, d.is_vpn AS vpn, d.is_emulator AS emulator`,
          { params: { id: accId } }
        ),
        graph.query(
          `MATCH (a:Account {id: $id})-[:FLAGGED_IN]->(f:FraudCase)
           RETURN f.id AS id, f.type AS type, f.severity AS severity, f.status AS status,
                  f.description AS description, f.total_loss AS loss`,
          { params: { id: accId } }
        ),
        graph.query(
          `MATCH (a:Account {id: $id})-[:HAS_ALERT]->(al:Alert)
           RETURN al.id AS id, al.type AS type, al.severity AS severity,
                  al.description AS description`,
          { params: { id: accId } }
        ),
        graph.query(
          `MATCH (a:Account {id: $id})-[:SHARES_DEVICE]->(other:Account)
           RETURN other.id AS id, other.name AS name, other.risk_score AS risk_score,
                  other.kyc_verified AS kyc_verified`,
          { params: { id: accId } }
        ),
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            account,
            recentTransactions: txResult.data ?? [],
            devices: devResult.data ?? [],
            fraudCases: caseResult.data ?? [],
            alerts: alertResult.data ?? [],
            sharedDeviceAccounts: sharedDevResult.data ?? [],
          }, null, 2),
        }],
      };
    } catch (e) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(e) }) }] };
    }
  }
);

server.tool(
  "trace_money_flow",
  "Trace money flow from an account through multiple hops. Follows SENT→Transaction→RECEIVED_BY→Account chains. Detects circular flows and money mule networks.",
  {
    accountName: z.string().describe("Starting account name or ID"),
    hops: z.number().min(1).max(4).default(2).describe("Number of hops to trace (1-4)"),
    minAmount: z.number().default(0).describe("Minimum transaction amount to follow"),
  },
  async ({ accountName, hops, minAmount }) => {
    try {
      const graph = await getGraph();
      const depth = Math.min(Math.max(hops, 1), 4);

      const accResult = await graph.query(
        `MATCH (a:Account) WHERE toLower(a.name) CONTAINS toLower($name) OR a.id = $name RETURN a.id AS id LIMIT 1`,
        { params: { name: accountName } }
      );
      const accId = (accResult.data?.[0] as Record<string, unknown>)?.id as string | undefined;
      if (!accId) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Account not found" }) }] };

      const flowResult = await graph.query(
        `MATCH path = (start:Account {id: $id})-[:SENT]->(tx1:Transaction)-[:RECEIVED_BY]->(a2:Account)${
          depth >= 2 ? `-[:SENT]->(tx2:Transaction)-[:RECEIVED_BY]->(a3:Account)` : ""
        }${depth >= 3 ? `-[:SENT]->(tx3:Transaction)-[:RECEIVED_BY]->(a4:Account)` : ""}
         WHERE tx1.amount >= $min${depth >= 2 ? " AND tx2.amount >= $min" : ""}${depth >= 3 ? " AND tx3.amount >= $min" : ""}
         RETURN start.name AS hop0, tx1.amount AS amt1, a2.name AS hop1${
          depth >= 2 ? ", tx2.amount AS amt2, a3.name AS hop2" : ""
        }${depth >= 3 ? ", tx3.amount AS amt3, a4.name AS hop3" : ""}
         LIMIT 20`,
        { params: { id: accId, min: minAmount } }
      );

      const circularResult = await graph.query(
        `MATCH (start:Account {id: $id})-[:SENT]->(tx1:Transaction)-[:RECEIVED_BY]->(mid:Account)-[:SENT]->(tx2:Transaction)-[:RECEIVED_BY]->(start)
         WHERE tx1.amount >= $min AND tx2.amount >= $min
         RETURN start.name AS from_account, tx1.amount AS sent_amount,
                mid.name AS through_account, tx2.amount AS returned_amount`,
        { params: { id: accId, min: minAmount } }
      );

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            moneyFlow: flowResult.data ?? [],
            circularFlows: circularResult.data ?? [],
            circularFlowDetected: (circularResult.data?.length ?? 0) > 0,
          }, null, 2),
        }],
      };
    } catch (e) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(e) }) }] };
    }
  }
);

server.tool(
  "detect_patterns",
  "Detect common fraud patterns across the graph: shared_devices, high_risk_merchants, structuring, velocity, geo_mismatch, new_accounts.",
  {
    pattern: z.enum(["shared_devices", "high_risk_merchants", "structuring", "velocity", "geo_mismatch", "new_accounts"])
      .describe("Fraud pattern to detect"),
  },
  async ({ pattern }) => {
    try {
      const graph = await getGraph();
      const queries: Record<string, string> = {
        shared_devices: `MATCH (a1:Account)-[:SHARES_DEVICE]->(a2:Account)
           MATCH (a1)-[:USES]->(d:Device) WHERE a2.id > a1.id
           RETURN a1.name AS account1, a2.name AS account2, d.type AS device_type,
                  d.country AS country, d.is_vpn AS vpn, a1.risk_score AS risk1, a2.risk_score AS risk2`,
        high_risk_merchants: `MATCH (a:Account)-[:SENT]->(tx:Transaction)-[:AT]->(m:Merchant)
           WHERE m.risk_level = 'high' OR m.is_shell_company = 1
           RETURN a.name AS account, a.id AS accountId, m.name AS merchant,
                  m.category AS category, sum(tx.amount) AS total_amount,
                  count(tx) AS tx_count, m.is_shell_company AS shell ORDER BY total_amount DESC`,
        structuring: `MATCH (a:Account)-[:SENT]->(tx:Transaction)
           WHERE tx.amount >= 4500 AND tx.amount < 5000
           RETURN a.name AS account, a.id AS accountId, tx.amount AS amount,
                  tx.timestamp AS timestamp, tx.type AS type ORDER BY tx.timestamp DESC`,
        velocity: `MATCH (a:Account)-[:SENT]->(tx:Transaction)
           WITH a, sum(tx.amount) AS total, count(tx) AS count
           WHERE total > a.avg_monthly_volume * 3
           RETURN a.name AS account, a.id AS accountId, a.avg_monthly_volume AS avg_volume,
                  total AS actual_volume, count AS tx_count,
                  round(total / a.avg_monthly_volume) AS multiplier ORDER BY multiplier DESC`,
        geo_mismatch: `MATCH (a:Account)-[:USES]->(d:Device)
           WHERE a.country <> d.country
           RETURN a.name AS account, a.id AS accountId, a.country AS account_country,
                  a.city AS account_city, d.country AS device_country, d.city AS device_city,
                  d.is_vpn AS vpn, d.is_emulator AS emulator`,
        new_accounts: `MATCH (a:Account) WHERE a.kyc_verified = 0
           OPTIONAL MATCH (a)-[:SENT]->(tx:Transaction)
           RETURN a.name AS account, a.id AS accountId, a.created_date AS created,
                  a.kyc_verified AS kyc, a.income_bracket AS income,
                  count(tx) AS tx_count, sum(tx.amount) AS total_sent ORDER BY total_sent DESC`,
      };

      const result = await graph.query(queries[pattern]);
      return { content: [{ type: "text" as const, text: JSON.stringify({ pattern, results: result.data ?? [] }, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(e) }) }] };
    }
  }
);

server.tool(
  "flag_account",
  "ACTION: Update an account's risk score and/or status. Creates an alert node. Use when investigation reveals suspicious activity.",
  {
    accountName: z.string().describe("Account name or ID to flag"),
    newRiskScore: z.number().min(0).max(100).optional().describe("New risk score (0-100)"),
    newStatus: z.enum(["active", "frozen", "suspended"]).optional().describe("New account status"),
    reason: z.string().describe("Reason for flagging"),
  },
  async ({ accountName, newRiskScore, newStatus, reason }) => {
    try {
      const graph = await getGraph();

      const updates: string[] = [];
      const params: Record<string, string | number> = { name: accountName };

      if (newRiskScore !== undefined) {
        updates.push("a.risk_score = $risk");
        params.risk = newRiskScore;
      }
      if (newStatus) {
        updates.push("a.status = $status");
        params.status = newStatus;
      }
      if (updates.length === 0) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "No updates specified" }) }] };

      const result = await graph.query(
        `MATCH (a:Account) WHERE toLower(a.name) CONTAINS toLower($name) OR a.id = $name
         SET ${updates.join(", ")}
         RETURN a.id AS id, a.name AS name, a.risk_score AS risk_score, a.status AS status`,
        { params }
      );

      const updated = result.data?.[0];
      if (!updated) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Account not found" }) }] };

      const alertId = `ALT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      await graph.query(
        `MATCH (a:Account) WHERE toLower(a.name) CONTAINS toLower($name) OR a.id = $name
         CREATE (al:Alert {id: $alertId, type: 'network_risk', severity: 'high', timestamp: $ts, description: $reason, auto_resolved: 0})
         MERGE (a)-[:HAS_ALERT]->(al)`,
        { params: { name: accountName, alertId, ts: new Date().toISOString().slice(0, 19).replace("T", " "), reason } }
      );

      return { content: [{ type: "text" as const, text: JSON.stringify({ action: "account_flagged", account: updated, alertCreated: alertId, reason }, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(e) }) }] };
    }
  }
);

server.tool(
  "escalate_case",
  "ACTION: Create a new FraudCase node and link it to suspect accounts. Use when you've confirmed fraudulent activity requiring formal investigation.",
  {
    type: z.enum(["identity_theft", "account_takeover", "money_laundering", "card_fraud", "synthetic_identity"]).describe("Fraud type"),
    severity: z.enum(["low", "medium", "high", "critical"]).describe("Case severity"),
    description: z.string().describe("Detailed description of the fraud case"),
    accountNames: z.array(z.string()).describe("Account names or IDs involved"),
    estimatedLoss: z.number().default(0).describe("Estimated monetary loss"),
  },
  async ({ type, severity, description, accountNames, estimatedLoss }) => {
    try {
      const graph = await getGraph();
      const caseId = `CASE-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

      await graph.query(
        `CREATE (f:FraudCase {
          id: $id, type: $type, severity: $severity, status: 'open',
          description: $description, created_date: $date,
          assigned_to: 'FraudGraph Agent', total_loss: $loss
        })`,
        { params: { id: caseId, type, severity, description, date: new Date().toISOString().slice(0, 19).replace("T", " "), loss: estimatedLoss } }
      );

      const linkedAccounts: string[] = [];
      for (const name of accountNames) {
        const result = await graph.query(
          `MATCH (a:Account), (f:FraudCase {id: $caseId})
           WHERE toLower(a.name) CONTAINS toLower($name) OR a.id = $name
           MERGE (a)-[:FLAGGED_IN]->(f)
           RETURN a.name AS name`,
          { params: { name, caseId } }
        );
        if (result.data?.[0]) linkedAccounts.push(String((result.data[0] as Record<string, unknown>).name));
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ action: "case_escalated", caseId, type, severity, linkedAccounts, estimatedLoss }, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(e) }) }] };
    }
  }
);

server.tool(
  "get_graph_schema",
  "Get the current graph schema — node labels, relationship types, and counts.",
  {},
  async () => {
    try {
      const graph = await getGraph();
      const [labels, rels] = await Promise.all([
        graph.query("MATCH (n) RETURN DISTINCT labels(n) AS label, count(n) AS count"),
        graph.query("MATCH ()-[r]->() RETURN DISTINCT type(r) AS type, count(r) AS count"),
      ]);
      return { content: [{ type: "text" as const, text: JSON.stringify({ nodeLabels: labels.data ?? [], relationshipTypes: rels.data ?? [] }, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(e) }) }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FraudGraph MCP server running on stdio");
}

main().catch(console.error);
