import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { TagBadge } from "@/components/primitives";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { useAuth } from "@/hooks/useAuth";

interface PocketItem {
  id: string;
  name: string;
  tags: string[];
  area: string;
  distance: string;
  note?: string;
}

const POCKETS = ["工作", "讀書", "約會"];

const MOCK_ITEMS: Record<string, PocketItem[]> = {
  工作: [
    { id: "wo-cafe", name: "窩 café", tags: ["不限時", "插座", "安靜"], area: "中西區", distance: "0.6km", note: "晚上常去" },
    { id: "paper-window", name: "紙窗", tags: ["不限時", "適合工作"], area: "中西區", distance: "2.1km" },
  ],
  讀書: [
    { id: "kokoni", name: "kokoni café", tags: ["戶外座", "適合讀書"], area: "中西區", distance: "1.4km" },
  ],
  約會: [
    { id: "wood-door", name: "木門咖啡", tags: ["可訂位", "適合聊天"], area: "中西區", distance: "1.2km" },
  ],
};

/**
 * 口袋名單頁 — 管理收藏的店家。
 */
export default function PocketListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activePocket, setActivePocket] = useState(POCKETS[0]);
  const items = MOCK_ITEMS[activePocket] ?? [];

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-base-100">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-lg font-semibold">登入後可同步你的口袋</p>
          <p className="mt-1 text-sm text-base-content/55">收藏的店會跨裝置保存</p>
          <Link to="/login" className="btn btn-neutral mt-6">
            登入
          </Link>
        </div>
        <MobileTabBar />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      <header className="flex items-center justify-between border-b border-base-content/10 px-5 py-3">
        <div>
          <h1 className="text-lg font-bold">口袋名單</h1>
          <p className="text-xs text-base-content/55">
            {Object.values(MOCK_ITEMS).flat().length} 間 · {POCKETS.length} 個口袋
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm btn-square" aria-label="新口袋">
          <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={1.5} />
        </button>
      </header>

      {/* Pocket tabs */}
      <div className="flex gap-2 overflow-x-auto border-b border-base-content/10 px-5 py-2">
        {POCKETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setActivePocket(p)}
            className={`btn btn-sm ${p === activePocket ? "btn-neutral" : "btn-ghost"}`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base-content/55">這個口袋還是空的</p>
            <Link to="/" className="btn btn-ghost btn-sm mt-3">去逛逛 →</Link>
          </div>
        ) : (
          <ul className="divide-y divide-base-content/10">
            {items.map((item) => (
              <li key={item.id}>
                <Link to={`/cafe/${item.id}`} className="block px-5 py-3 active:bg-base-200/60">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-xs text-base-content/55">{item.distance}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.tags.map((t) => (
                      <TagBadge key={t} variant="ghost" size="sm">{t}</TagBadge>
                    ))}
                  </div>
                  {item.note && (
                    <p className="mt-1 text-xs text-base-content/55">✎ {item.note}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-base-content/10 px-5 py-3">
        <button
          type="button"
          onClick={() => navigate("/map")}
          className="btn btn-ghost btn-sm btn-block justify-start gap-2"
        >
          <HugeiconsIcon icon={Location01Icon} size={16} strokeWidth={1.5} />
          在地圖上看這個口袋
        </button>
      </div>

      <MobileTabBar />
    </div>
  );
}
