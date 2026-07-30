import { PageMeta } from '@/components/PageMeta';
import { LegalPageShell, LegalSection } from '@/features/legal/components/LegalPageShell';

const LAST_UPDATED = 'July 30, 2026';

export function PrivacyPolicyPage() {
  return (
    <>
      <PageMeta
        title="Privacy Policy — RevGen BillIQ"
        description="How RevGen BillIQ collects, uses, and protects your data across our multi-tenant billing and POS platform."
      />
      <LegalPageShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection heading="1. Introduction">
        <p>
          RevGen BillIQ ("RevGen BillIQ", "we", "us", or "our") provides a multi-tenant software-as-a-service
          platform for billing, point-of-sale, and inventory management for retail businesses ("Service"). This
          Privacy Policy explains what information we collect when you or your business ("Customer", "tenant",
          "you") use the Service, how we use and protect that information, and the choices available to you.
        </p>
        <p>
          By creating an account or otherwise using the Service, you agree to the collection and use of
          information in accordance with this policy. If you do not agree, please do not use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="2. Information We Collect">
        <p>We collect the following categories of information:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-foreground">Account information.</span> When you register, we collect
            your name, business/company name, legal name, email address, phone number, and password (stored only as
            a salted hash, never in plain text).
          </li>
          <li>
            <span className="font-medium text-foreground">Business data you enter.</span> As part of using the
            Service, your business (tenant) may enter or upload data such as product catalogs, inventory levels,
            customer records, vendor records, invoices, sales transactions, payment and outstanding-balance records,
            and related business documents. This data belongs to you and is described further in our Terms of
            Service.
          </li>
          <li>
            <span className="font-medium text-foreground">Usage and analytics data.</span> We collect information
            about how you interact with the Service, including pages visited, features used, timestamps, device and
            browser type, IP address, and error/diagnostic logs, in order to operate, secure, and improve the
            Service.
          </li>
          <li>
            <span className="font-medium text-foreground">Support communications.</span> If you contact our support
            team, we retain the content of that communication and any information you provide to help resolve your
            request.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. How We Use Information">
        <p>We use the information described above to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Provide, operate, maintain, and secure the Service;</li>
          <li>Process transactions and manage your subscription and billing;</li>
          <li>Authenticate users and prevent fraud, abuse, and unauthorized access;</li>
          <li>Respond to support requests and communicate with you about the Service;</li>
          <li>Monitor, analyze, and improve performance, reliability, and usability;</li>
          <li>Comply with applicable legal, tax, and regulatory obligations.</li>
        </ul>
        <p>
          We do not sell your personal information or your business data to third parties, and we do not use your
          tenant business data (products, customers, invoices, etc.) to train third-party models or for advertising
          purposes.
        </p>
      </LegalSection>

      <LegalSection heading="4. Data Storage and Security">
        <p>
          Your data is stored on cloud infrastructure with logical separation between tenants. We apply industry
          standard technical and organizational safeguards to protect your information, including encryption of
          data in transit (HTTPS/TLS) and encryption at rest for sensitive fields such as authentication
          credentials and other confidential data. Access to production data is restricted to authorized personnel
          on a need-to-know basis.
        </p>
        <p>
          No method of transmission or storage is 100% secure, and we cannot guarantee absolute security. If we
          become aware of a security incident affecting your data, we will notify you in accordance with
          applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="5. Third-Party Service Providers">
        <p>
          We rely on trusted third-party service providers to help us deliver the Service, including providers of:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Cloud hosting and database infrastructure;</li>
          <li>Payment processing for subscription billing;</li>
          <li>Transactional email delivery (e.g., account verification, receipts, notifications);</li>
          <li>Error monitoring and infrastructure logging.</li>
        </ul>
        <p>
          These providers process information only as necessary to perform their services on our behalf and are
          bound by contractual obligations to protect your information. We do not name specific vendors in this
          policy; a current list is available on request.
        </p>
      </LegalSection>

      <LegalSection heading="6. Cookies and Local Storage">
        <p>
          The Service uses browser local storage for essential functionality such as keeping you signed in and
          remembering your display preferences. See our{' '}
          <a href="/cookies" className="text-primary underline underline-offset-2">
            Cookie Policy
          </a>{' '}
          for full details on what is stored and why.
        </p>
      </LegalSection>

      <LegalSection heading="7. Data Retention">
        <p>
          We retain account information and tenant business data for as long as your account is active and as
          needed to provide the Service. Following account closure, we may retain data for a reasonable period to
          comply with legal, tax, or regulatory obligations, resolve disputes, and enforce our agreements, after
          which it is deleted or anonymized in accordance with our internal retention schedule.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your Rights">
        <p>
          Depending on your location and applicable law, you may have rights to access, correct, export, or request
          deletion of your personal information. The Service does not currently provide a fully automated
          self-service export or deletion flow. To exercise any of these rights, please contact our support team at
          the email address below and we will assist you.
        </p>
      </LegalSection>

      <LegalSection heading="9. Children's Privacy">
        <p>
          The Service is intended for business use by adults and is not directed at children. We do not knowingly
          collect personal information from individuals under the age of 18. If you believe a child has provided us
          with personal information, please contact us and we will take appropriate steps to remove it.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time to reflect changes in our practices or for legal,
          operational, or regulatory reasons. We will update the "Last updated" date above when we do, and for
          material changes we will make reasonable efforts to notify you, such as by email or an in-app notice.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact Us">
        <p>
          If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us
          at{' '}
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
