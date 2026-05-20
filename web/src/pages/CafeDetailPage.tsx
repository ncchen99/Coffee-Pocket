import { Link, useParams, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Share01Icon,
  BookmarkAdd01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { CafeDetailContent } from "@/components/cafe/CafeDetailContent";
import { mockCafeDetail } from "@/data/mockCafes";

/**
 * 手機版 cafe 詳細頁。
 * 桌面版改由 App.tsx 的 DesktopApp 統一管理(共用 CafeMap 不重 mount)。
 */
export default function CafeDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const cafe = mockCafeDetail(id);

  if (!cafe) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-100">
        <div role="alert" className="alert alert-warning max-w-sm">
          <HugeiconsIcon icon={AlertCircleIcon} size={18} strokeWidth={1.5} />
          <span>找不到這間店</span>
          <Link to="/" className="btn btn-sm btn-neutral">
            回首頁
          </Link>
        </div>
      </div>
    );
  }

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
        <div className="navbar-end">
          <button type="button" aria-label="分享" className="btn btn-ghost btn-sm btn-square">
            <HugeiconsIcon icon={Share01Icon} size={18} strokeWidth={1.5} />
          </button>
          <button type="button" aria-label="加入口袋" className="btn btn-ghost btn-sm btn-square">
            <HugeiconsIcon icon={BookmarkAdd01Icon} size={18} strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <main>
        <CafeDetailContent cafe={cafe} isDesktop={false} />
      </main>
    </div>
  );
}
