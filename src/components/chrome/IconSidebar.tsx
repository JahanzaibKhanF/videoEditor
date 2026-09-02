"use client";
import { IoTextOutline, GoFileMedia, GoSun, TbTransitionRight, FiLayers, CgTemplate, Clock, Scissors } from "@/utils/icons";


const tabs = [
  { id: "media",       label: "Media",       icon: <GoFileMedia size={20} /> },
  { id: "text",        label: "Text",        icon: <IoTextOutline size={20} /> },
  { id: "effects",     label: "Effects",     icon: <GoSun size={20} /> },
  { id: "bgremove",    label: "BG Remove",   icon: <Scissors size={20} />, badge: "AI" },
  { id: "transitions", label: "Transitions", icon: <TbTransitionRight size={20} /> },
  { id: "layers",      label: "Layers",      icon: <FiLayers size={20} /> },
  { id: "templates",   label: "Templates",   icon: <CgTemplate size={20} /> },
  { id: "recent",      label: "Recent",      icon: <Clock size={20} /> },
];

interface Props { activeTab: string; onTabChange: (t: string) => void; }

export default function IconSidebar({ activeTab, onTabChange }: Props) {
  return (
    <div
      style={{ width: 72 }}
      className="flex-shrink-0 flex flex-col items-center py-2.5 gap-1 overflow-y-auto scrollbar-thin bg-studio-surface border-r border-studio-border"
    >
      {tabs.map(t => {
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            title={t.label}
            aria-pressed={active}
            className={`
              group flex flex-col items-center justify-center gap-1
              w-[58px] h-[54px] rounded-xl border cursor-pointer
              transition-[background,color,border-color,transform] duration-150 flex-shrink-0 relative
              active:scale-95
              ${active
                ? "bg-signal/12 text-signal border-signal/25"
                : "bg-transparent text-ink-muted border-transparent hover:bg-studio-hover hover:text-ink-primary"
              }
            `}
          >
            <span
              className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-signal transition-all duration-200 ${
                active ? "h-6 opacity-100" : "h-2 opacity-0 group-hover:opacity-40"
              }`}
            />
            <span className="relative">
              {t.icon}
              {"badge" in t && t.badge && (
                <span className="absolute -top-1.5 -right-2.5 text-[6.5px] font-black bg-signal text-white rounded-full px-1 py-px leading-tight">
                  {t.badge}
                </span>
              )}
            </span>
            <span className="text-[9.5px] font-bold tracking-wide leading-none">
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
