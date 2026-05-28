import { useState } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Navigation03Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

interface LocationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LocationGuideModal({ isOpen, onClose }: LocationGuideModalProps) {
  const [activeTab, setActiveTab] = useState<"safari" | "chrome">("safari");

  if (!isOpen) return null;

  // 偵測是否處於非安全遠端 HTTP 開發環境
  const isHttpRemote =
    typeof window !== "undefined" &&
    window.location.protocol === "http:" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 h-full w-full bg-base-300/40 backdrop-blur-sm transition-opacity cursor-default focus:outline-none"
        onClick={onClose}
        aria-label="關閉"
      />

      {/* Modal Box */}
      <div className="relative z-10 w-full max-w-md border border-base-content/15 bg-base-100 p-6 shadow-xl rounded-none cp-anim-slide-in">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-base-content/40 hover:text-base-content/70 btn btn-ghost btn-sm btn-square rounded-none"
          aria-label="關閉"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
        </button>

        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary/10 text-primary rounded-none">
            <HugeiconsIcon icon={Navigation03Icon} size={20} strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-base-content leading-snug">如何啟用定位服務？</h3>
            <p className="mt-1 text-xs text-base-content/60">
              {isHttpRemote 
                ? "iOS 開發測試環境限制警告" 
                : "位置讀取權限目前被拒絕，請依照下方指引設定以啟用。"}
            </p>
          </div>
        </div>

        {isHttpRemote ? (
          /* 非安全遠端 HTTP 警告介面 */
          <div className="mt-5 space-y-4">
            <div className="border-l-4 border-warning bg-warning/5 p-4 text-xs text-base-content/85 leading-relaxed space-y-2">
              <p className="font-bold text-warning-content">⚠️ 偵測到非安全的 HTTP 測試連線</p>
              <p>
                Apple iOS 的安全性原則規定，<strong>必須在安全連線 (HTTPS)</strong> 環境下，瀏覽器才允許呼叫 Geolocation 定位 API（localhost 除外）。
              </p>
              <p>
                因為您目前使用的是區網 HTTP（<code>{window.location.host}</code>），iOS Safari/Chrome 會<strong>直接且靜默地阻擋</strong>定位要求，而不彈出任何權限視窗。
              </p>
            </div>
            
            <div className="bg-base-200/50 p-4 text-xs text-base-content/80 leading-relaxed space-y-2">
              <p className="font-semibold text-base-content">💡 建議的測試方式：</p>
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-base-content/10 font-mono text-[10px] font-bold rounded-none">1</span>
                <p>在 Onboarding 頁面中，點選右下角的<strong>「手動指定定位」</strong>，系統將預設為台南市中西區，以順暢測試地圖與搜尋功能。</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-base-content/10 font-mono text-[10px] font-bold rounded-none">2</span>
                <p>若需測試實機真實定位，請透過 <code>ngrok</code>、<code>localflare</code> 或設定 Vite SSL 套件提供 <code>https://</code> 開發連線網址。</p>
              </div>
            </div>
          </div>
        ) : (
          /* 標準 iOS Safari / Chrome 指南 */
          <>
            {/* Browser Tabs */}
            <div className="mt-5 flex border-b border-base-content/10">
              <button
                type="button"
                onClick={() => setActiveTab("safari")}
                className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 rounded-none transition-colors ${
                  activeTab === "safari"
                    ? "border-primary text-primary animate-none"
                    : "border-transparent text-base-content/50 hover:text-base-content/85"
                }`}
              >
                Safari 瀏覽器
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("chrome")}
                className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 rounded-none transition-colors ${
                  activeTab === "chrome"
                    ? "border-primary text-primary animate-none"
                    : "border-transparent text-base-content/50 hover:text-base-content/85"
                }`}
              >
                Google Chrome
              </button>
            </div>

            {/* Tab Content */}
            <div className="mt-4 bg-base-200/50 p-4 text-xs text-base-content/85 leading-relaxed space-y-2.5">
              {activeTab === "safari" ? (
                <>
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-base-content/10 font-mono text-[10px] font-bold rounded-none">1</span>
                    <p>開啟 iPhone 系統的<strong>「設定」</strong>App。</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-base-content/10 font-mono text-[10px] font-bold rounded-none">2</span>
                    <p>向下滾動並點選<strong>「Safari 瀏覽器」</strong>。</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-base-content/10 font-mono text-[10px] font-bold rounded-none">3</span>
                    <p>滾動至下方的「網站設定」區塊，點選<strong>「位置」</strong>。</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-base-content/10 font-mono text-[10px] font-bold rounded-none">4</span>
                    <p>將權限更改為<strong>「詢問」</strong>或<strong>「允許」</strong>，然後回到此網頁重新整理。</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-base-content/10 font-mono text-[10px] font-bold rounded-none">1</span>
                    <p>開啟 iPhone 系統的<strong>「設定」</strong>App。</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-base-content/10 font-mono text-[10px] font-bold rounded-none">2</span>
                    <p>向下滾動並點選<strong>「Chrome」</strong>。</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-base-content/10 font-mono text-[10px] font-bold rounded-none">3</span>
                    <p>點選最上方的<strong>「位置」</strong>。</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-base-content/10 font-mono text-[10px] font-bold rounded-none">4</span>
                    <p>將權限更改為<strong>「使用 App 期間」</strong>，然後回到此網頁重新整理。</p>
                  </div>
                </>
              )}
            </div>

            {/* System settings guide fallback */}
            <div className="mt-3 border-l-2 border-warning bg-warning/5 p-3 text-[11px] text-base-content/75 leading-normal">
              💡 <strong>若設定後仍無法正常讀取：</strong><br />
              請確認「設定」&gt;「隱私權與安全性」&gt;「定位服務」之中的<strong>「定位服務」</strong>主開關是否處於開啟狀態。
            </div>
          </>
        )}

        {/* Action Button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-neutral btn-sm text-xs rounded-none font-medium px-5"
          >
            我懂了
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
