import { PageMeta } from '@/components/PageMeta';
import { LegalPageShell, LegalSection } from '@/features/legal/components/LegalPageShell';

const LAST_UPDATED = 'July 30, 2026';

export function CookiePolicyPage() {
  return (
    <>
      <PageMeta
        title="Cookie Policy — RevGen BillIQ"
        description="How RevGen BillIQ uses cookies and similar technologies across our billing, POS, and inventory platform."
      />
      <LegalPageShell title="Cookie Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection heading="1. Overview">
        <p>
          This Cookie Policy explains how RevGen BillIQ ("we", "us", "our") uses browser storage technologies on the
          RevGen BillIQ web application ("Service"). We aim to be transparent about what is actually stored on your
          device — not a generic list of technologies we don't use.
        </p>
      </LegalSection>

      <LegalSection heading="2. What We Actually Use">
        <p>
          The Service does not use third-party advertising or tracking cookies. It uses the browser's{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">localStorage</code> to store a small number of
          essential, first-party values required for the app to function:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-foreground">Authentication tokens</span> — an access token and a
            refresh token (stored under the keys <code className="rounded bg-muted px-1 py-0.5 text-xs">revgeniq_access_token</code>{' '}
            and <code className="rounded bg-muted px-1 py-0.5 text-xs">revgeniq_refresh_token</code>) that keep you
            signed in between visits and let the app securely call our backend on your behalf.
          </li>
          <li>
            <span className="font-medium text-foreground">Theme preference</span> — a value that remembers whether
            you prefer light or dark mode, so the interface renders consistently on your next visit.
          </li>
        </ul>
        <p>
          These values are stored only in your browser, are never sold or shared with advertisers, and are not used
          to track you across other websites.
        </p>
      </LegalSection>

      <LegalSection heading="3. Why These Are Classified as Essential">
        <p>
          Both categories of storage above are strictly necessary for the Service to work: without the
          authentication tokens you would be unable to stay signed in, and without the theme preference the app
          simply falls back to a default appearance. Neither is used for analytics, advertising, or cross-site
          tracking.
        </p>
      </LegalSection>

      <LegalSection heading="4. No Cookie Consent Banner">
        <p>
          Because the Service today only uses strictly essential local storage — and no analytics, marketing, or
          third-party tracking cookies — a cookie-consent banner is not currently required under most cookie-consent
          frameworks, which generally exempt storage that is essential to the requested service. If we introduce
          analytics or marketing technologies in the future that require consent, we will update this policy and
          add an appropriate consent mechanism at that time.
        </p>
      </LegalSection>

      <LegalSection heading="5. Managing Local Storage">
        <p>
          You can clear locally stored data at any time through your browser's settings (typically under
          "Privacy" or "Site data"). Doing so will sign you out of the Service and reset your theme preference to
          the default.
        </p>
      </LegalSection>

      <LegalSection heading="6. Changes to This Policy">
        <p>
          We may update this Cookie Policy if the storage technologies we use change. We will update the "Last
          updated" date above whenever we do.
        </p>
      </LegalSection>

      <LegalSection heading="7. Contact Us">
        <p>
          Questions about this Cookie Policy can be sent to{' '}
          <a href="mailto:privacy@revgenbilliq.com" className="text-primary underline underline-offset-2">
            privacy@revgenbilliq.com
          </a>{' '}
          (placeholder address — to be replaced with a verified support contact).
        </p>
      </LegalSection>
      </LegalPageShell>
    </>
  );
}
