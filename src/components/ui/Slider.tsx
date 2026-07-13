"use client";

/**
 * Slider — custom styled range input.
 * Replaces all `<input type="range">` in the app.
 */
import React, { useRef } from "react";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  color?: string;
  disabled?: boolean;
}

export default function Slider({
  value, min, max, step = 0.01, onChange, color = "#8B5CFF", disabled = false,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  const calc = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const raw = (clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, raw));
    const v = min + clamped * (max - min);
    const stepped = step ? Math.round(v / step) * step : v;
    onChange(Math.max(min, Math.min(max, parseFloat(stepped.toFixed(10)))));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    calc(e.clientX);
    const mv = (me: MouseEvent) => calc(me.clientX);
    const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  };

  return (
    <div
      ref={trackRef}
      onMouseDown={onMouseDown}
      style={{
        position: "relative", height: 18, flex: 1, minWidth: 0,
        display: "flex", alignItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        userSelect: "none",
      }}
    >
      {/* Track background */}
      <div style={{
        position: "absolute", left: 0, right: 0,
        height: 4, borderRadius: 2,
        background: "rgba(255,255,255,.1)",
      }} />
      {/* Fill */}
      <div style={{
        position: "absolute", left: 0, width: `${pct}%`,
        height: 4, borderRadius: 2,
        background: color,
      }} />
      {/* Thumb */}
      <div style={{
        position: "absolute",
        left: `${pct}%`,
        transform: "translateX(-50%)",
        width: 14, height: 14,
        borderRadius: "50%",
        background: "white",
        boxShadow: `0 0 0 3px ${color}, 0 2px 6px rgba(0,0,0,.25)`,
        transition: "box-shadow .1s",
        pointerEvents: "none",
      }} />
    </div>
  );
}
