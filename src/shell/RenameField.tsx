// Inline rename input shared by Desktop and Files: selects the name without extension, Enter/blur commits, Esc cancels.
import { useEffect, useRef } from "react";
import { basename } from "../os/fs";
import { renamePath } from "../os/launch";

export function RenameField({
  path,
  onDone,
  className = "",
}: {
  path: string;
  onDone: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const name = basename(path);
  useEffect(() => {
    const dot = name.lastIndexOf(".");
    ref.current?.focus();
    ref.current?.setSelectionRange(0, dot > 0 ? dot : name.length);
  }, [name]);
  const commit = () => {
    renamePath(path, ref.current?.value ?? name);
    onDone();
  };
  return (
    <input
      ref={ref}
      defaultValue={name}
      aria-label="New name"
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onDone();
      }}
      className={`w-full rounded bg-view px-1 text-center text-sm text-fg outline-2 outline-accent ${className}`}
    />
  );
}
