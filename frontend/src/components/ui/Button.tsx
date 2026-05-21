import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 " +
    "focus-visible:ring-2 focus-visible:ring-blue-500/40",
  secondary:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 " +
    "focus-visible:ring-2 focus-visible:ring-blue-500/40",
  ghost:
    "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800 " +
    "focus-visible:ring-2 focus-visible:ring-blue-500/40",
  danger:
    "bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 " +
    "focus-visible:ring-2 focus-visible:ring-red-500/40",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs rounded-md",
  md: "px-3 py-2 text-sm rounded-lg",
  lg: "px-4 py-3 text-sm font-medium rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium",
        "transition-colors outline-none disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
});
