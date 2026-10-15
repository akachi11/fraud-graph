import { getGraph } from "./falkordb";

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

const FIRST_NAMES = [
  "James", "Sarah", "Michael", "Emily", "David", "Jessica", "Robert", "Ashley",
  "William", "Jennifer", "Richard", "Amanda", "Joseph", "Stephanie", "Thomas",
  "Nicole", "Charles", "Elizabeth", "Daniel", "Megan", "Olga", "Viktor",
  "Ahmed", "Yuki", "Chen", "Priya", "Liam", "Sofia", "Omar", "Fatima",
];
const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson",
  "White", "Harris", "Clark", "Lewis", "Young", "Petrov", "Nakamura", "Li", "Patel",
];
const COUNTRIES = ["US", "UK", "CA", "DE", "NG", "RU", "CN", "BR", "IN", "JP"];
const CITIES: Record<string, string[]> = {
  US: ["New York", "Los Angeles", "Chicago", "Houston", "Miami"],
  UK: ["London", "Manchester", "Birmingham", "Leeds"],
  CA: ["Toronto", "Vancouver", "Montreal"],
  DE: ["Berlin", "Munich", "Hamburg"],
  NG: ["Lagos", "Abuja"],
  RU: ["Moscow", "Saint Petersburg"],
  CN: ["Shanghai", "Beijing"],
  BR: ["Sao Paulo", "Rio de Janeiro"],
  IN: ["Mumbai", "Delhi", "Bangalore"],
  JP: ["Tokyo", "Osaka"],
};
const MERCHANT_NAMES = [
  "Amazon", "Walmart", "Starbucks", "Shell Gas", "McDonald's",
  "Target", "Apple Store", "Netflix", "Uber", "DoorDash",
  "CryptoSwap Exchange", "QuickCash ATM", "LuxuryBags Ltd",
  "GoldTrade International", "WireSend Global", "Casino Royale Online",
  "TechMart Electronics", "FreshMart Grocery", "AirTravel Plus",
  "PharmaQuick", "BitVault Crypto", "JetSet Travel", "MoneyGram Express",
  "DigiWallet Transfer", "ShellCorp Holdings", "FastLoan Direct",
];
const MERCHANT_CATEGORIES = [
  "retail", "food", "fuel", "entertainment", "crypto_exchange",
  "atm", "luxury_goods", "precious_metals", "wire_transfer", "gambling",
  "electronics", "grocery", "travel", "pharmacy", "crypto_exchange",
  "travel", "money_transfer", "digital_wallet", "shell_company", "lending",
];
const DEVICE_TYPES = ["mobile", "desktop", "tablet"];
const OS_LIST = ["iOS 18", "Android 15", "Windows 11", "macOS 15", "Linux"];
const BROWSERS = ["Chrome 130", "Safari 19", "Firefox 135", "Edge 130"];

interface Account {
  id: string;
  name: string;
  email: string;
  phone: string;
  account_type: string;
  created_date: string;
  kyc_verified: boolean;
  risk_score: number;
  status: string;
  country: string;
  city: string;
  income_bracket: string;
  avg_monthly_volume: number;
}

interface Merchant {
  id: string;
  name: string;
  category: string;
  risk_level: string;
  country: string;
  is_shell_company: boolean;
  registration_date: string;
  mcc_code: string;
}

interface Device {
  id: string;
  fingerprint: string;
  type: string;
  os: string;
  browser: string;
  ip_address: string;
  country: string;
  city: string;
  is_vpn: boolean;
  is_emulator: boolean;
  first_seen: string;
  last_seen: string;
}

const MCC_CODES: Record<string, string> = {
  retail: "5411", food: "5812", fuel: "5541", entertainment: "7832",
  crypto_exchange: "6051", atm: "6011", luxury_goods: "5944",
  precious_metals: "5094", wire_transfer: "4829", gambling: "7995",
  electronics: "5732", grocery: "5411", travel: "4722", pharmacy: "5912",
  money_transfer: "4829", digital_wallet: "6051", shell_company: "7399",
  lending: "6153",
};

function generateAccounts(count: number): Account[] {
  const accounts: Account[] = [];
  for (let i = 0; i < count; i++) {
    const country = randomFrom(COUNTRIES);
    const city = randomFrom(CITIES[country]);
    const first = randomFrom(FIRST_NAMES);
    const last = randomFrom(LAST_NAMES);
    accounts.push({
      id: `ACC-${randomId()}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${Math.floor(Math.random() * 99)}@${randomFrom(["gmail.com", "yahoo.com", "outlook.com", "protonmail.com"])}`,
      phone: `+${Math.floor(Math.random() * 99)}${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      account_type: randomFrom(["personal", "personal", "personal", "business", "joint"]),
      created_date: randomDate(730),
      kyc_verified: Math.random() > 0.15,
      risk_score: Math.floor(Math.random() * 30),
      status: "active",
      country,
      city,
      income_bracket: randomFrom(["low", "low", "medium", "medium", "medium", "high"]),
      avg_monthly_volume: randomBetween(500, 15000),
    });
  }
  return accounts;
}

function generateMerchants(): Merchant[] {
  return MERCHANT_NAMES.map((name, i) => {
    const category = MERCHANT_CATEGORIES[i] || "retail";
    const highRiskCategories = ["crypto_exchange", "gambling", "wire_transfer", "money_transfer", "shell_company", "lending", "precious_metals"];
    return {
      id: `MER-${randomId()}`,
      name,
      category,
      risk_level: highRiskCategories.includes(category) ? "high" : (category === "luxury_goods" || category === "digital_wallet" ? "medium" : "low"),
      country: randomFrom(["US", "UK", "CA", "DE", "NG", "RU"]),
      is_shell_company: name === "ShellCorp Holdings",
      registration_date: randomDate(1825),
      mcc_code: MCC_CODES[category] || "5999",
    };
  });
}

function generateDevices(accounts: Account[], count: number): { devices: Device[]; accountDeviceMap: Map<string, string[]> } {
  const devices: Device[] = [];
  const accountDeviceMap = new Map<string, string[]>();

  for (let i = 0; i < count; i++) {
    const country = randomFrom(COUNTRIES);
    const city = randomFrom(CITIES[country]);
    devices.push({
      id: `DEV-${randomId()}`,
      fingerprint: `fp_${randomId()}${randomId()}`,
      type: randomFrom(DEVICE_TYPES),
      os: randomFrom(OS_LIST),
      browser: randomFrom(BROWSERS),
      ip_address: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      country,
      city,
      is_vpn: Math.random() > 0.85,
      is_emulator: Math.random() > 0.95,
      first_seen: randomDate(365),
      last_seen: randomDate(30),
    });
  }

  for (const account of accounts) {
    const numDevices = Math.random() > 0.7 ? 2 : 1;
    const assigned: string[] = [];
    for (let i = 0; i < numDevices; i++) {
      assigned.push(randomFrom(devices).id);
    }
    accountDeviceMap.set(account.id, assigned);
  }

  return { devices, accountDeviceMap };
}

function injectFraudPatterns(
  accounts: Account[],
  merchants: Merchant[],
  devices: Device[],
  accountDeviceMap: Map<string, string[]>
) {
  const transactions: {
    id: string; amount: number; currency: string; timestamp: string;
    type: string; channel: string; status: string; is_international: boolean;
    description: string; ip_address: string; latitude: number; longitude: number;
    senderId: string; receiverId: string; merchantId: string | null; deviceId: string | null;
  }[] = [];
  const fraudCases: {
    id: string; severity: string; status: string; type: string;
    description: string; created_date: string; resolved_date: string | null;
    assigned_to: string; total_loss: number; accountIds: string[]; transactionIds: string[];
  }[] = [];
  const alerts: {
    id: string; type: string; severity: string; timestamp: string;
    description: string; auto_resolved: boolean; accountId: string; transactionId: string | null;
  }[] = [];

  const cryptoMerchants = merchants.filter(m => m.category === "crypto_exchange");
  const shellMerchants = merchants.filter(m => m.is_shell_company);
  const gamblingMerchants = merchants.filter(m => m.category === "gambling");
  const normalMerchants = merchants.filter(m => m.risk_level === "low");

  // --- PATTERN 1: Money Laundering Ring (3 accounts cycling money) ---
  const ringAccounts = accounts.slice(0, 3);
  const sharedDevice = devices[0];
  for (const acc of ringAccounts) {
    acc.status = "active";
    acc.kyc_verified = false;
    acc.created_date = randomDate(30);
    acc.risk_score = 75;
    acc.income_bracket = "low";
    accountDeviceMap.set(acc.id, [sharedDevice.id]);
  }
  sharedDevice.is_vpn = true;
  sharedDevice.country = "RU";

  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < ringAccounts.length; i++) {
      const sender = ringAccounts[i];
      const receiver = ringAccounts[(i + 1) % ringAccounts.length];
      const txId = `TXN-${randomId()}`;
      const amount = randomBetween(4500, 4999);
      transactions.push({
        id: txId,
        amount,
        currency: "USD",
        timestamp: randomDate(14),
        type: "transfer",
        channel: "web",
        status: "completed",
        is_international: true,
        description: `Transfer to ${receiver.name}`,
        ip_address: sharedDevice.ip_address,
        latitude: 55.75 + Math.random() * 0.1,
        longitude: 37.61 + Math.random() * 0.1,
        senderId: sender.id,
        receiverId: receiver.id,
        merchantId: null,
        deviceId: sharedDevice.id,
      });
    }
  }

  fraudCases.push({
    id: `CASE-${randomId()}`,
    severity: "critical",
    status: "investigating",
    type: "money_laundering",
    description: `Circular money flow detected between ${ringAccounts.map(a => a.name).join(", ")}. All accounts share same device (VPN from Russia), created within 30 days, unverified KYC. Amounts kept just below $5,000 reporting threshold.`,
    created_date: randomDate(7),
    resolved_date: null,
    assigned_to: "Agent Rodriguez",
    total_loss: 0,
    accountIds: ringAccounts.map(a => a.id),
    transactionIds: transactions.filter(t => ringAccounts.some(a => a.id === t.senderId)).map(t => t.id),
  });

  // --- PATTERN 2: Account Takeover (location anomaly) ---
  const victimAccount = accounts[3];
  victimAccount.country = "US";
  victimAccount.city = "New York";
  victimAccount.risk_score = 60;
  victimAccount.income_bracket = "medium";
  victimAccount.avg_monthly_volume = 3000;

  const legitDevice = devices[3];
  legitDevice.country = "US";
  legitDevice.city = "New York";
  legitDevice.is_vpn = false;

  const suspiciousDevice = devices[4];
  suspiciousDevice.country = "NG";
  suspiciousDevice.city = "Lagos";
  suspiciousDevice.is_vpn = true;
  suspiciousDevice.is_emulator = true;

  accountDeviceMap.set(victimAccount.id, [legitDevice.id, suspiciousDevice.id]);

  for (let i = 0; i < 3; i++) {
    transactions.push({
      id: `TXN-${randomId()}`,
      amount: randomBetween(100, 500),
      currency: "USD",
      timestamp: randomDate(60),
      type: "payment",
      channel: "mobile",
      status: "completed",
      is_international: false,
      description: `Payment at ${randomFrom(normalMerchants).name}`,
      ip_address: legitDevice.ip_address,
      latitude: 40.71 + Math.random() * 0.05,
      longitude: -74.0 + Math.random() * 0.05,
      senderId: victimAccount.id,
      receiverId: randomFrom(accounts.slice(10)).id,
      merchantId: randomFrom(normalMerchants).id,
      deviceId: legitDevice.id,
    });
  }

  const atoTxns: string[] = [];
  for (let i = 0; i < 5; i++) {
    const txId = `TXN-${randomId()}`;
    atoTxns.push(txId);
    transactions.push({
      id: txId,
      amount: randomBetween(2000, 8000),
      currency: "USD",
      timestamp: randomDate(3),
      type: randomFrom(["withdrawal", "transfer", "payment"]),
      channel: "web",
      status: "completed",
      is_international: true,
      description: i < 3 ? `Transfer to ${randomFrom(cryptoMerchants).name}` : `Purchase at ${randomFrom(merchants).name}`,
      ip_address: suspiciousDevice.ip_address,
      latitude: 6.52 + Math.random() * 0.05,
      longitude: 3.37 + Math.random() * 0.05,
      senderId: victimAccount.id,
      receiverId: randomFrom(accounts.slice(15)).id,
      merchantId: i < 3 ? randomFrom(cryptoMerchants).id : randomFrom(merchants).id,
      deviceId: suspiciousDevice.id,
    });
  }

  alerts.push({
    id: `ALT-${randomId()}`,
    type: "geo_anomaly",
    severity: "high",
    timestamp: randomDate(3),
    description: `Account ${victimAccount.name} (${victimAccount.id}) suddenly transacting from Lagos, Nigeria via VPN+emulator. Previous activity exclusively from New York, US.`,
    auto_resolved: false,
    accountId: victimAccount.id,
    transactionId: atoTxns[0],
  });
  alerts.push({
    id: `ALT-${randomId()}`,
    type: "velocity",
    severity: "high",
    timestamp: randomDate(2),
    description: `Account ${victimAccount.name} monthly volume spiked to $${(atoTxns.length * 5000).toLocaleString()} vs avg $${victimAccount.avg_monthly_volume.toLocaleString()}`,
    auto_resolved: false,
    accountId: victimAccount.id,
    transactionId: atoTxns[1],
  });

  fraudCases.push({
    id: `CASE-${randomId()}`,
    severity: "high",
    status: "open",
    type: "account_takeover",
    description: `${victimAccount.name}'s account shows sudden activity from Lagos, Nigeria (normally New York). New device with VPN and emulator detected. High-value transfers to crypto exchanges.`,
    created_date: randomDate(3),
    resolved_date: null,
    assigned_to: "Agent Chen",
    total_loss: 25000,
    accountIds: [victimAccount.id],
    transactionIds: atoTxns,
  });

  // --- PATTERN 3: Synthetic Identity Fraud ---
  const synthAccounts = accounts.slice(4, 7);
  for (const acc of synthAccounts) {
    acc.created_date = randomDate(14);
    acc.kyc_verified = false;
    acc.risk_score = 55;
    acc.account_type = "personal";
    acc.income_bracket = "high";
    acc.avg_monthly_volume = 0;
  }

  for (const acc of synthAccounts) {
    const txId = `TXN-${randomId()}`;
    transactions.push({
      id: txId,
      amount: randomBetween(9500, 9999),
      currency: "USD",
      timestamp: randomDate(7),
      type: "payment",
      channel: "web",
      status: "completed",
      is_international: false,
      description: `Payment to ${shellMerchants[0]?.name || "ShellCorp Holdings"}`,
      ip_address: devices[5].ip_address,
      latitude: 40.71,
      longitude: -74.0,
      senderId: acc.id,
      receiverId: accounts[7].id,
      merchantId: shellMerchants[0]?.id || merchants[0].id,
      deviceId: devices[5].id,
    });
  }

  fraudCases.push({
    id: `CASE-${randomId()}`,
    severity: "high",
    status: "open",
    type: "synthetic_identity",
    description: `Multiple new accounts (${synthAccounts.map(a => a.name).join(", ")}) with no transaction history making large payments to ShellCorp Holdings. All unverified KYC, claim high income.`,
    created_date: randomDate(5),
    resolved_date: null,
    assigned_to: "Agent Williams",
    total_loss: 30000,
    accountIds: synthAccounts.map(a => a.id),
    transactionIds: [],
  });

  // --- PATTERN 4: Card Fraud (rapid small transactions then big one) ---
  const cardFraudAccount = accounts[7];
  cardFraudAccount.risk_score = 45;

  const rapidTxns: string[] = [];
  for (let i = 0; i < 8; i++) {
    const txId = `TXN-${randomId()}`;
    rapidTxns.push(txId);
    const timestamp = new Date();
    timestamp.setHours(timestamp.getHours() - 2);
    timestamp.setMinutes(timestamp.getMinutes() + i * 3);
    transactions.push({
      id: txId,
      amount: i < 6 ? randomBetween(1, 5) : randomBetween(3000, 7000),
      currency: "USD",
      timestamp: timestamp.toISOString().slice(0, 19).replace("T", " "),
      type: "payment",
      channel: "pos",
      status: i < 7 ? "completed" : "declined",
      is_international: false,
      description: i < 6 ? `Small test charge at ${randomFrom(normalMerchants).name}` : `Large purchase at ${randomFrom(merchants).name}`,
      ip_address: "0.0.0.0",
      latitude: 34.05 + Math.random() * 0.1,
      longitude: -118.24 + Math.random() * 0.1,
      senderId: cardFraudAccount.id,
      receiverId: randomFrom(accounts.slice(10)).id,
      merchantId: randomFrom(normalMerchants).id,
      deviceId: null,
    });
  }

  alerts.push({
    id: `ALT-${randomId()}`,
    type: "pattern_match",
    severity: "critical",
    timestamp: randomDate(1),
    description: `Card testing pattern detected on ${cardFraudAccount.name} (${cardFraudAccount.id}): 6 micro-transactions ($1-$5) followed by $5,000+ charge within 20 minutes.`,
    auto_resolved: false,
    accountId: cardFraudAccount.id,
    transactionId: rapidTxns[rapidTxns.length - 1],
  });

  fraudCases.push({
    id: `CASE-${randomId()}`,
    severity: "critical",
    status: "open",
    type: "card_fraud",
    description: `Card testing pattern on ${cardFraudAccount.name}: rapid micro-transactions followed by large purchase attempt. Classic stolen card validation technique.`,
    created_date: randomDate(1),
    resolved_date: null,
    assigned_to: "Unassigned",
    total_loss: 5000,
    accountIds: [cardFraudAccount.id],
    transactionIds: rapidTxns,
  });

  // --- Normal legitimate transactions for the remaining accounts ---
  for (const acc of accounts.slice(8)) {
    const numTxns = Math.floor(Math.random() * 8) + 2;
    for (let i = 0; i < numTxns; i++) {
      const merchant = randomFrom(normalMerchants);
      const devIds = accountDeviceMap.get(acc.id) || [];
      transactions.push({
        id: `TXN-${randomId()}`,
        amount: randomBetween(5, acc.avg_monthly_volume * 0.3),
        currency: "USD",
        timestamp: randomDate(90),
        type: randomFrom(["payment", "payment", "payment", "deposit"]),
        channel: randomFrom(["mobile", "web", "pos"]),
        status: "completed",
        is_international: false,
        description: `Payment at ${merchant.name}`,
        ip_address: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        latitude: 40 + Math.random() * 10,
        longitude: -80 + Math.random() * 40,
        senderId: acc.id,
        receiverId: randomFrom(accounts).id,
        merchantId: merchant.id,
        deviceId: devIds.length > 0 ? randomFrom(devIds) : null,
      });
    }
  }

  return { transactions, fraudCases, alerts };
}

export async function seedDatabase() {
  const graph = await getGraph();

  await graph.query("MATCH (n) DETACH DELETE n");

  const accounts = generateAccounts(30);
  const merchants = generateMerchants();
  const { devices, accountDeviceMap } = generateDevices(accounts, 20);
  const { transactions, fraudCases, alerts } = injectFraudPatterns(accounts, merchants, devices, accountDeviceMap);

  // Create accounts
  for (const a of accounts) {
    await graph.query(
      `CREATE (a:Account {
        id: $id, name: $name, email: $email, phone: $phone,
        account_type: $account_type, created_date: $created_date,
        kyc_verified: $kyc_verified, risk_score: $risk_score, status: $status,
        country: $country, city: $city, income_bracket: $income_bracket,
        avg_monthly_volume: $avg_monthly_volume
      })`,
      { params: { ...a, kyc_verified: a.kyc_verified ? 1 : 0 } }
    );
  }

  // Create merchants
  for (const m of merchants) {
    await graph.query(
      `CREATE (m:Merchant {
        id: $id, name: $name, category: $category, risk_level: $risk_level,
        country: $country, is_shell_company: $is_shell_company,
        registration_date: $registration_date, mcc_code: $mcc_code
      })`,
      { params: { ...m, is_shell_company: m.is_shell_company ? 1 : 0 } }
    );
  }

  // Create devices
  for (const d of devices) {
    await graph.query(
      `CREATE (d:Device {
        id: $id, fingerprint: $fingerprint, type: $type, os: $os, browser: $browser,
        ip_address: $ip_address, country: $country, city: $city,
        is_vpn: $is_vpn, is_emulator: $is_emulator,
        first_seen: $first_seen, last_seen: $last_seen
      })`,
      { params: { ...d, is_vpn: d.is_vpn ? 1 : 0, is_emulator: d.is_emulator ? 1 : 0 } }
    );
  }

  // Create Account -[:USES]-> Device relationships
  for (const [accountId, deviceIds] of accountDeviceMap) {
    for (const deviceId of deviceIds) {
      await graph.query(
        `MATCH (a:Account {id: $aid}), (d:Device {id: $did})
         MERGE (a)-[:USES]->(d)`,
        { params: { aid: accountId, did: deviceId } }
      );
    }
  }

  // Create transactions + relationships
  for (const t of transactions) {
    await graph.query(
      `CREATE (tx:Transaction {
        id: $id, amount: $amount, currency: $currency, timestamp: $timestamp,
        type: $type, channel: $channel, status: $status,
        is_international: $is_international, description: $description,
        ip_address: $ip_address, latitude: $latitude, longitude: $longitude
      })`,
      { params: {
        id: t.id, amount: t.amount, currency: t.currency, timestamp: t.timestamp,
        type: t.type, channel: t.channel, status: t.status,
        is_international: t.is_international ? 1 : 0, description: t.description,
        ip_address: t.ip_address, latitude: t.latitude, longitude: t.longitude,
      } }
    );

    await graph.query(
      `MATCH (a:Account {id: $aid}), (tx:Transaction {id: $tid})
       MERGE (a)-[:SENT]->(tx)`,
      { params: { aid: t.senderId, tid: t.id } }
    );

    await graph.query(
      `MATCH (tx:Transaction {id: $tid}), (a:Account {id: $aid})
       MERGE (tx)-[:RECEIVED_BY]->(a)`,
      { params: { tid: t.id, aid: t.receiverId } }
    );

    if (t.merchantId) {
      await graph.query(
        `MATCH (tx:Transaction {id: $tid}), (m:Merchant {id: $mid})
         MERGE (tx)-[:AT]->(m)`,
        { params: { tid: t.id, mid: t.merchantId } }
      );
    }

    if (t.deviceId) {
      await graph.query(
        `MATCH (d:Device {id: $did}), (tx:Transaction {id: $tid})
         MERGE (d)-[:USED_IN]->(tx)`,
        { params: { did: t.deviceId, tid: t.id } }
      );
    }
  }

  // Create fraud cases
  for (const fc of fraudCases) {
    await graph.query(
      `CREATE (f:FraudCase {
        id: $id, severity: $severity, status: $status, type: $type,
        description: $description, created_date: $created_date,
        assigned_to: $assigned_to, total_loss: $total_loss
      })`,
      { params: { id: fc.id, severity: fc.severity, status: fc.status, type: fc.type, description: fc.description, created_date: fc.created_date, assigned_to: fc.assigned_to, total_loss: fc.total_loss } }
    );

    for (const accId of fc.accountIds) {
      await graph.query(
        `MATCH (a:Account {id: $aid}), (f:FraudCase {id: $fid})
         MERGE (a)-[:FLAGGED_IN]->(f)`,
        { params: { aid: accId, fid: fc.id } }
      );
    }

    for (const txId of fc.transactionIds) {
      await graph.query(
        `MATCH (f:FraudCase {id: $fid}), (tx:Transaction {id: $tid})
         MERGE (f)-[:INVOLVES]->(tx)`,
        { params: { fid: fc.id, tid: txId } }
      );
    }
  }

  // Create alerts
  for (const alt of alerts) {
    await graph.query(
      `CREATE (al:Alert {
        id: $id, type: $type, severity: $severity, timestamp: $timestamp,
        description: $description, auto_resolved: $auto_resolved
      })`,
      { params: {
        id: alt.id, type: alt.type, severity: alt.severity, timestamp: alt.timestamp,
        description: alt.description, auto_resolved: alt.auto_resolved ? 1 : 0,
      } }
    );

    await graph.query(
      `MATCH (a:Account {id: $aid}), (al:Alert {id: $alid})
       MERGE (a)-[:HAS_ALERT]->(al)`,
      { params: { aid: alt.accountId, alid: alt.id } }
    );

    if (alt.transactionId) {
      await graph.query(
        `MATCH (al:Alert {id: $alid}), (tx:Transaction {id: $tid})
         MERGE (al)-[:TRIGGERED_BY]->(tx)`,
        { params: { alid: alt.id, tid: alt.transactionId } }
      );
    }
  }

  // Create inferred relationships: SHARES_DEVICE
  const deviceToAccounts = new Map<string, string[]>();
  for (const [accId, devIds] of accountDeviceMap) {
    for (const devId of devIds) {
      const list = deviceToAccounts.get(devId) || [];
      list.push(accId);
      deviceToAccounts.set(devId, list);
    }
  }
  for (const [, accIds] of deviceToAccounts) {
    if (accIds.length > 1) {
      for (let i = 0; i < accIds.length; i++) {
        for (let j = i + 1; j < accIds.length; j++) {
          await graph.query(
            `MATCH (a1:Account {id: $a1}), (a2:Account {id: $a2})
             MERGE (a1)-[:SHARES_DEVICE]->(a2)`,
            { params: { a1: accIds[i], a2: accIds[j] } }
          );
        }
      }
    }
  }

  // Create indexes for performance
  await graph.query("CREATE INDEX FOR (a:Account) ON (a.id)").catch(() => {});
  await graph.query("CREATE INDEX FOR (t:Transaction) ON (t.id)").catch(() => {});
  await graph.query("CREATE INDEX FOR (m:Merchant) ON (m.id)").catch(() => {});
  await graph.query("CREATE INDEX FOR (d:Device) ON (d.id)").catch(() => {});
  await graph.query("CREATE INDEX FOR (f:FraudCase) ON (f.id)").catch(() => {});
  await graph.query("CREATE INDEX FOR (al:Alert) ON (al.id)").catch(() => {});

  const nodeCount = await graph.query("MATCH (n) RETURN count(n) AS c");
  const edgeCount = await graph.query("MATCH ()-[r]->() RETURN count(r) AS c");

  return {
    nodes: (nodeCount.data?.[0] as Record<string, unknown>)?.c ?? 0,
    edges: (edgeCount.data?.[0] as Record<string, unknown>)?.c ?? 0,
    accounts: accounts.length,
    merchants: merchants.length,
    devices: devices.length,
    transactions: transactions.length,
    fraudCases: fraudCases.length,
    alerts: alerts.length,
  };
}
