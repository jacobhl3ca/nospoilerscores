import Link from "next/link";

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
};

export default function SeoLandingPage({
  eyebrow = "HideScore",
  h1,
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
}: SeoLandingPageProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>
        {eyebrow}
      </p>
      <h1 className="text-2xl font-bold mb-4">{h1}</h1>

      {intro.map((paragraph) => (
        <p key={paragraph} className="mb-4" style={{ color: "var(--text-muted)" }}>
          {paragraph}
        </p>
      ))}

      {sections.map((section) => (
        <section key={section.h}>
          <h2 className="text-lg font-semibold mt-8 mb-2">{section.h}</h2>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            {section.p}
          </p>
        </section>
      ))}

      <h2 className="text-lg font-semibold mt-8 mb-3">What HideScore helps with</h2>
      <ul className="mb-4 space-y-1.5 list-disc pl-5" style={{ color: "var(--text-muted)" }}>
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>

      <div
        className="mt-8 rounded-xl px-5 py-5 text-center"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <p className="font-semibold mb-3">Open HideScore with scores hidden by default.</p>
        <Link
          href={ctaHref}
          className="inline-block rounded-lg px-5 py-2.5 font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
          data-umami-event={`seo-open-${canonical.replace(/^\//, "")}`}
        >
          {ctaLabel}
        </Link>
        {links.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="underline underline-offset-2">
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-3">Frequently asked questions</h2>
      <section className="space-y-5">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-semibold mb-1">{item.q}</h3>
            <p style={{ color: "var(--text-muted)" }}>{item.a}</p>
          </div>
        ))}
      </section>

      <div className="mt-10 flex flex-wrap gap-x-4 gap-y-2">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Back to HideScore
        </Link>
        <Link href="/spoiler-free-sports" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Spoiler-free sports guide
        </Link>
        <Link href="/faq" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          FAQ
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
                isPartOf: { "@type": "WebSite", name: "HideScore", url: "https://hidescore.com" },
                about: about.map((name) => ({ "@type": "Thing", name })),
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "HideScore", item: "https://hidescore.com" },
                  { "@type": "ListItem", position: 2, name: h1, item: `https://hidescore.com${canonical}` },
                ],
              },
              {
                "@type": "FAQPage",
                mainEntity: faq.map((item) => ({
                  "@type": "Question",
                  name: item.q,
                  acceptedAnswer: { "@type": "Answer", text: item.a },
                })),
              },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
