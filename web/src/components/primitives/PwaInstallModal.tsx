import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PwaInstallModal({ isOpen, onClose }: PwaInstallModalProps) {
  if (!isOpen) return null;

  // Detect iOS/iPadOS to show custom instructions
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

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
      <div className="relative z-10 w-full max-w-sm border border-base-content/15 bg-base-100 p-6 shadow-xl rounded-none cp-anim-slide-in">
        <header className="flex justify-between items-center pb-4 border-b border-base-content/10">
          <h3 className="text-base font-bold text-base-content leading-snug">安裝 咖啡口袋 · Coffee Pocket</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="btn btn-ghost btn-sm btn-square text-base-content/65 hover:text-base-content"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.5} />
          </button>
        </header>

        <div className="py-4">
          <div className="flex items-center gap-3 mb-4">
            <img src="/pwa-icon-192.png" alt="Coffee Pocket" className="h-12 w-12 rounded-none border border-base-content/10" />
            <div>
              <h4 className="font-semibold text-sm">咖啡口袋</h4>
              <p className="text-xs text-base-content/55">收藏你的台南咖啡店口袋名單</p>
            </div>
          </div>

          {isIOS ? (
            <div className="space-y-3.5 text-xs text-base-content/80">
              <p className="font-medium text-base-content">在 iOS / iPadOS 裝置上，請依循以下步驟安裝：</p>
              <ol className="list-decimal pl-4 space-y-2.5">
                <li>
                  點擊 Safari 瀏覽器底部工具列的<strong>「分享」</strong>按鈕（圖示為方塊帶有向上箭頭 📤）。
                </li>
                <li>
                  在分享選單中向下捲動，選擇<strong>「加入主畫面」</strong>（圖示為帶有加號的方塊 ➕）。
                </li>
                <li>
                  確認名稱為「Coffee Pocket」，並點擊右上角的<strong>「新增」</strong>。
                </li>
              </ol>
              <p className="text-[11px] text-base-content/50 mt-1 italic">
                安裝完成後，即可直接從桌面像開啟原生 App 一樣享受流暢的咖啡口袋體驗！
              </p>
            </div>
          ) : (
            <div className="space-y-3.5 text-xs text-base-content/80">
              <p className="font-medium text-base-content">在您的瀏覽器上，請依循以下方式進行安裝：</p>
              <ul className="list-disc pl-4 space-y-2.5">
                <li>
                  <strong>使用 Chrome / Edge 桌上版：</strong>
                  <br />
                  點選網址列右側的<strong>「安裝圖示」</strong>（顯示為螢幕下載圖樣 🖥️），或點開瀏覽器選單並點選<strong>「安裝 咖啡口袋」</strong>。
                </li>
                <li>
                  <strong>使用 Android 行動版：</strong>
                  <br />
                  點選瀏覽器右上角選單（三個點 ⁝），然後選擇<strong>「安裝應用程式」</strong>或<strong>「加入主畫面」</strong>。
                </li>
              </ul>
              <p className="text-[11px] text-base-content/50 mt-1 italic">
                若未看見選項，可能是因為您已安裝或該瀏覽器不支援 PWA 標準。
              </p>
            </div>
          )}
        </div>

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-neutral btn-sm rounded-none text-xs px-5"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
