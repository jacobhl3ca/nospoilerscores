import Link from "next/link";
import DocTopBar from "@/components/DocTopBar";
import FeedbackBox from "@/components/FeedbackBox";
import type { ReactNode } from "react";
import { formatUpdated, routeFirstPublished, routeLastModified } from "@/lib/routeLastModified";

type FaqItem = {
  q: string;
  a: string;
};

type LinkItem = {
  href: string;
  label: string;
};

type SeoLandingPageProps = {
  // Small uppercase kicker above the h1. Was a plain "HideScore" line until
  // 2026-09-25; the pinned bar already carries the brand.
  eyebrow?: string;
  h1: string;
  // Short label beside the logo in the pinned top bar ("HideScore | NFL
  // highlights"), 2026-09-25. Defaults to the h1 minus a trailing "without
  // spoilers", which fits every "<X> without spoilers" page; the few h1s that
  // are full sentences pass their own.
  subject?: string;
  // Rendered straight under the h1, above the intro, and wider than the text
  // column. Added 2026-09-23 for the MLB playoff pages, which lead with the live
  // playoff panel itself so a visitor from search reaches the bracket before
  // any copy (and without the board's first-run league picker). A caller that
  // passes nothing gets byte-identical output to before.
  lead?: ReactNode;
  intro: string[];
  sections: { h: string; p: string }[];
  bullets: string[];
  ctaLabel: string;
  ctaHref?: string;
  links?: LinkItem[];
  faq: FaqItem[];
  schemaName: string;
  schemaDescription: string;
  canonical: string;
  about: string[];
  // Extra JSON-LD nodes appended to this page's @graph. Added 2026-09-20 for
  // /best-spoiler-free-sports-sites, which needs an ItemList beside the
  // WebPage/BreadcrumbList/FAQPage nodes every landing page already emits.
  // Deliberately an append rather than an override: the three standard nodes
  // and their @id cross-links are the part that must not vary per page, and a
  // caller that passes nothing gets byte-identical output to before.
  extraSchema?: Record<string, unknown>[];
  // @id of a node in `extraSchema` that this page is primarily ABOUT, wired to
  // the WebPage node as `mainEntity`. Without it an appended node floats in the
  // @graph unreferenced, the way the BreadcrumbList and FAQPage nodes used to
  // before the refs above were added — Google merges the graph either way, but
  // an unlinked list is not attributed to the page it describes.
  mainEntityId?: string;
};

export default function SeoLandingPage({
  eyebrow = "Spoiler-free guide",
  h1,
  subject,
  lead,
  intro,
  sections,
  bullets,
  ctaLabel,
  ctaHref = "/",
  links = [],
  faq,
  schemaName,
  schemaDescription,
  canonical,
  about,
  extraSchema = [],
  mainEntityId,
}: SeoLandingPageProps) {
  // The date this page's own copy last changed, shown under the h1 and sent as
  // dateModified (2026-09-24, for the freshness signal answer engines read).
  // Skipped on a page with a live `lead` panel: the MLB playoff pages change
  // every game day, and a months-old source date would undersell them.
  const updated = lead ? null : routeLastModified(canonical);
  const published = routeFirstPublished(canonical);
  const topic = subject ?? h1.replace(/\s+without spoilers$/i, "");
  const route = canonical.replace(/^\//, "");
  // Read time over everything a reader scrolls past, FAQ included, at 230 wpm.
  const words = [...intro, ...sections.flatMap((x) => [x.h, x.p]), ...bullets, ...faq.flatMap((x) => [x.q, x.a])]
    .join(" ")
    .split(/\s+/).length;
  const readMin = Math.max(1, Math.ceil(words / 230));
  const body = { color: "var(--text-body)" };
  const muted = { color: "var(--text-muted)" };
  // Article layout 2026-09-25 (Jacob: "more official looking"): breadcrumb +
  // kicker, a larger h1 with the meta description as its dek, a byline row, an
  // "At a glance" box built from `bullets` (they used to sit at the bottom
  // under "What HideScore helps with"), darker body copy, and an "About this
  // guide" box with a Report-an-error link. No page's copy changed.
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-base leading-relaxed" style={{ color: "var(--text)" }}>
      <DocTopBar route={route} ctaHref={ctaHref} subject={topic} />

      <nav aria-label="Breadcrumb" className="mb-2 text-xs" style={muted}>
        <ol className="flex flex-wrap items-center gap-x-1.5">
          <li>
            <Link href="/" className="hover:underline">HideScore</Link>
          </li>
          <li aria-hidden="true">›</li>
          <li>
            <Link href="/spoiler-free-sports" className="hover:underline">Guides</Link>
          </li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="font-medium" style={{ color: "var(--text-secondary)" }}>
            {topic}
          </li>
        </ol>
      </nav>
      <p className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.09em]" style={{ color: "var(--accent)" }}>
        {eyebrow}
      </p>
      <h1 className="mb-3 text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.12]">{h1}</h1>
      {/* The meta description doubles as the dek. Not on a live-panel page:
          there the panel is the summary, and the dek would push it a screen
          further from a visitor arriving from search. */}
      {lead ? null : (
        <p className="mb-4 text-lg leading-snug" style={body}>
          {schemaDescription}
        </p>
      )}

      <div
        className="mb-6 flex items-center gap-2.5 py-2.5 text-[13px]"
        style={{ ...muted, borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
      >
        <svg className="w-6 h-6 shrink-0 header-logo" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="16" className="header-logo-bg" />
          <text x="16" y="21.5" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="system-ui" className="header-logo-text">H</text>
        </svg>
        <p>
          By{" "}
          <Link href="/about" className="font-semibold hover:underline" style={{ color: "var(--text)" }}>
            the HideScore team
          </Link>
          {updated ? (
            <>
              {" · "}Updated <time dateTime={updated.toISOString()}>{formatUpdated(updated, "short")}</time>
            </>
          ) : null}
          {` · ${readMin} min read`}
        </p>
      </div>

      {lead ? (
        // Centred on the page and allowed past the 2xl text column: the bracket
        // needs the room. 100vw minus the page gutters, capped at the modal's
        // own max-w-6xl.
        <div className="relative left-1/2 -translate-x-1/2 mb-6" style={{ width: "min(72rem, calc(100vw - 2rem))" }}>
          {lead}
        </div>
      ) : null}

      <aside className="doc-glance mb-7 rounded-md px-4 py-3" aria-labelledby="doc-glance-title">
        <h2 id="doc-glance-title" className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--accent)" }}>
          At a glance
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-[15px]" style={body}>
          {bullets.map((bullet, i) => (
            <li key={`${bullet}-${i}`}>{bullet}</li>
          ))}
        </ul>
      </aside>

      {intro.map((paragraph, i) => (
        <p key={`${paragraph}-${i}`} className="mb-4" style={body}>
          {paragraph}
        </p>
      ))}

      {sections.map((section, i) => (
        <section key={`${section.h}-${i}`}>
          <h2 className="text-xl font-bold tracking-tight mt-9 mb-2">{section.h}</h2>
          <p className="mb-4" style={body}>
            {section.p}
          </p>
        </section>
      ))}

      <div
        className="mt-8 rounded-xl px-5 py-5 text-center"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <p className="font-semibold mb-3">Open HideScore. No score is printed on the board.</p>
        <Link
          href={ctaHref}
          className="inline-block rounded-lg px-5 py-2.5 font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
          data-umami-event={`seo-open-${route}`}
        >
          {ctaLabel}
        </Link>
        {links.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" style={muted}>
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="underline underline-offset-2">
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <h2 className="text-xl font-bold tracking-tight mt-9 mb-3">Frequently asked questions</h2>
      <section className="space-y-5">
        {faq.map((item, i) => (
          <div key={`${item.q}-${i}`}>
            <h3 className="font-semibold mb-1">{item.q}</h3>
            <p style={body}>{item.a}</p>
          </div>
        ))}
      </section>

      <aside
        className="mt-10 rounded-xl px-4 py-4 text-sm"
        style={{ ...body, background: "var(--bg-card)" }}
        aria-labelledby="doc-about-title"
      >
        <h2 id="doc-about-title" className="mb-1 font-bold" style={{ color: "var(--text)" }}>
          About this guide
        </h2>
        <p>
          Written and kept up to date by{" "}
          <Link href="/about" className="underline underline-offset-2">
            the HideScore team
          </Link>
          , who build the spoiler-free board it describes.
          {updated ? <> Last updated {formatUpdated(updated)}.</> : null}
        </p>
        {/* A div, not a p: FeedbackBox renders its modal (a div + form) in place. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Spotted a mistake?</span>
          <FeedbackBox label="Report an error" seed={`Error on ${canonical}: `} />
          <Link href="/contact" className="underline underline-offset-2" style={muted}>
            Contact
          </Link>
        </div>
      </aside>

      <div className="mt-10 flex flex-wrap gap-x-4 gap-y-2">
        <Link
          href="/"
          className="underline underline-offset-2"
          style={{ color: "var(--text-muted)" }}
          data-umami-event={`doc-bottom-open-${route}`}
        >
          Back to HideScore
        </Link>
        <Link href="/spoiler-free-sports" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Spoiler-free sports guide
        </Link>
        <Link href="/faq" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          FAQ
        </Link>
        <Link href="/about" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          About
        </Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                name: schemaName,
                description: schemaDescription,
                url: `https://hidescore.com${canonical}`,
                inLanguage: "en",
                ...(updated ? { dateModified: updated.toISOString() } : {}),
                // Reference the site-level WebSite node by @id (declared in
                // layout.tsx's JSON-LD @graph) rather than re-declaring an
                // @id-less WebSite here. Both blocks render on the same page, so
                // Google merges them into one graph and this resolves to the
                // single shared WebSite entity — the same node-linking the site
                // uses for publisher/#organization — instead of leaving two
                // duplicate WebSite entities for hidescore.com on the page.
                isPartOf: { "@id": "https://hidescore.com/#website" },
                // Point this page at its own BreadcrumbList node (below) by @id,
                // the same @graph node-linking the WebPage→WebSite isPartOf above
                // and layout.tsx's publisher/#organization refs use. The
                // BreadcrumbList was the one sibling node left unlinked — a bare,
                // @id-less list floating beside the page it describes. `breadcrumb`
                // is a valid WebPage property, and tying it to the page node is
                // Google's recommended pattern for the breadcrumb rich result.
                breadcrumb: { "@id": `https://hidescore.com${canonical}#breadcrumb` },
                ...(mainEntityId ? { mainEntity: { "@id": mainEntityId } } : {}),
                about: about.map((name) => ({ "@type": "Thing", name })),
              },
              {
                "@type": "BreadcrumbList",
                // Stable per-page @id so the WebPage node above can reference this
                // exact list (Google merges the page's JSON-LD into one graph, so
                // the ref resolves here). Keyed on the canonical path so each
                // landing page gets its own unambiguous breadcrumb node.
                "@id": `https://hidescore.com${canonical}#breadcrumb`,
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: "Guides", item: "https://hidescore.com/spoiler-free-sports" },
                  { "@type": "ListItem", position: 3, name: h1, item: `https://hidescore.com${canonical}` },
                ],
              },
              {
                "@type": "FAQPage",
                // Tie this node to the same page URL as the WebPage node above and
                // into the shared WebSite entity. FAQPage is a WebPage subtype, so
                // without a `url`/`isPartOf` it floated as a SECOND, disconnected
                // page node beside the WebPage describing the exact same address —
                // the lone sibling in this @graph still left unlinked, after the
                // WebPage→#website and WebPage→#breadcrumb refs above already tied
                // the rest together. Anchoring it to the canonical URL + #website
                // (the same node-linking pattern the WebPage/BreadcrumbList use)
                // makes the two page nodes read as one entity for this URL instead
                // of two, matching layout.tsx's publisher/#organization approach.
                url: `https://hidescore.com${canonical}`,
                isPartOf: { "@id": "https://hidescore.com/#website" },
                // Declare the Q&A content language, matching the WebPage node
                // above and the inLanguage signal the site adds to its other
                // CreativeWork schema nodes (WebApplication/WebSite in layout).
                // FAQPage is a WebPage subtype, so this is a valid locale hint.
                inLanguage: "en",
                mainEntity: faq.map((item) => ({
                  "@type": "Question",
                  name: item.q,
                  acceptedAnswer: { "@type": "Answer", text: item.a },
                })),
              },
              {
                // The article itself, with the byline's author (2026-09-25).
                // Author and publisher point at layout.tsx's Organization node
                // by @id, like the WebApplication/WebSite nodes do.
                "@type": "Article",
                "@id": `https://hidescore.com${canonical}#article`,
                headline: h1,
                description: schemaDescription,
                url: `https://hidescore.com${canonical}`,
                mainEntityOfPage: `https://hidescore.com${canonical}`,
                inLanguage: "en",
                image: "https://hidescore.com/og-image.png",
                author: { "@id": "https://hidescore.com/#organization" },
                publisher: { "@id": "https://hidescore.com/#organization" },
                isPartOf: { "@id": "https://hidescore.com/#website" },
                ...(published ? { datePublished: published.toISOString() } : {}),
                ...(updated ? { dateModified: updated.toISOString() } : {}),
              },
              ...extraSchema,
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
