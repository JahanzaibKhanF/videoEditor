import { Input, ALL_FORMATS, BlobSource } from "mediabunny";

export async function getFps(file: File): Promise<number | null> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error("No video track found");

  const stats = await videoTrack.computePacketStats(100);
  return stats.averagePacketRate ?? null;
}
