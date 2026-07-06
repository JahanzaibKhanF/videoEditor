"use client";

import { BiSkipNext } from "react-icons/bi";
import { FaPause, FaPlay } from "react-icons/fa";
import { useAppDetailsContext } from "../../context/useAppContext";
import { useEngineControls } from "../../context/useAppContext";
import { formatVideoDuration } from "../../utils/formatVideoDuration";

const TBtn = ({ onClick, children, large = false, title, disabled = false }: {
  onClick?: () => void; children: React.ReactNode;
  large?: boolean; title?: string; disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`player-tbtn${large ? " player-tbtn-large" : ""}`}
    style={{ width: large ? 36 : 30, height: large ? 36 : 30, borderRadius: large ? 10 : 8, opacity: disabled ? 0.4 : 1 }}
  >
    {children}
  </button>
);

export default function PlayerControls() {
  const { currentTime, totalTime, fps, clipsDetails } = useAppDetailsContext();
  const { play, pause, seekTo, isPlaying } = useEngineControls();

  const step = 1 / (fps || 30);
  const hasClips = clipsDetails.length > 0;

  const goToStart = () => seekTo(0);
  const goToEnd = () => seekTo(totalTime);
  const stepBack = () => seekTo(Math.max(0, currentTime - step));
  const stepForward = () => seekTo(Math.min(totalTime, currentTime + step));

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <TBtn title="Go to start" onClick={goToStart} disabled={!hasClips}>
        <BiSkipNext size={13} style={{ transform: "rotate(180deg)" }} />
      </TBtn>

      <TBtn title="Step back" onClick={stepBack} disabled={!hasClips}>
        <FaPlay size={7} style={{ transform: "rotate(180deg)" }} />
      </TBtn>

      {!isPlaying ? (
        <TBtn large title="Play (Space)" onClick={play} disabled={!hasClips}>
          <FaPlay size={10} style={{ marginLeft: 2 }} />
        </TBtn>
      ) : (
        <TBtn large title="Pause (Space)" onClick={pause}>
          <FaPause size={10} />
        </TBtn>
      )}

      <TBtn title="Step forward" onClick={stepForward} disabled={!hasClips}>
        <FaPlay size={7} />
      </TBtn>

      <TBtn title="Go to end" onClick={goToEnd} disabled={!hasClips}>
        <BiSkipNext size={13} />
      </TBtn>

      <div className="player-time-display" style={{ marginLeft: 6 }}>
        {formatVideoDuration(currentTime)} / {formatVideoDuration(totalTime)}
      </div>
    </div>
  );
}
