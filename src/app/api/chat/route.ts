import {
  ToolLoopAgent,
  createAgentUIStreamResponse,
  tool,
  jsonSchema,
  stepCountIs,
} from "ai";
import { google } from "@ai-sdk/google";
import { getGraph } from "@/lib/falkordb";

const agent = new ToolLoopAgent({
  model: google("gemini-3.5-flash"),
  instructions: `You are FraudGraph, an AI fraud investigation agent powered by FalkorDB graph database.

## MANDATORY RESPONSE FORMAT — READ THIS FIRST
You MUST write a detailed markdown text response to the user. Tool calls alone are NOT a response.
Your workflow: call 1-3 tools to gather data, then STOP calling tools and WRITE a full investigation report.
The report must include: a summary, key findings with markdown tables, risk indicators, and recommended actions.
NEVER make more than 4 tool calls without writing text. After calling investigate_account, you have enough data — write the report.
If you call query_graph, do it ONCE for the specific data you need, not repeatedly.

## Graph Schema
Nodes: Account (id, name, email, phone, account_type, created_date, kyc_verified, risk_score 0-100, status, country, city, income_bracket, avg_monthly_volume), Transaction (id, amount, currency, timestamp, type, channel, status, is_international, description, ip_address, latitude, longitude), Merchant (id, name, category, risk_level, country, is_shell_company, mcc_code), Device (id, fingerprint, type, os, browser, ip_address, country, city, is_vpn, is_emulator), FraudCase (id, severity, status, type, description, assigned_to, total_loss), Alert (id, type, severity, timestamp, description).

Relationships: (Account)-[:SENT]->(Transaction)-[:RECEIVED_BY]->(Account), (Transaction)-[:AT]->(Merchant), (Account)-[:USES]->(Device), (Device)-[:USED_IN]->(Transaction), (Account)-[:FLAGGED_IN]->(FraudCase), (FraudCase)-[:INVOLVES]->(Transaction), (Account)-[:HAS_ALERT]->(Alert), (Alert)-[:TRIGGERED_BY]->(Transaction), (Account)-[:SHARES_DEVICE]->(Account).

## Investigation Protocol
1. Start with the subject — use investigate_account (it includes circular flow detection and inbound transactions)
2. If circular flows are detected, highlight them prominently — money returning to the origin account is a critical laundering signal
3. Optionally trace money flow or detect patterns for deeper analysis (1 more tool call)
4. WRITE your analysis — explain what the graph paths revealed, use tables, assess risk
5. Optionally flag_account or escalate_case if warranted

## Red Flags
Amounts just below $5k/$10k (structuring), unverified KYC + large transfers, VPN+emulator combos, geo mismatches, shared devices, circular money flows, shell company transactions, velocity anomalies.

## FalkorDB Cypher Notes
round() takes 1 arg. No EXISTS {}. Use toLower()+CONTAINS for fuzzy matching. Booleans are 1/0 not true/false.`,

  tools: {
    query_graph: tool({
      description:
        "Run a Cypher query against the FalkorDB fraud graph. Use this to traverse accounts, transactions, merchants, devices, fraud cases, and alerts. Returns rows of data.",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Cypher query to execute",
          },
          params: {
            type: "object",
            description: "Query parameters (key-value pairs)",
          },
        },
        required: ["query"],
      }),
      execute: async ({
        query,
        params,
      }: {
        query: string;
        params?: Record<string, unknown>;
      }) => {
        try {
          const graph = await getGraph();
          const result = await graph.query(query, {
            params: (params ?? {}) as Record<string, string | number | boolean>,
          });

          const rows = result.data ?? [];
          return {
            success: true,
            data: rows.slice(0, 50),
            count: rows.length,
            message: rows.length === 0 ? "No results found" : undefined,
          };
        } catch (e) {
          return {
            success: false,
            error: String(e),
            hint: "Check Cypher syntax. round() takes 1 arg. No EXISTS {}. Booleans are 1/0.",
          };
        }
      },
    }),

    investigate_account: tool({
      description:
        "Deep investigation of an account — returns the account details, recent transactions, connected devices, fraud cases, alerts, and accounts sharing devices. Use this as the starting point for any account investigation.",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          accountName: {
            type: "string",
            description: "Account name or ID to investigate",
          },
        },
        required: ["accountName"],
      }),
      execute: async ({ accountName }: { accountName: string }) => {
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

          const account = accResult.data?.[0];
          if (!account) return { error: "Account not found" };

          const accId = (account as Record<string, unknown>).id as string;

          const txResult = await graph.query(
            `MATCH (a:Account {id: $id})-[:SENT]->(tx:Transaction)-[:RECEIVED_BY]->(recv:Account)
             OPTIONAL MATCH (tx)-[:AT]->(m:Merchant)
             RETURN tx.id AS txId, tx.amount AS amount, tx.type AS type, tx.channel AS channel,
                    tx.timestamp AS timestamp, tx.status AS status, tx.is_international AS intl,
                    recv.name AS receiver, recv.risk_score AS receiver_risk, m.name AS merchant, m.category AS merchant_category
             ORDER BY tx.timestamp DESC LIMIT 15`,
            { params: { id: accId } }
          );

          const inboundResult = await graph.query(
            `MATCH (sender:Account)-[:SENT]->(tx:Transaction)-[:RECEIVED_BY]->(a:Account {id: $id})
             RETURN tx.id AS txId, tx.amount AS amount, tx.type AS type,
                    tx.timestamp AS timestamp, sender.name AS sender, sender.risk_score AS sender_risk
             ORDER BY tx.timestamp DESC LIMIT 15`,
            { params: { id: accId } }
          );

          const devResult = await graph.query(
            `MATCH (a:Account {id: $id})-[:USES]->(d:Device)
             RETURN d.id AS id, d.type AS type, d.os AS os, d.ip_address AS ip,
                    d.country AS country, d.city AS city, d.is_vpn AS vpn, d.is_emulator AS emulator`,
            { params: { id: accId } }
          );

          const caseResult = await graph.query(
            `MATCH (a:Account {id: $id})-[:FLAGGED_IN]->(f:FraudCase)
             RETURN f.id AS id, f.type AS type, f.severity AS severity, f.status AS status,
                    f.description AS description, f.total_loss AS loss`,
            { params: { id: accId } }
          );

          const alertResult = await graph.query(
            `MATCH (a:Account {id: $id})-[:HAS_ALERT]->(al:Alert)
             RETURN al.id AS id, al.type AS type, al.severity AS severity,
                    al.description AS description`,
            { params: { id: accId } }
          );

          const sharedDevResult = await graph.query(
            `MATCH (a:Account {id: $id})-[:SHARES_DEVICE]->(other:Account)
             RETURN other.id AS id, other.name AS name, other.risk_score AS risk_score,
                    other.kyc_verified AS kyc_verified`,
            { params: { id: accId } }
          );

          const circularResult = await graph.query(
            `MATCH (a:Account {id: $id})-[:SENT]->(tx1:Transaction)-[:RECEIVED_BY]->(b:Account)-[:SENT]->(tx2:Transaction)-[:RECEIVED_BY]->(a)
             WHERE tx2.timestamp > tx1.timestamp
             RETURN a.name AS account, tx1.amount AS sent_amount, b.name AS through_account, tx2.amount AS returned_amount, tx1.timestamp AS sent_time, tx2.timestamp AS return_time
             UNION ALL
             MATCH (a:Account {id: $id})-[:SENT]->(tx1:Transaction)-[:RECEIVED_BY]->(b:Account)-[:SENT]->(tx2:Transaction)-[:RECEIVED_BY]->(c:Account)-[:SENT]->(tx3:Transaction)-[:RECEIVED_BY]->(a)
             WHERE tx2.timestamp > tx1.timestamp AND tx3.timestamp > tx2.timestamp
             RETURN a.name AS account, tx1.amount AS sent_amount, b.name + ' -> ' + c.name AS through_account, tx3.amount AS returned_amount, tx1.timestamp AS sent_time, tx3.timestamp AS return_time`,
            { params: { id: accId } }
          );

          return {
            account,
            recentTransactions: txResult.data ?? [],
            inboundTransactions: inboundResult.data ?? [],
            devices: devResult.data ?? [],
            fraudCases: caseResult.data ?? [],
            alerts: alertResult.data ?? [],
            sharedDeviceAccounts: sharedDevResult.data ?? [],
            circularFlows: circularResult.data ?? [],
            circularFlowDetected: (circularResult.data?.length ?? 0) > 0,
          };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    trace_money_flow: tool({
      description:
        "Trace the flow of money from an account through multiple hops with temporal ordering (only follows paths where each transaction happened after the previous one). Detects circular flows (money returning to origin via 2 or 3 hops), amount correlation between hops, and layering patterns. Essential for money laundering investigations.",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          accountName: {
            type: "string",
            description: "Starting account name or ID",
          },
          hops: {
            type: "number",
            description: "Number of hops to trace (1-4, default 2)",
          },
          minAmount: {
            type: "number",
            description: "Minimum transaction amount to follow",
          },
        },
        required: ["accountName"],
      }),
      execute: async ({
        accountName,
        hops = 2,
        minAmount = 0,
      }: {
        accountName: string;
        hops?: number;
        minAmount?: number;
      }) => {
        try {
          const graph = await getGraph();
          const depth = Math.min(Math.max(hops, 1), 4);

          const accResult = await graph.query(
            `MATCH (a:Account)
             WHERE toLower(a.name) CONTAINS toLower($name) OR a.id = $name
             RETURN a.id AS id LIMIT 1`,
            { params: { name: accountName } }
          );
          const accId = (accResult.data?.[0] as Record<string, unknown>)?.id as string | undefined;
          if (!accId) return { error: "Account not found" };

          let flowQuery: string;
          if (depth === 1) {
            flowQuery = `MATCH (start:Account {id: $id})-[:SENT]->(tx1:Transaction)-[:RECEIVED_BY]->(a2:Account)
             WHERE tx1.amount >= $min
             RETURN start.name AS hop0, tx1.amount AS amt1, tx1.timestamp AS time1, a2.name AS hop1, a2.risk_score AS hop1_risk
             ORDER BY tx1.timestamp LIMIT 20`;
          } else if (depth === 2) {
            flowQuery = `MATCH (start:Account {id: $id})-[:SENT]->(tx1:Transaction)-[:RECEIVED_BY]->(a2:Account)-[:SENT]->(tx2:Transaction)-[:RECEIVED_BY]->(a3:Account)
             WHERE tx1.amount >= $min AND tx2.amount >= $min AND tx2.timestamp > tx1.timestamp
             RETURN start.name AS hop0, tx1.amount AS amt1, tx1.timestamp AS time1, a2.name AS hop1,
                    tx2.amount AS amt2, tx2.timestamp AS time2, a3.name AS hop2, a3.risk_score AS hop2_risk
             ORDER BY tx1.timestamp LIMIT 20`;
          } else {
            flowQuery = `MATCH (start:Account {id: $id})-[:SENT]->(tx1:Transaction)-[:RECEIVED_BY]->(a2:Account)-[:SENT]->(tx2:Transaction)-[:RECEIVED_BY]->(a3:Account)-[:SENT]->(tx3:Transaction)-[:RECEIVED_BY]->(a4:Account)
             WHERE tx1.amount >= $min AND tx2.amount >= $min AND tx3.amount >= $min AND tx2.timestamp > tx1.timestamp AND tx3.timestamp > tx2.timestamp
             RETURN start.name AS hop0, tx1.amount AS amt1, tx1.timestamp AS time1, a2.name AS hop1,
                    tx2.amount AS amt2, tx2.timestamp AS time2, a3.name AS hop2,
                    tx3.amount AS amt3, tx3.timestamp AS time3, a4.name AS hop3, a4.risk_score AS hop3_risk
             ORDER BY tx1.timestamp LIMIT 20`;
          }

          const flowResult = await graph.query(flowQuery, { params: { id: accId, min: minAmount } });

          const circular2Result = await graph.query(
            `MATCH (start:Account {id: $id})-[:SENT]->(tx1:Transaction)-[:RECEIVED_BY]->(mid:Account)-[:SENT]->(tx2:Transaction)-[:RECEIVED_BY]->(start)
             WHERE tx1.amount >= $min AND tx2.amount >= $min AND tx2.timestamp > tx1.timestamp
             RETURN start.name AS from_account, tx1.amount AS sent_amount, tx1.timestamp AS sent_time,
                    mid.name AS through_account, tx2.amount AS returned_amount, tx2.timestamp AS return_time,
                    2 AS hops`,
            { params: { id: accId, min: minAmount } }
          );

          const circular3Result = await graph.query(
            `MATCH (start:Account {id: $id})-[:SENT]->(tx1:Transaction)-[:RECEIVED_BY]->(mid1:Account)-[:SENT]->(tx2:Transaction)-[:RECEIVED_BY]->(mid2:Account)-[:SENT]->(tx3:Transaction)-[:RECEIVED_BY]->(start)
             WHERE tx1.amount >= $min AND tx2.amount >= $min AND tx3.amount >= $min AND tx2.timestamp > tx1.timestamp AND tx3.timestamp > tx2.timestamp
             RETURN start.name AS from_account, tx1.amount AS sent_amount, tx1.timestamp AS sent_time,
                    mid1.name + ' -> ' + mid2.name AS through_account, tx3.amount AS returned_amount, tx3.timestamp AS return_time,
                    3 AS hops`,
            { params: { id: accId, min: minAmount } }
          );

          const allCircular = [...(circular2Result.data ?? []), ...(circular3Result.data ?? [])];

          return {
            moneyFlow: flowResult.data ?? [],
            circularFlows: allCircular,
            circularFlowDetected: allCircular.length > 0,
          };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    detect_patterns: tool({
      description:
        "Detect common fraud patterns across the graph: accounts sharing devices, high-risk merchant activity, velocity anomalies, structuring (transactions just below reporting thresholds). Use this for broad surveillance.",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description:
              "Pattern to detect: 'shared_devices' | 'high_risk_merchants' | 'structuring' | 'velocity' | 'geo_mismatch' | 'new_accounts'",
          },
        },
        required: ["pattern"],
      }),
      execute: async ({ pattern }: { pattern: string }) => {
        try {
          const graph = await getGraph();

          switch (pattern) {
            case "shared_devices": {
              const result = await graph.query(
                `MATCH (a1:Account)-[:SHARES_DEVICE]->(a2:Account)
                 MATCH (a1)-[:USES]->(d:Device)
                 WHERE a2.id > a1.id
                 RETURN a1.name AS account1, a2.name AS account2,
                        d.type AS device_type, d.country AS country,
                        d.is_vpn AS vpn, a1.risk_score AS risk1, a2.risk_score AS risk2`
              );
              return { pattern: "shared_devices", results: result.data ?? [] };
            }
            case "high_risk_merchants": {
              const result = await graph.query(
                `MATCH (a:Account)-[:SENT]->(tx:Transaction)-[:AT]->(m:Merchant)
                 WHERE m.risk_level = 'high' OR m.is_shell_company = 1
                 RETURN a.name AS account, a.id AS accountId, m.name AS merchant,
                        m.category AS category, sum(tx.amount) AS total_amount,
                        count(tx) AS tx_count, m.is_shell_company AS shell
                 ORDER BY total_amount DESC`
              );
              return { pattern: "high_risk_merchants", results: result.data ?? [] };
            }
            case "structuring": {
              const result = await graph.query(
                `MATCH (a:Account)-[:SENT]->(tx:Transaction)
                 WHERE (tx.amount >= 4500 AND tx.amount < 5000) OR (tx.amount >= 9000 AND tx.amount < 10000)
                 RETURN a.name AS account, a.id AS accountId, tx.amount AS amount,
                        tx.timestamp AS timestamp, tx.type AS type,
                        CASE WHEN tx.amount < 5000 THEN '$5k threshold' ELSE '$10k threshold' END AS threshold
                 ORDER BY tx.timestamp DESC`
              );
              return { pattern: "structuring", results: result.data ?? [] };
            }
            case "velocity": {
              const result = await graph.query(
                `MATCH (a:Account)-[:SENT]->(tx:Transaction)
                 WITH a, sum(tx.amount) AS total, count(tx) AS count
                 WHERE total > a.avg_monthly_volume * 3
                 RETURN a.name AS account, a.id AS accountId,
                        a.avg_monthly_volume AS avg_volume,
                        total AS actual_volume, count AS tx_count,
                        round(total / a.avg_monthly_volume) AS multiplier
                 ORDER BY multiplier DESC`
              );
              return { pattern: "velocity", results: result.data ?? [] };
            }
            case "geo_mismatch": {
              const result = await graph.query(
                `MATCH (a:Account)-[:USES]->(d:Device)
                 WHERE a.country <> d.country
                 RETURN a.name AS account, a.id AS accountId,
                        a.country AS account_country, a.city AS account_city,
                        d.country AS device_country, d.city AS device_city,
                        d.is_vpn AS vpn, d.is_emulator AS emulator`
              );
              return { pattern: "geo_mismatch", results: result.data ?? [] };
            }
            case "new_accounts": {
              const result = await graph.query(
                `MATCH (a:Account)
                 WHERE a.kyc_verified = 0
                 OPTIONAL MATCH (a)-[:SENT]->(tx:Transaction)
                 RETURN a.name AS account, a.id AS accountId,
                        a.created_date AS created, a.kyc_verified AS kyc,
                        a.income_bracket AS income,
                        count(tx) AS tx_count, sum(tx.amount) AS total_sent
                 ORDER BY total_sent DESC`
              );
              return { pattern: "new_accounts", results: result.data ?? [] };
            }
            default:
              return { error: `Unknown pattern: ${pattern}. Use: shared_devices, high_risk_merchants, structuring, velocity, geo_mismatch, new_accounts` };
          }
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    flag_account: tool({
      description:
        "ACTION: Update an account's risk score and/or status in the graph. Use this when your investigation reveals suspicious activity. This writes back to the graph — the agent is taking action based on what the data shows.",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          accountName: {
            type: "string",
            description: "Account name or ID to flag",
          },
          newRiskScore: {
            type: "number",
            description: "New risk score (0-100)",
          },
          newStatus: {
            type: "string",
            description: "New status: 'active' | 'frozen' | 'suspended'",
          },
          reason: {
            type: "string",
            description: "Reason for the flag",
          },
        },
        required: ["accountName", "reason"],
      }),
      execute: async ({
        accountName,
        newRiskScore,
        newStatus,
        reason,
      }: {
        accountName: string;
        newRiskScore?: number;
        newStatus?: string;
        reason: string;
      }) => {
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

          if (updates.length === 0) return { error: "No updates specified" };

          const result = await graph.query(
            `MATCH (a:Account)
             WHERE toLower(a.name) CONTAINS toLower($name) OR a.id = $name
             SET ${updates.join(", ")}
             RETURN a.id AS id, a.name AS name, a.risk_score AS risk_score, a.status AS status`,
            { params }
          );

          const updated = result.data?.[0];
          if (!updated) return { error: "Account not found" };

          const alertId = `ALT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
          await graph.query(
            `MATCH (a:Account)
             WHERE toLower(a.name) CONTAINS toLower($name) OR a.id = $name
             CREATE (al:Alert {id: $alertId, type: 'network_risk', severity: 'high', timestamp: $ts, description: $reason, auto_resolved: 0})
             MERGE (a)-[:HAS_ALERT]->(al)`,
            { params: { name: accountName, alertId, ts: new Date().toISOString().slice(0, 19).replace("T", " "), reason } }
          );

          return {
            action: "account_flagged",
            account: updated,
            alertCreated: alertId,
            reason,
          };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    escalate_case: tool({
      description:
        "ACTION: Create a new FraudCase node in the graph and link it to the suspect accounts. Use this when you've confirmed fraudulent activity that needs formal investigation.",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {
          type: {
            type: "string",
            description: "Fraud type: identity_theft | account_takeover | money_laundering | card_fraud | synthetic_identity",
          },
          severity: {
            type: "string",
            description: "Severity: low | medium | high | critical",
          },
          description: {
            type: "string",
            description: "Detailed description of the fraud case",
          },
          accountNames: {
            type: "array",
            items: { type: "string" },
            description: "Account names or IDs involved",
          },
          estimatedLoss: {
            type: "number",
            description: "Estimated monetary loss",
          },
        },
        required: ["type", "severity", "description", "accountNames"],
      }),
      execute: async ({
        type,
        severity,
        description,
        accountNames,
        estimatedLoss = 0,
      }: {
        type: string;
        severity: string;
        description: string;
        accountNames: string[];
        estimatedLoss?: number;
      }) => {
        try {
          const graph = await getGraph();
          const caseId = `CASE-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

          await graph.query(
            `CREATE (f:FraudCase {
              id: $id, type: $type, severity: $severity, status: 'open',
              description: $description, created_date: $date,
              assigned_to: 'FraudGraph Agent', total_loss: $loss
            })`,
            {
              params: {
                id: caseId,
                type,
                severity,
                description,
                date: new Date().toISOString().slice(0, 19).replace("T", " "),
                loss: estimatedLoss,
              },
            }
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
            if (result.data?.[0]) {
              linkedAccounts.push(String((result.data[0] as Record<string, unknown>).name));
            }
          }

          return {
            action: "case_escalated",
            caseId,
            type,
            severity,
            linkedAccounts,
            estimatedLoss,
          };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    get_graph_schema: tool({
      description:
        "Get the current graph schema — node labels, relationship types, and counts. Use this first if you need to understand what data is available.",
      inputSchema: jsonSchema({
        type: "object" as const,
        properties: {},
      }),
      execute: async () => {
        try {
          const graph = await getGraph();
          const labels = await graph.query(
            "MATCH (n) RETURN DISTINCT labels(n)[0] AS label, count(n) AS count"
          );
          const rels = await graph.query(
            "MATCH ()-[r]->() RETURN DISTINCT type(r) AS type, count(r) AS count"
          );
          return {
            nodeLabels: labels.data ?? [],
            relationshipTypes: rels.data ?? [],
          };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),
  },

  stopWhen: stepCountIs(8),
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  try {
    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
    });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("quota") || msg.includes("429") || msg.includes("rate")) {
      return new Response(
        JSON.stringify({ error: "Gemini API rate limit reached (20 req/day on free tier). Try again later or upgrade your API key." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
