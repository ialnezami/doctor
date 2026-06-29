import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Searchable combobox: shows predefined options filtered by text input.
 * Allows free-text entry — if the typed value isn't in the list, it's kept as-is.
 *
 * Props:
 *   value        — controlled value (string)
 *   onChange     — (val: string) => void
 *   options      — string[]   predefined options
 *   placeholder  — string
 *   inputStyle   — CSSProperties to merge onto the <input>
 */
export default function ComboSelect({ value, onChange, options = [], placeholder = '', inputStyle = {} }) {
  const [query, setQuery]       = useState(value || '');
  const [open, setOpen]         = useState(false);
  const [cursor, setCursor]     = useState(-1);
  const containerRef            = useRef(null);
  const inputRef                = useRef(null);
  const listRef                 = useRef(null);

  // Keep local query in sync when controlled value changes externally
  useEffect(() => { setQuery(value || ''); }, [value]);

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const commit = useCallback((val) => {
    onChange(val);
    setQuery(val);
    setOpen(false);
    setCursor(-1);
  }, [onChange]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);       // live update — allows custom values
    setOpen(true);
    setCursor(-1);
  };

  const handleKeyDown = (e) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return; }
    if (e.key === 'Escape')     { setOpen(false); setCursor(-1); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setCursor(c => Math.max(c - 1, -1)); return; }
    if (e.key === 'Enter')      {
      e.preventDefault();
      if (cursor >= 0 && filtered[cursor]) commit(filtered[cursor]);
      else setOpen(false);
    }
  };

  // Scroll active option into view
  useEffect(() => {
    if (cursor >= 0 && listRef.current) {
      const item = listRef.current.children[cursor];
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [cursor]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setCursor(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: inputStyle.flex || 1 }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          ...inputStyle,
        }}
      />

      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: 160,
            maxWidth: 220,
            maxHeight: 200,
            overflowY: 'auto',
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            zIndex: 200,
          }}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); commit(opt); }}
              onMouseEnter={() => setCursor(i)}
              style={{
                padding: '7px 12px',
                fontSize: 12,
                cursor: 'pointer',
                color: cursor === i ? 'var(--mint)' : 'var(--text)',
                background: cursor === i ? 'var(--mint-dim)' : 'transparent',
                borderRadius: i === 0 ? '8px 8px 0 0' : i === filtered.length - 1 ? '0 0 8px 8px' : 0,
                transition: 'background .08s',
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
