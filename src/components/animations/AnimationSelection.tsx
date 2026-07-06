"use client";

import { useState } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import { animationOptions } from "../../utils/animationOptionsConstants";

export default function AnimationSelection() {
  const { selectedImageID, selectedTextId, imagesDetails, textsDetails, setImagesDetails, setTextsDetails } = useAppDetailsContext();
  // Determine which category based on what's selected
  const showAnimationOptionsFor = selectedImageID ? "image" : "text";
  const selectedAnimation = showAnimationOptionsFor === "image"
    ? imagesDetails.find(img => img.id === selectedImageID)?.animation
    : textsDetails.find(txt => txt.id === selectedTextId)?.animation;
  const isObjectSelected = selectedImageID !== null || selectedTextId !== null;
  const handleAnimationChange = (key: string) => {
    if (showAnimationOptionsFor === "image") setImagesDetails(prev => prev.map(img => img.id === selectedImageID ? { ...img, animation: key } : img));
    else setTextsDetails(prev => prev.map(txt => txt.id === selectedTextId ? { ...txt, animation: key } : txt));
  };
  const [search, setSearch] = useState("");
  const filtered = animationOptions.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-[.7px] text-gray-700 dark:text-gray-400 mb-2.5 capitalize">
        {showAnimationOptionsFor} Animations
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} type="text" placeholder="Search animations…"
        className="w-full px-3 py-2 rounded-lg border border-studio-border bg-studio-raised text-ink-primary text-[12px] outline-none font-[inherit] focus:border-signal mb-3 placeholder:text-ink-muted dark:placeholder:text-[#4B5563]" />
      <div className="grid grid-cols-3 gap-2">
        {filtered.map(anim => {
          const active = selectedAnimation === anim.key;
          const Icon = anim.Icon;
          return (
            <div key={anim.key}
              onClick={() => {
                if (textsDetails.length === 0 && imagesDetails.length === 0) { console.warn("Please add Text or Image first."); return; }
                if (!isObjectSelected) { console.warn("Please select an Image or Text first."); return; }
                handleAnimationChange(anim.key);
              }}
              className={`border-[1.5px] rounded-lg py-2 px-1.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all gap-1
                ${active
                  ? "border-signal bg-[rgba(91,79,232,.1)] dark:bg-[rgba(91,79,232,.2)] text-signal"
                  : "border-studio-border bg-studio-raised text-ink-secondary hover:bg-studio-hover hover:border-signal/40"}`}>
              {Icon && <Icon size={14} />}
              <div className="text-[10px] font-medium">{anim.name}</div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div className="mt-4 text-center text-gray-700 dark:text-gray-400 text-[12px] italic">No animations found.</div>}
    </div>
  );
}
