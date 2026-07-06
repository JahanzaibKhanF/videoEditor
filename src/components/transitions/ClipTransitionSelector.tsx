"use client";

import { useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { transitionOptions } from "../../utils/transitionOtionsConstants";
import { toast } from "react-toastify";

export default function ClipTransitionSelector() {
  const { selectedClipId, clipsDetails, setClipsDetails } = useAppDetailsContext();
  const selectedTransition = clipsDetails.find(c => c.id === selectedClipId)?.transition || "none";
  const handleTransitionChange = (key: string) => {
    setClipsDetails(prev => prev.map(c => c.id === selectedClipId ? { ...c, transition: key } : c));
  };
  const [search, setSearch] = useState("");
  const filtered = transitionOptions.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-3">
      <div className="text-[10.5px] font-bold uppercase tracking-[.7px] text-gray-700 dark:text-gray-400 mb-2.5">Clip Transition</div>
      <input value={search} onChange={e => setSearch(e.target.value)} type="text" placeholder="Search transitions…"
        className="w-full px-3 py-2 rounded-lg border border-studio-border bg-studio-raised text-ink-primary text-[12px] outline-none font-[inherit] focus:border-signal mb-3 placeholder:text-ink-muted dark:placeholder:text-[#4B5563]" />
      <div className="grid grid-cols-3 gap-2">
        {filtered.map(({ key, name, Icon }) => {
          const active = selectedTransition === key;
          return (
            <button key={key}
              onClick={() => {
                if (key !== "none" && clipsDetails.length === 0) { toast.error("Please add a clip to Timeline first."); return; }
                if (key !== "none" && clipsDetails.length > 1 && !selectedClipId) { toast.error("Please select a clip to apply transition."); return; }
                if (key !== "none" && clipsDetails.length === 1) { toast.error("At least 2 clips required."); return; }
                if (key !== "none" && clipsDetails && selectedClipId === clipsDetails[clipsDetails.length - 1].id) { toast.error("Last clip cannot have transition."); return; }
                handleTransitionChange(key);
              }}
              className={`border-[1.5px] rounded-lg py-2 px-1.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all gap-1 font-[inherit]
                ${active
                  ? "border-signal bg-[rgba(91,79,232,.1)] dark:bg-[rgba(91,79,232,.2)] text-signal"
                  : "border-studio-border bg-studio-raised text-ink-secondary hover:bg-studio-hover hover:border-signal/40"}`}>
              <Icon size={14} />
              <div className="text-[10px] font-medium">{name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
