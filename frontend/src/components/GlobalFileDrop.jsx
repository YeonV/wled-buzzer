import { useState, useEffect, useCallback, useRef } from 'react';
import { Package } from 'lucide-react';
import { useSessionStore } from '../store/sessionStore';
import { peekPack } from '../services/api';
import { BACKEND_URL } from '../utils/viewMode';

/**
 * Global file-drop provider — shows an overlay when a .zip is dragged onto the window.
 * Respects local drop zones: if a drop event was already handled (defaultPrevented or
 * stopped propagation), the global handler ignores it.
 */
export default function GlobalFileDrop({ children }) {
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const isZipDrag = (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return false;
    const items = e.dataTransfer.items;
    if (!items?.length) return true; // can't check type during dragenter in some browsers, assume zip
    for (let i = 0; i < items.length; i++) {
      if (items[i].type === 'application/zip' || items[i].type === 'application/x-zip-compressed') return true;
      // Some browsers don't expose MIME during drag — check if any file item exists
      if (items[i].kind === 'file') return true;
    }
    return false;
  };

  const onDragEnter = useCallback((e) => {
    if (!isZipDrag(e)) return;
    dragCounter.current++;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
  }, [dragging]);

  const onDrop = useCallback(async (e) => {
    dragCounter.current = 0;
    setDragging(false);

    // If a local drop zone already handled this, skip
    if (e.defaultPrevented) return;

    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.zip')) return;

    e.preventDefault();

    // Read the zip and peek
    try {
      const raw = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = ev => res(ev.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const peek = await peekPack(BACKEND_URL, raw);
      if (!peek) return;

      // Store the peek data for PackManager to pick up
      useSessionStore.setState({
        showPackManager: true,
        pendingPackImport: {
          raw,
          meta: peek.meta,
          contents: peek.contents,
          fileName: file.name,
        },
      });
    } catch (err) {
      console.error('Global drop failed:', err);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, [onDragEnter, onDragLeave, onDragOver, onDrop]);

  return (
    <>
      {children}
      {dragging && (
        <div className="global-drop-overlay">
          <div className="global-drop-overlay__inner">
            <Package size={48} />
            <div style={{ marginTop: '0.75rem' }}>Drop pack to import</div>
          </div>
        </div>
      )}
    </>
  );
}
