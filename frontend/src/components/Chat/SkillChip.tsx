export function SkillChip({
  name,
  onRemove,
}: {
  name: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
        bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
    >
      <span aria-hidden>🧩</span>
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 text-violet-500 hover:text-violet-800 dark:hover:text-violet-100"
          aria-label={`Remove skill ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
