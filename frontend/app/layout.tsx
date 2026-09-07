import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { serverRuntimeConfig } from "@/lib/runtime";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TradeOps Command Center",
  description: "Trading observability, rejection intelligence and RCA"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Serialised per request so one image can serve every environment. Without this
  // the browser would fall back to the API URL baked in at `next build` time.
  const config = serverRuntimeConfig();
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__TRADEOPS_CONFIG__=${JSON.stringify(config).replace(/</g, "\\u003c")}`,
          }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
