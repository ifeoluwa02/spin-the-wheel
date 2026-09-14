import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true, message: "Logged out." });
  response.cookies.set("campaign_session", "", { path: "/", maxAge: 0 });
  response.cookies.set("super_admin_session", "", { path: "/", maxAge: 0 });
  return response;
}
