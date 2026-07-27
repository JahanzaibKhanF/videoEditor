"use client";

type BlurComponentProps = {
  blurAmount: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const BlurComponent = ({
  blurAmount,
  x,
  y,
  width,
  height,
}: BlurComponentProps) => {
  return (
    <div
      className="absolute pointer-events-none Z-[100]"
      style={{
        top: y,
        left: x,
        width,
        height,
        zIndex: 60,
        backdropFilter: `blur(${blurAmount}px)`,
      }}
    />
  );
};

export default BlurComponent;
