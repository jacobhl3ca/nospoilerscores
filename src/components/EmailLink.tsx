// hi@hidescore.com as a mailto link that Cloudflare's Email Obfuscation leaves
// alone (2026-09-25). CF rewrites every mailto anchor in served HTML to
// /cdn-cgi/l/email-protection#…, which scanners and AI crawlers cannot read. It
// skips anything between <!--email_off--> and <!--/email_off-->, and JSX drops
// comments from the HTML, so the anchor is written as raw markup.
export default function EmailLink() {
  return (
    <span
      dangerouslySetInnerHTML={{
        __html:
          '<!--email_off--><a href="mailto:hi@hidescore.com" class="underline underline-offset-2">hi@hidescore.com</a><!--/email_off-->',
      }}
    />
  );
}
