import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** Styled native <select>: accessible and mobile-friendly without extra dependencies. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('relative', className)}>
      <select
        ref={ref}
        className="h-9 w-full appearance-none rounded-md border border-input bg-background py-1 pr-8 pl-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
Select.displayName = 'Select';
