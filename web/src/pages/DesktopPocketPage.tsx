import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { TagBadge } from "@/components/primitives";
import { DesktopPageLayout } from "@/components/layout/DesktopPageLayout";
import { useAuth } from "@/hooks/useAuth";
import { usePockets, usePocketItems, useCreatePocket } from "@/hooks/usePockets";

/**
 * 桌面版口袋名單頁 — 使用 DesktopPageLayout 置中呈現。
 */
export default function DesktopPocketPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: pockets, isLoading: pocketsLoading } = usePockets();
  const [activePocketId, setActivePocketId] = useState<string | null>(null);
  const createPocket = useCreatePocket();

  useEffect(() => {
    if (!activePocketId && pockets && pockets.length > 0) {
      setActivePocketId(pockets[0].id);
    }
  }, [pockets, activePocketId]);

  const { data: items = [], isLoading: itemsLoading } = usePocketItems(activePocketId);

  const handleCreate = () => {
    const name = window.prompt("新口袋名稱");
    if (!name) return;
    createPocket.mutate({ name });
  };

  if (!user) {
    return (
      <DesktopPageLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-semibold">登入後可同步你的口袋</p>
          <p className="mt-1 text-sm text-base-content/55">收藏的店會跨裝置保存</p>
          <Link to="/login" className="btn btn-neutral mt-6">登入</Link>
        </div>
      </DesktopPageLayout>
    );
  }

  const totalItems = (pockets ?? []).reduce((sum, p) => sum + (p.item_count ?? 0), 0);

  return (
    <DesktopPageLayout>
      {/* Header */}
      <div className="flex items-center justify-between pb-5">
        <div>
          <h1 className="text-xl font-bold">口袋名單</h1>
          <p className="mt-0.5 text-sm text-base-content/55">
            {totalItems} 間 · {pockets?.length ?? 0} 個口袋
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="btn btn-ghost btn-sm btn-square"
          aria-label="新口袋"
        >
          <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={1.5} />
        </button>
      </div>

      {/* Pocket tabs */}
      <div className="flex gap-2 border-b border-base-content/10 pb-3">
        {pocketsLoading ? (
          <div className="h-8 w-20 bg-base-200 animate-pulse rounded" />
        ) : (
          (pockets ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivePocketId(p.id)}
              className={`btn btn-sm ${p.id === activePocketId ? "btn-neutral" : "btn-ghost"}`}
            >
              {p.emoji ? `${p.emoji} ` : ""}
              {p.name}
            </button>
          ))
        )}
      </div>

      {/* List */}
      <div className="mt-2">
        {!pocketsLoading && (pockets?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base-content/55">還沒有口袋名單</p>
            <button
              type="button"
              onClick={handleCreate}
              className="btn btn-neutral btn-sm mt-3"
            >
              建立第一個口袋
            </button>
          </div>
        ) : itemsLoading ? (
          <ul className="divide-y divide-base-content/10 rounded-xl border border-base-content/10 overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="px-5 py-3">
                <div className="h-12 bg-base-200 animate-pulse rounded" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base-content/55">口袋裡還沒有咖啡店，去地圖找找看吧！</p>
            <Link to="/" className="btn btn-ghost btn-sm mt-3">去逛逛 →</Link>
          </div>
        ) : (
          <ul className="divide-y divide-base-content/10 rounded-xl border border-base-content/10 overflow-hidden">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/cafe/${item.cafe_id}`}
                  className="block px-5 py-3 hover:bg-base-200/60 transition-colors"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{item.cafe?.name ?? "—"}</span>
                    {item.cafe?.google_rating != null && (
                      <span className="text-xs text-base-content/55">
                        ★ {item.cafe.google_rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(item.cafe?.top_tags ?? []).map((t) => (
                      <TagBadge key={t} variant="ghost" size="sm">{t}</TagBadge>
                    ))}
                  </div>
                  {item.personal_note && (
                    <p className="mt-1 text-xs text-base-content/55">✎ {item.personal_note}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer action */}
      <div className="mt-5">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="btn btn-ghost btn-sm gap-2"
        >
          <HugeiconsIcon icon={Location01Icon} size={16} strokeWidth={1.5} />
          在地圖上看這個口袋
        </button>
      </div>
    </DesktopPageLayout>
  );
}
