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
        // Studio surfaces — cool graphite, not pure black
        studio: {
          void: "#0B0D10",      // app canvas / outer background
          base: "#0F1216",      // main workspace background
          surface: "#14171C",   // panels
          raised: "#1C2027",    // elevated cards, dropdowns, modals
          hover: "#242830",     // hover states on raised surfaces
          border: "#262B33",    // hairline borders
          borderLight: "#323844",
        },
        // Text
        ink: {
          primary: "#EDEFF2",
          secondary: "#B4BAC4",
          muted: "#8A919E",
          faint: "#5B6270",
        },
        // Signal accent — warm tally-light orange, used sparingly for primary actions
        signal: {
          DEFAULT: "#FF6A3D",
          hover: "#FF8259",
          dim: "#3A2118",
          50: "#FFF1EC",
        },
        // Secondary accent — cool cyan for playhead / selection / scrub states
        scrub: {
          DEFAULT: "#4FD1C5",
          hover: "#6EE0D5",
          dim: "#12302E",
        },
        // Semantic
        danger: "#FF5C5C",
        success: "#3DD68C",
        warning: "#F5B94D",
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
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        pop: "0 12px 40px -8px rgba(0,0,0,0.65)",
        glow: "0 0 0 1px rgba(255,106,61,0.4), 0 0 24px -4px rgba(255,106,61,0.5)",
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
      },
      animation: {
        "tally-pulse": "tally-pulse 1.4s ease-in-out infinite",
        "fade-in": "fade-in 0.18s ease-out",
        "scan-line": "scan-line 1.8s linear infinite",
      },
    },
  },
  plugins: [],
};
