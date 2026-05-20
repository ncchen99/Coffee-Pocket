// Map + Results — Mobile (4 variations)
// 390x740

const sampleStores = [
  { n: '窩 café', t: '不限時 · 有插座 · 安靜', d: '0.6km · 開到 23:00' },
  { n: '木門咖啡', t: '可訂位 · 大桌 · 適合聊天', d: '1.2km · 開到 22:00' },
  { n: 'kokoni café', t: '戶外座 · 適合讀書', d: '1.4km · 開到 21:00' },
  { n: '老房子', t: '安靜 · 低消 100', d: '1.8km · 開到 22:30' },
];

// ──────────────────────────────────────────────
// A · Apple Maps 式 — 全螢幕地圖 + draggable sheet
// ──────────────────────────────────────────────
const MobMapA = (props) => (
  <MobileFrame {...props}>
    <div className="map" style={{ position: 'absolute', inset: 0 }}>
      {/* pins */}
      <Pin acc style={{ position: 'absolute', left: '38%', top: '28%' }} />
      <Pin style={{ position: 'absolute', left: '62%', top: '34%' }} />
      <Pin style={{ position: 'absolute', left: '48%', top: '50%' }} />
      <Pin style={{ position: 'absolute', left: '24%', top: '46%' }} />
      <div className="mono" style={{ position: 'absolute', left: '38%', top: 'calc(28% + 22px)', background: 'var(--paper)', border: '1px solid var(--ink)', padding: '1px 5px', fontSize: 9 }}>窩 café</div>

      {/* top floating controls */}
      <div style={{ position: 'absolute', top: 36, left: 12, right: 12 }}>
        <div className="box" style={{ background: 'var(--paper)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono">⌕</span>
          <span className="meta" style={{ flex: 1, color: 'var(--ink-faint)' }}>找咖啡廳或情境</span>
          <Pill acc style={{ fontSize: 10 }}>情境</Pill>
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 6, overflow: 'hidden' }}>
          <Pill sel>現在</Pill><Pill sel>不限時</Pill><Pill sel>有插座</Pill><Pill>安靜</Pill><Pill>＋</Pill>
        </div>
      </div>

      {/* zoom buttons */}
      <div style={{ position: 'absolute', right: 12, top: 200, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Glyph ch="＋" style={{ width: 30, height: 30, background: 'var(--paper)' }} />
        <Glyph ch="－" style={{ width: 30, height: 30, background: 'var(--paper)' }} />
        <Glyph ch="◎" style={{ width: 30, height: 30, background: 'var(--paper)' }} />
      </div>
    </div>

    {/* bottom sheet */}
    <div className="box" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--paper)', borderRadius: '14px 14px 0 0', padding: '8px 16px 18px', height: 280, borderBottom: 'none' }}>
      <div style={{ width: 36, height: 4, background: 'var(--ink-faint)', borderRadius: 2, margin: '0 auto 10px' }} />
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <div className="h-title" style={{ fontSize: 15 }}>12 間 · 中西區</div>
        <span className="meta">排序：距離 ↓</span>
      </div>
      <Divider soft style={{ margin: '8px 0 0' }} />
      {sampleStores.slice(0, 3).map((s, i) => (
        <div key={i} className="listing" style={{ padding: '10px 0' }}>
          <Placeholder w={52} h={52} label="img" />
          <div className="body">
            <div className="row between" style={{ alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{s.n}</span>
              <span className="mono">{s.d.split(' · ')[0]}</span>
            </div>
            <div className="meta">{s.t}</div>
            <div className="meta" style={{ color: 'var(--ink-faint)' }}>{s.d.split(' · ')[1]}</div>
          </div>
        </div>
      ))}
    </div>

    <Ann style={{ position: 'absolute', right: 10, top: 460, maxWidth: 120, textAlign: 'right' }}>
      drag sheet up → full list <br/>drag down → full map
    </Ann>
    <Ann style={{ position: 'absolute', left: 14, bottom: 4, color: 'var(--ink-faint)' }}>
      A · Bottom sheet (Apple Maps)
    </Ann>
  </MobileFrame>
);

// ──────────────────────────────────────────────
// B · 上地圖 / 下列表 50/50 split
// ──────────────────────────────────────────────
const MobMapB = (props) => (
  <MobileFrame {...props}>
    {/* top: filter strip */}
    <div style={{ padding: '6px 14px 8px' }}>
      <div className="row gap-6 center">
        <div className="box" style={{ flex: 1, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono">⌕</span>
          <span className="meta" style={{ color: 'var(--ink-faint)' }}>不限時 + 有插座 + 安靜</span>
        </div>
        <Glyph ch="◐" style={{ width: 30, height: 30 }} />
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 6, overflow: 'hidden' }}>
        <Pill sel>現在 ✕</Pill><Pill sel>不限時 ✕</Pill><Pill sel>插座 ✕</Pill><Pill>＋ 標籤</Pill>
      </div>
    </div>

    {/* map half */}
    <div className="map" style={{ position: 'relative', height: 280, borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}>
      <Pin acc style={{ position: 'absolute', left: '30%', top: '40%' }} />
      <Pin style={{ position: 'absolute', left: '58%', top: '24%' }} />
      <Pin style={{ position: 'absolute', left: '70%', top: '60%' }} />
      <Pin style={{ position: 'absolute', left: '20%', top: '70%' }} />
      <div className="mono" style={{ position: 'absolute', right: 8, top: 8, background: 'var(--paper)', border: '1px solid var(--ink)', padding: '2px 6px' }}>12 間</div>
    </div>

    {/* list half */}
    <div style={{ padding: '4px 16px 0', overflow: 'hidden', flex: 1 }}>
      <div className="row between" style={{ alignItems: 'baseline', padding: '6px 0' }}>
        <span className="meta">12 間 · 中西區</span>
        <span className="meta">距離 ↓</span>
      </div>
      {sampleStores.slice(0, 3).map((s, i) => (
        <div key={i} className="listing" style={{ padding: '8px 0', gap: 8 }}>
          <Placeholder w={44} h={44} label="" />
          <div className="body">
            <div className="row between" style={{ alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{s.n}</span>
              <span className="mono">{s.d.split(' · ')[0]}</span>
            </div>
            <div className="meta" style={{ fontSize: 10 }}>{s.t}</div>
          </div>
        </div>
      ))}
    </div>

    <Ann style={{ position: 'absolute', right: 10, top: 90, maxWidth: 110, textAlign: 'right' }}>
      fixed 50/50 — see both at once ↓
    </Ann>
    <Ann style={{ position: 'absolute', left: 14, bottom: 4, color: 'var(--ink-faint)' }}>
      B · Fixed split
    </Ann>
  </MobileFrame>
);

// ──────────────────────────────────────────────
// C · List-first + mini map header
// ──────────────────────────────────────────────
const MobMapC = (props) => (
  <MobileFrame {...props}>
    <div style={{ padding: '8px 16px 0' }}>
      <div className="row between center">
        <div className="hand" style={{ fontSize: 17 }}>咖啡口袋</div>
        <Glyph ch="◐" />
      </div>
      <div className="box" style={{ marginTop: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="mono">⌕</span>
        <span className="meta" style={{ color: 'var(--ink-faint)', flex: 1 }}>找咖啡廳⋯</span>
      </div>
    </div>

    {/* mini map ribbon */}
    <div className="map" style={{ position: 'relative', height: 96, margin: '10px 16px', border: '1px solid var(--ink)' }}>
      <Pin acc style={{ position: 'absolute', left: '20%', top: '40%' }} />
      <Pin style={{ position: 'absolute', left: '46%', top: '30%' }} />
      <Pin style={{ position: 'absolute', left: '72%', top: '55%' }} />
      <div className="mono" style={{ position: 'absolute', right: 6, bottom: 6, background: 'var(--paper)', border: '1px solid var(--ink)', padding: '1px 5px', fontSize: 9 }}>展開地圖 ↗</div>
    </div>

    <div style={{ padding: '0 16px' }}>
      <div style={{ display: 'flex', gap: 6, overflow: 'hidden' }}>
        <Pill sel>現在</Pill><Pill sel>不限時</Pill><Pill>插座</Pill><Pill>安靜</Pill><Pill>4 人</Pill><Pill>＋</Pill>
      </div>
      <div className="row between" style={{ alignItems: 'baseline', padding: '14px 0 4px' }}>
        <span className="h-title" style={{ fontSize: 15 }}>12 間符合</span>
        <span className="meta">適合工作 ↓</span>
      </div>
      {sampleStores.slice(0, 4).map((s, i) => (
        <div key={i} className="listing" style={{ padding: '10px 0' }}>
          <Placeholder w={64} h={64} label="img" />
          <div className="body">
            <div className="row between" style={{ alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{s.n}</span>
              <span className="mono">{s.d.split(' · ')[0]}</span>
            </div>
            <div className="meta">{s.t}</div>
            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span className="chip" style={{ fontSize: 9, padding: '1px 5px' }}>插座</span>
              <span className="chip" style={{ fontSize: 9, padding: '1px 5px' }}>不限時</span>
              <span className="chip" style={{ fontSize: 9, padding: '1px 5px' }}>安靜</span>
            </div>
          </div>
        </div>
      ))}
    </div>

    <Ann style={{ position: 'absolute', right: 8, top: 120, maxWidth: 110, textAlign: 'right' }}>
      list is hero, map is preview ↓
    </Ann>
    <Ann style={{ position: 'absolute', left: 14, bottom: 4, color: 'var(--ink-faint)' }}>
      C · List-first
    </Ann>
  </MobileFrame>
);

// ──────────────────────────────────────────────
// D · 全螢幕地圖 + 底部 card carousel
// ──────────────────────────────────────────────
const MobMapD = (props) => (
  <MobileFrame {...props}>
    <div className="map" style={{ position: 'absolute', inset: 0 }}>
      <Pin acc style={{ position: 'absolute', left: '42%', top: '36%' }} />
      <Pin style={{ position: 'absolute', left: '24%', top: '52%' }} />
      <Pin style={{ position: 'absolute', left: '64%', top: '46%' }} />
      <Pin style={{ position: 'absolute', left: '70%', top: '24%' }} />
      <Pin style={{ position: 'absolute', left: '34%', top: '64%' }} />

      <div style={{ position: 'absolute', top: 36, left: 12, right: 12 }}>
        <div className="box" style={{ background: 'var(--paper)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono">⌕</span>
          <span className="meta" style={{ flex: 1, color: 'var(--ink-faint)' }}>找咖啡廳或情境</span>
          <Glyph ch="◐" />
        </div>
      </div>

      {/* chip rail */}
      <div style={{ position: 'absolute', top: 90, left: 12, right: 12, display: 'flex', gap: 6, overflow: 'hidden' }}>
        <Pill sel style={{ background: 'var(--paper)', color: 'var(--ink)' }}>排序 ↓</Pill>
        <Pill style={{ background: 'var(--paper)' }}>現在開</Pill>
        <Pill style={{ background: 'var(--paper)' }}>不限時</Pill>
        <Pill style={{ background: 'var(--paper)' }}>插座</Pill>
        <Pill style={{ background: 'var(--paper)' }}>安靜</Pill>
      </div>

      {/* result count */}
      <div className="hand" style={{ position: 'absolute', top: 130, right: 12, fontSize: 16 }}>12 間 found</div>
    </div>

    {/* card carousel */}
    <div style={{ position: 'absolute', bottom: 18, left: 0, right: 0, display: 'flex', gap: 10, padding: '0 14px', overflow: 'hidden' }}>
      {sampleStores.slice(0, 3).map((s, i) => (
        <div key={i} className="box" style={{ width: 230, flexShrink: 0, background: 'var(--paper)', padding: 0 }}>
          <Placeholder w={228} h={86} label="" />
          <div style={{ padding: '8px 10px' }}>
            <div className="row between" style={{ alignItems: 'baseline' }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{s.n}</span>
              <span className="mono">{s.d.split(' · ')[0]}</span>
            </div>
            <div className="meta">{s.t}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <span className="chip" style={{ fontSize: 9, padding: '1px 5px' }}>插座</span>
              <span className="chip" style={{ fontSize: 9, padding: '1px 5px' }}>不限時</span>
            </div>
          </div>
        </div>
      ))}
    </div>

    <Ann style={{ position: 'absolute', right: 10, bottom: 200, maxWidth: 110, textAlign: 'right' }}>
      swipe cards = pan to pin ↓
    </Ann>
    <Ann style={{ position: 'absolute', left: 14, bottom: 4, color: 'var(--ink-faint)' }}>
      D · Map + carousel
    </Ann>
  </MobileFrame>
);

Object.assign(window, { MobMapA, MobMapB, MobMapC, MobMapD });
