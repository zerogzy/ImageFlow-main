import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    remotePatterns: process.env.NEXT_PUBLIC_REMOTE_PATTERNS || "",
  });
}
