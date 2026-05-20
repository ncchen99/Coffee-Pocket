import { Link, useParams, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Share01Icon,
  BookmarkAdd01Icon,
  InstagramIcon,
  GoogleMapsIcon,
  Call02Icon,
  Location01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { Cap, Placeholder, TagBadge } from "@/components/primitives";
import { TagConfidenceRow } from "@/components/cafe/TagConfidenceRow";
import { mockCafeDetail } from "@/data/mockCafes";
import { useIsDesktop } from "@/components/layout/Responsive";
import { Topbar } from "@/components/layout/Topbar";

export default function CafeDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
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

  const sticky = (
    <header className="navbar sticky top-0 z-30 min-h-12 border-b border-base-content/15 bg-base-100/95 px-2 backdrop-blur">
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
  );

  const content = (
    <>
      <Placeholder ratio={isDesktop ? "21/9" : "16/9"} label="hero" />

      <section className="px-5 pt-5 lg:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">{cafe.name}</h2>
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

      <div className="divider mx-5 lg:mx-8" />

      {/* AI summary — daisyUI alert (info),維持低調 */}
      <section className="px-5 lg:px-8">
        <Cap>AI 摘要</Cap>
        <div role="status" className="alert alert-info bg-base-200 mt-2 text-base-content border border-base-content/15">
          <span className="text-sm leading-relaxed">{cafe.ai_summary}</span>
        </div>
        <p className="mt-2 font-mono text-[10px] text-base-content/45">
          based on 8 Google reviews · Cafe Nomad fields
        </p>
      </section>

      <div className="divider mx-5 lg:mx-8" />

      <section className="px-5 lg:px-8">
        <Cap>標籤與證據</Cap>
        <ul className="mt-2 divide-y divide-base-content/10">
          {cafe.tags.map((t) => (
            <li key={t.key}>
              <TagConfidenceRow tag={t} />
            </li>
          ))}
        </ul>
      </section>

      <div className="divider mx-5 lg:mx-8" />

      <section className="px-5 lg:px-8">
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

      <div className="divider mx-5 lg:mx-8" />

      <section className="px-5 pb-24 lg:px-8 lg:pb-8">
        <Cap>聯絡與連結</Cap>
        <ul className="menu menu-vertical w-full p-0 mt-2 border-y border-base-content/15 divide-y divide-base-content/10">
          <LinkItem icon={Call02Icon} label={cafe.phone ?? "—"} href={cafe.phone ? `tel:${cafe.phone}` : undefined} />
          <LinkItem icon={Location01Icon} label="在 Google Maps 開啟" href={cafe.google_url} />
          <LinkItem icon={GoogleMapsIcon} label="路線導航" href={cafe.google_url} />
          <LinkItem icon={InstagramIcon} label="Instagram" href={cafe.ig_url} />
        </ul>
      </section>

      <div className="sticky bottom-0 z-20 grid grid-cols-2 gap-2 border-t border-base-content/15 bg-base-100/95 px-5 py-3 backdrop-blur lg:hidden">
        <button type="button" className="btn btn-outline">
          回報問題
        </button>
        <button type="button" className="btn btn-neutral">
          加入口袋
        </button>
      </div>
    </>
  );

  if (isDesktop) {
    return (
      <div className="flex min-h-screen flex-col bg-base-100">
        <Topbar variant="desktop" />
        <main className="mx-auto w-full max-w-3xl border-x border-base-content/15">{content}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      {sticky}
      <main>{content}</main>
    </div>
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
