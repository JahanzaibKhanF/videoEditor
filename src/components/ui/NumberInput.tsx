"use client";

/**
 * NumberInput — clean styled number input.
 * Replaces `<input type="number">` everywhere.
 */
interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  width?: number;
}

export default function NumberInput({ value, onChange, min, max, step = 1, suffix, width = 56 }: Props) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
        style={{
          width,
          padding: "4px 6px",
          paddingRight: suffix ? 20 : 6,
          borderRadius: 8,
          border: "1px solid",
          outline: "none",
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: "center",
          appearance: "textfield",
          MozAppearance: "textfield",
          WebkitAppearance: "none",
          background: "transparent",
        }}
        className="border-studio-border bg-studio-raised text-ink-primary focus:border-signal"
      />
      {suffix && (
        <span style={{
          position: "absolute", right: 6,
          fontSize: 10, fontWeight: 600, pointerEvents: "none",
        }}
          className="text-ink-muted dark:text-[rgba(255,255,255,.35)]">
          {suffix}
        </span>
      )}
    </div>
  );
}
