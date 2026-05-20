# Coffee Pocket — Web

Vite + React + TypeScript + Tailwind/daisyUI + Hugeicons + Mapbox + Supabase。

## 設計守則

- **直角網頁**:`card / modal / alert / button / input / select / tab / checkbox / toggle / badge` 全部 `border-radius: 0`,在 [tailwind.config.js](tailwind.config.js) 的 daisyUI theme 與 [src/styles/index.css](src/styles/index.css) 雙重 hard-pin。
- **扁平化**:儘量少用 `Box`,優先用 `Divider`。Card 用於真正需要的容器(如 hero、AI 摘要區塊)。
- **主題**:`coffee-paper`(light)/`coffee-roast`(dark)。對應 [specs/requirements.md](../specs/requirements.md) §4.2。
- **Icon**:Hugeicons Stroke Rounded,`strokeWidth={1.5}`,呼應手繪 wireframe 的 `Ann` 風格。

## 開發

```bash
cd web
npm install
cp .env.example .env  # 等使用者把 Mapbox / Supabase 金鑰填上
npm run dev
```

沒有 `VITE_MAPBOX_TOKEN` 時,Map 頁會 fallback 成純清單,不會崩。

## 路由

| Path | 對應 wireframe | 對應 Edge Function |
| --- | --- | --- |
| `/` | `wf-home.jsx` A 變體 + onboarding hooks | (純前端) |
| `/map` | `wf-mobile.jsx` A 變體 (Apple-Maps 式 sheet) | `search-cafes` |
| `/cafe/:id` | `designs/wireframes/pages/cafe-detail.md` | `cafe-detail`, `vote-tag`, `ai-summary` |

## 對齊後端的下一步

跑通三頁 mock 之後,把 [src/data/mockCafes.ts](src/data/mockCafes.ts) 換成真正打 `search-cafes` / `cafe-detail` 的 React Query hook。型別已在 [src/types/cafe.ts](src/types/cafe.ts) 對齊。
