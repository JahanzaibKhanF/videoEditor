"use client";

import { useEffect, useRef, useState } from "react";
import TextEditor from "./TextEditor";
import { twMerge } from "tailwind-merge"; // Import twMerge for conditional class merging
import { useAppDetailsContext } from "../../context/useAppContext";
import ClipTransitionSelector from "../transitions/ClipTransitionSelector";
import Slider from "../ui/Slider";
import AnimationSelection from "../animations/AnimationSelection";

export default function EffectsEditor() {
  const {
    textsDetails,
    blursDetails,
    selectedBlurId,
    setBlursDetails,
    imagesDetails,
    selectedImageID,
    setImagesDetails,
  } = useAppDetailsContext();

  const containerRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  // Scroll logic
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollToElement = (el: HTMLDivElement | null) => {
      if (!el) return;
      const offsetTop = el.offsetTop;
      container.scrollTo({ top: offsetTop, behavior: "smooth" });
    };

    const timeout = setTimeout(() => {
      if (selectedImageID) {
        scrollToElement(imageRef.current);
      } else if (selectedBlurId) {
        scrollToElement(blurRef.current);
      } else if (textsDetails.length > 0) {
        // Scroll to top or specific text element if a text is selected
        // For now, let's keep it simple and scroll to top for text
        container.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 50);

    return () => clearTimeout(timeout);
  }, [selectedBlurId, selectedImageID, textsDetails.length]);

  const [selectedTab, setSelectedTab] = useState("edit");

  return (
    <div
      ref={containerRef}
      className="bg-studio-surface text-ink-primary overflow-auto scrollbar-thin px-4 py-4 space-y-4"
    >
      <div className="grid grid-cols-3 gap-x-1 border-b border-studio-border">
        <button
          className={twMerge(
            "text-sm cursor-pointer p-2 text-center transition-colors duration-200",
            selectedTab === "edit"
              ? "font-semibold text-signal border-b-2 border-signal" // Active tab style
              : "text-ink-muted hover:text-ink-primary" // Inactive tab style
          )}
          onClick={() => setSelectedTab("edit")}
        >
          Edit
        </button>
        <button // Changed div to button
          className={twMerge(
            "text-sm cursor-pointer p-2 text-center transition-colors duration-200",
            selectedTab === "animation"
              ? "font-semibold text-signal border-b-2 border-signal" // Active tab style
              : "text-ink-muted hover:text-ink-primary" // Inactive tab style
          )}
          onClick={() => setSelectedTab("animation")}
        >
          Animation
        </button>
        <button // Changed div to button
          className={twMerge(
            "text-sm cursor-pointer p-2 text-center transition-colors duration-200",
            selectedTab === "transitions"
              ? "font-semibold text-signal border-b-2 border-signal" // Active tab style
              : "text-ink-muted hover:text-ink-primary" // Inactive tab style
          )}
          onClick={() => setSelectedTab("transitions")}
        >
          Transitions
        </button>
      </div>

      {selectedTab === "edit" && (
        <>
          {/* Text Editor */}
          {textsDetails.length > 0 && <TextEditor />}

          {/* Blur Control */}
          {blursDetails.length > 0 && (
            <div
              ref={blurRef}
              className="w-full bg-studio-raised text-ink-primary p-4 rounded-xl shadow-panel border border-studio-border "
            >
              <p className="text-sm font-semibold text-ink-primary mb-2">
                Blur
              </p>
              <div className="flex items-center gap-4">
                <label className="text-ink-secondary text-xs min-w-[70px]">
                  Blur Amount
                </label>
                <div className="w-full">
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={
                      blursDetails.find((blur) => blur.id === selectedBlurId)
                        ?.blurAmount || 0
                    }
                    onChange={(newValue) => {
                      setBlursDetails((prevDetails) =>
                        prevDetails.map((blur) =>
                          blur.id === selectedBlurId
                            ? { ...blur, blurAmount: newValue }
                            : blur
                        )
                      );
                    }}
                  />
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={
                    blursDetails.find((blur) => blur.id === selectedBlurId)
                      ?.blurAmount || 0
                  }
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value, 10);
                    setBlursDetails((prevDetails) =>
                      prevDetails.map((blur) =>
                        blur.id === selectedBlurId
                          ? { ...blur, blurAmount: newValue }
                          : blur
                      )
                    );
                  }}
                  className="w-[56px] text-center rounded bg-studio-void text-ink-primary px-2 py-[2px] border border-studio-border outline-none   "
                />
              </div>
            </div>
          )}

          {/* Image Opacity Control */}
          {imagesDetails.length > 0 && (
            <div
              ref={imageRef}
              className="w-full bg-studio-raised text-ink-primary p-4 rounded-xl shadow-panel border border-studio-border "
            >
              {" "}
              {/* Removed w-1/2, added box styling */}
              <p className="text-sm font-semibold text-ink-primary mb-2">
                Image Opacity
              </p>
              <div className="flex items-center gap-4">
                <label className="text-ink-secondary text-xs min-w-[70px]">
                  Opacity
                </label>
                {(() => {
                  const selectedImage = imagesDetails.find(
                    (img) => img.id === selectedImageID
                  );
                  const opacity = selectedImage?.opacity || 0;

                  return (
                    <>
                      <div className="w-full">
                        <Slider
                          min={0}
                          max={1}
                          step={0.01}
                          value={opacity}
                          onChange={(newValue) => {
                            setImagesDetails((prevDetails) =>
                              prevDetails.map((img) =>
                                img.id === selectedImageID
                                  ? { ...img, opacity: newValue }
                                  : img
                              )
                            );
                          }}
                        />
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={opacity}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value);
                          setImagesDetails((prevDetails) =>
                            prevDetails.map((img) =>
                              img.id === selectedImageID
                                ? { ...img, opacity: newValue }
                                : img
                            )
                          );
                        }}
                        className="w-[50px] text-center rounded bg-studio-void text-ink-primary px-2 py-[2px] border border-studio-border outline-none   "
                      />
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* No Effect Applied Message */}
          {blursDetails.length < 1 &&
            textsDetails.length < 1 &&
            imagesDetails.length < 1 && (
              <div className="w-full h-full flex justify-center items-center text-ink-faint italic text-sm">
                <p>No Effect Applied</p>
              </div>
            )}
        </>
      )}
      {
        // Animation Effects
        selectedTab === "animation" && <AnimationSelection />
      }
      {
        // transitions
        selectedTab === "transitions" && <ClipTransitionSelector />
      }
    </div>
  );
}
