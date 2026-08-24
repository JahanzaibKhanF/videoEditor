// TypeScript's bundled DOM lib already includes FileSystemFileHandle and
// FileSystemWritableFileStream, but not the window-level entry point that
// actually opens a save dialog and hands one back. This is the one piece
// missing — declared here instead of pulling in a whole extra @types
// package for a single function signature.
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
}

interface Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}