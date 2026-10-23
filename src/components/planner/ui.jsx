import { useCallback, useEffect, useId, useRef, useState } from 'react';
import gsap from 'gsap';

/** Accessible modal built on <dialog>: focus trapping, Esc to close and backdrop click come from the platform. */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      gsap.fromTo(dlg, { y: 18, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.28, ease: 'power3.out', clearProps: 'transform,opacity' });
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-inner">
          <header className="modal-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Promise-based confirm dialog: `const [dialog, confirm] = useConfirm(); if (await confirm({...})) …` */
export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setState({ ...opts, resolve });
      }),
    [],
  );
  const close = (result) => {
    state?.resolve(result);
    setState(null);
  };
  const dialog = (
    <Modal
      open={Boolean(state)}
      onClose={() => close(false)}
      title={state?.title ?? 'Are you sure?'}
      size="sm"
      footer={
        <>
          <button type="button" className="btn" onClick={() => close(false)}>
            {state?.cancelLabel ?? 'Cancel'}
          </button>
          <button type="button" className={`btn ${state?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
            {state?.confirmLabel ?? 'Continue'}
          </button>
        </>
      }
    >
      <p className="muted">{state?.message}</p>
    </Modal>
  );
  return [dialog, confirm];
}

/** Dropdown menu with keyboard support (arrows, Home/End, Esc). */
export function Menu({ label, buttonClass = 'btn', icon, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const btnId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    listRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  const onKeyDown = (e) => {
    const els = Array.from(listRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') ?? []);
    const i = els.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      setOpen(false);
      wrapRef.current?.querySelector('button')?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="menu" ref={wrapRef} onKeyDown={onKeyDown}>
      <button type="button" id={btnId} className={buttonClass} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        {label && <span>{label}</span>}
      </button>
      {open && (
        <div className={`menu-list align-${align}`} role="menu" aria-labelledby={btnId} ref={listRef}>
          {items.map((item, i) =>
            item === 'divider' ? (
              <div key={i} className="menu-divider" role="separator" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`menu-item${item.danger ? ' is-danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <span>{item.label}</span>
                {item.hint && <kbd>{item.hint}</kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'info', ms = 4200) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    if (ms) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  const view = (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast tone-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <span>{t.message}</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
  return [view, push];
}

export function useMediaQuery(query) {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
