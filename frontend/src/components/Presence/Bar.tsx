import type { PresenceUser } from "../../hooks/useListen";

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

// Shows other engineers currently viewing this session.
export function PresenceBar({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null;
  return (
    <div
      id="presence-bar"
      className="flex items-center gap-2 px-6 py-1.5 bg-emerald-50 dark:bg-emerald-900/20
        border-b border-emerald-100 dark:border-emerald-900/40"
    >
      <span className="flex -space-x-1.5" id="presence-names">
        {users.map((u) => (
          <span
            key={u.clientId}
            title={u.userName}
            className="h-5 w-5 rounded-full bg-emerald-500 text-white text-[10px]
              font-semibold flex items-center justify-center ring-2 ring-emerald-50
              dark:ring-emerald-900/20"
          >
            {initials(u.userName)}
          </span>
        ))}
      </span>
      <span className="text-xs text-emerald-700 dark:text-emerald-300">
        {users.length === 1
          ? `${users[0].userName} is also viewing`
          : `${users.length} others viewing`}
      </span>
    </div>
  );
}
