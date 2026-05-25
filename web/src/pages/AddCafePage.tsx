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
import { searchPlaces, submitCafeStream, type PlaceSearchResult } from "@/lib/api";

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

  // 顯示在電腦 Header 的進度狀態文字
  const [progressStatus, setProgressStatus] = useState<string | null>(null);

  // 手機專用通知文字與 Timer
  const [mobileNotification, setMobileNotification] = useState<string | null>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerMobileNotification = (text: string) => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setMobileNotification(text);
    notificationTimerRef.current = setTimeout(() => {
      setMobileNotification(null);
    }, 2000);
  };

  const mapEventToMessage = (event: any): string => {
    switch (event.stage) {
      case "pinyin":
        return "建立網址與拼音索引...";
      case "scrape":
        return "正在爬取 Google 評論...";
      case "extract":
        return "AI 正在擷取店家特色...";
      case "semantic":
        return "正在整合語意標籤...";
      case "ai_summary":
        return "AI 正在產生智能摘要...";
      default:
        return "正在分析店家資訊...";
    }
  };

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
    setProgressStatus("開始新增...");

    if (!isDesktop) {
      triggerMobileNotification("開始新增店家...");
    }

    try {
      await submitCafeStream(place.place_id, (event) => {
        if (event.type === "already_exists") {
          setToast({
            kind: "success",
            text: `「${place.name}」已存在於資料庫中`,
          });
          setTimeout(() => navigate(-1), 1500);
          return;
        }

        if (event.type === "pipeline_start") {
          const msg = "準備分析資料...";
          setProgressStatus(msg);
          if (!isDesktop) triggerMobileNotification(msg);
        } else if (event.type === "stage_start") {
          const msg = mapEventToMessage(event);
          setProgressStatus(msg);
          if (!isDesktop) triggerMobileNotification(msg);
        } else if (event.type === "pipeline_done") {
          setProgressStatus("新增完成！");
          if (!isDesktop) {
            triggerMobileNotification("新增完成！已發布至地圖。");
          }
          setToast({
            kind: "success",
            text: `「${place.name}」分析完成！已成功加入地圖。`,
          });
          setTimeout(() => navigate(-1), 2000);
        } else if (event.type === "pipeline_failed" || event.type === "pipeline_error") {
          const errMsg = event.message || "店家分析失敗，請稍後再試";
          setToast({
            kind: "error",
            text: errMsg,
          });
          setSubmittingId(null);
          setProgressStatus(null);
          setMobileNotification(null);
        }
      });
    } catch (e) {
      setToast({
        kind: "error",
        text: e instanceof Error ? e.message : "送出失敗，請稍後再試",
      });
      setSubmittingId(null);
      setProgressStatus(null);
      setMobileNotification(null);
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
            disabled={!!submittingId}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="返回"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
          </button>
          <h1 className="flex-1 text-base font-semibold">
            {progressStatus ? `新增中 (${progressStatus})` : "新增咖啡廳"}
          </h1>
          {submittingId && (
            <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin text-base-content/55 mr-2" />
          )}
        </header>
      )}

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6">
        {isDesktop && (
          <div className="flex items-center gap-2 pb-3">
            <button
              type="button"
              onClick={handleBack}
              disabled={!!submittingId}
              className="btn btn-ghost btn-sm btn-square"
              aria-label="返回"
            >
              <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
            </button>
            <h1 className="text-lg font-bold">
              {progressStatus ? `新增中 (${progressStatus})` : "新增咖啡廳"}
            </h1>
            {submittingId && (
              <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin text-base-content/55 ml-1" />
            )}
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

      {/* 手機專用底部通知 — 貼齊下方，覆蓋 navigation bar 區域 */}
      {mobileNotification && (
        <div className="fixed bottom-0 left-0 right-0 z-50 w-full bg-base-content text-base-100 px-4 py-4 shadow-2xl flex items-center justify-between gap-3 transition-transform duration-300 transform translate-y-0"
             style={{ 
               paddingBottom: "calc(1.1rem + env(safe-area-inset-bottom))",
               animation: "slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards"
             }}>
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
          `}</style>
          <div className="flex items-center gap-3">
            <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin text-base-100 shrink-0" />
            <span className="text-sm font-medium">{mobileNotification}</span>
          </div>
          <span className="text-[10px] text-base-100/70 bg-base-100/15 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0">
            分析中
          </span>
        </div>
      )}
    </div>
  );
}
