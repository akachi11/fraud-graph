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

export async function getGraph() {
  const database = await getDB();
  return database.selectGraph("fraud");
}
