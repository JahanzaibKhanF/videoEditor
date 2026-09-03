"use client";

import { X, Plus, Droplets, Type, SplitSquareHorizontal, Film, Upload, Wand2, Scissors, Sparkles, FiLayers, Shuffle } from "@/utils/icons";
import { v4 as uuidv4 } from "uuid";
import { measureWrappedTextHeight } from "../../utils/measureText";
import { useAppDetailsContext } from "../../context/useAppContext";
import { addClipToTimeline } from "../../utils/addClipToTimeline";
import { deleteVideo } from "../../utils/deleteVideo";
import { splitLayer } from "../../utils/splitLayer";
import { frontmostZ } from "../../utils/zStack";
import { formatVideoSize } from "../../utils/formatVideoSize";
import ClipTransitionSelector from "../transitions/ClipTransitionSelector";
import AnimationSelection from "../animations/AnimationSelection";
import TemplatesPanel from "./TemplatesPanel";
import RecentProjectsPanel from "./RecentProjectsPanel";
import ClipEffectsPanel from "./ClipEffectsPanel";
import BackgroundRemovalPanel from "./BackgroundRemovalPanel";
import { useProjectMedia } from "../../hooks/useProjectMedia";
import { pickMediaFiles } from "../../utils/pickMediaFiles";
import type { Template } from "../../utils/templates";
import { PanelShell, PanelHeader, PanelBody } from "../ui/Panel";
import SectionLabel from "../ui/SectionLabel";
import EmptyState from "../ui/EmptyState";

export default function MediaPanel({ activeTab, pendingTemplate }: { activeTab: string; pendingTemplate?: Template }) {
  const {
    videos, setVideos, clipsDetails, setClipsDetails, setTotalTime, setPrimaryVideoDimensions, setAudioDetails, audioDetails,
    imagesDetails, setImagesDetails, setSelectedImageID, imageRefs, setImageRefs,
    textsDetails, setTextsDetails, setSelectedTextId, selectedTextId,
    blursDetails, setBlursDetails, setSelectedBlurId, selectedBlurId, selectedImageID, totalTime, containerDimenions, currentTime,
    setMediaImportError, activeTemplate, selectedClipId,
  } = useAppDetailsContext();

  const { registerFiles } = useProjectMedia();

  // Route templates tab directly to TemplatesPanel
  if (activeTab === "templates") return <TemplatesPanel initialTemplate={pendingTemplate} />;
  if (activeTab === "recent") return <RecentProjectsPanel />;

  // Shared by both the native <input type=file> picker AND files pulled
  // from a linked local folder (File System Access API) — either path
  // ends up with plain File objects, so the ingestion logic is identical.
  const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "mkv", "avi", "m4v"];
  const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"];

  // `File.type` (MIME type) is sometimes just an empty string for files
  // obtained via the File System Access API (FileSystemFileHandle.getFile())
  // rather than a normal <input type="file"> — a known real-world browser
  // gap, especially on Linux for less common video extensions. Without a
  // fallback, such a file matched neither "video/" nor "image/" and was
  // silently dropped: no error, no toast, the click just appeared to do
  // nothing at all. Falling back to the file's extension when the MIME
  // type is missing/unrecognized fixes that.
  const classifyFile = (file: File): "video" | "image" | "other" => {
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "image";
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (VIDEO_EXTENSIONS.includes(ext)) return "video";
    if (IMAGE_EXTENSIONS.includes(ext)) return "image";
    return "other";
  };

  const ingestFiles = (files: File[]) => {
    const newImages = [...imagesDetails];
    const newRefs = { ...imageRefs };
    const videoQueue: { file: File; index: number }[] = [];

    files.forEach((file, index) => {
      const kind = classifyFile(file);
      if (kind === "video") {
        videoQueue.push({ file, index });
      } else if (kind === "image") {
        // BUG THIS FIXES: refs used to be keyed by this forEach loop's local
        // `index`, which starts at 0 for every SEPARATE import action (not
        // just within one multi-select batch). Importing one image, then
        // importing another one later, meant the second image's ref
        // silently overwrote the first image's ref at the same key (0),
        // while imagesDetails kept growing correctly — so the first
        // image's data entry ended up pointing at the second image's
        // pixels (or nothing, once more images were added), which is what
        // made it look like the first image's box "took over" or went
        // blank. Keying by the image's own stable id makes this collision
        // impossible regardless of how many separate import actions happen.
        const id = uuidv4();
        // Baseline is the count of images that existed before this whole
        // ingest call started, so separate import actions naturally get
        // increasing placement offsets instead of every batch restarting
        // from the same spot (the same class of bug as the ref collision
        // above, just for on-screen position instead of pixel content).
        const placementIndex = imagesDetails.length + index;
        // NEW-LAYER-ON-TOP FIX: a freshly imported image used to get no
        // zIndex at all, which every reorder/composite path then defaulted
        // to 0 via `?? 0` — tying it with video's own default track zIndex
        // (also 0, see addClipToTimeline.ts) and landing it wherever that
        // tie happened to fall in the merged draw order, NOT necessarily on
        // top. Explicitly placing it strictly in front of every existing
        // layer (video/image/text/blur) matches how every other editor
        // treats a newly added layer.
        const zIndex = frontmostZ([
          ...clipsDetails.map(c => c.zIndex ?? 0),
          ...imagesDetails.map(i => i.zIndex ?? 0),
          ...textsDetails.map(t => t.zIndex ?? 0),
          ...blursDetails.map(b => b.zIndex ?? 0),
        ]);
        const imgEl = new Image();
        imgEl.src = URL.createObjectURL(file);
        imgEl.onload = () => {
          newRefs[id] = imgEl;
          const reader = new FileReader();
          reader.onload = () => {
            newImages.push({ id, src: imgEl.src, image: file, sourceFileName: file.name, opacity: 1, imageX: placementIndex * 40, imageY: placementIndex * 30, width: imgEl.width, height: imgEl.height, scaleX: .4, scaleY: .4, startTime: 0, endTime: totalTime, animation: "none", zIndex });
            setImagesDetails([...newImages]);
            setImageRefs({ ...newRefs });
            setSelectedImageID(id);
          };
          reader.readAsDataURL(file);
        };
      } else {
        setMediaImportError(`"${file.name}" isn't a supported video or image file.`);
      }
    });

    if (videoQueue.length > 0) {
      setMediaImportError("");
      // Sequential, not parallel: each clip's placement depends on the
      // previous one's resolved end time, so we chain them instead of
      // firing addClipToTimeline for every file off the same stale
      // clipsDetails snapshot (which would make every clip in a multi-file
      // select land at the same spot instead of stacking one after another).
      let cursor = clipsDetails.reduce((max, c) => Math.max(max, c.endPosition ?? 0), 0);
      (async () => {
        for (const { file, index } of videoQueue) {
          const vName = `video${Date.now()}_${index}`;
          const newVid = { video: file, name: vName };
          setVideos(prev => [...prev, newVid]);
          cursor = await addClipToTimeline({
            video: newVid, setTotalTime, clipsDetails, setClipsDetails,
            setPrimaryVideoDimensions, setAudioDetails, startAt: cursor,
          });
        }
      })();
    }
  };

  const handleImport = async () => {
    const picked = await pickMediaFiles();
    if (picked.length === 0) return;
    // Persist the picked files' handles so a reopened project can
    // auto-relink them later without re-prompting (see useProjectMedia).
    await registerFiles(picked);
    ingestFiles(picked.map((p) => p.file));
  };

  const addText = () => {
    // Previous defaults (220px wide box at 100px font) were badly
    // mismatched — even a single short word wouldn't fit on one line,
    // and the box height was never measured against the actual default
    // text, so newly-created text could immediately overflow its own
    // selection box. Use a much more reasonable default size, and measure
    // the real required height up front instead of guessing 100.
    const defaultText = "New Text";
    const fontSize = 48;
    const width = Math.min(420, Math.max(220, containerDimenions.width * 0.4));
    const height = measureWrappedTextHeight(defaultText, fontSize, "Arial", 1, width, false, false);
    const defaultDuration = Math.min(5, totalTime || 5);
    // NEW-LAYER-ON-TOP FIX — see the matching comment in ingestFiles above.
    const textZIndex = frontmostZ([
      ...clipsDetails.map(c => c.zIndex ?? 0),
      ...imagesDetails.map(i => i.zIndex ?? 0),
      ...textsDetails.map(tx => tx.zIndex ?? 0),
      ...blursDetails.map(b => b.zIndex ?? 0),
    ]);
    const t = { text: defaultText, textColor: "white", backgroundColor: "transparent", shadowColor: "transparent", shadowBlur: 0, shadowOffsetX: 3, shadowOffsetY: 1, fontFamily: "Arial", textX: (containerDimenions.width - width) / 2, textY: (containerDimenions.height - height) / 2, width, height, fontSize, lineHeight: 1, isBold: false, isItalic: false, isUnderline: false, opacity: 1, id: uuidv4(), startTime: 0, endTime: defaultDuration, animation: "none", zIndex: textZIndex };
    setTextsDetails(prev => [...prev, t]);
    setSelectedTextId(t.id);
  };

  const addBlur = () => {
    // NEW-LAYER-ON-TOP FIX — see the matching comment in ingestFiles above.
    // Blur especially needs to default to the front: a blur region only
    // blurs whatever's already been drawn BELOW it (see drawBlurRegion in
    // compositeFrame.ts), so a fresh blur that silently landed BEHIND
    // something (via the old zIndex-0 tie) would render as if it did
    // nothing at all — exactly the "why did my blur not show up / show up
    // behind my image" symptom.
    const blurZIndex = frontmostZ([
      ...clipsDetails.map(c => c.zIndex ?? 0),
      ...imagesDetails.map(i => i.zIndex ?? 0),
      ...textsDetails.map(t => t.zIndex ?? 0),
      ...blursDetails.map(b => b.zIndex ?? 0),
    ]);
    const b = { id: uuidv4(), x: (containerDimenions.width - 200) / 2, y: 100, width: 400, height: 200, blurAmount: 10, startTime: 0, endTime: totalTime, zIndex: blurZIndex };
    setBlursDetails(prev => [...prev, b]);
    setSelectedBlurId(b.id);
  };

  const rowBase = "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors border-l-2";

  const addGradBtn = (onClick: () => void, disabled = false, grad = "linear-gradient(135deg,#8B5CFF,#A47CFF)") => (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 30, height: 30, borderRadius: 9, background: disabled ? undefined : grad, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .4 : 1, flexShrink: 0 }}
      className="bg-studio-raised disabled:bg-studio-raised">
      <Plus size={13} color="white" strokeWidth={2.4} />
    </button>
  );

  /* ─── MEDIA TAB ─── */
  if (activeTab === "media") return (
    <PanelShell>
      <PanelHeader
        icon={<Film size={13} />}
        title="Media Library"
        subtitle={`${videos.length} video${videos.length !== 1 ? "s" : ""} · ${imagesDetails.length} image${imagesDetails.length !== 1 ? "s" : ""}`}
        action={addGradBtn(handleImport, !!activeTemplate)}
      />

      <PanelBody>
        {videos.length === 0 && imagesDetails.length === 0 ? (
          <div className={`m-4 border-[1.5px] border-dashed rounded-xl p-6 text-center transition-all ${activeTemplate ? "border-studio-border opacity-40 cursor-not-allowed" : "border-studio-borderLight cursor-pointer hover:border-signal hover:bg-signal/5"}`} onClick={activeTemplate ? undefined : handleImport}>
            <Upload size={22} className="mx-auto mb-2 text-ink-faint" />
            <div className="text-[13px] font-semibold text-ink-secondary">Import your media</div>
            <div className="text-[11px] text-ink-secondary mt-1">Click to browse files</div>
          </div>
        ) : (<>
          {videos.length > 0 && <>
            <SectionLabel>Videos ({videos.length})</SectionLabel>
            {videos.map((v, i) => (
              <div key={i} className={`${rowBase} border-transparent hover:bg-studio-hover`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-studio-hover to-studio-void border border-studio-border">
                  <Film size={13} className="text-ink-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-ink-primary truncate">{v.video.name.slice(0, 26)}{v.video.name.length > 26 ? "…" : ""}</div>
                  <div className="text-[10.5px] text-ink-secondary">{formatVideoSize(v.video.size)}</div>
                </div>
                <button title="Add to timeline" onClick={() => addClipToTimeline({ video: v, setTotalTime, clipsDetails, setClipsDetails, setPrimaryVideoDimensions, setAudioDetails })}
                  className="w-6 h-6 rounded-md flex items-center justify-center cursor-pointer bg-signal/15 text-signal border-none hover:bg-signal/25 transition-all">
                  <Plus size={13} />
                </button>
                <button title="Remove" disabled={v.name === "video1"} onClick={() => deleteVideo({ video: v, setVideos, setClipsDetails, setTotalTime })}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-danger border-none bg-transparent disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:bg-danger/10 transition-all">
                  <X size={11} />
                </button>
              </div>
            ))}
          </>}
          {imagesDetails.length > 0 && <>
            <SectionLabel>Images ({imagesDetails.length})</SectionLabel>
            <div className="grid grid-cols-2 gap-2 px-3 pb-2">
              {imagesDetails.map(img => (
                <div key={img.id}
                  className={`relative rounded-lg overflow-hidden cursor-pointer aspect-video bg-black border-[1.5px] transition-all ${selectedImageID === img.id ? "border-signal" : "border-studio-border"}`}
                  onClick={() => { setSelectedImageID(img.id); }}>
                  <img src={img.src} className="w-full h-full object-cover" />
                  <button aria-label="Delete image" className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center text-white bg-black/60 hover:bg-danger rounded-full transition-colors"
                    onClick={e => { e.stopPropagation(); setImagesDetails(prev => prev.filter(p => p.id !== img.id)); }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </>}
        </>)}
      </PanelBody>
    </PanelShell>
  );

  /* ─── TEXT TAB ─── */
  if (activeTab === "text") return (
    <PanelShell>
      <PanelHeader
        icon={<Type size={13} />}
        title="Text Layers"
        action={addGradBtn(addText, videos.length === 0 || !!activeTemplate)}
      />
      <PanelBody>
        {textsDetails.length === 0 ? <EmptyState compact icon={<Type size={18} strokeWidth={1.7} />} title="No text layers" hint="Click + to add one." />
          : textsDetails.map(t => {
            const active = selectedTextId === t.id;
            return (
              <div key={t.id}
                className={`${rowBase} ${active ? "border-signal bg-signal/10" : "border-transparent hover:bg-studio-hover"}`}
                onClick={() => { setSelectedTextId(t.id); }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-signal/10 border border-signal/20">
                  <Type size={14} className="text-signal" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-ink-primary truncate">{t.text.slice(0, 24)}{t.text.length > 24 ? "…" : ""}</div>
                  <div className="text-[10.5px] text-ink-secondary">{t.fontFamily} · {Math.trunc(t.fontSize)}px</div>
                </div>
                <button aria-label="Delete text" className="w-6 h-6 flex items-center justify-center flex-shrink-0 text-ink-faint hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                  onClick={e => { e.stopPropagation(); setTextsDetails(prev => prev.filter(d => d.id !== t.id)); }}>
                  <X size={13} />
                </button>
              </div>
            );
          })}
      </PanelBody>
    </PanelShell>
  );

  /* ─── EFFECTS TAB ─── */
  if (activeTab === "effects") {
    const selectedClip = clipsDetails.find(c => c.id === selectedClipId);
    return (
    <PanelShell>
      <PanelHeader
        icon={<Sparkles size={13} />}
        title="Effects"
        subtitle={selectedClip ? "Applying to the selected clip" : "Select a timeline clip to add effects"}
      />

      <PanelBody padded className="flex flex-col gap-4">
        {/* ── Special Effects (particles, shake, wiggle, etc) ── */}
        <div>
          <SectionLabel inset={false}>Special Effects</SectionLabel>
          {selectedClip ? <ClipEffectsPanel clip={selectedClip} /> : (
            <div className="text-meta text-ink-faint text-center py-3 border border-dashed border-studio-border rounded-lg">
              Select a video clip first
            </div>
          )}
        </div>

        {/* ── Blur Regions ─────────────────────────────────── */}
        <div>
          <SectionLabel inset={false} right={addGradBtn(addBlur, videos.length === 0 || !!activeTemplate, "linear-gradient(135deg,#10B981,#06B6D4)")}>
            Blur Regions
          </SectionLabel>
          {blursDetails.length === 0 ? <EmptyState compact icon={<Droplets size={18} strokeWidth={1.7} />} title="No blur regions" hint="Click + to add one." />
            : blursDetails.map((b, i) => {
              const active = selectedBlurId === b.id;
              return (
                <div key={b.id}
                  className={`${rowBase} ${active ? "border-signal bg-signal/10" : "border-transparent hover:bg-studio-hover"}`}
                  onClick={() => setSelectedBlurId(b.id)}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-success/10 border border-success/20">
                    <Droplets size={14} className="text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-ink-primary">Blur Region {i + 1}</div>
                    <div className="text-[10.5px] text-ink-secondary">Intensity {b.blurAmount}</div>
                  </div>
                  <button aria-label="Delete blur" className="w-6 h-6 flex items-center justify-center flex-shrink-0 text-ink-faint hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                    onClick={e => { e.stopPropagation(); setBlursDetails(prev => prev.filter(d => d.id !== b.id)); }}>
                    <X size={13} />
                  </button>
                </div>
              );
            })}
        </div>
      </PanelBody>
    </PanelShell>
  );
  }

  /* ─── BACKGROUND REMOVAL TAB ─── */
  if (activeTab === "bgremove") {
    const selectedClip = clipsDetails.find(c => c.id === selectedClipId);
    return (
      <PanelShell>
        <PanelHeader
          icon={<Scissors size={13} />}
          title="Background Removal"
          subtitle={selectedClip ? "Ready for the selected clip" : "Select a clip on the timeline first"}
        />

        <PanelBody padded>
          {selectedClip ? (
            <BackgroundRemovalPanel clip={selectedClip} />
          ) : (
            <EmptyState
              compact
              icon={<Scissors size={18} strokeWidth={1.7} />}
              title="No clip selected"
              hint="Tap a video clip on the timeline, then come back here."
            />
          )}
        </PanelBody>
      </PanelShell>
    );
  }

  /* ─── LAYERS TAB ─── */
  if (activeTab === "layers") return (
    <PanelShell>
      <PanelHeader
        icon={<FiLayers size={13} />}
        title="All Layers"
        subtitle={`${clipsDetails.length + textsDetails.length + imagesDetails.length + blursDetails.length} layers total`}
      />
      <div className="px-3 py-2 border-b border-studio-border flex flex-wrap gap-1.5 flex-shrink-0">
        {[
          { label: "Import", icon: <Upload size={13} />, onClick: handleImport, disabled: !!activeTemplate },
          { label: "Text",   icon: <Type size={13}/>, onClick: addText, disabled: videos.length === 0 || !!activeTemplate },
          { label: "Blur",   icon: <Droplets size={13}/>, onClick: addBlur, disabled: videos.length === 0 },
          { label: "Split",  icon: <SplitSquareHorizontal size={13}/>, onClick: () => splitLayer(selectedClipId, clipsDetails, setClipsDetails, currentTime, audioDetails, setAudioDetails), disabled: videos.length === 0 },
        ].map(btn => (
          <button key={btn.label} onClick={btn.onClick} disabled={btn.disabled}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-studio-border bg-studio-raised text-ink-secondary text-[11px] font-semibold cursor-pointer hover:bg-signal/10 hover:border-signal/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-[inherit]">
            {btn.icon}{btn.label}
          </button>
        ))}
      </div>
      <PanelBody>
        {clipsDetails.length === 0 && textsDetails.length === 0 && imagesDetails.length === 0 && blursDetails.length === 0
          ? <EmptyState compact icon={<FiLayers size={18} strokeWidth={1.7} />} title="No layers yet" hint="Import a video to start." />
          : <>
            {clipsDetails.length > 0 && <SectionLabel>Video Clips</SectionLabel>}
            {clipsDetails.map(c => (
              <div key={c.id} className={`${rowBase} border-transparent`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-signal/25 to-scrub/15 border border-studio-border">
                  <Film size={13} className="text-ink-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-ink-primary truncate">{c.sourceFileName ?? c.name}</div>
                  <div className="text-[10.5px] text-ink-secondary">{(c.endPosition - c.startPosition).toFixed(1)}s</div>
                </div>
              </div>
            ))}
            {textsDetails.length > 0 && <SectionLabel>Text Layers</SectionLabel>}
            {textsDetails.map(t => (
              <div key={t.id} className={`${rowBase} ${selectedTextId === t.id ? "border-signal bg-signal/10" : "border-transparent hover:bg-studio-hover"}`}
                onClick={() => setSelectedTextId(t.id)}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-signal/10 border border-signal/20">
                  <Type size={13} className="text-signal" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-ink-primary truncate">{t.text.slice(0, 20)}</div>
                  <div className="text-[10.5px] text-ink-secondary">{t.fontFamily}</div>
                </div>
                <button aria-label="Delete text" className="w-6 h-6 flex items-center justify-center flex-shrink-0 text-ink-faint hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                  onClick={e => { e.stopPropagation(); setTextsDetails(prev => prev.filter(d => d.id !== t.id)); }}>
                  <X size={13} />
                </button>
              </div>
            ))}
            {blursDetails.length > 0 && <SectionLabel>Blur Regions</SectionLabel>}
            {blursDetails.map((b, i) => (
              <div key={b.id} className={`${rowBase} ${selectedBlurId === b.id ? "border-signal bg-signal/10" : "border-transparent hover:bg-studio-hover"}`}
                onClick={() => setSelectedBlurId(b.id)}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-success/10 border border-success/20">
                  <Droplets size={13} className="text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-ink-primary">Blur {i + 1}</div>
                  <div className="text-[10.5px] text-ink-secondary">Intensity {b.blurAmount}</div>
                </div>
                <button aria-label="Delete blur" className="w-6 h-6 flex items-center justify-center flex-shrink-0 text-ink-faint hover:text-danger hover:bg-danger/10 rounded-md transition-colors"
                  onClick={e => { e.stopPropagation(); setBlursDetails(prev => prev.filter(d => d.id !== b.id)); }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </>}
      </PanelBody>
    </PanelShell>
  );

  /* ─── TRANSITIONS TAB ─── */
  if (activeTab === "transitions") return (
    <PanelShell>
      <PanelHeader
        icon={<Shuffle size={13} />}
        title="Transitions"
        subtitle="Select a clip, then pick a transition"
      />
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3">
        <ClipTransitionSelector />
      </div>
    </PanelShell>
  );

  /* ─── ANIMATIONS TAB ─── */
  if (activeTab === "animations") return (
    <PanelShell>
      <PanelHeader
        icon={<Wand2 size={13} />}
        title="Animations"
        subtitle="Select a text or image layer, then pick"
      />
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3">
        <AnimationSelection />
      </div>
    </PanelShell>
  );

  return null;
}