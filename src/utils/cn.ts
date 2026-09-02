import { twMerge } from "tailwind-merge";

/**
 * cn — join conditional class names and resolve Tailwind conflicts.
 * `cn("px-2", isBig && "px-4")` → `"px-4"`.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
