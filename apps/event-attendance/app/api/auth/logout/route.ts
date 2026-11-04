import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  response.cookies.set("event_admin_session", "", { path: "/", maxAge: 0 });
  response.cookies.set("super_admin_session", "", { path: "/", maxAge: 0 });
  response.cookies.set("usher_session", "", { path: "/", maxAge: 0 });
  return response;
}
