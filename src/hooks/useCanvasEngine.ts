"use client";

/**
 * useCanvasEngine — React hook that owns one CanvasEngine instance
 * and keeps it synced with app state.
 *
 * Returns { engineRef, play, pause, seekTo, isPlaying }
 * so components can control playback without touching the engine directly.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { CanvasEngine } from "../utils/CanvasEngine";
import { ClipDetails } from "../types/types";

interface Options {
  canvasEl: React.RefObject<HTMLCanvasElement>;
  clips: ClipDetails[];
  canvasWidth: number;
  canvasHeight: number;
  onTimeUpdate: (t: number) => void;
  onEnded: () => void;
}

export function useCanvasEngine({
  canvasEl, clips, canvasWidth, canvasHeight, onTimeUpdate, onEnded,
}: Options) {
  const engineRef = useRef<CanvasEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Create engine once canvas is ready
  useEffect(() => {
    const el = canvasEl.current;
    if (!el || !canvasWidth || !canvasHeight) return;

    // Dispose old engine if canvas size changed
    if (engineRef.current) {
      engineRef.current.dispose();
    }

    el.width = canvasWidth;
    el.height = canvasHeight;

    const engine = new CanvasEngine(el);
    engine.onTimeUpdate = (t) => onTimeUpdate(t);
    engine.onEnded = () => { setIsPlaying(false); onEnded(); };
    engineRef.current = engine;

    // Load clips into engine
    if (clips.length > 0) engine.load(clips);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // Only recreate when canvas dimensions change
  }, [canvasWidth, canvasHeight]);

  // Reload clips when they change (new clip added, trimmed, etc.)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || clips.length === 0) return;
    engine.load(clips);
  }, [clips]);

  // Update callbacks when they change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.onTimeUpdate = onTimeUpdate;
    engine.onEnded = () => { setIsPlaying(false); onEnded(); };
  }, [onTimeUpdate, onEnded]);

  const play = useCallback(() => {
    engineRef.current?.play();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const seekTo = useCallback((t: number) => {
    engineRef.current?.seekTo(t);
  }, []);

  const getCurrentTime = useCallback(() => {
    return engineRef.current?.getCurrentTime() ?? 0;
  }, []);

  return { engineRef, isPlaying, play, pause, seekTo, getCurrentTime };
}
