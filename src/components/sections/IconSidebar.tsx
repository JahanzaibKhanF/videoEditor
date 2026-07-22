"use client";
import { IoTextOutline, GoFileMedia, GoSun, TbTransitionRight, FiLayers, CgTemplate } from "@/utils/icons";


const tabs = [
  { id: "media",       label: "Media",       icon: <GoFileMedia size={20} /> },
  { id: "text",        label: "Text",        icon: <IoTextOutline size={20} /> },
  { id: "effects",     label: "Effects",     icon: <GoSun size={20} /> },
  { id: "transitions", label: "Transitions", icon: <TbTransitionRight size={20} /> },
  { id: "layers",      label: "Layers",      icon: <FiLayers size={20} /> },
  { id: "templates",   label: "Templates",   icon: <CgTemplate size={20} /> },
];

interface Props { activeTab: string; onTabChange: (t: string) => void; }

export default function IconSidebar({ activeTab, onTabChange }: Props) {
  return (
    <div
      style={{ width: 72 }}
      className="flex-shrink-0 flex flex-col items-center py-3 gap-0.5 overflow-y-auto bg-studio-surface border-r border-studio-border"
    >
      {tabs.map(t => {
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            title={t.label}
            className={`
              flex flex-col items-center justify-center gap-1
              w-[58px] h-[54px] rounded-xl border-none cursor-pointer
              transition-colors duration-150 flex-shrink-0 relative
              ${active
                ? "bg-signal/10 text-signal"
                : "bg-transparent text-ink-faint hover:bg-studio-hover hover:text-ink-secondary"
              }
            `}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-[3px] bg-signal" />
            )}
            {t.icon}
            <span className="text-[9.5px] font-bold tracking-wide leading-none">
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
