"use client";

import { useEffect } from "react";
import { IoLogoTiktok, IoPlayOutline, IoSquareOutline } from "react-icons/io5";
import { MdCropSquare } from "react-icons/md";
import { FaXTwitter } from "react-icons/fa6";
import { IoLogoInstagram, IoLogoYoutube } from "react-icons/io";
import { RiBracketsFill } from "react-icons/ri";
import { AspectRatio } from "../../types/types";
import { useAppDetailsContext } from "../../context/useAppContext";

const RATIOS: { key: AspectRatio; label: string; sub: string; icon: React.ReactNode; w: number; h: number }[] = [
  { key:"16:9",       label:"16:9",      sub:"YouTube / Landscape",  icon:<IoPlayOutline />,                                w:44, h:25 },
  { key:"9:16",       label:"9:16",      sub:"TikTok / Reels",       icon:<IoPlayOutline style={{transform:"rotate(90deg)"}} />, w:25, h:44 },
  { key:"1:1",        label:"1:1",       sub:"Square",               icon:<IoSquareOutline />,                               w:36, h:36 },
  { key:"4:5",        label:"4:5",       sub:"Instagram Portrait",   icon:<MdCropSquare />,                                 w:30, h:37 },
  { key:"3:4",        label:"3:4",       sub:"Camera Native",        icon:<MdCropSquare />,                                 w:28, h:37 },
  { key:"original",   label:"Original",  sub:"Keep source",          icon:<RiBracketsFill />,                               w:38, h:30 },
  { key:"ytshorts",   label:"YT Shorts", sub:"YouTube Shorts",       icon:<IoLogoYoutube />,                                w:25, h:44 },
  { key:"instareels", label:"Reels",     sub:"Instagram Reels",      icon:<IoLogoInstagram />,                              w:25, h:44 },
  { key:"tiktok",     label:"TikTok",    sub:"TikTok Videos",        icon:<IoLogoTiktok />,                                 w:25, h:44 },
  { key:"xfeeds",     label:"X Feeds",   sub:"Twitter / X",          icon:<FaXTwitter />,                                   w:44, h:33 },
];

export default function CompostionSettingsModal() {
  const { setIsCompostionSettingsOpen, selectedAspectRatio, setSelectedAspectRatio, containerDimenions, setClipsDetails, clipsDetails } = useAppDetailsContext();

  useEffect(() => {
    if (containerDimenions.width > 0 && containerDimenions.height > 0) {
      clipsDetails.forEach(clip => {
        const nx = containerDimenions.width / 2 - (clip.width * clip.scale) / 2;
        const ny = containerDimenions.height / 2 - (clip.height * clip.scale) / 2;
        setClipsDetails(prev => prev.map(c => c.id === clip.id ? { ...c, x: nx, y: ny, scale: 1 } : c));
      });
    }
  }, [selectedAspectRatio, containerDimenions]);

  return (
    <div className="fixed inset-0 z-[9000] bg-black/40 backdrop-blur-sm flex items-center justify-center"
      onClick={() => setIsCompostionSettingsOpen(false)}>
      <div className="bg-studio-surface border border-studio-border rounded-2xl shadow-2xl p-7 w-[560px] max-w-[95vw] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[16px] font-bold text-ink-primary">Composition Settings</div>
            <div className="text-[12px] text-ink-secondary mt-0.5">Change the canvas aspect ratio</div>
          </div>
          <button onClick={() => setIsCompostionSettingsOpen(false)}
            className="w-8 h-8 rounded-lg border border-studio-border bg-studio-raised flex items-center justify-center cursor-pointer text-ink-secondary hover:bg-studio-hover font-[inherit] text-[14px] transition-all">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-5 gap-2.5">
          {RATIOS.map(r => {
            const active = r.key === selectedAspectRatio;
            return (
              <div key={r.key}
                onClick={() => { setSelectedAspectRatio(r.key); setTimeout(() => setIsCompostionSettingsOpen(false), 80); }}
                className={`border-[2px] rounded-xl py-3 px-1.5 flex flex-col items-center gap-2 cursor-pointer transition-all
                  ${active
                    ? "border-signal bg-[rgba(91,79,232,.06)] dark:bg-[rgba(91,79,232,.15)] shadow-[0_0_0_3px_rgba(91,79,232,.12)]"
                    : "border-studio-border bg-studio-raised hover:border-signal hover:bg-studio-hover"}`}>
                <div style={{ width: r.w * .8, height: r.h * .8 }}
                  className={`border-[1.5px] rounded flex items-center justify-center text-[13px] flex-shrink-0
                    ${active
                      ? "border-signal bg-[rgba(91,79,232,.1)] dark:bg-[rgba(91,79,232,.2)] text-signal"
                      : "border-studio-borderLight bg-studio-surface text-ink-secondary"}`}>
                  {r.icon}
                </div>
                <div className="text-center">
                  <div className={`text-[11.5px] font-bold ${active ? "text-signal" : "text-ink-primary"}`}>{r.label}</div>
                  <div className="text-[9.5px] text-ink-secondary mt-0.5 leading-tight">{r.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
