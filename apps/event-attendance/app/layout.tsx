import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Passflow | Event Registration & Passes",
  description: "Fast-track event registration, automated branded email ticketing with dynamic QR codes, and zero-click admission.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900 min-h-screen flex flex-col selection:bg-blue-600 selection:text-white">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-100 bg-white py-6 text-center text-xs text-slate-400">
          <p>&copy; {new Date().getFullYear()} Passflow &bull; Event Attendance &amp; Operations</p>
        </footer>
      </body>
    </html>
  );
}
