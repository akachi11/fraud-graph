import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/seed-data";

export async function POST() {
  try {
    const stats = await seedDatabase();
    return NextResponse.json({ success: true, ...stats });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
