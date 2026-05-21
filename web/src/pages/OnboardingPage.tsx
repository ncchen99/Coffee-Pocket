import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Coffee02Icon } from "@hugeicons/core-free-icons";
import { useUserLocation } from "@/context/UserLocationContext";

const ONBOARDED_KEY = "cp.onboarded";
const PERMISSION_KEY = "cp.location_permission";

export function isOnboarded(): boolean {
  return localStorage.getItem(ONBOARDED_KEY) === "1";
}

function markOnboarded() {
  localStorage.setItem(ONBOARDED_KEY, "1");
}

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "為你此刻的需求，\n找一間剛好的店。",
    body: "",
  },
  {
    title: "不是另一個 Google Maps。",
    body: "你告訴它「現在、附近、要安靜有插座」，它告訴你只有 3 間符合，而不是 50 間。",
  },
  {
    title: "讓我們知道你在哪。",
    body: "只用於「現在」，不會記錄。你也可以手動指定地點。",
  },
];

/**
 * Onboarding — 3 頁引導,介紹情境式搜尋並請求位置權限。
 */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const { requestLocation } = useUserLocation();

  const finish = () => {
    markOnboarded();
    navigate("/", { replace: true });
  };

  const handleRequestLocation = () => {
    requestLocation(
      () => finish(),
      () => finish(),
    );
  };

  const handleManualLocation = () => {
    localStorage.setItem(PERMISSION_KEY, "denied");
    finish();
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-100 px-6">
      <button
        type="button"
        onClick={finish}
        className="btn btn-ghost btn-sm absolute right-4 top-4 text-xs text-base-content/50"
      >
        跳過
      </button>

      <div className="w-full max-w-xs text-center">
        {step === 0 && (
          <HugeiconsIcon icon={Coffee02Icon} size={40} strokeWidth={1.5} className="mx-auto mb-4" />
        )}

        <h1 className="whitespace-pre-line text-xl font-bold leading-relaxed">
          {current.title}
        </h1>
        {current.body && (
          <p className="mt-3 text-sm text-base-content/65 leading-relaxed">{current.body}</p>
        )}

        {/* Dots */}
        <div className="mt-8 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`block h-1.5 w-1.5 ${i === step ? "bg-base-content" : "bg-base-content/25"}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 space-y-2">
          {isLast ? (
            <>
              <button type="button" onClick={handleRequestLocation} className="btn btn-neutral btn-block">
                開啟定位
              </button>
              <button type="button" onClick={handleManualLocation} className="btn btn-ghost btn-block btn-sm">
                手動指定（預設中西區）
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="btn btn-neutral btn-block"
            >
              {step === 0 ? "下一步" : "懂了"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
