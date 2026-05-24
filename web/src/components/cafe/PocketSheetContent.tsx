import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { InputModal } from "@/components/primitives";
import { PocketCafeCard } from "@/components/search/PocketCafeCard";
import { useAuth } from "@/hooks/useAuth";
import { usePockets, usePocketItems, useCreatePocket } from "@/hooks/usePockets";

interface Props {
  /** 由父層 MapPage 控制 — 改變時也會影響地圖 marker。 */
  activePocketId: string | null;
  onActivePocketIdChange: (id: string | null) => void;
}

/** 口袋 tab 的 sheet 內容 — 從原 PocketListPage 抽出,不再含 header/MobileTabBar。 */
export function PocketSheetContent({ activePocketId, onActivePocketIdChange }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { data: pockets, isLoading: pocketsLoading } = usePockets();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createPocket = useCreatePocket();

  useEffect(() => {
    if (!activePocketId && pockets && pockets.length > 0) {
      onActivePocketIdChange(pockets[0].id);
    }
  }, [pockets, activePocketId, onActivePocketIdChange]);

  const { data: items = [], isLoading: itemsLoading } = usePocketItems(activePocketId);

  if (authLoading) {
    return (
      <div className="px-5 py-6">
        <div className="h-4 w-32 animate-pulse rounded bg-base-200" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-base-200" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-lg font-semibold">登入後可同步你的口袋</p>
        <p className="mt-1 text-sm text-base-content/55">收藏的店會跨裝置保存</p>
        <Link to="/login" className="btn btn-neutral mt-6">
          登入
        </Link>
      </div>
    );
  }

  const totalItems = (pockets ?? []).reduce((sum, p) => sum + (p.item_count ?? 0), 0);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-5 pb-2">
        <div>
          <h2 className="text-[15px] font-semibold">口袋名單</h2>
          <p className="text-[11px] text-base-content/55">
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
      </header>

      <div className="flex gap-2 overflow-x-auto border-b border-base-content/10 px-5 py-2 no-scrollbar">
        {pocketsLoading ? (
          <div className="h-8 w-20 animate-pulse rounded bg-base-200" />
        ) : (
          (pockets ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onActivePocketIdChange(p.id)}
              className={`btn btn-sm whitespace-nowrap ${
                p.id === activePocketId ? "btn-neutral" : "btn-ghost"
              }`}
            >
              {p.emoji ? `${p.emoji} ` : ""}
              {p.name}
            </button>
          ))
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!pocketsLoading && (pockets?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
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
          <ul className="divide-y divide-base-content/10">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex gap-3 px-4 py-3">
                <div className="h-20 w-20 shrink-0 animate-pulse rounded-sm bg-base-200" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-base-200" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-base-200" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-base-200" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-base-content/55">口袋裡還沒有咖啡店</p>
          </div>
        ) : (
          <ul className="divide-y divide-base-content/10">
            {items.map((item) =>
              item.cafe ? (
                <li key={item.id} data-cafe-id={item.cafe.id}>
                  <PocketCafeCard cafe={item.cafe} personalNote={item.personal_note} />
                </li>
              ) : null,
            )}
          </ul>
        )}
      </div>

      <InputModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={(name) => createPocket.mutate({ name })}
        title="新口袋"
        description="幫這個口袋取個好記的名字，例如「想去的咖啡店」。"
        placeholder="口袋名稱"
        submitText="建立"
      />
    </div>
  );
}
