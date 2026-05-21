/**
 * 嘗試以系統原生分享介面分享一個 URL；不支援時 fallback 到 clipboard。
 * 回傳是否成功（使用者取消視為成功）。
 */
export async function shareUrl(url: string, title?: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url, title });
      return true;
    } catch (err) {
      // AbortError = 使用者取消，視為成功；其他錯誤 fallthrough 到 clipboard
      if (err instanceof Error && err.name === "AbortError") return true;
    }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // ignore
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
    if (ok) return true;
  } catch {
    // ignore
  }
  window.prompt("複製此網址", url);
  return false;
}
