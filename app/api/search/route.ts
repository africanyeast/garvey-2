import { NextRequest, NextResponse } from "next/server";
import { searchVault } from "@/lib/search";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results = await searchVault(q);
  return NextResponse.json(results);
}
