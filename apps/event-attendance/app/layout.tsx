import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "EventPass Pro | Instant Event Registration & Zero-Click Admission",
  description: "High-speed event registration, automated branded email ticketing with dynamic QR codes, and zero-click continuous camera check-in.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col selection:bg-indigo-500 selection:text-white">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
          <p>EventPass Pro &bull; Brand Activation &amp; Event Operations Monorepo</p>
        </footer>
      </body>
    </html>
  );
}
