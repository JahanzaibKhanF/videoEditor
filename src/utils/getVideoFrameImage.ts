// utils/getVideoFrameImage.ts
export async function getVideoFrameImage(
  videoUrl: string,
): Promise<string> {
  try {
    // 1. Fetch video blob with Bearer token
    const response = await fetch(videoUrl, {
      method: "GET",
   
    });

    if (!response.ok) {
      console.warn("Failed to fetch video:", response.status);
      return "";
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    // 2. Load video element
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = blobUrl;
    video.muted = true;
    video.playsInline = true;

    // 3. Wait for metadata
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject("Video metadata failed to load");
    });

    // 4. Seek to 1s or less if duration too short
    const seekTime = Math.min(1, video.duration - 0.1);
    video.currentTime = seekTime;

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject("Seek failed");
    });

    // 5. Draw frame
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");

    // 6. Cleanup
    URL.revokeObjectURL(blobUrl);
    video.remove();

    return dataUrl;
  } catch (error) {
    console.error("getVideoFrameImage error:", error);
    return "";
  }
}
