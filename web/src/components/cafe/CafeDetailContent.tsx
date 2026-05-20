import { HugeiconsIcon } from "@hugeicons/react";
import {
  InstagramIcon,
  GoogleMapsIcon,
  Call02Icon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import { Cap, Placeholder, TagBadge } from "@/components/primitives";
import { TagConfidenceRow } from "@/components/cafe/TagConfidenceRow";
import type { mockCafeDetail } from "@/data/mockCafes";

interface CafeDetailContentProps {
  cafe: NonNullable<ReturnType<typeof mockCafeDetail>>;
  isDesktop: boolean;
}

/** 詳細頁主體 — 桌面中間欄與手機 main 共用。 */
export function CafeDetailContent({ cafe, isDesktop }: CafeDetailContentProps) {
  return (
    <>
      <Placeholder ratio="16/9" label="hero" />

      <section className="px-5 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-2xl font-bold tracking-tight">{cafe.name}</h2>
          <div
            className={`badge badge-outline ${cafe.open_now ? "text-success" : "text-base-content/55"}`}
          >
            {cafe.open_now ? `營業中 · ${cafe.closes_at} 打烊` : "今日已休"}
          </div>
        </div>
        <p className="mt-1 text-xs text-base-content/55">
          {cafe.address} · {cafe.distance_km}km
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {cafe.top_tags.map((t) => (
            <TagBadge key={t} variant="neutral">
              {t}
            </TagBadge>
          ))}
        </div>
      </section>

      <div className="divider mx-5" />

      <section className="px-5">
        <Cap>AI 摘要</Cap>
        <div
          role="status"
          className="alert alert-info bg-base-200 mt-2 text-base-content border border-base-content/10"
        >
          <span className="text-sm leading-relaxed">{cafe.ai_summary}</span>
        </div>
        <p className="mt-2 font-mono text-[10px] text-base-content/45">
          based on 8 Google reviews · Cafe Nomad fields
        </p>
      </section>

      <div className="divider mx-5" />

      <section className="px-5">
        <Cap>標籤與證據</Cap>
        <ul className="mt-2 divide-y divide-base-content/10">
          {cafe.tags.map((t) => (
            <li key={t.key}>
              <TagConfidenceRow tag={t} />
            </li>
          ))}
        </ul>
      </section>

      <div className="divider mx-5" />

      <section className="px-5">
        <Cap>營業時間</Cap>
        <dl className="mt-2 divide-y divide-base-content/10">
          {Object.entries(cafe.hours).map(([day, hr]) => (
            <div key={day} className="flex justify-between py-1.5 text-sm">
              <dt className="text-base-content/65">{day}</dt>
              <dd className="font-mono text-xs text-base-content/80">{hr}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="divider mx-5" />

      <section className="px-5 pb-24 lg:pb-8">
        <Cap>聯絡與連結</Cap>
        <ul className="menu menu-vertical w-full p-0 mt-2 border-y border-base-content/10 divide-y divide-base-content/10">
          <LinkItem
            icon={Call02Icon}
            label={cafe.phone ?? "—"}
            href={cafe.phone ? `tel:${cafe.phone}` : undefined}
          />
          <LinkItem icon={Location01Icon} label="在 Google Maps 開啟" href={cafe.google_url} />
          <LinkItem icon={GoogleMapsIcon} label="路線導航" href={cafe.google_url} />
          <LinkItem icon={InstagramIcon} label="Instagram" href={cafe.ig_url} />
        </ul>
      </section>

      {!isDesktop && (
        <div className="sticky bottom-0 z-20 grid grid-cols-2 gap-2 border-t border-base-content/10 bg-base-100/95 px-5 py-3 backdrop-blur">
          <button type="button" className="btn btn-outline">
            回報問題
          </button>
          <button type="button" className="btn btn-neutral">
            加入口袋
          </button>
        </div>
      )}
    </>
  );
}

function LinkItem({
  icon,
  label,
  href,
}: {
  icon: typeof Call02Icon;
  label: string;
  href?: string;
}) {
  const inner = (
    <span className="flex w-full items-center gap-3 px-2 py-2.5">
      <HugeiconsIcon icon={icon} size={16} strokeWidth={1.5} className="text-base-content/65" />
      <span className="flex-1 text-sm">{label}</span>
    </span>
  );
  return (
    <li className="block">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {inner}
        </a>
      ) : (
        <span>{inner}</span>
      )}
    </li>
  );
}
