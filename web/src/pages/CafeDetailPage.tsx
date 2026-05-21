import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Share01Icon,
  BookmarkAdd01Icon,
  BookmarkCheck01Icon,
  Tick02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { CafeDetailContent } from "@/components/cafe/CafeDetailContent";
import { CafeActionModals } from "@/components/cafe/CafeActionModals";
import { useCafeDetail } from "@/hooks/useCafes";
import { useCafeActions } from "@/hooks/useCafeActions";

/**
 * 手機版 cafe 詳細頁。
 * 桌面版改由 App.tsx 的 DesktopApp 統一管理(共用 CafeMap 不重 mount)。
 */
export default function CafeDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: cafe, isLoading, isError } = useCafeDetail(id);

  const actions = useCafeActions(id || null);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      return;
    } catch {
      // 在 iframe / 未取得焦點時 Clipboard API 會失敗,改用 execCommand 後援。
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        setCopied(true);
        return;
      }
    } catch {
      // ignore
    }
    window.prompt("複製此網址", url);
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
            aria-label={copied ? "已複製連結" : "分享"}
            className={`btn btn-ghost btn-sm gap-1 ${copied ? "text-success" : ""}`}
          >
            <HugeiconsIcon
              icon={copied ? Tick02Icon : Share01Icon}
              size={16}
              strokeWidth={1.5}
            />
            {copied && <span className="text-xs">已複製連結</span>}
          </button>
          <button
            type="button"
            onClick={handlePocketClick}
            disabled={pocketDisabled}
            aria-label={inPocket ? "已加入口袋" : "加入口袋"}
            className={`btn btn-ghost btn-sm btn-square ${inPocket ? "text-primary" : ""}`}
          >
            <HugeiconsIcon
              icon={inPocket ? BookmarkCheck01Icon : BookmarkAdd01Icon}
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
