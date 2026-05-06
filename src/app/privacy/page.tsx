import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | HideScore",
  description: "HideScore does not collect, store, or share personal data.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-[15px] leading-relaxed" style={{ color: "var(--text)" }}>
      <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Last updated: 2026-05-06</p>

      <section className="space-y-4">
        <p>
          HideScore is built to hide sports scores until you choose to see them. We do not collect, store, sell, or share any personal information about you.
        </p>

        <h2 className="text-lg font-semibold mt-6">What we collect</h2>
        <p>
          Nothing personally identifiable. HideScore has no user accounts, no analytics SDKs, no advertising trackers, and no crash-reporting services. We do not place cookies for tracking purposes.
        </p>
        <p>
          Your favorite-team selections and view preferences are stored locally on your device using your browser&apos;s local storage. They never leave your device and are not transmitted to us.
        </p>

        <h2 className="text-lg font-semibold mt-6">Network requests</h2>
        <p>
          When you use HideScore, your device fetches publicly available scores, schedules, news headlines, and video metadata from third-party sports sources, including ESPN, MLB.com, NBA.com, NHL.com, Reddit, YouTube, and others. These services may receive your IP address and standard request information as a normal part of any web request. HideScore does not see, log, or store these requests on our servers.
        </p>

        <h2 className="text-lg font-semibold mt-6">Children</h2>
        <p>
          HideScore is not directed at children under 13 and does not knowingly collect any information from anyone of any age.
        </p>

        <h2 className="text-lg font-semibold mt-6">Third-party content</h2>
        <p>
          HideScore links to and embeds publicly available content from third-party sports providers and broadcasters. HideScore is not affiliated with, endorsed by, or sponsored by ESPN, MLB, NBA, NHL, NFL, the NCAA, FIFA, or any team, league, or broadcaster. All trademarks and logos belong to their respective owners.
        </p>

        <h2 className="text-lg font-semibold mt-6">Changes</h2>
        <p>
          If this policy changes in the future, the updated version will be posted at this URL with a new &ldquo;Last updated&rdquo; date.
        </p>

        <h2 className="text-lg font-semibold mt-6">Contact</h2>
        <p>
          Questions: <a href="mailto:hi@hidescore.com" className="underline underline-offset-2">hi@hidescore.com</a>
        </p>

        <h2 className="text-lg font-semibold mt-6">Credits</h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          The HideScore monkey icon is derived from <a href="https://github.com/twitter/twemoji" className="underline underline-offset-2" target="_blank" rel="noreferrer">Twemoji</a>, copyright Twitter, Inc. and other contributors, licensed under CC-BY 4.0.
        </p>
      </section>

      <div className="mt-10">
        <Link href="/" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>← Back to HideScore</Link>
      </div>
    </main>
  );
}
