"use client";

import { toast } from "react-toastify";
import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAppDetailsContext } from "../../context/useAppContext";
import { hasSpeedRamp, speedAtFraction } from "../../utils/speedRamp";

const Video = () => {
  const {
    videoRef, clipsDetails, setCurrentTime, setSeekTime, totalTime,
    setTotalTime, setClipsDetails, videos, currentTime,
    setPrimaryVideoDimensions, activeClipIndex, setActiveClipIndex,
    setAudioDetails,
  } = useAppDetailsContext();

  // Refs so timeupdate always reads fresh data — no stale closures, no re-registration
  const clipsRef = useRef(clipsDetails);
  const totalTimeRef = useRef(totalTime);
  const activeIndexRef = useRef(activeClipIndex);
  const isSwitchingRef = useRef(false);

  useEffect(() => { clipsRef.current = clipsDetails; }, [clipsDetails]);
  useEffect(() => { totalTimeRef.current = totalTime; }, [totalTime]);
  useEffect(() => { activeIndexRef.current = activeClipIndex; }, [activeClipIndex]);

  // Auto-add single video to timeline
  useEffect(() => {
    if (!videos || videos.length !== 1 || clipsDetails.length !== 0) return;
    let cancelled = false;
    const file = videos[0].video;
    const tmp = document.createElement("video");
    tmp.preload = "metadata";
    tmp.src = URL.createObjectURL(file);
    tmp.onloadedmetadata = () => {
      if (cancelled) return;
      const duration = tmp.duration || 0;
      const w = tmp.videoWidth || 0, h = tmp.videoHeight || 0;
      setTotalTime(duration);
      setPrimaryVideoDimensions({ width: w, height: h });
      const clip = {
        id: uuidv4(), name: "video1", duration,
        startPosition: 0, endPosition: duration,
        startTime: 0, endTime: duration, transition: "none",
        src: URL.createObjectURL(file), video: "video1",
        x: 0, y: 0, scale: 1, width: w, height: h, muted: false,
      };
      setClipsDetails([clip]);
      // Auto-create audio layer for this clip
      setAudioDetails([{
        id: uuidv4(), clipId: clip.id, name: file.name,
        startTime: 0, endTime: duration, volume: 1, muted: false,
      }]);
      URL.revokeObjectURL(tmp.src);
      tmp.remove();
    };
    tmp.onerror = () => {
      if (!cancelled) { setTotalTime(0); setClipsDetails([]); }
      URL.revokeObjectURL(tmp.src);
      tmp.remove();
    };
    return () => { cancelled = true; };
  }, [videos]);

  // Determine active clip from currentTime (seek-driven)
  useEffect(() => {
    if (isSwitchingRef.current) return;
    const idx = clipsDetails.findIndex(
      c => currentTime >= (c.startPosition ?? 0) && currentTime <= (c.endPosition ?? 0)
    );
    setActiveClipIndex(idx !== -1 ? idx : null);
  }, [currentTime, clipsDetails]);

  // Switch video src when user seeks to a different clip
  useEffect(() => {
    const video = videoRef?.current;
    if (!video || isSwitchingRef.current) return;
    const clip = activeClipIndex !== null ? clipsDetails[activeClipIndex] : null;
    if (!clip) { video.pause(); return; }

    const localTarget = (clip.startTime ?? 0) + (currentTime - (clip.startPosition ?? 0));

    if (video.src !== clip.src) {
      const wasPlaying = !video.paused;
      isSwitchingRef.current = true;
      video.pause();
      video.src = clip.src;
      video.load();
      const onCanPlay = () => {
        video.removeEventListener("canplay", onCanPlay);
        video.currentTime = Math.max(0, localTarget);
        if (wasPlaying) video.play().catch(() => {});
        isSwitchingRef.current = false;
      };
      video.addEventListener("canplay", onCanPlay);
      return () => video.removeEventListener("canplay", onCanPlay);
    }

    // Same src — fix drift from seeking
    if (Math.abs(video.currentTime - localTarget) > 0.15) {
      video.currentTime = Math.max(0, localTarget);
    }
  }, [activeClipIndex, clipsDetails]);

  // timeupdate — track global time + auto-advance clips
  // Registered ONCE — reads everything via refs, zero stale closures
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (isSwitchingRef.current) return;
      const idx = activeIndexRef.current;
      const clips = clipsRef.current;
      if (idx === null) return;
      const clip = clips[idx];
      if (!clip) return;

      const local = video.currentTime;
      const global = (clip.startPosition ?? 0) + (local - (clip.startTime ?? 0));

      if (global >= 0 && global <= totalTimeRef.current) {
        setCurrentTime(global);
        setSeekTime(global);
      }

      // End of clip? Switch directly — no React state round-trip
      if (global >= (clip.endPosition ?? 0) - 0.06) {
        const nextClip = clips[idx + 1];
        if (nextClip) {
          isSwitchingRef.current = true;
          video.pause();
          video.src = nextClip.src;
          video.load();
          const onCanPlay = () => {
            video.removeEventListener("canplay", onCanPlay);
            video.currentTime = Math.max(0, nextClip.startTime ?? 0);
            video.play().catch(() => {});
            setCurrentTime(nextClip.startPosition ?? 0);
            setSeekTime(nextClip.startPosition ?? 0);
            setActiveClipIndex(idx + 1);
            isSwitchingRef.current = false;
          };
          video.addEventListener("canplay", onCanPlay);
        } else {
          video.pause();
          setCurrentTime(0);
          setSeekTime(0);
        }
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, []); // empty — all via refs

  // Live speed-ramp preview: continuously drive native playbackRate for
  // whichever clip is active. This is a lightweight preview approximation
  // (based on how far playback has gotten through the clip's own SOURCE
  // span, not the export path's exact output-time integration) — good
  // enough to see the ramp's shape while scrubbing/playing back; the
  // WebCodecs export path is the frame-accurate source of truth for the
  // final rendered file.
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    let rafId: number;
    const tick = () => {
      const idx = activeIndexRef.current;
      const clips = clipsRef.current;
      const clip = idx !== null ? clips[idx] : null;
      if (clip && hasSpeedRamp(clip)) {
        const srcStart = clip.startTime ?? 0;
        const srcSpan = Math.max(0.001, (clip.endTime ?? clip.duration ?? 1) - srcStart);
        const frac = Math.max(0, Math.min(1, (video.currentTime - srcStart) / srcSpan));
        const rate = speedAtFraction(clip.speed, frac);
        if (Math.abs(video.playbackRate - rate) > 0.02) video.playbackRate = rate;
      } else if (video.playbackRate !== 1) {
        video.playbackRate = 1;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Metadata error check
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    const onMeta = () => {
      if (video.duration === Infinity) toast.error("Video duration error. App may not work properly.");
    };
    video.addEventListener("loadedmetadata", onMeta);
    return () => video.removeEventListener("loadedmetadata", onMeta);
  }, []);

  const activeClip = activeClipIndex !== null ? clipsDetails[activeClipIndex] : null;

  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        top: activeClip?.y ?? 0,
        left: activeClip?.x ?? 0,
        width: Math.max(0, (activeClip?.width ?? 0) * (activeClip?.scale ?? 1)),
        height: Math.max(0, (activeClip?.height ?? 0) * (activeClip?.scale ?? 1)),
      }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted={activeClip?.muted ?? false}
        playsInline
        style={{ visibility: activeClip ? "visible" : "hidden" }}
      />
    </div>
  );
};

export default Video;
