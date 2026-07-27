import { useState } from "react";

export default function DraggableWrapper({
  children,
  closeOn,
  boxWidth,
}: {
  children: React.ReactNode;
  boxWidth: string;
  closeOn: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setPosition({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      onClick={closeOn}
      className="h-screen w-full bg-black/50 fixed inset-0 z-[1000] flex items-center justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: boxWidth,
          height: "auto", // 👈 shrink to fit
          maxHeight: "90vh", // 👈 never exceed screen height
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
        className="overflow-hidden flex flex-col" // ensure flex column layout
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {children}
      </div>
    </div>
  );
}
