import Link from "next/link";
import type { ReactNode } from "react";
import { formatUpdated, routeLastModified } from "@/lib/routeLastModified";

type FaqItem = {
  q: string;
  a: string;
};

type LinkItem = {
  href: string;
  label: string;
};

type SeoLandingPageProps = {
  eyebrow?: string;
  h1: string;
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
  eyebrow = "HideScore",
  h1,
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
  return (
    <main className="mx-auto max-w-2xl px-4 doc-page text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        {eyebrow}
      </p>
      <h1 className="text-2xl font-bold mb-4">{h1}</h1>
      {updated ? (
        <p className="-mt-2 mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
          Updated <time dateTime={updated.toISOString()}>{formatUpdated(updated)}</time>
        </p>
      ) : null}

      {lead ? (
        // Centred on the page and allowed past the 2xl text column: the bracket
        // needs the room. 100vw minus the page gutters, capped at the modal's
        // own max-w-6xl.
        <div className="relative left-1/2 -translate-x-1/2 mb-6" style={{ width: "min(72rem, calc(100vw - 2rem))" }}>
          {lead}
        </div>
      ) : null}

      {intro.map((paragraph, i) => (
        <p key={`${paragraph}-${i}`} className="mb-4" style={{ color: "var(--text-muted)" }}>
          {paragraph}
        </p>
      ))}

      {sections.map((section, i) => (
        <section key={`${section.h}-${i}`}>
          <h2 className="text-lg font-semibold mt-8 mb-2">{section.h}</h2>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            {section.p}
          </p>
        </section>
      ))}

      <h2 className="text-lg font-semibold mt-8 mb-3">What HideScore helps with</h2>
      <ul className="mb-4 space-y-1.5 list-disc pl-5" style={{ color: "var(--text-muted)" }}>
        {bullets.map((bullet, i) => (
          <li key={`${bullet}-${i}`}>{bullet}</li>
        ))}
      </ul>

      <div
        className="mt-8 rounded-xl px-5 py-5 text-center"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <p className="font-semibold mb-3">Open HideScore. No score is printed on the board.</p>
        <Link
          href={ctaHref}
          className="inline-block rounded-lg px-5 py-2.5 font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
          data-umami-event={`seo-open-${canonical.replace(/^\//, "")}`}
        >
          {ctaLabel}
        </Link>
        {links.length > 0 && (
          <nav aria-label="Related spoiler-free pages" className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="underline underline-offset-2">
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-3">Frequently asked questions</h2>
      <section className="space-y-5">
        {faq.map((item, i) => (
          <div key={`${item.q}-${i}`}>
            <h3 className="font-semibold mb-1">{item.q}</h3>
            <p style={{ color: "var(--text-muted)" }}>{item.a}</p>
          </div>
        ))}
      </section>

      <nav aria-label="More from HideScore" className="mt-10 flex flex-wrap gap-x-4 gap-y-2">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
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
                  { "@type": "ListItem", position: 2, name: h1, item: `https://hidescore.com${canonical}` },
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
              ...extraSchema,
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
