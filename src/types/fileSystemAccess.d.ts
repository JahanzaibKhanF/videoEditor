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

// TypeScript's bundled DOM lib also doesn't include the File System Access
// permissions API (queryPermission/requestPermission) on handle types, even
// though every browser that implements showDirectoryPicker/showOpenFilePicker
// also implements these. Declared here so useLocalMediaFolder.ts can call
// them directly instead of needing a `@ts-expect-error` at every call site.
type FileSystemPermissionMode = "read" | "readwrite";

interface FileSystemHandlePermissionDescriptor {
  mode?: FileSystemPermissionMode;
}

interface FileSystemHandle {
  queryPermission?: (
    descriptor?: FileSystemHandlePermissionDescriptor
  ) => Promise<"granted" | "denied" | "prompt">;
  requestPermission?: (
    descriptor?: FileSystemHandlePermissionDescriptor
  ) => Promise<"granted" | "denied" | "prompt">;
}