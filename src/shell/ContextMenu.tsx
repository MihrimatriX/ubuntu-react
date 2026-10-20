// The one context menu. Anyone calls useOS().openMenu(event, items) with a plain item array; this renders
// it, flips it back inside the viewport after measuring, and supports ↑/↓/Home/End/Enter/Esc navigation.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { useOS } from "../os/store";

const MARGIN = 6;

export function ContextMenu() {
  const menu = useOS((state) => state.menu);
  const closeMenu = useOS((state) => state.closeMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    // Flip to the other side of the anchor point when the menu would overflow, then clamp.
    const flip = (start: number, size: number, limit: number) =>
      Math.max(MARGIN, start + size > limit - MARGIN ? Math.min(start - size, limit - size - MARGIN) : start);
    setPosition({ x: flip(menu.x, width, innerWidth), y: flip(menu.y, height, innerHeight) });
    ref.current.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu]);

  if (!menu) return null;

  function onKeyDown(event: KeyboardEvent) {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: buttons.length - 1,
    };
    if (event.key === "Escape") closeMenu();
    else if (event.key in moves) buttons.at(moves[event.key]! % buttons.length)?.focus();
    else return;
    event.preventDefault();
  }

  return (
    <div
      className="fixed inset-0 z-[9000]"
      onPointerDown={closeMenu}
      onContextMenu={(e) => {
        e.preventDefault();
        closeMenu();
      }}
    >
      <div
        ref={ref}
        role="menu"
        onKeyDown={onKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        className="anim-pop absolute min-w-52 rounded-xl border border-white/10 bg-[#353535] p-1.5 text-sm text-white shadow-2xl"
        style={{ left: position.x, top: position.y }}
      >
        {menu.items.map((item, index) =>
          item === "separator" ? (
            <div key={index} role="separator" className="mx-2 my-1 h-px bg-white/10" />
          ) : (
            <button
              key={index}
              role="menuitem"
              disabled={item.disabled}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-white/10 focus:bg-white/10 focus:outline-none disabled:opacity-40"
              onClick={() => {
                closeMenu();
                item.action?.();
              }}
            >
              <span className="w-4">{item.checked && <Check className="size-4" />}</span>
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <span className="text-xs text-white/50">{item.shortcut}</span>}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
