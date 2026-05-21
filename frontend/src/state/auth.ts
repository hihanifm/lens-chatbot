import { create } from "zustand";

const USER_ID_KEY = "lens_user_id";
const USER_NAME_KEY = "lens_user_name";

interface AuthState {
  userId: string | null;
  userName: string | null;
  setUser: (id: string, name: string) => void;
  signOut: () => void;
}

// Read persisted auth synchronously so the first render already knows whether
// the user is signed in — otherwise RequireAuth redirects to /login before an
// effect-based hydrate can run.
function initialAuth(): { userId: string | null; userName: string | null } {
  try {
    return {
      userId: localStorage.getItem(USER_ID_KEY),
      userName: localStorage.getItem(USER_NAME_KEY),
    };
  } catch {
    return { userId: null, userName: null };
  }
}

export const useAuth = create<AuthState>((set) => ({
  ...initialAuth(),
  setUser: (id, name) => {
    try {
      localStorage.setItem(USER_ID_KEY, id);
      localStorage.setItem(USER_NAME_KEY, name);
    } catch {}
    set({ userId: id, userName: name });
  },
  signOut: () => {
    try {
      localStorage.removeItem(USER_ID_KEY);
      localStorage.removeItem(USER_NAME_KEY);
    } catch {}
    set({ userId: null, userName: null });
  },
}));
