import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { InputModal } from "@/components/primitives";
import { DesktopPageLayout } from "@/components/layout/DesktopPageLayout";
import { PocketCafeCard } from "@/components/search/PocketCafeCard";
import { useAuth } from "@/hooks/useAuth";
import { usePockets, usePocketItems, useCreatePocket } from "@/hooks/usePockets";

function DesktopPocketListSkeleton() {
  return (
    <ul className="divide-y divide-base-content/10 rounded-xl border border-base-content/10 overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex gap-3 px-4 py-3">
          <div className="h-20 w-20 shrink-0 bg-base-200 animate-pulse rounded-sm" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 bg-base-200 animate-pulse rounded w-3/4" />
            <div className="h-3 bg-base-200 animate-pulse rounded w-1/2" />
            <div className="h-3 bg-base-200 animate-pulse rounded w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 桌面版口袋名單頁 — 使用 DesktopPageLayout 置中呈現。
 */
export default function DesktopPocketPage() {
  const { user, loading: authLoading } = useAuth();
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

  const handleSubmitCreate = (name: string) => {
    createPocket.mutate({ name });
  };

  if (authLoading) {
    return (
      <DesktopPageLayout>
        <div className="flex items-center justify-between pb-5">
          <div className="space-y-2">
            <div className="h-6 w-24 bg-base-200 animate-pulse rounded" />
            <div className="h-4 w-32 bg-base-200 animate-pulse rounded" />
          </div>
          <div className="h-8 w-8 bg-base-200 animate-pulse rounded" />
        </div>
        <div className="flex gap-2 border-b border-base-content/10 pb-3">
          <div className="h-8 w-20 bg-base-200 animate-pulse rounded" />
          <div className="h-8 w-24 bg-base-200 animate-pulse rounded" />
        </div>
        <div className="mt-2">
          <DesktopPocketListSkeleton />
        </div>
      </DesktopPageLayout>
    );
  }

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
          onClick={() => setIsCreateOpen(true)}
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
              onClick={() => setIsCreateOpen(true)}
              className="btn btn-neutral btn-sm mt-3"
            >
              建立第一個口袋
            </button>
          </div>
        ) : itemsLoading ? (
          <DesktopPocketListSkeleton />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base-content/55">口袋裡還沒有咖啡店，去地圖找找看吧！</p>
            <Link to="/" className="btn btn-ghost btn-sm mt-3">去逛逛 →</Link>
          </div>
        ) : (
          <ul className="divide-y divide-base-content/10 rounded-xl border border-base-content/10 overflow-hidden">
            {items.map((item) =>
              item.cafe ? (
                <li key={item.id}>
                  <PocketCafeCard cafe={item.cafe} personalNote={item.personal_note} />
                </li>
              ) : null
            )}
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

      <InputModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleSubmitCreate}
        title="新口袋"
        description="幫這個口袋取個好記的名字，例如「想去的咖啡店」。"
        placeholder="口袋名稱"
        submitText="建立"
      />
    </DesktopPageLayout>
  );
}
