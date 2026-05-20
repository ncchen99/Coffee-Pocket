// Shared sketch primitives for Coffee Pocket wireframes.
// All exported via window.* so other babel scripts can use them.

const Pill = ({ children, sel, acc, style }) => (
  <span className={`pill ${sel ? 'sel' : ''} ${acc ? 'acc' : ''}`} style={style}>{children}</span>
);

const Chip = ({ children, style }) => (
  <span className="chip" style={style}>{children}</span>
);

const Divider = ({ soft, dashed, style }) => (
  <div className={`divider ${soft ? 'soft' : ''} ${dashed ? 'dashed' : ''}`} style={style} />
);

const Cap = ({ children, style }) => (
  <div className="label-cap" style={style}>{children}</div>
);

const Ann = ({ children, style }) => (
  <div className="ann" style={style}>{children}</div>
);

const Placeholder = ({ w, h, label, style }) => (
  <div className="placeholder" style={{ width: w, height: h, position: 'relative', ...style }}>
    {label && (
      <div className="mono" style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'var(--ink-soft)', background: 'var(--paper)',
        margin: 4, padding: '0 4px', borderRadius: 2,
      }}>{label}</div>
    )}
  </div>
);

// Annotation arrow — a little hand-drawn arrow with a label.
// Position via absolute placement (left/top/right/bottom). path goes inside an
// inline svg sized to `size`. Arrow head at the END of the path.
const ArrowNote = ({ children, x, y, w = 120, h = 60, path, anchor = 'tl', side = 'right' }) => {
  // anchor: where in the parent to place the arrow box (tl,tr,bl,br)
  const pos = {
    tl: { left: x, top: y },
    tr: { right: x, top: y },
    bl: { left: x, bottom: y },
    br: { right: x, bottom: y },
  }[anchor];
  return (
    <div className="arrow" style={{ ...pos, width: w, height: h }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <path d={path} stroke="var(--ink-soft)" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="ann" style={{
        position: 'absolute', [side === 'right' ? 'right' : 'left']: 0,
        top: 0, maxWidth: w - 20, textAlign: side,
      }}>{children}</div>
    </div>
  );
};

// Simple hand label with arrow line — easier to use than ArrowNote.
const HandLabel = ({ children, style, arrow }) => (
  <div className="ann" style={{ position: 'absolute', ...style }}>
    {arrow === 'down' && <span style={{ display: 'block' }}>{children} ↓</span>}
    {arrow === 'up' && <span style={{ display: 'block' }}>↑ {children}</span>}
    {arrow === 'left' && <span style={{ display: 'block' }}>← {children}</span>}
    {arrow === 'right' && <span style={{ display: 'block' }}>{children} →</span>}
    {!arrow && <span>{children}</span>}
  </div>
);

// Generic mobile frame shell — 360x720, paper bg, status bar, content children.
const MobileFrame = ({ children, dark, sketchy, hideAnn, label }) => (
  <div className={`wf ${dark ? 'dark' : ''}`} style={{ width: '100%', height: '100%' }}>
    <div className={sketchy ? 'sketchy' : ''} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div className="status-mob">
        <span>9:41</span>
        <span style={{ letterSpacing: 2 }}>• • •</span>
        <span>100%</span>
      </div>
      {children}
    </div>
    {!hideAnn && label && (
      <div className="ann" style={{ position: 'absolute', left: 12, bottom: 8, color: 'var(--ink-faint)', fontSize: 13 }}>{label}</div>
    )}
  </div>
);

// Generic desktop frame — browser chrome + content.
const DesktopFrame = ({ children, dark, sketchy, hideAnn, label }) => (
  <div className={`wf ${dark ? 'dark' : ''}`} style={{ width: '100%', height: '100%' }}>
    <div className={sketchy ? 'sketchy' : ''} style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div className="browser-bar">
        <span className="browser-dot" />
        <span className="browser-dot" />
        <span className="browser-dot" />
        <div className="url-bar">coffeepocket.tw — 臺南</div>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>
    </div>
  </div>
);

// Pin marker w/ optional label tail
const Pin = ({ acc, label, style }) => (
  <div style={{ position: 'relative', ...style }}>
    <div className={`pin ${acc ? 'acc' : ''}`}>
      <div className="pin-dot" />
    </div>
    {label && (
      <div className="mono" style={{
        position: 'absolute', left: 18, top: -2, background: 'var(--paper)', border: '1px solid var(--ink)',
        padding: '1px 5px', whiteSpace: 'nowrap', fontSize: 9,
      }}>{label}</div>
    )}
  </div>
);

// A row of category headings with sketchy underline
const SecHead = ({ children, hint }) => (
  <div className="col gap-2" style={{ marginTop: 6 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <div className="h-title">{children}</div>
      {hint && <div className="ann">{hint}</div>}
    </div>
  </div>
);

// Tag chip row that scrolls horizontally (visually clipped)
const TagRow = ({ tags, sel = [], style }) => (
  <div style={{ display: 'flex', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap', ...style }}>
    {tags.map((t, i) => (
      <span key={i} className={`pill ${sel.includes(i) ? 'sel' : ''}`}>{t}</span>
    ))}
  </div>
);

// Tiny icon glyphs from text (avoid SVG drawing for icons)
const Glyph = ({ ch, style }) => (
  <span className="mono" style={{ display: 'inline-flex', width: 18, height: 18, border: '1px solid var(--ink)', borderRadius: 4, alignItems: 'center', justifyContent: 'center', fontSize: 10, ...style }}>{ch}</span>
);

Object.assign(window, {
  Pill, Chip, Divider, Cap, Ann, Placeholder, ArrowNote, HandLabel,
  MobileFrame, DesktopFrame, Pin, SecHead, TagRow, Glyph,
});
