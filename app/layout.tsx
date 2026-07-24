import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spin & Win",
  description: "Spin the wheel for a chance to win a prize.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
