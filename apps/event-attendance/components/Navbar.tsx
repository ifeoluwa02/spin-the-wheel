"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ticket, ScanLine, ShieldCheck } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Register Pass", icon: Ticket },
    { href: "/scan", label: "Gate Scanner", icon: ScanLine, highlight: true },
    { href: "/admin", label: "Attendees & Admin", icon: ShieldCheck },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo in Zedda Geometric Style */}
        <Link href="/" className="flex items-center space-x-2.5 group">
          <div className="flex items-center space-x-1">
            <span className="w-2 h-7 bg-blue-600 rounded-sm transform -skew-x-12 group-hover:scale-105 transition-transform" />
            <span className="w-2 h-7 bg-sky-400 rounded-sm transform -skew-x-12 group-hover:scale-105 transition-transform" />
          </div>
          <span className="text-xl font-black tracking-tight text-slate-900">
            Passflow
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));

            if (link.highlight) {
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100/80"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            }

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-100 text-slate-900 font-semibold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4 text-slate-500" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
