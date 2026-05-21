import { Link, useParams, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  LinkForwardIcon,
  Bookmark02Icon,
  BookmarkCheck02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { CafeDetailContent } from "@/components/cafe/CafeDetailContent";
import { CafeActionModals } from "@/components/cafe/CafeActionModals";
import { useCafeDetail } from "@/hooks/useCafes";
import { useCafeActions } from "@/hooks/useCafeActions";
import { shareUrl } from "@/lib/share";

/**
 * 手機版 cafe 詳細頁。
 * 桌面版改由 App.tsx 的 DesktopApp 統一管理(共用 CafeMap 不重 mount)。
 */
export default function CafeDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: cafe, isLoading, isError } = useCafeDetail(id);

  const actions = useCafeActions(id || null);

  const handleShare = () => {
    shareUrl(window.location.href, cafe?.name);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-base-100 p-5 space-y-3">
        <div className="h-12 bg-base-200 animate-pulse rounded" />
        <div className="h-48 bg-base-200 animate-pulse rounded" />
        <div className="h-6 bg-base-200 animate-pulse rounded w-1/2" />
        <div className="h-4 bg-base-200 animate-pulse rounded w-3/4" />
        <div className="h-24 bg-base-200 animate-pulse rounded" />
      </div>
    );
  }

  if (!cafe) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-100">
        <div role="alert" className="alert alert-warning max-w-sm">
          <HugeiconsIcon icon={AlertCircleIcon} size={18} strokeWidth={1.5} />
          <span>{isError ? "載入失敗，請稍後再試" : "找不到這間店"}</span>
          <Link to="/" className="btn btn-sm btn-neutral">
            回首頁
          </Link>
        </div>
      </div>
    );
  }

  const { inPocket, pocketDisabled, handlePocketClick } = actions;

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      <header className="navbar sticky top-0 z-30 min-h-12 border-b border-base-content/10 bg-base-100/95 px-2 backdrop-blur">
        <div className="navbar-start">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="返回"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="navbar-center">
          <h1 className="truncate text-sm font-semibold px-2">{cafe.name}</h1>
        </div>
        <div className="navbar-end gap-1">
          <button
            type="button"
            onClick={handleShare}
            aria-label="分享"
            className="btn btn-ghost btn-sm btn-square"
          >
            <HugeiconsIcon icon={LinkForwardIcon} size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={handlePocketClick}
            disabled={pocketDisabled}
            aria-label={inPocket ? "已加入口袋" : "加入口袋"}
            className={`btn btn-ghost btn-sm btn-square ${inPocket ? "text-primary" : ""}`}
          >
            <HugeiconsIcon
              icon={inPocket ? BookmarkCheck02Icon : Bookmark02Icon}
              size={18}
              strokeWidth={1.5}
            />
          </button>
        </div>
      </header>
      <main>
        <CafeDetailContent cafe={cafe} isDesktop={false} actions={actions} />
      </main>
      <CafeActionModals actions={actions} />
    </div>
  );
}
