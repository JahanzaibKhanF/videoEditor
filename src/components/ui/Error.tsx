"use client";
import { PiWarningOctagonFill } from "@/utils/icons";


export default function Error({ error, closerFunction }: { error: string; closerFunction?: () => void }) {
  return (
    <div onClick={closerFunction} className="fixed inset-0 z-[100] flex justify-center bg-black/30" style={{ paddingTop: "12.3%" }}>
      <div className="fixed flex items-center gap-2 bg-danger/10 border border-danger/35 rounded-[10px] px-4 py-2.5 text-danger text-[13px] font-medium backdrop-blur-md">
        <PiWarningOctagonFill size={18} className="text-danger flex-shrink-0" />
        {error}!
      </div>
    </div>
  );
}
