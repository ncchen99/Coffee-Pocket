// Home / 搜尋入口 — 4 variations
// Mobile-first (390x740) since "scenario_search hero" + map co-primary.

// ──────────────────────────────────────────────
// A · 對話式入口 (Conversational hero)
// ──────────────────────────────────────────────
const HomeA = (props) => (
  <MobileFrame {...props}>
    <div style={{ padding: '14px 18px 0' }}>
      <div className="row between center">
        <div className="hand" style={{ fontSize: 20 }}>咖啡口袋</div>
        <Glyph ch="☰" />
      </div>
      <div className="mono" style={{ marginTop: 2, color: 'var(--ink-soft)' }}>TAINAN · 臺南</div>
    </div>

    <div style={{ padding: '34px 22px 0' }}>
      <div className="h-display">我現在<br/>想要⋯</div>
      <div className="meta" style={{ marginTop: 6 }}>告訴我你的情境，我幫你挑</div>

      <div className="box" style={{ marginTop: 18, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="meta" style={{ color: 'var(--ink-faint)' }}>例如：晚上 8 點 / 安靜 / 有插座</span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>↵</span>
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Pill acc>＋ 不限時</Pill>
        <Pill acc>＋ 有插座</Pill>
        <Pill>＋ 安靜</Pill>
        <Pill>＋ 22:00 後</Pill>
        <Pill>＋ 3km 內</Pill>
        <Pill>＋ 4 人</Pill>
      </div>

      <div className="divider soft" style={{ margin: '24px 0 12px' }} />

      <Cap>快速場景</Cap>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          ['工作 / 讀書', '插座・大桌・不限時'],
          ['深夜咖啡', '22:00 後還開'],
          ['聊天聚會', '4 人以上・可訂位'],
          ['今天去哪', '隨機・在你附近'],
        ].map(([t, s], i) => (
          <div key={i} className="box" style={{ padding: '10px 12px' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div>
            <div className="meta" style={{ marginTop: 2 }}>{s}</div>
          </div>
        ))}
      </div>
    </div>

    {/* sketchy annotations */}
    <Ann style={{ position: 'absolute', right: 14, top: 96, maxWidth: 130, textAlign: 'right' }}>
      hero prompt — the WHOLE point of the app ↓
    </Ann>
    <Ann style={{ position: 'absolute', left: 18, bottom: 14, color: 'var(--ink-faint)' }}>
      A · Conversational
    </Ann>
  </MobileFrame>
);

// ──────────────────────────────────────────────
// B · 結構化情境條件 (Structured scenario builder)
// ──────────────────────────────────────────────
const HomeB = (props) => (
  <MobileFrame {...props}>
    <div style={{ padding: '14px 18px 0' }}>
      <div className="row between center">
        <div className="hand" style={{ fontSize: 20 }}>咖啡口袋</div>
        <Glyph ch="☰" />
      </div>
    </div>

    <div style={{ padding: '18px 18px 0' }}>
      <div className="h-display" style={{ fontSize: 22 }}>找一間<br/>剛好的咖啡廳</div>

      <div style={{ marginTop: 18, padding: '14px 14px', border: '1.2px solid var(--ink)' }}>
        <Cap>什麼時候</Cap>
        <div className="row between center" style={{ marginTop: 6 }}>
          <span style={{ fontWeight: 600 }}>今天 · 20:00</span>
          <Ann>tap to edit</Ann>
        </div>
        <Divider soft style={{ margin: '12px 0' }} />

        <Cap>距離我</Cap>
        <div style={{ marginTop: 6 }}>
          <div className="sli">
            <div className="track" />
            <div className="thumb" style={{ left: '38%' }} />
          </div>
          <div className="row between" style={{ marginTop: 2 }}>
            <span className="mono">500m</span><span className="mono">1k</span><span className="mono">3k</span><span className="mono">5k</span><span className="mono">10k</span>
          </div>
        </div>
        <Divider soft style={{ margin: '12px 0' }} />

        <Cap>幾個人</Cap>
        <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
          {['1','2','3','4','5+'].map((n, i) => (
            <span key={i} className={`pill ${i === 3 ? 'sel' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>{n}</span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Cap>還要⋯</Cap>
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Pill sel>不限時</Pill>
          <Pill sel>有插座</Pill>
          <Pill>安靜</Pill>
          <Pill>大桌面</Pill>
          <Pill>可訂位</Pill>
          <Pill>戶外</Pill>
          <Pill>低消友善</Pill>
          <span className="meta" style={{ alignSelf: 'center' }}>＋ 看全部 (24)</span>
        </div>
      </div>

      <div className="box" style={{ marginTop: 18, padding: '12px', textAlign: 'center', background: 'var(--ink)', color: 'var(--paper)' }}>
        <span style={{ fontWeight: 600 }}>看 12 間符合的店 →</span>
      </div>
    </div>

    <Ann style={{ position: 'absolute', right: 12, top: 220, maxWidth: 110, textAlign: 'right' }}>
      live count updates as you tweak ↓
    </Ann>
    <Ann style={{ position: 'absolute', left: 18, bottom: 14, color: 'var(--ink-faint)' }}>
      B · Structured form
    </Ann>
  </MobileFrame>
);

// ──────────────────────────────────────────────
// C · 標籤分類面板 (Curated rows — denser)
// ──────────────────────────────────────────────
const HomeC = (props) => (
  <MobileFrame {...props}>
    <div style={{ padding: '12px 16px 0' }}>
      <div className="row between center">
        <div>
          <div className="hand" style={{ fontSize: 18 }}>咖啡口袋</div>
          <div className="mono" style={{ color: 'var(--ink-soft)' }}>臺南 · 中西區附近</div>
        </div>
        <Glyph ch="◐" />
      </div>

      <div className="box" style={{ marginTop: 12, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="mono">⌕</span>
        <span className="meta" style={{ color: 'var(--ink-faint)', flex: 1 }}>店名、地址、或情境⋯</span>
        <span className="pill acc" style={{ fontSize: 10, padding: '2px 6px' }}>情境</span>
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 6, overflow: 'hidden' }}>
        <Pill sel>現在營業</Pill>
        <Pill>不限時</Pill>
        <Pill>有插座</Pill>
        <Pill>安靜</Pill>
        <Pill>可訂位</Pill>
      </div>
    </div>

    <Divider soft style={{ margin: '14px 16px 0', width: 'auto' }} />

    <div style={{ padding: '14px 16px 0' }}>
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <div className="h-title" style={{ fontSize: 15 }}>現在還開的</div>
        <span className="meta">看全部 →</span>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, overflow: 'hidden' }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ width: 130, flexShrink: 0 }}>
            <Placeholder w={130} h={86} label="店家照" />
            <div style={{ fontWeight: 600, fontSize: 12, marginTop: 4 }}>咖啡店 #{i}</div>
            <div className="meta">不限時 · 600m</div>
          </div>
        ))}
      </div>
    </div>

    <div style={{ padding: '14px 16px 0' }}>
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <div className="h-title" style={{ fontSize: 15 }}>適合工作</div>
        <span className="meta">看全部 →</span>
      </div>
      <div style={{ marginTop: 8 }}>
        {[
          ['插座多 · 大桌面', '中西區 · 800m'],
          ['不限時 · 安靜', '東區 · 1.4km'],
        ].map(([t, s], i) => (
          <div key={i} className="listing" style={{ padding: '8px 0' }}>
            <Placeholder w={56} h={56} label="img" />
            <div className="body">
              <div style={{ fontWeight: 600, fontSize: 13 }}>店名 #{i+1}</div>
              <div className="meta">{t}</div>
              <div className="meta" style={{ color: 'var(--ink-faint)' }}>{s}</div>
            </div>
          </div>
        ))}
      </div>
    </div>

    <Ann style={{ position: 'absolute', right: 12, top: 138, maxWidth: 130, textAlign: 'right' }}>
      browse-first — for people who don't yet have a need →
    </Ann>
    <Ann style={{ position: 'absolute', left: 18, bottom: 14, color: 'var(--ink-faint)' }}>
      C · Curated rows
    </Ann>
  </MobileFrame>
);

// ──────────────────────────────────────────────
// D · 「今天去哪」單卡推薦 (Discover-style single recommendation)
// ──────────────────────────────────────────────
const HomeD = (props) => (
  <MobileFrame {...props}>
    <div style={{ padding: '14px 18px 0' }}>
      <div className="row between center">
        <div className="hand" style={{ fontSize: 20 }}>咖啡口袋</div>
        <Glyph ch="☰" />
      </div>
    </div>

    <div style={{ padding: '20px 18px 0' }}>
      <div className="mono" style={{ color: 'var(--ink-soft)' }}>2026 · 05 · 20  ·  週三晚上</div>
      <div className="h-mega" style={{ fontSize: 30, marginTop: 4 }}>今天<br/>去哪？</div>

      <div className="box" style={{ marginTop: 18, position: 'relative' }}>
        <Placeholder w="100%" h={170} label="店家主圖" />
        <div style={{ padding: '12px 14px' }}>
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>窩 · café</div>
            <div className="mono">1.2km</div>
          </div>
          <div className="meta" style={{ marginTop: 4 }}>不限時 · 有插座 · 安靜 · 開到 23:00</div>
          <Divider soft style={{ margin: '10px 0' }} />
          <Ann>偏安靜，很多人在工作 · AI 摘要</Ann>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <div className="box" style={{ flex: 1, padding: '10px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'JetBrains Mono' }}>↻ 換一間</span>
        </div>
        <div className="box" style={{ flex: 1, padding: '10px', textAlign: 'center', background: 'var(--ink)', color: 'var(--paper)' }}>
          <span style={{ fontWeight: 600 }}>就去這間 →</span>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Cap>或選一個情境</Cap>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Pill>工作</Pill><Pill>讀書</Pill><Pill>約會</Pill><Pill>聊天</Pill><Pill>深夜</Pill><Pill>聚會</Pill>
        </div>
      </div>
    </div>

    <Ann style={{ position: 'absolute', right: 12, top: 250, maxWidth: 110, textAlign: 'right' }}>
      Spotify-Discover vibe — one card at a time ↓
    </Ann>
    <Ann style={{ position: 'absolute', left: 18, bottom: 14, color: 'var(--ink-faint)' }}>
      D · "Today" card
    </Ann>
  </MobileFrame>
);

Object.assign(window, { HomeA, HomeB, HomeC, HomeD });
