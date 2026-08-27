import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reelcloner",
  description: "Recreate a reference UGC video with a swapped character or product.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
