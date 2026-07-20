// Centralized icon module — single premium icon set (lucide-react).
// This replaces every react-icons import in the app. Each export below is the
// original icon name used across the codebase, re-pointed at its lucide-react
// equivalent, so every icon in the product now comes from one consistent library.
import {
  Activity,
  AlertOctagon,
  AlignJustify,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  AtSign,
  Ban,
  Blend,
  Bold,
  Box,
  Camera,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsRight,
  Clapperboard,
  ClipboardList,
  CloudFog,
  Code2,
  Compass,
  Crop,
  Crosshair,
  Download,
  Expand,
  Eye,
  EyeOff,
  FileVideo,
  Film,
  FolderOpen,
  FolderPlus,
  GraduationCap,
  Hand,
  Hourglass,
  Italic,
  Layers,
  LayoutTemplate,
  Lightbulb,
  Link2,
  Loader2,
  LoaderCircle,
  Maximize,
  Maximize2,
  Minimize,
  Minimize2,
  Minus,
  MinusSquare,
  MoreHorizontal,
  MoveHorizontal,
  Music2,
  Pause,
  Play,
  PlayCircle,
  Plus,
  PlusSquare,
  Puzzle,
  Redo2,
  Rocket,
  RotateCw,
  Share2,
  SkipForward,
  Sparkles,
  Spline,
  SplitSquareHorizontal,
  Square,
  Star,
  Sun,
  Truck,
  Type,
  Underline,
  Undo2,
  Upload,
  VenetianMask,
  Wand2,
  Waves,
  X,
  XCircle,
  Zap,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";

export type { LucideIcon };

// Also re-export the entire lucide-react icon set under its native names,
// so new code can import icons directly (e.g. `import { X } from "@/utils/icons"`)
// instead of going through a legacy react-icons-style alias.
export * from "lucide-react";
// `Image` collides with the DOM's global Image constructor in plain .ts
// files, so it's also available under a disambiguated name.
export { Image as ImageIcon } from "lucide-react";

export { SplitSquareHorizontal as AiOutlineSplitCells };
export { Plus as BiPlus };
export { SkipForward as BiSkipNext };
export { X as BiX };
export { LayoutTemplate as CgTemplate };
export { Type as CiText };
export { ChevronsDown as FaAngleDoubleDown };
export { ChevronsRight as FaAngleDoubleRight };
export { ArrowDown as FaArrowDown };
export { ArrowLeft as FaArrowLeft };
export { ArrowRight as FaArrowRight };
export { ArrowUp as FaArrowUp };
export { MoveHorizontal as FaArrowsAltH };
export { Ban as FaBan };
export { AlignJustify as FaBars };
export { Spline as FaBezierCurve };
export { Bold as FaBold };
export { Zap as FaBolt };
export { ChevronDown as FaCaretDown };
export { ChevronUp as FaCaretUp };
export { LoaderCircle as FaCircleNotch };
export { ClipboardList as FaClipboardList };
export { CloudFog as FaCloud };
export { Minimize as FaCompress };
export { Minimize2 as FaCompressAlt };
export { Crosshair as FaCrosshairs };
export { Box as FaCubes };
export { Truck as FaDolly };
export { Download as FaDownload };
export { Compass as FaDraftingCompass };
export { MoreHorizontal as FaEllipsisH };
export { ArrowLeftRight as FaExchangeAlt };
export { ArrowUpDown as FaExchangeAltVertical };
export { Maximize as FaExpand };
export { Maximize2 as FaExpandAlt };
export { Expand as FaExpandArrowsAlt };
export { Eye as FaEye };
export { EyeOff as FaEyeSlash };
export { FolderOpen as FaFolderOpen };
export { FolderPlus as FaFolderPlus };
export { GraduationCap as FaGraduationCap };
export { Hand as FaHandPointUp };
export { Activity as FaHeartbeat };
export { Hourglass as FaHourglassHalf };
export { Italic as FaItalic };
export { Layers as FaLayerGroup };
export { Lightbulb as FaLightbulb };
export { Link2 as FaLink };
export { ArrowLeftToLine as FaLongArrowAltLeft };
export { Wand2 as FaMagic };
export { VenetianMask as FaMask };
export { Sparkles as FaMeteor };
export { Minus as FaMinus };
export { MinusSquare as FaMinusSquare };
export { Pause as FaPause };
export { Film as FaPhotoVideo };
export { Play as FaPlay };
export { PlayCircle as FaPlayCircle };
export { Plus as FaPlus };
export { PlusSquare as FaPlusSquare };
export { Puzzle as FaPuzzlePiece };
export { Redo2 as FaRedo };
export { Rocket as FaRocket };
export { ZoomIn as FaSearchPlus };
export { Share2 as FaShareAlt };
export { Loader2 as FaSpinner };
export { Star as FaStar };
export { Sun as FaSun };
export { RotateCw as FaSyncAlt };
export { XCircle as FaTimesCircle };
export { Truck as FaTruckLoading };
export { Underline as FaUnderline };
export { Undo2 as FaUndo };
export { Waves as FaWaveSquare };
export { AtSign as FaXTwitter };
export { Layers as FiLayers };
export { FileVideo as GoFileMedia };
export { Sun as GoSun };
export { Camera as IoLogoInstagram };
export { Music2 as IoLogoTiktok };
export { Clapperboard as IoLogoYoutube };
export { Play as IoPlayOutline };
export { Square as IoSquareOutline };
export { Type as IoTextOutline };
export { Blend as MdBlurOn };
export { Crop as MdCropSquare };
export { Sparkles as MdOutlineAnimation };
export { Upload as PiExportBold };
export { AlertOctagon as PiWarningOctagonFill };
export { Code2 as RiBracketsFill };
export { ArrowRightLeft as TbTransitionRight };
export { XCircle as TiDelete };
