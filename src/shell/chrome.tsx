// Shared window-chrome building blocks used by apps: header-bar slots, alert dialogs, a crash boundary,
// the libadwaita segmented switcher (Calculator, System Monitor, Clocks) and a closable tab strip
// (Terminal, Text Editor, Firefox).
import { Component, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";

/** Save callbacks registered by apps with unsaved state, used by the close-confirmation dialog. */
export const saveHandlers = new Map<string, () => boolean>();

/** Portals app widgets into the header bar; content in the "center" slot replaces the window title. */
export function HeaderSlot({
  windowId,
  side = "start",
  children,
}: {
  windowId: string;
  side?: "start" | "center" | "end";
  children: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById(`hdr-${side}-${windowId}`));
  }, [windowId, side]);
  return target ? createPortal(children, target) : null;
}

type Action = { label: string; style?: "danger" | "accent"; run: () => void };

/** Libadwaita alert dialog, modal over its window. Cancel (or Esc) dismisses; the actions follow it. */
export function Dialog({
  title,
  body,
  onCancel,
  actions,
}: {
  title: string;
  body: ReactNode;
  onCancel: () => void;
  actions: Action[];
}) {
  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/40"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <div
        role="alertdialog"
        aria-label={title}
        className="anim-pop w-80 rounded-xl bg-popover p-5 text-center text-fg shadow-xl"
      >
        <h3 className="font-bold">{title}</h3>
        <div className="mt-2 text-sm text-fg-dim">{body}</div>
        <div className="mt-5 flex gap-2 [&>*]:flex-1">
          <button autoFocus className="btn" onClick={onCancel}>
            {actions.length ? "Cancel" : "Close"}
          </button>
          {actions.map((action) => (
            <button
              key={action.label}
              className={`btn ${action.style ? `btn-${action.style}` : ""}`}
              onClick={action.run}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Keeps one crashing app from taking down the desktop: shows GNOME's "has stopped" sheet instead. */
export class AppErrorBoundary extends Component<
  { name: string; onClose: () => void; children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <Dialog
        title={`“${this.props.name}” has stopped`}
        body={<code className="break-all text-xs">{this.state.error.message}</code>}
        onCancel={this.props.onClose}
        actions={[{ label: "Restart", style: "accent", run: () => this.setState({ error: null }) }]}
      />
    );
  }
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-accent" : "bg-fg/25"}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${checked ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-md bg-hover p-0.5 text-sm">
      {(Object.keys(options) as T[]).map((key) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`whitespace-nowrap rounded px-3 py-1 ${value === key ? "bg-view font-bold shadow" : "hover:bg-hover"}`}
        >
          {options[key]}
        </button>
      ))}
    </div>
  );
}

type TabProps<T> = {
  tabs: T[];
  active: number;
  title: (tab: T) => ReactNode;
  icon?: (tab: T) => ReactNode;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
  onAdd?: () => void;
  className?: string;
};

export function TabStrip<T extends { id: number }>({
  tabs,
  active,
  title,
  icon,
  onSelect,
  onClose,
  onAdd,
  className = "",
}: TabProps<T>) {
  return (
    <div role="tablist" className={`flex min-w-0 items-center gap-1 ${className}`}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === active}
          tabIndex={0}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(e) => e.key === "Enter" && onSelect(tab.id)}
          onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
          className={`flex h-8 min-w-0 max-w-56 flex-1 items-center gap-2 rounded-md px-2 text-sm ${tab.id === active ? "bg-view font-bold shadow-sm" : "hover:bg-hover"}`}
        >
          {icon?.(tab)}
          <span className="flex-1 truncate text-center">{title(tab)}</span>
          <button
            aria-label="Close Tab"
            className="rounded-full p-0.5 hover:bg-fg/15"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {onAdd && (
        <button aria-label="New Tab" className="btn btn-flat shrink-0" onClick={onAdd}>
          <Plus className="size-4" />
        </button>
      )}
    </div>
  );
}
