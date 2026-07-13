/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Studio surfaces — near-black ink violet, deliberately cooler & darker
        // than the previous graphite palette (new "Aperture" identity, v2)
        studio: {
          void: "#07070C",       // app canvas / outer background
          base: "#0A0A13",       // main workspace background
          surface: "#111120",    // panels
          raised: "#171728",     // elevated cards, dropdowns, modals
          hover: "#1F1F35",      // hover states on raised surfaces
          border: "#211F33",     // hairline borders
          borderLight: "#35334F",
        },
        // Text
        ink: {
          primary: "#F3F1FA",
          secondary: "#B8B4D1",
          muted: "#89859F",
          faint: "#524E68",
        },
        // Signal accent — electric violet, the new primary action color
        signal: {
          DEFAULT: "#8B5CFF",
          hover: "#A47CFF",
          dim: "#241A47",
          50: "#F2EDFF",
        },
        // Secondary accent — warm amber for playhead / selection / scrub states
        scrub: {
          DEFAULT: "#FFB648",
          hover: "#FFC670",
          dim: "#3A2B10",
        },
        // Semantic
        danger: "#FF4F70",
        success: "#33D8A0",
        warning: "#FFC24B",
      },
      fontFamily: {
        display: ["var(--font-display)", "Space Grotesk", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        xl: "0.625rem",
        "2xl": "0.875rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -14px rgba(0,0,0,0.75)",
        pop: "0 16px 48px -10px rgba(0,0,0,0.75)",
        glow: "0 0 0 1px rgba(139,92,255,0.45), 0 0 28px -4px rgba(139,92,255,0.55)",
        "glow-amber": "0 0 0 1px rgba(255,182,72,0.4), 0 0 24px -6px rgba(255,182,72,0.5)",
        ring: "0 0 0 1px rgba(255,255,255,0.06)",
      },
      backgroundImage: {
        grain: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")",
        "aperture-radial": "radial-gradient(120% 120% at 50% -10%, rgba(139,92,255,0.10) 0%, rgba(7,7,12,0) 55%)",
      },
      keyframes: {
        "tally-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scan-line": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "tally-pulse": "tally-pulse 1.4s ease-in-out infinite",
        "fade-in": "fade-in 0.18s ease-out",
        "scan-line": "scan-line 1.8s linear infinite",
        "rise-in": "rise-in 0.22s cubic-bezier(0.16,1,0.3,1)",
      },
    },
  },
  plugins: [],
};
