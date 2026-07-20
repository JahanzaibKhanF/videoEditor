import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export const metadata: Metadata = {
  title: "ClipFlow — Browser-Based Video Editor",
  description:
    "Edit, layer, and export video entirely in your browser. No uploads, no cloud rendering — powered by WebAssembly.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#07070C",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Applies the saved theme before paint, avoiding a flash of the
            wrong theme — this runs before React hydrates, which is why
            it's a plain inline script rather than part of useTheme.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("clipflow-theme");if(t==="light"){document.documentElement.classList.add("light");document.documentElement.classList.remove("dark");}}catch(e){}`,
          }}
        />
        {/* Self-hosted at build time on Netlify (full network access there).
            Falls back to system-ui in this sandboxed preview build. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Anton&family=Bebas+Neue&family=Oswald:wght@400;600;700&family=Permanent+Marker&family=Caveat:wght@500;700&family=Archivo+Black&family=Righteous&family=Bangers&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ToastContainer
          position="bottom-right"
          theme="dark"
          toastClassName="!bg-studio-raised !text-ink-primary !border !border-studio-border !rounded-xl !shadow-pop"
          autoClose={3500}
        />
      </body>
    </html>
  );
}
