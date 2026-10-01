import { NextRequest, NextResponse } from "next/server";
import { linkPreview } from "@/lib/links/preview";

/** A link attachment's card data: `?url=<http(s) url>`. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ error: "only http(s) links have previews" }, { status: 400 });
  }
  return NextResponse.json(await linkPreview(url.href), {
    headers: { "Cache-Control": "private, max-age=86400" },
  });
}
