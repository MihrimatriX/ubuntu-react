// Session screens around the desktop: boot splash (~1.5s) → GDM login (any password) → desktop; the
// lock screen (clock, then password on click/key) overlays the still-running desktop; Power Off is a
// black screen with a power-on button that boots again.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BatteryFull, Power, Volume2, Wifi } from "lucide-react";
import { enterFullscreen } from "../os/keyboard";
import { UBUNTU_LOGO } from "../os/seed";
import { useOS } from "../os/store";
import { formatTime, useMinute } from "./TopBar";

const BOOT_MS = 1500;

export function BootSplash() {
  useEffect(() => {
    const timer = setTimeout(() => useOS.getState().setSession("login"), BOOT_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white" aria-label="Booting">
      <img src={UBUNTU_LOGO} alt="" className="size-24" />
      <div className="mt-10 flex gap-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <i
            key={index}
            className="block size-2 animate-pulse rounded-full bg-white"
            style={{ animationDelay: `${index * 150}ms` }}
          />
        ))}
      </div>
      <span className="absolute bottom-12 text-2xl font-light tracking-wide">ubuntu</span>
    </div>
  );
}

function Avatar({ size = "size-24" }: { size?: string }) {
  return (
    <div className={`${size} grid place-items-center rounded-full bg-accent text-4xl font-medium text-white`}>U</div>
  );
}

/** Avatar, name and a password entry; any non-empty password is accepted. */
function PasswordPrompt({ onUnlock, onCancel }: { onUnlock: () => void; onCancel?: () => void }) {
  const [password, setPassword] = useState("");
  return (
    <form
      className="anim-pop flex flex-col items-center gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (password) onUnlock();
      }}
    >
      <Avatar />
      <span className="text-xl">ubuntu</span>
      <div className="flex w-72 items-center gap-2">
        <input
          autoFocus
          type="password"
          aria-label="Password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
          className="h-10 flex-1 rounded-lg bg-white/15 px-3 text-white outline-none placeholder:text-white/50 focus:ring-2 focus:ring-accent"
        />
        <button
          aria-label="Unlock"
          disabled={!password}
          className="grid size-10 place-items-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
    </form>
  );
}

export function LoginScreen() {
  const now = useMinute();
  const clock24 = useOS((state) => state.settings.clock24);
  const [chosen, setChosen] = useState(false);
  const login = () => {
    const os = useOS.getState();
    os.setSession("desktop");
    if (!os.hintShown) {
      useOS.setState({ hintShown: true });
      os.notify({
        title: "Tip: press F11 for full screen",
        body: "Full screen with keyboard lock lets Super, Alt+Tab and Ctrl+Alt+T reach Ubuntu. Alternatives are listed in Settings › Keyboard.",
        action: { label: "Enter Full Screen", run: enterFullscreen },
      });
    }
  };
  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#2c001e] to-[#1a1a1a] text-white">
      <header className="flex h-8 items-center justify-center bg-black text-sm font-medium">
        {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}&nbsp;&nbsp;
        {formatTime(now, clock24)}
      </header>
      <main className="grid flex-1 place-items-center">
        {chosen ? (
          <PasswordPrompt onUnlock={login} onCancel={() => setChosen(false)} />
        ) : (
          <button
            className="flex w-72 items-center gap-4 rounded-2xl p-3 hover:bg-white/10"
            onClick={() => setChosen(true)}
          >
            <Avatar size="size-14" />
            <span className="text-lg">ubuntu</span>
          </button>
        )}
      </main>
      <div className="flex items-center justify-between p-6">
        <button
          aria-label="Power Off"
          className="grid size-10 place-items-center rounded-full hover:bg-white/10"
          onClick={() => useOS.getState().setSession("off")}
        >
          <Power className="size-5" />
        </button>
        <span className="flex items-center gap-2 text-xl font-light">
          <img src={UBUNTU_LOGO} alt="" className="size-8" />
          ubuntu
        </span>
      </div>
    </div>
  );
}

export function LockScreen() {
  const now = useMinute();
  const clock24 = useOS((state) => state.settings.clock24);
  const wallpaper = useOS((state) => state.settings.wallpaper);
  const [prompt, setPrompt] = useState(false);
  const lockedAt = useRef(Date.now());
  const missed = useOS((state) =>
    state.settings.lockNotifications ? state.notes.filter((note) => note.time >= lockedAt.current).length : 0,
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => !prompt && event.key !== "Escape" && setPrompt(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prompt]);
  return (
    <div className="fixed inset-0 z-[10000] overflow-hidden bg-black text-white" onClick={() => setPrompt(true)}>
      <div
        className="absolute -inset-10 scale-105 bg-cover bg-center blur-2xl brightness-50"
        style={{ backgroundImage: `url("${wallpaper}")` }}
      />
      <div className="relative flex justify-end gap-3 p-2 text-white/90 [&>svg]:size-4" aria-hidden>
        <Wifi />
        <Volume2 />
        <BatteryFull />
      </div>
      <div className="relative grid h-[calc(100%-32px)] place-items-center">
        {prompt ? (
          <PasswordPrompt onUnlock={() => useOS.getState().setLocked(false)} onCancel={() => setPrompt(false)} />
        ) : (
          <div className="anim-pop flex flex-col items-center">
            <span className="text-8xl font-light tabular-nums">{formatTime(now, clock24)}</span>
            <span className="mt-2 text-2xl">
              {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </span>
            {missed > 0 && (
              <span className="mt-8 rounded-full bg-white/15 px-4 py-1.5 text-sm">
                {missed} new notification{missed > 1 ? "s" : ""}
              </span>
            )}
            <span className="mt-24 text-sm text-white/60">Click or press a key to unlock</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function PowerOff() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-black">
      <button
        aria-label="Power On"
        className="flex flex-col items-center gap-3 text-white/40 hover:text-white/80"
        onClick={() => useOS.getState().setSession("boot")}
      >
        <Power className="size-14" />
        Power on
      </button>
    </div>
  );
}
