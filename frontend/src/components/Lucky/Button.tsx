// 🎲 Lucky — seeds the session's first turn with an automatic root-cause
// investigation. It is a normal persisted session: the agent may reply with a
// plan and a question, and the user keeps chatting in the composer. Clicking
// 🎲 again starts a fresh investigation.
export function LuckyButton({
  disabled,
  onLucky,
}: {
  disabled?: boolean;
  onLucky: () => void;
}) {
  return (
    <button
      id="lucky-btn"
      type="button"
      disabled={disabled}
      onClick={() => onLucky()}
      title="Start a guided root-cause investigation — you can keep chatting in this session"
      className="text-xs px-2.5 py-1 rounded-lg border
        border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100
        dark:border-amber-700/60 dark:text-amber-300 dark:bg-amber-900/30
        dark:hover:bg-amber-900/50 disabled:opacity-40 transition-colors"
    >
      🎲 Lucky
    </button>
  );
}
