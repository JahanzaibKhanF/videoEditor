import { FaBan, FaArrowLeft, FaArrowUp, FaArrowDown, FaEye, FaEyeSlash, FaSearchPlus, FaArrowsAltH, FaSyncAlt, FaExpandAlt, FaCompressAlt, FaHeartbeat, FaMeteor, FaExchangeAlt, FaExchangeAltVertical, FaHandPointUp, FaCloud, FaLongArrowAltLeft, FaExpandArrowsAlt, FaRocket, FaFolderPlus, FaFolderOpen, FaArrowRight, FaCaretUp, FaCaretDown, FaCrosshairs, FaTimesCircle, FaMagic, FaCompress, FaExpand, FaWaveSquare, FaBolt, FaCircleNotch, FaStar, FaSun, FaMinusSquare, FaPlusSquare, FaBezierCurve, FaUndo, FaRedo, FaHourglassHalf, FaGraduationCap, FaMask, FaDolly, FaTruckLoading, FaLightbulb, FaPuzzlePiece, FaSpinner, FaEllipsisH, FaBars, FaClipboardList, FaLink, FaShareAlt, FaCubes, FaDraftingCompass } from "@/utils/icons";
export const animationOptions = [
  { name: "None", key: "none", Icon: FaBan },
  { name: "Slide In (Left)", key: "slideIn", Icon: FaArrowLeft },
  { name: "Slide In (Right)", key: "slideInRight", Icon: FaArrowRight }, // New
  { name: "Slide Up", key: "slideUp", Icon: FaArrowUp },
  { name: "Slide Down", key: "slideDown", Icon: FaArrowDown },
  { name: "Fade In", key: "fadeIn", Icon: FaEye },
  { name: "Fade Out", key: "fadeOut", Icon: FaEyeSlash },
  { name: "Zoom In", key: "zoomIn", Icon: FaSearchPlus },
  { name: "Mirror In", key: "mirrorIn", Icon: FaArrowsAltH }, // FaArrowsAltH for horizontal reflection
  { name: "Rotate In", key: "rotateIn", Icon: FaSyncAlt },
  { name: "Shake", key: "shake", Icon: FaBolt },
  { name: "Wiggle", key: "wiggle", Icon: FaWaveSquare },
  { name: "Sparkle", key: "sparkle", Icon: FaStar },
  { name: "Grow", key: "grow", Icon: FaExpandAlt },
  { name: "Shrink", key: "shrink", Icon: FaCompressAlt },
  { name: "Pulse (Continuous)", key: "pulse", Icon: FaHeartbeat },
  { name: "Bounce In", key: "bounceIn", Icon: FaMeteor },
  { name: "Flip In (X)", key: "flipX", Icon: FaExchangeAlt }, // Horizontal flip
  { name: "Flip In (Y)", key: "flipY", Icon: FaExchangeAltVertical }, // Using alias for clarity, can be styled with CSS to rotate 90deg
  // --- Existing Modern Animations ---
  { name: "Flip Bounce In", key: "flipBounceIn", Icon: FaHandPointUp },
  { name: "Blur In", key: "blurIn", Icon: FaCloud },
  {
    name: "Slide In (Left & Fade)",
    key: "slideInFromLeftFade",
    Icon: FaLongArrowAltLeft,
  },
  {
    name: "Scale & Rotate In",
    key: "scaleRotateIn",
    Icon: FaExpandArrowsAlt,
  },
  { name: "Light Speed In", key: "lightSpeedIn", Icon: FaRocket },
  { name: "Fold In", key: "foldIn", Icon: FaFolderPlus },
  { name: "Unfold Out", key: "unfoldOut", Icon: FaFolderOpen },

  // --- Many More Animation Types ---

  { name: "Pop In (Up)", key: "popInUp", Icon: FaCaretUp }, // New
  { name: "Pop In (Down)", key: "popInDown", Icon: FaCaretDown }, // New
  { name: "Target Zoom", key: "targetZoom", Icon: FaCrosshairs }, // New
  { name: "Explode Out", key: "explodeOut", Icon: FaTimesCircle }, // New
  { name: "Twirl In", key: "twirlIn", Icon: FaMagic }, // New
  { name: "Squeeze In", key: "squeezeIn", Icon: FaCompress }, // New
  { name: "Stretch Out", key: "stretchOut", Icon: FaExpand }, // New
  { name: "Wave In", key: "waveIn", Icon: FaWaveSquare }, // New
  { name: "Flash In", key: "flashIn", Icon: FaBolt }, // New
  { name: "Spin In", key: "spinIn", Icon: FaCircleNotch }, // New
  { name: "Bling In", key: "blingIn", Icon: FaStar }, // New
  { name: "Glow In", key: "glowIn", Icon: FaSun }, // New
  { name: "Collapse", key: "collapse", Icon: FaMinusSquare }, // New
  { name: "Expand", key: "expand", Icon: FaPlusSquare }, // New
  { name: "Smooth In", key: "smoothIn", Icon: FaBezierCurve }, // New
  { name: "Rewind In", key: "rewindIn", Icon: FaUndo }, // New
  { name: "Fast Forward Out", key: "fastForwardOut", Icon: FaRedo }, // New
  { name: "Slow Fade", key: "slowFade", Icon: FaHourglassHalf }, // New
  { name: "Reveal Up", key: "revealUp", Icon: FaGraduationCap }, // New
  { name: "Mask Reveal", key: "maskReveal", Icon: FaMask }, // New
  { name: "Slide From Top", key: "slideFromTop", Icon: FaDolly }, // New
  { name: "Slide From Bottom", key: "slideFromBottom", Icon: FaTruckLoading }, // New
  { name: "Flicker", key: "flicker", Icon: FaLightbulb }, // New
  { name: "Jigsaw In", key: "jigsawIn", Icon: FaPuzzlePiece }, // New
  { name: "Loading Spin (Continuous)", key: "loadingSpin", Icon: FaSpinner }, // New
  { name: "Dots Fade", key: "dotsFade", Icon: FaEllipsisH }, // New
  { name: "Stagger In", key: "staggerIn", Icon: FaBars }, // New
  { name: "Typewriter", key: "typewriter", Icon: FaClipboardList }, // New
  { name: "Chain Reaction", key: "chainReaction", Icon: FaLink }, // New
  { name: "Disperse", key: "disperse", Icon: FaShareAlt }, // New
  { name: "Stack In", key: "stackIn", Icon: FaCubes }, // New
  { name: "Draw In", key: "drawIn", Icon: FaDraftingCompass }, // New
];
