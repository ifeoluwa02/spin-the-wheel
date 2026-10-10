import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Field Check-In & Operations | Brand Ambassador Attendance",
  description: "Geofenced Brand Ambassador Check-In, Shift Tracking & Field Ops Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#080E1A] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
