import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Modal built on native <dialog>: focus trapping, Esc and backdrop come from the browser. */
export function Dialog({ open, onClose, title, children, footer, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50',
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Đóng">
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
