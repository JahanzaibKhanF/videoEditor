"use client";

/**
 * CompostionSettingsModal — read-only composition info.
 *
 * Aspect ratio is a one-time decision made on the startup screen, not
 * something you flip mid-edit (that used to live here as an interactive
 * ratio grid). The one exception is "Original", which isn't a fixed ratio
 * at all — it continuously re-derives from whatever video is primary right
 * now (see Screen.tsx), so it already "changes" on its own without any
 * control needed here.
 */
import { X, Info } from "@/utils/icons";
import { useAppDetailsContext } from "../../context/useAppContext";

const RATIO_LABELS: Record<string, string> = {
  "original": "Original (matches source video)",
  "16:9": "16:9 — YouTube / Landscape",
  "9:16": "9:16 — TikTok / Reels",
  "1:1": "1:1 — Square",
  "4:5": "4:5 — Instagram Portrait",
  "3:4": "3:4 — Camera Native",
  "ytshorts": "YouTube Shorts",
  "instareels": "Instagram Reels",
  "tiktok": "TikTok",
  "xfeeds": "X (Twitter) Feed",
};

export default function CompostionSettingsModal() {
  const { setIsCompostionSettingsOpen, selectedAspectRatio, containerDimenions, fps } = useAppDetailsContext();

  return (
    <div className="fixed inset-0 z-[9000] bg-black/40 backdrop-blur-sm flex items-center justify-center"
      onClick={() => setIsCompostionSettingsOpen(false)}>
      <div className="bg-studio-surface border border-studio-border rounded-2xl shadow-2xl p-7 w-[420px] max-w-[95vw]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[16px] font-bold text-ink-primary">Composition</div>
            <div className="text-[12px] text-ink-secondary mt-0.5">Project settings for this composition</div>
          </div>
          <button onClick={() => setIsCompostionSettingsOpen(false)}
            className="w-8 h-8 rounded-lg border border-studio-border bg-studio-raised flex items-center justify-center cursor-pointer text-ink-secondary hover:bg-studio-hover transition-all">
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <InfoRow label="Aspect ratio" value={RATIO_LABELS[selectedAspectRatio] ?? selectedAspectRatio} />
          <InfoRow label="Resolution" value={`${containerDimenions.width || 0} × ${containerDimenions.height || 0}px`} />
          {fps != null && <InfoRow label="Frame rate" value={`${fps.toFixed(2)} fps`} />}
        </div>

        <div className="flex items-start gap-2 mt-5 px-3 py-2.5 rounded-lg bg-signal/8 border border-signal/20">
          <Info size={13} className="text-signal flex-shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-ink-secondary leading-snug">
            Aspect ratio is set when a project is created and can't be changed here — start a new
            project to use a different ratio. If this project uses "Original", it already adapts
            automatically to whatever video you set as primary.
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-studio-base">
      <span className="text-[12px] text-ink-muted">{label}</span>
      <span className="text-[12.5px] font-semibold text-ink-primary font-mono">{value}</span>
    </div>
  );
}
