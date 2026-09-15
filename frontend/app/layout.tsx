import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./market-monitor.css";
import { serverRuntimeConfig } from "@/lib/runtime";

// Argus design-system typefaces, self-hosted from app/fonts/ (latin subset).
//
// Deliberately next/font/local rather than next/font/google: the Google loader
// downloads the woff2 files at build time, and behind a proxy that fetch wedges
// with no error and no timeout — `next build` sat at "Creating an optimized
// production build" indefinitely. Self-hosting makes the build hermetic, and it
// also gives design-sync a real @font-face to ship (it was reporting
// [FONT_MISSING] for the brand family).
//
// IBM Plex Sans is a variable font: one file covers the whole 400-700 range,
// which is why it is declared as a range rather than four static weights.
const body = localFont({
  src: [{ path: "./fonts/IBMPlexSans-var.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-body",
  display: "swap",
});
const display = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
});
const mono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono-face",
  display: "swap",
});

// Runtime config must also remain request-time on otherwise static public pages.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Argus TradeOps",
  description: "Trading observability, rejection intelligence and RCA"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Serialised per request so one image can serve every environment. Without this
  // the browser would fall back to the API URL baked in at `next build` time.
  const config = serverRuntimeConfig();
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${mono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__TRADEOPS_CONFIG__=${JSON.stringify(config).replace(/</g, "\\u003c")}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
