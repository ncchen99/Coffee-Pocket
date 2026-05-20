import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Coffee02Icon } from "@hugeicons/core-free-icons";
import { useAuth } from "@/hooks/useAuth";

/**
 * 登入頁 — 僅 Google OAuth。
 * 以全螢幕呈現,登入成功後自動跳回上一頁。
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const { signInWithGoogle } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-100 px-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="btn btn-ghost btn-sm btn-square absolute right-4 top-4"
        aria-label="關閉"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
      </button>

      <div className="w-full max-w-xs text-center">
        <HugeiconsIcon icon={Coffee02Icon} size={40} strokeWidth={1.5} className="mx-auto" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight">咖啡口袋</h1>
        <p className="mt-1 font-mono text-xs text-base-content/55">Coffee Pocket</p>

        <div className="mt-8 text-left">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-base-content/55">
            為什麼要登入？
          </p>
          <ul className="mt-2 space-y-1 text-sm text-base-content/70">
            <li>・收藏你的口袋名單</li>
            <li>・修正 / 補充店家資訊</li>
            <li>・對標籤投票，讓資料更準</li>
          </ul>
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          className="btn btn-neutral btn-block mt-8"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.96 10.96 0 0 0 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09a6.56 6.56 0 0 1 0-4.18V7.07H2.18a10.96 10.96 0 0 0 0 9.86l3.66-2.84z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 10.96 10.96 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
            />
          </svg>
          以 Google 繼續
        </button>

        <div className="divider my-6 text-xs text-base-content/45">或先逛逛</div>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn btn-ghost btn-block btn-sm"
        >
          返回不登入
        </button>

        <p className="mt-8 text-[10px] text-base-content/40">
          登入即同意服務條款與隱私權政策
        </p>
      </div>
    </div>
  );
}
