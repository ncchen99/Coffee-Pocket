import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { TagBadge, InputModal } from "@/components/primitives";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { useAuth } from "@/hooks/useAuth";
import { usePockets, usePocketItems, useCreatePocket } from "@/hooks/usePockets";

/**
 * 口袋名單頁 — 管理收藏的店家。
 */
export default function PocketListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: pockets, isLoading: pocketsLoading } = usePockets();
  const [activePocketId, setActivePocketId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createPocket = useCreatePocket();

  useEffect(() => {
    if (!activePocketId && pockets && pockets.length > 0) {
      setActivePocketId(pockets[0].id);
    }
  }, [pockets, activePocketId]);

  const { data: items = [], isLoading: itemsLoading } = usePocketItems(activePocketId);

  const handleCreate = () => {
    setIsCreateOpen(true);
  };

  const handleSubmitCreate = (name: string) => {
    createPocket.mutate({ name });
  };

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

  const totalItems = (pockets ?? []).reduce((sum, p) => sum + (p.item_count ?? 0), 0);

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      <header className="flex items-center justify-between border-b border-base-content/10 px-5 py-3">
        <div>
          <h1 className="text-lg font-bold">口袋名單</h1>
          <p className="text-xs text-base-content/55">
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
      </header>

      {/* Pocket tabs */}
      <div className="flex gap-2 overflow-x-auto border-b border-base-content/10 px-5 py-2">
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
      <div className="flex-1 overflow-y-auto">
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
          <ul className="divide-y divide-base-content/10">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="px-5 py-3">
                <div className="h-12 bg-base-200 animate-pulse rounded" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base-content/55">口袋裡還沒有咖啡店，去地圖找找看吧！</p>
            <Link to="/map" className="btn btn-ghost btn-sm mt-3">
              去逛逛 →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-base-content/10">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/cafe/${item.cafe_id}`}
                  className="block px-5 py-3 active:bg-base-200/60"
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
                      <TagBadge key={t} variant="ghost" size="sm">
                        {t}
                      </TagBadge>
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

      <InputModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleSubmitCreate}
        title="新口袋"
        description="幫這個口袋取個好記的名字，例如「想去的咖啡店」。"
        placeholder="口袋名稱"
        submitText="建立"
      />
    </div>
  );
}
