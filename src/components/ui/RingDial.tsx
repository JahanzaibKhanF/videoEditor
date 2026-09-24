"use client";

/**
 * RingDial — a small click-to-cycle circular level control: Off → Low →
 * High (wrapping back to Off), the ring filling proportionally as the level
 * rises. Used by EnhancePanel for its three Resolution/Denoise/Color
 * controls — one ring each, same interaction, just different level labels.
 */
const SIZE = 56;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export default function RingDial({
  label, value, labels, onChange, disabled, accent = "#8B5CFF",
}: {
  label: string;
  value: 0 | 1 | 2;
  labels: [string, string, string];
  onChange: (v: 0 | 1 | 2) => void;
  disabled?: boolean;
  accent?: string;
}) {
  const fraction = value / 2;
  const offset = CIRC * (1 - fraction);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(((value + 1) % 3) as 0 | 1 | 2)}
      className="flex flex-col items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed group"
      title={`${label}: ${labels[value]} — click to change`}
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="rgb(var(--studio-border))" strokeWidth={STROKE} />
          {value > 0 && (
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none"
              stroke={accent} strokeWidth={STROKE} strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-200"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold text-ink-primary group-hover:scale-110 transition-transform" style={{ color: value > 0 ? accent : undefined }}>
            {labels[value]}
          </span>
        </div>
      </div>
      <span className="text-[10.5px] font-semibold text-ink-secondary">{label}</span>
    </button>
  );
}
