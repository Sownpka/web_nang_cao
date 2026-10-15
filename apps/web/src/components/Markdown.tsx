import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/** Renders problem statements. Raw HTML is not enabled, so markdown cannot inject markup. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:text-foreground prose-table:text-sm',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
