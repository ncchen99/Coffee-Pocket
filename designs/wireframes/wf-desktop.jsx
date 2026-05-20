// Map + Results — Desktop (4 variations)
// Frame is 1180x720 (incl browser chrome).

const dStores = [
  { n: '窩 café', t: '不限時 · 有插座 · 安靜', d: '0.6km', h: '至 23:00', tg: ['插座', '不限時', '安靜', '大桌'] },
  { n: '木門咖啡', t: '可訂位 · 適合聊天 · 大桌', d: '1.2km', h: '至 22:00', tg: ['可訂位', '聊天', '大桌', '4 人'] },
  { n: 'kokoni café', t: '戶外座 · 適合讀書', d: '1.4km', h: '至 21:00', tg: ['戶外', '讀書', '安靜'] },
  { n: '老房子', t: '安靜 · 低消 100', d: '1.8km', h: '至 22:30', tg: ['安靜', '低消友善'] },
  { n: 'kinks', t: '插座多 · 大桌', d: '2.1km', h: '至 22:00', tg: ['插座', '工作'] },
];

const FilterAside = ({ compact }) => (
  <div style={{ padding: '14px 16px' }}>
    <Cap>時間</Cap>
    <div className="box" style={{ marginTop: 6, padding: '8px 10px', display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontWeight: 600 }}>今天 · 20:00</span>
      <Ann>edit</Ann>
    </div>

    <Cap style={{ marginTop: 14 }}>距離</Cap>
    <div style={{ marginTop: 6 }}>
      <div className="sli">
        <div className="track" />
        <div className="thumb" style={{ left: '40%' }} />
      </div>
      <div className="row between" style={{ marginTop: 2 }}>
        <span className="mono">500m</span><span className="mono">1k</span><span className="mono">3k</span><span className="mono">5k</span><span className="mono">10k</span>
      </div>
    </div>

    {!compact && (<>
      <Cap style={{ marginTop: 14 }}>工作 / 讀書</Cap>
      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Pill sel>插座</Pill><Pill sel>不限時</Pill><Pill>大桌</Pill><Pill>Wi-Fi</Pill><Pill>讀書</Pill>
      </div>
      <Cap style={{ marginTop: 14 }}>社交 / 氛圍</Cap>
      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Pill>聊天</Pill><Pill sel>安靜</Pill><Pill>普通</Pill><Pill>偏吵</Pill>
      </div>
      <Cap style={{ marginTop: 14 }}>聚會</Cap>
      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Pill>2 人</Pill><Pill sel>4 人</Pill><Pill>6 人</Pill><Pill>可訂位</Pill>
      </div>
      <Cap style={{ marginTop: 14 }}>其他</Cap>
      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Pill>戶外</Pill><Pill>低消</Pill><Pill>停車</Pill>
      </div>
    </>)}
  </div>
);

const ListRow = ({ s, i, big }) => (
  <div className="listing" style={{ padding: big ? '14px 0' : '10px 0', gap: 12 }}>
    <Placeholder w={big ? 92 : 64} h={big ? 92 : 64} label="img" />
    <div className="body">
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <div style={{ fontWeight: 700, fontSize: big ? 16 : 14 }}>{i}. {s.n}</div>
        <div className="mono">{s.d}</div>
      </div>
      <div className="meta">{s.t}</div>
      <div className="meta" style={{ color: 'var(--ink-faint)' }}>{s.h} · ★ 4.{i+2}</div>
      <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {s.tg.map((t, j) => <span key={j} className="chip" style={{ fontSize: 10, padding: '1px 6px' }}>{t}</span>)}
      </div>
    </div>
  </div>
);

const MapBig = ({ children }) => (
  <div className="map" style={{ position: 'relative', width: '100%', height: '100%' }}>
    <Pin acc style={{ position: 'absolute', left: '38%', top: '32%' }} />
    <Pin style={{ position: 'absolute', left: '54%', top: '46%' }} />
    <Pin style={{ position: 'absolute', left: '24%', top: '50%' }} />
    <Pin style={{ position: 'absolute', left: '66%', top: '24%' }} />
    <Pin style={{ position: 'absolute', left: '72%', top: '62%' }} />
    <Pin style={{ position: 'absolute', left: '46%', top: '70%' }} />
    <Pin style={{ position: 'absolute', left: '30%', top: '74%' }} />

    {/* selected pin label */}
    <div className="box" style={{ position: 'absolute', left: 'calc(38% + 18px)', top: 'calc(32% - 4px)', background: 'var(--paper)', padding: '4px 8px' }}>
      <div style={{ fontWeight: 700, fontSize: 11 }}>窩 café</div>
      <div className="meta" style={{ fontSize: 10 }}>不限時 · 0.6km</div>
    </div>

    {/* map controls */}
    <div style={{ position: 'absolute', right: 12, top: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Glyph ch="＋" style={{ width: 28, height: 28, background: 'var(--paper)' }} />
      <Glyph ch="－" style={{ width: 28, height: 28, background: 'var(--paper)' }} />
      <Glyph ch="◎" style={{ width: 28, height: 28, background: 'var(--paper)' }} />
    </div>

    {/* re-search */}
    <div className="box" style={{ position: 'absolute', left: '50%', top: 12, transform: 'translateX(-50%)', background: 'var(--paper)', padding: '4px 10px', fontSize: 11 }}>
      ↻ 在此區域搜尋
    </div>
    {children}
  </div>
);

// ──────────────────────────────────────────────
// A · 經典 Airbnb 風 — 左 list / 右 map
// ──────────────────────────────────────────────
const DeskA = (props) => (
  <DesktopFrame {...props}>
    {/* top bar */}
    <div style={{ padding: '10px 18px', borderBottom: '1.2px solid var(--ink)', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div className="hand" style={{ fontSize: 18 }}>咖啡口袋</div>
      <div className="box" style={{ flex: 1, maxWidth: 540, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="mono">⌕</span>
        <span className="meta" style={{ flex: 1, color: 'var(--ink-faint)' }}>晚上 8 點 · 不限時 · 有插座 · 3km 內</span>
        <Pill acc style={{ fontSize: 10 }}>情境模式</Pill>
      </div>
      <div style={{ flex: 1 }} />
      <span className="meta">登入</span>
      <Glyph ch="◐" />
    </div>

    {/* filter chips */}
    <div style={{ padding: '8px 18px', borderBottom: '1px solid var(--ink-faint)', display: 'flex', gap: 6, alignItems: 'center' }}>
      <Pill sel>現在 ✕</Pill><Pill sel>不限時 ✕</Pill><Pill sel>插座 ✕</Pill><Pill sel>安靜 ✕</Pill>
      <Pill>＋ 標籤</Pill>
      <div style={{ flex: 1 }} />
      <span className="meta">12 間符合 · 排序：距離 ↓</span>
    </div>

    <div style={{ display: 'flex', height: 'calc(100% - 92px)' }}>
      {/* list */}
      <div style={{ width: 480, borderRight: '1.2px solid var(--ink)', padding: '0 18px', overflow: 'hidden' }}>
        {dStores.slice(0, 4).map((s, i) => <ListRow key={i} s={s} i={i+1} big />)}
      </div>
      {/* map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapBig />
      </div>
    </div>

    <Ann style={{ position: 'absolute', left: 520, top: 110, maxWidth: 130 }}>
      Airbnb / classic — list scrolls, map syncs
    </Ann>
  </DesktopFrame>
);

// ──────────────────────────────────────────────
// B · 三欄：filter / list / map (denser)
// ──────────────────────────────────────────────
const DeskB = (props) => (
  <DesktopFrame {...props}>
    <div style={{ padding: '10px 18px', borderBottom: '1.2px solid var(--ink)', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div className="hand" style={{ fontSize: 18 }}>咖啡口袋</div>
      <div className="box" style={{ flex: 1, maxWidth: 460, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="mono">⌕</span>
        <span className="meta" style={{ flex: 1, color: 'var(--ink-faint)' }}>找咖啡廳或情境</span>
      </div>
      <div style={{ flex: 1 }} />
      <Glyph ch="♡" /><Glyph ch="◐" />
    </div>

    <div style={{ display: 'flex', height: 'calc(100% - 40px)' }}>
      {/* filter aside */}
      <div style={{ width: 240, borderRight: '1.2px solid var(--ink)', overflow: 'hidden' }}>
        <FilterAside />
      </div>

      {/* list */}
      <div style={{ width: 360, borderRight: '1.2px solid var(--ink)', overflow: 'hidden' }}>
        <div className="row between center" style={{ padding: '10px 16px', borderBottom: '1px solid var(--ink-faint)' }}>
          <span className="h-title" style={{ fontSize: 14 }}>12 間符合</span>
          <span className="meta">距離 ↓</span>
        </div>
        <div style={{ padding: '0 16px' }}>
          {dStores.slice(0, 5).map((s, i) => <ListRow key={i} s={s} i={i+1} />)}
        </div>
      </div>

      {/* map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapBig />
      </div>
    </div>

    <Ann style={{ position: 'absolute', left: 14, top: 50, color: 'var(--ink-faint)' }}>
      filters always visible — power users
    </Ann>
    <Ann style={{ position: 'absolute', left: 250, bottom: 12, color: 'var(--ink-faint)' }}>
      B · 3-column dense
    </Ann>
  </DesktopFrame>
);

// ──────────────────────────────────────────────
// C · 大地圖 + 浮動 floating panel (map-forward)
// ──────────────────────────────────────────────
const DeskC = (props) => (
  <DesktopFrame {...props}>
    {/* full map */}
    <div style={{ position: 'absolute', inset: 0 }}>
      <MapBig />
    </div>

    {/* top bar (transparent) */}
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
      <div className="box" style={{ background: 'var(--paper)', padding: '8px 14px' }}>
        <div className="hand" style={{ fontSize: 17 }}>咖啡口袋</div>
      </div>
      <div className="box" style={{ background: 'var(--paper)', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 520 }}>
        <span className="mono">⌕</span>
        <span className="meta" style={{ flex: 1, color: 'var(--ink-faint)' }}>晚上 8 點 · 安靜 · 有插座</span>
        <Pill acc style={{ fontSize: 10 }}>情境</Pill>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 6 }}>
        <Pill style={{ background: 'var(--paper)' }}>現在</Pill>
        <Pill style={{ background: 'var(--paper)' }}>不限時</Pill>
        <Pill style={{ background: 'var(--paper)' }}>插座</Pill>
        <Pill style={{ background: 'var(--paper)' }}>＋ 標籤</Pill>
      </div>
    </div>

    {/* floating list panel */}
    <div className="box" style={{ position: 'absolute', left: 18, top: 80, bottom: 18, width: 340, background: 'var(--paper)', display: 'flex', flexDirection: 'column' }}>
      <div className="row between center" style={{ padding: '10px 14px', borderBottom: '1px solid var(--ink)' }}>
        <span className="h-title" style={{ fontSize: 14 }}>12 間符合</span>
        <span className="meta">適合工作 ↓</span>
      </div>
      <div style={{ padding: '0 14px', overflow: 'hidden', flex: 1 }}>
        {dStores.slice(0, 4).map((s, i) => <ListRow key={i} s={s} i={i+1} />)}
      </div>
    </div>

    {/* selected store detail card */}
    <div className="box" style={{ position: 'absolute', right: 18, top: 80, width: 280, background: 'var(--paper)' }}>
      <Placeholder w="100%" h={120} label="店家照" />
      <div style={{ padding: '10px 14px' }}>
        <div className="row between" style={{ alignItems: 'baseline' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>窩 café</div>
          <span className="mono">0.6km</span>
        </div>
        <div className="meta">不限時 · 有插座 · 安靜</div>
        <Divider soft style={{ margin: '8px 0' }} />
        <Ann>偏安靜，很多人在工作</Ann>
        <Divider soft style={{ margin: '8px 0' }} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span className="chip" style={{ fontSize: 10, padding: '1px 6px' }}>插座</span>
          <span className="chip" style={{ fontSize: 10, padding: '1px 6px' }}>不限時</span>
          <span className="chip" style={{ fontSize: 10, padding: '1px 6px' }}>安靜</span>
          <span className="chip" style={{ fontSize: 10, padding: '1px 6px' }}>大桌</span>
        </div>
        <div style={{ marginTop: 8, padding: '6px', textAlign: 'center', background: 'var(--ink)', color: 'var(--paper)', fontSize: 12, fontWeight: 600 }}>看更多 →</div>
      </div>
    </div>

    <Ann style={{ position: 'absolute', right: 18, bottom: 14, color: 'var(--ink-faint)' }}>
      C · Map-forward · floating panels
    </Ann>
  </DesktopFrame>
);

// ──────────────────────────────────────────────
// D · Filter bar 在頂部 + list/map split (sparse, content-first)
// ──────────────────────────────────────────────
const DeskD = (props) => (
  <DesktopFrame {...props}>
    <div style={{ padding: '14px 24px 10px', borderBottom: '1.2px solid var(--ink)' }}>
      <div className="row between center">
        <div className="hand" style={{ fontSize: 20 }}>咖啡口袋 · 臺南</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="meta">列表</span>
          <span className="meta" style={{ fontWeight: 700 }}>地圖</span>
          <span className="meta">收藏</span>
          <Glyph ch="◐" />
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
        <div className="col gap-2" style={{ minWidth: 140 }}>
          <Cap>時間</Cap>
          <div className="box" style={{ padding: '6px 10px', fontWeight: 600, fontSize: 12 }}>今天 · 20:00 ▾</div>
        </div>
        <div className="col gap-2" style={{ minWidth: 160 }}>
          <Cap>距離</Cap>
          <div className="box" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="sli" style={{ flex: 1, height: 14 }}>
              <div className="track" />
              <div className="thumb" style={{ left: '40%', width: 10, height: 10 }} />
            </div>
            <span className="mono" style={{ fontSize: 10 }}>3km</span>
          </div>
        </div>
        <div className="col gap-2" style={{ minWidth: 80 }}>
          <Cap>人數</Cap>
          <div className="box" style={{ padding: '6px 10px', fontWeight: 600, fontSize: 12 }}>4 人 ▾</div>
        </div>
        <div className="col gap-2" style={{ flex: 1 }}>
          <Cap>條件</Cap>
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill sel>不限時</Pill><Pill sel>有插座</Pill><Pill sel>安靜</Pill><Pill>大桌</Pill><Pill>可訂位</Pill><Pill>＋</Pill>
          </div>
        </div>
        <div className="box" style={{ padding: '8px 14px', background: 'var(--ink)', color: 'var(--paper)', fontWeight: 600, fontSize: 13, alignSelf: 'flex-end' }}>
          看 12 間 →
        </div>
      </div>
    </div>

    <div style={{ display: 'flex', height: 'calc(100% - 130px)' }}>
      <div style={{ width: 460, borderRight: '1.2px solid var(--ink)', padding: '0 22px', overflow: 'hidden' }}>
        <div className="row between" style={{ alignItems: 'baseline', padding: '12px 0' }}>
          <span className="h-title">12 間符合的店</span>
          <span className="meta">距離 ↓</span>
        </div>
        {dStores.slice(0, 4).map((s, i) => <ListRow key={i} s={s} i={i+1} big />)}
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <MapBig />
      </div>
    </div>

    <Ann style={{ position: 'absolute', left: 24, top: 64, color: 'var(--ink-faint)' }}>
      filters as a header strip — easy at-a-glance scan ↓
    </Ann>
    <Ann style={{ position: 'absolute', right: 18, bottom: 12, color: 'var(--ink-faint)' }}>
      D · Header filters
    </Ann>
  </DesktopFrame>
);

Object.assign(window, { DeskA, DeskB, DeskC, DeskD });
