import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import { SettingsModal } from "./Settings/Modal";
import { useAuth } from "../state/auth";

export default function Header() {
  const location = useLocation();
  const userName = useAuth((s) => s.userName);
  const userId = useAuth((s) => s.userId);
  const signOut = useAuth((s) => s.signOut);
  const onLogin = location.pathname === "/login";
  const [settingsOpen, setSettingsOpen] = useState(false);

  const navBtn =
    "text-sm px-3 py-1.5 rounded-lg bg-blue-500/30 hover:bg-blue-500/50 " +
    "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/50";

  return (
    <header className="bg-blue-600 text-white border-b border-blue-700 shrink-0">
      <div className="w-[92%] max-w-6xl mx-auto flex items-center justify-between gap-4 py-3">
        <Link to="/" className="flex items-baseline gap-2 group">
          <span className="text-xl font-bold tracking-tight">LENS</span>
          <span aria-hidden className="text-lg">🔍</span>
          <span className="hidden sm:inline text-sm text-blue-100/90 group-hover:text-white transition-colors">
            Debug bugs faster
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {userId && !onLogin && (
            <>
              {userName && (
                <span className="hidden sm:inline text-sm text-blue-100/90 px-2">
                  {userName}
                </span>
              )}
              <button type="button" onClick={() => setSettingsOpen(true)} className={navBtn}>
                ⚙ Settings
              </button>
              <button type="button" onClick={signOut} className={navBtn}>
                Sign out
              </button>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
