import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-gray-200 rounded-xl",
        "dark:bg-slate-900 dark:border-slate-800",
        interactive &&
          "transition-all hover:border-blue-300 hover:shadow-sm dark:hover:border-blue-500/60",
        className
      )}
      {...props}
    />
  );
}
