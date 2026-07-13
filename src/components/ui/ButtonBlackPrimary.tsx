"use client";

export default function ButtonBlackPrimary({ onClick, children, disabled = false }: { onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode; disabled?: boolean; }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-studio-border bg-studio-raised text-ink-secondary text-[12px] font-medium cursor-pointer hover:bg-studio-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all font-[inherit]">
      {children}
    </button>
  );
}
