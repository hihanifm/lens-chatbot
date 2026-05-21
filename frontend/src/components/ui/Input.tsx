import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

const fieldClasses =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 " +
  "placeholder:text-gray-400 " +
  "focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 " +
  "dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 " +
  "dark:focus:border-blue-400";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClasses, className)} {...props} />;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldClasses, "resize-y", className)} {...props} />;
  }
);
