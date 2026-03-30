import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

export default function InfoButton({ children, title, className, ariaLabel = 'info' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const onDown = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={className || undefined}
      style={{ display: 'inline-block', position: 'relative' }}
    >
      <button
        type="button"
        className="btn btn--icon btn--ghost btn--small"
        aria-label={ariaLabel}
        title={title}
        onClick={() => setOpen((s) => !s)}
      >
        <Info size={16} />
      </button>

      {open && (
        <div
          className="info-popover"
          role="dialog"
          aria-label={title}
          style={{ position: 'absolute', zIndex: 1000, right: 0, top: 'calc(100% + 8px)' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
