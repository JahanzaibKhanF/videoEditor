"use client";

/**
 * TemplateLoaderBadge — shown instead of the generic spinner while a
 * template's clips are buffering/seeking. Templates juggle several video
 * sources at once (one per slot) plus speed ramps that seek much more
 * often than a normal clip, so buffering pauses happen more visibly here
 * than in a regular single-clip edit — worth a loader with a bit more
 * personality than "spinner + Loading…".
 */
export default function TemplateLoaderBadge({ color = "#8B5CFF" }: { color?: string }) {
  return (
    <div
      className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl"
      style={{ background: "rgba(10,10,19,.78)", backdropFilter: "blur(8px)", border: `1px solid ${color}30` }}
    >
      <div className="relative w-14 h-14">
        {/* Three dots orbiting at staggered phase, each a shade of the template's own accent color */}
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="absolute w-2.5 h-2.5 rounded-full"
            style={{
              background: color,
              top: "50%", left: "50%",
              marginTop: -5, marginLeft: -5,
              animation: `tplOrbit 1.1s cubic-bezier(.5,0,.5,1) infinite`,
              animationDelay: `${i * 0.14}s`,
              opacity: 0.9 - i * 0.22,
            }}
          />
        ))}
        {/* Sparkle center */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
          style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: "tplPulse 1.1s ease-in-out infinite" }}>
          <path d="M10 1l1.8 5.7L17.5 8.5 11.8 10.3 10 16l-1.8-5.7L2.5 8.5l5.7-1.8L10 1z" fill={color} />
        </svg>
      </div>
      <span className="text-[11px] font-bold tracking-wide" style={{ color: `${color}` }}>
        Assembling your template…
      </span>
      <style>{`
        @keyframes tplOrbit {
          0%   { transform: rotate(0deg) translateX(20px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(20px) rotate(-360deg); }
        }
        @keyframes tplPulse {
          0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 1; }
          50%      { transform: translate(-50%,-50%) scale(1.25); opacity: .7; }
        }
      `}</style>
    </div>
  );
}
