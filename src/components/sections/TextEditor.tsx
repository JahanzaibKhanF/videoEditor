"use client";

import { FaBold, FaItalic, FaUnderline } from "@/utils/icons";
import { useEffect, useState, useRef } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import Slider from "../ui/Slider";

const fontFamilies = ["Arial","Verdana","Times New Roman","Georgia","Courier New","Trebuchet MS","Garamond","Lucida Console","Tahoma","Brush Script MT"];

const colors = [
  { value:"black",   cls:"bg-black" },
  { value:"white",   cls:"bg-white" },
  { value:"red",     cls:"bg-red-500" },
  { value:"green",   cls:"bg-green-500" },
  { value:"blue",    cls:"bg-blue-500" },
  { value:"yellow",  cls:"bg-yellow-400" },
  { value:"orange",  cls:"bg-orange-500" },
  { value:"purple",  cls:"bg-purple-500" },
  { value:"pink",    cls:"bg-pink-500" },
  { value:"teal",    cls:"bg-teal-500" },
  { value:"lime",    cls:"bg-lime-400" },
  { value:"cyan",    cls:"bg-cyan-400" },
  { value:"#ff6b81", cls:"bg-[#ff6b81]" },
  { value:"#38bdf8", cls:"bg-[#38bdf8]" },
  { value:"#554545", cls:"bg-[#554545]" },
  { value:"#ff9f43", cls:"bg-[#ff9f43]" },
  { value:"#1abc9c", cls:"bg-[#1abc9c]" },
  { value:"#8e44ad", cls:"bg-[#8e44ad]" },
  { value:"#c0392b", cls:"bg-[#c0392b]" },
  { value:"#2c3e50", cls:"bg-[#2c3e50]" },
  { value:"#27ae60", cls:"bg-[#27ae60]" },
];

const inputCls = "w-full text-center rounded-lg border border-studio-border bg-studio-surface text-ink-primary p-1.5 outline-none text-[12px] font-[inherit] focus:border-signal";

export default function TextEditor() {
  const { selectedTextId, setTextsDetails, textsDetails } = useAppDetailsContext();
  const [fontFamily, setFontFamily] = useState("Arial");
  const [textColor, setTextColor] = useState("black");
  const [backgroundColor, setBackgroundColor] = useState("transparent");
  const [shadowColor, setShadowColor] = useState("transparent");
  const [shadowBlur, setShadowBlur] = useState(0);
  const [shadowOffsetX, setShadowOffsetX] = useState(0);
  const [shadowOffsetY, setShadowOffsetY] = useState(0);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [fontSize, setFontSize] = useState(16);
  const [lineHeight, setLineHeight] = useState(1);
  const [colorMode, setColorMode] = useState<"text" | "background" | "shadow">("text");
  const isUpdating = useRef(false);

  useEffect(() => {
    if (selectedTextId) {
      const t = textsDetails.find(t => t.id === selectedTextId);
      if (t) {
        isUpdating.current = true;
        setFontFamily(t.fontFamily); setTextColor(t.textColor); setBackgroundColor(t.backgroundColor || "transparent");
        setShadowColor(t.shadowColor || "transparent"); setShadowBlur(t.shadowBlur); setShadowOffsetX(t.shadowOffsetX);
        setShadowOffsetY(t.shadowOffsetY); setIsBold(t.isBold); setIsItalic(t.isItalic); setIsUnderline(t.isUnderline);
        setOpacity(t.opacity); setFontSize(Math.trunc(t.fontSize)); setLineHeight(t.lineHeight);
        setTimeout(() => { isUpdating.current = false; }, 0);
      }
    }
  }, [selectedTextId]);

  useEffect(() => {
    if (!selectedTextId || isUpdating.current) return;
    setTextsDetails(prev => prev.map(t => t.id === selectedTextId ? { ...t, fontFamily, textColor, backgroundColor, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, isBold, isItalic, isUnderline, opacity, fontSize, lineHeight } : t));
  }, [fontFamily, textColor, backgroundColor, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, isBold, isItalic, isUnderline, opacity, fontSize, lineHeight]);

  const sectionLabel = "text-[10.5px] font-bold uppercase tracking-[.7px] text-ink-secondary mb-2.5";
  const divider = "h-px bg-[#211F33] dark:bg-[rgba(255,255,255,.07)] my-3";

  return (
    <div className="bg-studio-raised border border-studio-border rounded-xl p-3.5">
      <div className={sectionLabel}>Text Style</div>

      {/* Font size + line height */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] text-ink-secondary font-medium">Font Size</span>
          <input type="number" min={1} value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] text-ink-secondary font-medium">Line Height</span>
          <input type="number" min={1} value={lineHeight} onChange={e => setLineHeight(parseInt(e.target.value))} className={inputCls} />
        </label>
      </div>

      {/* Opacity */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11.5px] text-ink-secondary font-medium min-w-[48px]">Opacity</span>
        <div className="flex-1"><Slider min={0} max={1} step={0.01} value={opacity} onChange={setOpacity} /></div>
        <input type="number" step={0.01} min={0} max={1} value={opacity} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0 && v <= 1) setOpacity(v); }}
          className="w-14 text-center rounded-lg border border-studio-border bg-studio-surface text-ink-primary p-1 outline-none text-[11px] font-mono" />
      </div>

      {/* Font */}
      <div className="mb-3">
        <span className="text-[11.5px] text-ink-secondary font-medium block mb-1">Font Family</span>
        <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}
          className="w-full rounded-lg border border-studio-border bg-studio-surface text-ink-primary p-1.5 text-[12px] outline-none font-[inherit] focus:border-signal cursor-pointer">
          {fontFamilies.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* B/I/U */}
      <div className="mb-3">
        <span className="text-[11.5px] text-ink-secondary font-medium block mb-2">Style</span>
        <div className="flex gap-1.5">
          {[{ Icon: FaBold, s: isBold, set: setIsBold }, { Icon: FaItalic, s: isItalic, set: setIsItalic }, { Icon: FaUnderline, s: isUnderline, set: setIsUnderline }].map(({ Icon, s, set }, i) => (
            <div key={i} onClick={() => set(!s)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all border-[1.5px]
                ${s
                  ? "border-signal bg-[rgba(139,92,255,.1)] dark:bg-[rgba(139,92,255,.2)] text-signal"
                  : "border-studio-border bg-studio-surface text-ink-secondary hover:border-signal hover:text-signal"}`}>
              <Icon size={11} />
            </div>
          ))}
        </div>
      </div>

      <div className={divider} />

      {/* Color mode */}
      <div className="flex gap-4 border-b border-studio-border mb-3">
        {(["text", "background", "shadow"] as const).map(m => (
          <button key={m} onClick={() => setColorMode(m)}
            className={`text-[11.5px] font-semibold pb-1.5 border-none bg-transparent cursor-pointer font-[inherit] border-b-2 transition-all
              ${colorMode === m ? "text-signal border-signal" : "text-ink-secondary border-transparent"}`}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Color swatches */}
      {(colorMode === "text" || colorMode === "background") && (
        <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-studio-surface border border-studio-border">
          {colorMode === "background" && (
            <div onClick={() => setBackgroundColor("transparent")}
              className={`w-[22px] h-[22px] rounded-[5px] cursor-pointer relative overflow-hidden border-[1.5px] bg-studio-raised
                ${backgroundColor === "transparent" ? "border-signal shadow-[0_0_0_2px_rgba(139,92,255,.2)]" : "border-[#211F33] dark:border-[#3d4758]"}`}>
              <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-red-500 rotate-[-35deg]" />
            </div>
          )}
          {colors.map(c => {
            const sel = colorMode === "text" ? c.value === textColor : c.value === backgroundColor;
            return (
              <div key={c.value} className={`${c.cls} w-[22px] h-[22px] rounded-[5px] cursor-pointer transition-all border-[1.5px]
                ${sel ? "border-signal shadow-[0_0_0_2px_rgba(139,92,255,.2)]" : (c.value === "black" || c.value === "white") ? "border-[#211F33] dark:border-[#3d4758]" : "border-transparent"}
                hover:scale-110`}
                onClick={() => colorMode === "text" ? setTextColor(c.value) : setBackgroundColor(c.value)} />
            );
          })}
        </div>
      )}

      {colorMode === "shadow" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-studio-surface border border-studio-border">
            <div onClick={() => setShadowColor("transparent")}
              className={`w-[22px] h-[22px] rounded-[5px] cursor-pointer relative overflow-hidden border-[1.5px] bg-studio-raised
                ${shadowColor === "transparent" ? "border-signal" : "border-[#211F33] dark:border-[#3d4758]"}`}>
              <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-red-500 rotate-[-35deg]" />
            </div>
            {colors.map(c => (
              <div key={c.value} className={`${c.cls} w-[22px] h-[22px] rounded-[5px] cursor-pointer transition-all border-[1.5px] hover:scale-110
                ${c.value === shadowColor ? "border-signal shadow-[0_0_0_2px_rgba(139,92,255,.2)]" : (c.value === "black" || c.value === "white") ? "border-[#211F33] dark:border-[#3d4758]" : "border-transparent"}`}
                onClick={() => setShadowColor(c.value)} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[{ label: "Blur", val: shadowBlur, set: setShadowBlur }, { label: "Offset X", val: shadowOffsetX, set: setShadowOffsetX }, { label: "Offset Y", val: shadowOffsetY, set: setShadowOffsetY }].map(({ label, val, set }) => (
              <label key={label} className="flex flex-col gap-1">
                <span className="text-[11px] text-ink-secondary">{label}</span>
                <input type="number" value={val} onChange={e => set(parseInt(e.target.value))} className={inputCls} />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
