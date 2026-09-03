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
        // Studio surfaces & ink now resolve through CSS variables (defined
        // in globals.css for :root/.light) so the light/dark toggle can
        // flip every component using these tokens app-wide, without
        // touching each component individually. The `rgb(var(...) /
        // <alpha-value>)` form is required for opacity modifiers like
        // `bg-studio-raised/50` to keep working with CSS-variable colors.
        studio: {
          void: "rgb(var(--studio-void) / <alpha-value>)",
          base: "rgb(var(--studio-base) / <alpha-value>)",
          surface: "rgb(var(--studio-surface) / <alpha-value>)",
          raised: "rgb(var(--studio-raised) / <alpha-value>)",
          hover: "rgb(var(--studio-hover) / <alpha-value>)",
          border: "rgb(var(--studio-border) / <alpha-value>)",
          borderLight: "rgb(var(--studio-border-light) / <alpha-value>)",
        },
        ink: {
          primary: "rgb(var(--ink-primary) / <alpha-value>)",
          secondary: "rgb(var(--ink-secondary) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
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
        // ── UI type scale ─────────────────────────────────────────────
        // The editor chrome lives between 9px and 13px. Before this every
        // size was an arbitrary `text-[10.5px]` bracket value written
        // inline; these named steps are what the shared primitives use so
        // the same element is the same size everywhere.
        micro: ["0.5625rem", { lineHeight: "0.75rem" }],   //  9px  — badges, tick labels
        "3xs": ["0.625rem", { lineHeight: "0.875rem" }],   // 10px  — SectionLabel caption
        mini: ["0.65625rem", { lineHeight: "0.875rem" }],  // 10.5px — value read-outs, dense meta
        meta: ["0.6875rem", { lineHeight: "1rem" }],       // 11px  — hints, panel subtitles
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],      // 11px  — control labels (legacy alias)
        label: ["0.71875rem", { lineHeight: "1rem" }],     // 11.5px — field labels, row titles
        title: ["0.8125rem", { lineHeight: "1.1rem" }],    // 13px  — panel titles
      },
      borderRadius: {
        // md 6 / lg 8 / xl 10 / 2xl 14 / 3xl 24 — the only radii the UI
        // should use. Arbitrary `rounded-[9px]` / `rounded-[5px]` values
        // scattered through components should collapse onto these.
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
