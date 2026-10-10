// hi@hidescore.com as a mailto link that Cloudflare's Email Obfuscation leaves
// alone (2026-09-25). CF rewrites every mailto anchor in served HTML to
// /cdn-cgi/l/email-protection#…, which scanners and AI crawlers cannot read. It
// skips anything between <!--email_off--> and <!--/email_off-->, and JSX drops
// comments from the HTML, so the anchor is written as raw markup.
// `pill` (2026-10-09) draws it as the same blue pill as DocTopBar's "Open
// HideScore" button: as a plain underlined link it was easy to miss on /contact.
const PLAIN = 'class="underline underline-offset-2"';
const PILL =
  'class="inline-block rounded-lg px-3.5 py-1.5 text-sm font-semibold no-underline" style="background: var(--accent); color: #fff"';

export default function EmailLink({ pill = false }: { pill?: boolean }) {
  return (
    <span
      dangerouslySetInnerHTML={{
        __html: `<!--email_off--><a href="mailto:hi@hidescore.com" ${pill ? PILL : PLAIN}>hi@hidescore.com</a><!--/email_off-->`,
      }}
    />
  );
}
