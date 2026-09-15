"use client";

import { FaBold, FaItalic, FaUnderline } from "@/utils/icons";
import { useEffect, useState, useRef } from "react";
import { useAppDetailsContext } from "../../context/useAppContext";
import Slider from "../ui/Slider";
import InspectorCard from "../ui/InspectorCard";
import SectionLabel from "../ui/SectionLabel";
import Segmented from "../ui/Segmented";
import { Type as TypeIcon } from "@/utils/icons";
import { measureWrappedTextHeight } from "../../utils/measureText";

const fontFamilies = [
  "Arial", "Verdana", "Times New Roman", "Georgia", "Courier New", "Trebuchet MS",
  "Garamond", "Lucida Console", "Tahoma", "Brush Script MT",
  // Display/cinematic/TikTok-style — loaded via Google Fonts in app/layout.tsx
  "Anton", "Bebas Neue", "Oswald", "Permanent Marker", "Caveat", "Archivo Black", "Righteous", "Bangers",
];

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

const inputCls = "w-full text-center rounded-lg border border-studio-border bg-studio-surface text-ink-primary py-1 px-2 outline-none text-[11.5px] font-[inherit] focus:border-signal";

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
  const [fillMode, setFillMode] = useState<"solid" | "gradient">("solid");
  const [gradientColorStart, setGradientColorStart] = useState("#8b5cff");
  const [gradientColorEnd, setGradientColorEnd] = useState("#ff6b81");
  const [gradientAngle, setGradientAngle] = useState(0);
  const [strokeColor, setStrokeColor] = useState("transparent");
  const [strokeWidth, setStrokeWidth] = useState(0);
  const [curve, setCurve] = useState(0);
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
        setFillMode(t.fillMode ?? "solid");
        setGradientColorStart(t.gradientColorStart ?? "#8b5cff"); setGradientColorEnd(t.gradientColorEnd ?? "#ff6b81");
        setGradientAngle(t.gradientAngle ?? 0);
        setStrokeColor(t.strokeColor ?? "transparent"); setStrokeWidth(t.strokeWidth ?? 0);
        setCurve(t.curve ?? 0);
        setTimeout(() => { isUpdating.current = false; }, 0);
      }
    }
  }, [selectedTextId]);

  // fontSize/lineHeight can also change from the CANVAS (dragging a resize
  // handle bakes the new size straight into the text), independently of
  // this panel. Without resyncing here, that change left this panel's local
  // copies stale, and the next edit made in this panel (e.g. dragging Curve
  // or Gradient Angle) would push the stale values back and visually snap
  // the text back down to its pre-resize size.
  useEffect(() => {
    if (!selectedTextId || isUpdating.current) return;
    const t = textsDetails.find(t => t.id === selectedTextId);
    if (!t) return;
    const liveFontSize = Math.trunc(t.fontSize);
    if (liveFontSize !== fontSize || t.lineHeight !== lineHeight) {
      isUpdating.current = true;
      setFontSize(liveFontSize);
      setLineHeight(t.lineHeight);
      setTimeout(() => { isUpdating.current = false; }, 0);
    }
  }, [textsDetails, selectedTextId]);

  useEffect(() => {
    if (!selectedTextId || isUpdating.current) return;
    setTextsDetails(prev => prev.map(t => {
      if (t.id !== selectedTextId) return t;
      // Font size/weight/line-height all change how many lines the text
      // wraps to at a fixed width — keep the box tall enough to still
      // fully contain it (same measurement CompositorCanvas draws with).
      const neededH = measureWrappedTextHeight(t.text, fontSize, fontFamily, lineHeight, t.width, isBold, isItalic);
      return {
        ...t, fontFamily, textColor, backgroundColor, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, isBold, isItalic, isUnderline, opacity, fontSize, lineHeight, height: Math.max(t.height, neededH),
        fillMode, gradientColorStart, gradientColorEnd, gradientAngle, strokeColor, strokeWidth, curve,
      };
    }));
  }, [fontFamily, textColor, backgroundColor, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, isBold, isItalic, isUnderline, opacity, fontSize, lineHeight, fillMode, gradientColorStart, gradientColorEnd, gradientAngle, strokeColor, strokeWidth, curve]);

  const divider = "h-px bg-studio-border my-2.5";

  return (
    <InspectorCard accent="signal" icon={<TypeIcon size={12} />} title="Text">
      <SectionLabel inset={false} className="mb-0">Text Style</SectionLabel>

      {/* Font size + line height */}
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-mini text-ink-secondary font-medium">Font Size</span>
          <input type="number" min={1} value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-mini text-ink-secondary font-medium">Line Height</span>
          <input type="number" min={1} value={lineHeight} onChange={e => setLineHeight(parseInt(e.target.value))} className={inputCls} />
        </label>
      </div>

      {/* Opacity */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-mini text-ink-secondary font-medium min-w-[48px]">Opacity</span>
        <div className="flex-1"><Slider min={0} max={1} step={0.01} value={opacity} onChange={setOpacity} /></div>
        <input type="number" step={0.01} min={0} max={1} value={opacity} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0 && v <= 1) setOpacity(v); }}
          className="w-12 text-center rounded-lg border border-studio-border bg-studio-surface text-ink-primary py-1 px-1.5 outline-none text-[10.5px] font-mono" />
      </div>

      {/* Font */}
      <div className="mb-2.5">
        <span className="text-mini text-ink-secondary font-medium block mb-1">Font Family</span>
        <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}
          className="w-full rounded-lg border border-studio-border bg-studio-surface text-ink-primary py-1 px-2 text-[11.5px] outline-none font-[inherit] focus:border-signal cursor-pointer">
          {fontFamilies.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
      </div>

      {/* B/I/U */}
      <div className="mb-2.5">
        <span className="text-mini text-ink-secondary font-medium block mb-2">Style</span>
        <div className="flex gap-1.5">
          {[{ Icon: FaBold, s: isBold, set: setIsBold }, { Icon: FaItalic, s: isItalic, set: setIsItalic }, { Icon: FaUnderline, s: isUnderline, set: setIsUnderline }].map(({ Icon, s, set }, i) => (
            <div key={i} onClick={() => set(!s)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all border-[1.5px]
                ${s
                  ? "border-signal bg-signal/15 text-signal"
                  : "border-studio-border bg-studio-surface text-ink-secondary hover:border-signal hover:text-signal"}`}>
              <Icon size={11} />
            </div>
          ))}
        </div>
      </div>

      <div className={divider} />

      {/* Color mode */}
      <Segmented
        size="sm"
        className="mb-2.5"
        value={colorMode}
        onChange={setColorMode}
        options={[
          { value: "text", label: "Text" },
          { value: "background", label: "Background" },
          { value: "shadow", label: "Shadow" },
        ]}
      />

      {/* Color swatches */}
      {(colorMode === "text" || colorMode === "background") && (
        <div className="flex flex-wrap gap-1.5 p-1.5 rounded-lg bg-studio-surface border border-studio-border">
          {colorMode === "background" && (
            <div onClick={() => setBackgroundColor("transparent")}
              className={`w-5 h-5 rounded-[5px] cursor-pointer relative overflow-hidden border-[1.5px] bg-studio-raised
                ${backgroundColor === "transparent" ? "border-signal shadow-[0_0_0_2px_rgba(139,92,255,0.25)]" : "border-studio-borderLight"}`}>
              <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-red-500 rotate-[-35deg]" />
            </div>
          )}
          {colors.map(c => {
            const sel = colorMode === "text" ? c.value === textColor : c.value === backgroundColor;
            return (
              <div key={c.value} className={`${c.cls} w-5 h-5 rounded-[5px] cursor-pointer transition-all border-[1.5px]
                ${sel ? "border-signal shadow-[0_0_0_2px_rgba(139,92,255,0.25)]" : (c.value === "black" || c.value === "white") ? "border-studio-borderLight" : "border-transparent"}
                hover:scale-110`}
                onClick={() => colorMode === "text" ? setTextColor(c.value) : setBackgroundColor(c.value)} />
            );
          })}
        </div>
      )}

      {colorMode === "shadow" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5 p-1.5 rounded-lg bg-studio-surface border border-studio-border">
            <div onClick={() => setShadowColor("transparent")}
              className={`w-5 h-5 rounded-[5px] cursor-pointer relative overflow-hidden border-[1.5px] bg-studio-raised
                ${shadowColor === "transparent" ? "border-signal" : "border-studio-borderLight"}`}>
              <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-red-500 rotate-[-35deg]" />
            </div>
            {colors.map(c => (
              <div key={c.value} className={`${c.cls} w-5 h-5 rounded-[5px] cursor-pointer transition-all border-[1.5px] hover:scale-110
                ${c.value === shadowColor ? "border-signal shadow-[0_0_0_2px_rgba(139,92,255,0.25)]" : (c.value === "black" || c.value === "white") ? "border-studio-borderLight" : "border-transparent"}`}
                onClick={() => setShadowColor(c.value)} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[{ label: "Blur", val: shadowBlur, set: setShadowBlur }, { label: "Offset X", val: shadowOffsetX, set: setShadowOffsetX }, { label: "Offset Y", val: shadowOffsetY, set: setShadowOffsetY }].map(({ label, val, set }) => (
              <label key={label} className="flex flex-col gap-1">
                <span className="text-mini text-ink-secondary">{label}</span>
                <input type="number" value={val} onChange={e => set(parseInt(e.target.value))} className={inputCls} />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className={divider} />
      <SectionLabel inset={false} className="mb-2">Stylize</SectionLabel>

      {/* Fill mode */}
      <div className="mb-2.5">
        <Segmented
          size="sm"
          value={fillMode}
          onChange={setFillMode}
          options={[
            { value: "solid", label: "Solid Fill" },
            { value: "gradient", label: "Gradient Fill" },
          ]}
        />
      </div>

      {fillMode === "gradient" && (
        <div className="flex flex-col gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-mini text-ink-secondary font-medium">Start</span>
            <input type="color" value={gradientColorStart} onChange={e => setGradientColorStart(e.target.value)}
              className="w-8 h-8 rounded-lg bg-studio-void border border-studio-border cursor-pointer" />
            <span className="text-mini text-ink-secondary font-medium">End</span>
            <input type="color" value={gradientColorEnd} onChange={e => setGradientColorEnd(e.target.value)}
              className="w-8 h-8 rounded-lg bg-studio-void border border-studio-border cursor-pointer" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-mini text-ink-secondary font-medium min-w-[48px]">Angle</span>
            <div className="flex-1"><Slider min={0} max={360} step={1} value={gradientAngle} onChange={setGradientAngle} /></div>
            <span className="text-mini text-ink-faint w-8 text-right font-mono">{gradientAngle}°</span>
          </div>
        </div>
      )}

      {/* Outline / stroke */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-mini text-ink-secondary font-medium min-w-[48px]">Outline</span>
        <input type="color" value={strokeColor === "transparent" ? "#000000" : strokeColor}
          onChange={e => setStrokeColor(e.target.value)}
          className="w-8 h-8 rounded-lg bg-studio-void border border-studio-border cursor-pointer flex-shrink-0" />
        <div className="flex-1"><Slider min={0} max={20} step={0.5} value={strokeWidth}
          onChange={v => { setStrokeWidth(v); if (v > 0 && strokeColor === "transparent") setStrokeColor("#000000"); }} /></div>
        <span className="text-mini text-ink-faint w-8 text-right font-mono">{strokeWidth}</span>
      </div>

      {/* Curve */}
      <div className="flex items-center gap-2">
        <span className="text-mini text-ink-secondary font-medium min-w-[48px]">Curve</span>
        <div className="flex-1"><Slider min={-100} max={100} step={1} value={curve} onChange={setCurve} /></div>
        <span className="text-mini text-ink-faint w-8 text-right font-mono">{curve}</span>
      </div>
    </InspectorCard>
  );
}
