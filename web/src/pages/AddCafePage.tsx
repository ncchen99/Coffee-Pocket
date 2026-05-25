import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Search01Icon,
  Loading03Icon,
  Location01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { Topbar } from "@/components/layout/Topbar";
import { useIsDesktop } from "@/components/layout/Responsive";
import { searchPlaces, submitCafe, type PlaceSearchResult } from "@/lib/api";

/**
 * 「新增咖啡廳」全螢幕頁。
 *
 * 流程:使用者輸入店名 → 按 Enter → 後端呼叫 Google Places API → 顯示候選清單
 *      → 點某筆 → 後端 fire-and-forget pipeline → toast「正在新增」→ 返回上一頁。
 *
 * 不做 real-time search — Places API 每次呼叫都要錢。
 */
export default function AddCafePage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // 提交中的 place_id —— 防止連點重複觸發後端任務。
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const r = await searchPlaces(q);
      setResults(r);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "搜尋失敗");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (place: PlaceSearchResult) => {
    if (submittingId) return;
    setSubmittingId(place.place_id);
    try {
      await submitCafe(place.place_id);
      setToast({
        kind: "success",
        text: `已開始新增「${place.name}」，完成後會出現在地圖上`,
      });
      // 給 toast 露 1.5 秒,讓使用者看到成功訊息再退頁。
      setTimeout(() => navigate(-1), 1500);
    } catch (e) {
      setToast({
        kind: "error",
        text: e instanceof Error ? e.message : "送出失敗,稍後再試",
      });
      setSubmittingId(null);
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(isDesktop ? "/profile" : "/profile", { replace: true });
  };

  return (
    <div className="flex h-screen flex-col bg-base-100">
      {isDesktop && <Topbar variant="desktop" />}

      {/* Mobile header — 桌面有 Topbar 就不再多一條。 */}
      {!isDesktop && (
        <header
          className="flex items-center gap-2 border-b border-base-content/10 px-2 py-2"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={handleBack}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="返回"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
          </button>
          <h1 className="flex-1 text-base font-semibold">新增咖啡廳</h1>
        </header>
      )}

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6">
        {isDesktop && (
          <div className="flex items-center gap-2 pb-3">
            <button
              type="button"
              onClick={handleBack}
              className="btn btn-ghost btn-sm btn-square"
              aria-label="返回"
            >
              <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
            </button>
            <h1 className="text-lg font-bold">新增咖啡廳</h1>
          </div>
        )}

        <p className="pb-3 text-xs text-base-content/55">
          輸入店名後按 Enter，會用 Google 地圖搜尋；找到後點選即可加入。
        </p>

        {/* 搜尋列 — 與 PromptHero (桌面搜尋欄) 的 join 樣式對齊。 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSearch();
          }}
          className="join w-full border border-base-content/25"
        >
          <label className="input input-ghost join-item flex-1 flex items-center gap-2 pl-3 focus-within:bg-transparent">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              strokeWidth={1.5}
              className="text-base-content/55 flex-shrink-0"
            />
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例如：黑浮咖啡 台南民族店"
              className="grow focus:outline-none bg-transparent text-sm h-full"
              disabled={isSearching}
            />
          </label>
          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="btn btn-neutral join-item"
          >
            {isSearching ? (
              <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
            ) : (
              "搜尋"
            )}
          </button>
        </form>

        {/* 結果區 */}
        <div className="mt-3 flex-1 overflow-y-auto">
          {searchError && (
            <p className="py-6 text-center text-sm text-error">{searchError}</p>
          )}

          {!searchError && results === null && !isSearching && (
            <p className="py-12 text-center text-sm text-base-content/55">
              還沒搜尋。請在上方輸入店名後按 Enter。
            </p>
          )}

          {!searchError && results !== null && results.length === 0 && !isSearching && (
            <p className="py-12 text-center text-sm text-base-content/55">
              找不到符合的結果,試試更完整的店名或地址。
            </p>
          )}

          {results && results.length > 0 && (
            <ul className="divide-y divide-base-content/10">
              {results.map((r) => (
                <li key={r.place_id}>
                  <button
                    type="button"
                    disabled={!!submittingId || r.already_exists}
                    onClick={() => void handleSubmit(r)}
                    className="flex w-full items-start gap-3 px-2 py-3 text-left transition-colors hover:bg-base-200 disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-base-200 text-base-content/55">
                      <HugeiconsIcon
                        icon={Location01Icon}
                        size={18}
                        strokeWidth={1.5}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.name}</p>
                      {r.address && (
                        <p className="mt-0.5 truncate text-xs text-base-content/55">
                          {r.address}
                        </p>
                      )}
                      {r.already_exists && (
                        <p className="mt-1 text-[11px] text-base-content/50">
                          已在資料庫中
                        </p>
                      )}
                    </div>
                    {submittingId === r.place_id ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        className="mt-1 shrink-0 animate-spin text-base-content/55"
                      />
                    ) : r.already_exists ? (
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        size={16}
                        className="mt-1 shrink-0 text-success"
                      />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Toast — 簡化版,fire-and-forget 流程僅需短暫訊息。 */}
      {toast && (
        <div
          className={`pointer-events-none fixed inset-x-0 bottom-8 z-50 mx-auto w-fit max-w-[90vw] rounded-full px-4 py-2 text-sm shadow-lg ${
            toast.kind === "success"
              ? "bg-base-content text-base-100"
              : "bg-error text-error-content"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
