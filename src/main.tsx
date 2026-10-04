// Entry: loads fonts, mirrors theme/accent settings onto <html>, and renders the current session screen.
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ubuntu/300.css";
import "@fontsource/ubuntu/400.css";
import "@fontsource/ubuntu/500.css";
import "@fontsource/ubuntu/700.css";
import "@fontsource/ubuntu-mono/400.css";
import "@fontsource/ubuntu-mono/700.css";
import { useOS } from "./os/store";
import { Desktop } from "./shell/Desktop";
import { BootSplash, LockScreen, LoginScreen, PowerOff } from "./shell/Session";

const SCREENS = { boot: BootSplash, login: LoginScreen, off: PowerOff };

function Root() {
  const theme = useOS((state) => state.settings.theme);
  const accent = useOS((state) => state.settings.accent);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--accent", accent);
  }, [theme, accent]);
  const session = useOS((state) => state.session);
  const locked = useOS((state) => state.locked);
  if (session !== "desktop") {
    const Screen = SCREENS[session];
    return <Screen />;
  }
  return (
    <>
      <Desktop />
      {locked && <LockScreen />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
