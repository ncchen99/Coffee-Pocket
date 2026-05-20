// App entry — sets up DesignCanvas with all sections + Tweaks panel
// for: dark/light, line-weight (sketchy filter), show annotations.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "sketchy": false,
  "annotations": true,
  "density": "regular"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const sharedProps = { dark: t.dark, sketchy: t.sketchy, hideAnn: !t.annotations };

  // Inject style for hideAnn (hide all .ann globally)
  React.useEffect(() => {
    let style = document.getElementById('wf-ann-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'wf-ann-style';
      document.head.appendChild(style);
    }
    style.textContent = t.annotations ? '' : '.ann { display: none !important; }';
  }, [t.annotations]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <DesignCanvas storageKey="coffee-pocket-wireframes-v2">
        <DCSection
          id="intro"
          title="Coffee Pocket — 線框稿"
          subtitle="已選定 3 個主方向 · 其餘變體保留在下方作參考。"
        >
          <DCArtboard id="readme" label="README · 設計方向" width={520} height={740}>
            <div style={{ width: '100%', height: '100%', background: 'var(--paper, #fdfcf8)', padding: '36px 40px', fontFamily: 'Noto Sans TC, sans-serif', color: 'var(--ink, #1a1714)', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="hand" style={{ fontSize: 34, lineHeight: 1 }}>Coffee Pocket</div>
              <div className="mono" style={{ color: 'var(--ink-soft, #6b635a)', fontSize: 11 }}>線框稿 · 2026.05.20</div>
              <Divider />

              <div>
                <Cap>探索的維度</Cap>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: 16, fontSize: 13, lineHeight: 1.7 }}>
                  <li>Layout — 地圖與列表的關係</li>
                  <li>Filter UX — chip / slider / 結構化表單 / 對話式</li>
                  <li>Information density — 疏 vs 密</li>
                  <li>標籤 vs 圖片 的視覺權重</li>
                </ul>
              </div>

              <div>
                <Cap>已選定方向 ★</Cap>
                <ol style={{ margin: '8px 0 0 0', paddingLeft: 16, fontSize: 13, lineHeight: 1.7 }}>
                  <li><b>首頁</b> · A · 對話式 hero</li>
                  <li><b>手機地圖</b> · B · 固定 50/50</li>
                  <li><b>桌面地圖</b> · A · 經典 Airbnb 風</li>
                </ol>
                <div className="meta" style={{ marginTop: 6 }}>其餘變體保留為「參考」區段，方便日後比對 / 借鑑元素。</div>
              </div>

              <div>
                <Cap>Tweaks（右下角）</Cap>
                <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7 }}>
                  · 深 / 淺色模式（你需求書定義的兩套色）<br/>
                  · 線稿粗糙度（clean / sketchy）<br/>
                  · 顯示 / 隱藏 旁註<br/>
                  · 資訊密度（影響桌面變體）
                </div>
              </div>

              <Divider soft />

              <Ann style={{ fontSize: 18 }}>
                下一步：把選定的三個方向
                <br/>串成一個完整流程，再做高保真。
              </Ann>

              <div style={{ flex: 1 }} />
              <div className="mono" style={{ color: 'var(--ink-faint, #b8b0a4)', fontSize: 10 }}>scroll · drag · zoom · ⌥+drag to pan</div>
            </div>
          </DCArtboard>
        </DCSection>

        <DCSection
          id="chosen"
          title="★ 選定方向"
          subtitle="接下來會以這三個為基底，串成完整流程後再做高保真。"
        >
          <DCArtboard id="chosen-home-a" label="首頁 · A 對話式 hero ★" width={360} height={740}><HomeA {...sharedProps} /></DCArtboard>
          <DCArtboard id="chosen-mob-b" label="手機 · B 固定 50/50 ★" width={360} height={740}><MobMapB {...sharedProps} /></DCArtboard>
          <DCArtboard id="chosen-desk-a" label="桌面 · A 經典 Airbnb 風 ★" width={1180} height={720}><DeskA {...sharedProps} /></DCArtboard>
        </DCSection>

        <DCSection
          id="ref-home"
          title="參考 · 其他首頁方向"
          subtitle="未選中，但元素可借鑑：結構化條件、策展橫排、單卡推薦。"
        >
          <DCArtboard id="home-b" label="B · 結構化情境表單" width={360} height={740}><HomeB {...sharedProps} /></DCArtboard>
          <DCArtboard id="home-c" label="C · 策展橫排" width={360} height={740}><HomeC {...sharedProps} /></DCArtboard>
          <DCArtboard id="home-d" label="D · 今天去哪卡片" width={360} height={740}><HomeD {...sharedProps} /></DCArtboard>
        </DCSection>

        <DCSection
          id="ref-mobile"
          title="參考 · 其他手機地圖方向"
          subtitle="Bottom sheet / list-first / 地圖+卡片 carousel。"
        >
          <DCArtboard id="mob-a" label="A · Bottom sheet" width={360} height={740}><MobMapA {...sharedProps} /></DCArtboard>
          <DCArtboard id="mob-c" label="C · List-first" width={360} height={740}><MobMapC {...sharedProps} /></DCArtboard>
          <DCArtboard id="mob-d" label="D · 地圖 + 卡片" width={360} height={740}><MobMapD {...sharedProps} /></DCArtboard>
        </DCSection>

        <DCSection
          id="ref-desktop"
          title="參考 · 其他桌面地圖方向"
          subtitle="三欄密集 / 大地圖浮動 / 頂部 filter 帶。"
        >
          <DCArtboard id="desk-b" label="B · 三欄密集" width={1180} height={720}><DeskB {...sharedProps} /></DCArtboard>
          <DCArtboard id="desk-c" label="C · 大地圖浮動" width={1180} height={720}><DeskC {...sharedProps} /></DCArtboard>
          <DCArtboard id="desk-d" label="D · 頂部 filter 帶" width={1180} height={720}><DeskD {...sharedProps} /></DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="風格" />
        <TweakToggle label="深色模式" value={t.dark} onChange={(v) => setTweak('dark', v)} />
        <TweakToggle label="線稿粗糙" value={t.sketchy} onChange={(v) => setTweak('sketchy', v)} />
        <TweakSection label="顯示" />
        <TweakToggle label="設計旁註" value={t.annotations} onChange={(v) => setTweak('annotations', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
