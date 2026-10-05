// Libadwaita preference widgets shared by the Settings pages: titled groups of boxed-list rows, a switch and
// `set(key)`, the curried settings writer every control uses as its onChange.
import type { ReactNode } from "react";
import { useOS, type Settings } from "../../os/store";
export { Switch } from "../../shell/chrome";

export const set =
  <K extends keyof Settings>(key: K) =>
  (value: Settings[K]) =>
    useOS.getState().setSetting(key, value);

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h3 className="mb-2 text-sm font-bold">{title}</h3>}
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-view">{children}</div>
    </section>
  );
}

export function Row({
  title,
  subtitle,
  children,
  disabled,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={`flex min-h-14 items-center gap-4 px-4 py-2 ${disabled ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm">{title}</div>
        {subtitle && <div className="text-xs text-fg-dim">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
