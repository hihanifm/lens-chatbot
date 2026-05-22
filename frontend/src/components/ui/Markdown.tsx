import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a Markdown string as formatted HTML.
 * ReactMarkdown escapes raw HTML by default, so this is XSS-safe.
 * Element styling lives in `.md-body` (see index.css).
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
