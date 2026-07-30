import { PageMeta } from '@/components/PageMeta';
import { LegalPageShell, LegalSection } from '@/features/legal/components/LegalPageShell';

const LAST_UPDATED = 'July 30, 2026';

export function TermsOfServicePage() {
  return (
    <>
      <PageMeta
        title="Terms of Service — RevGen BillIQ"
        description="The terms and conditions governing use of RevGen BillIQ's billing, point-of-sale, and inventory platform."
      />
      <LegalPageShell title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <LegalSection heading="1. Acceptance of Terms">
        <p>
          These Terms of Service ("Terms") govern access to and use of the RevGen BillIQ billing, point-of-sale, and
          inventory management platform ("Service"), operated by RevGen BillIQ ("we", "us", "our"). By creating an
          account, accessing, or using the Service, you agree to be bound by these Terms and by our{' '}
          <a href="/privacy" className="text-primary underline underline-offset-2">
            Privacy Policy
          </a>
          . If you are entering into these Terms on behalf of a business, you represent that you have authority to
          bind that business.
        </p>
      </LegalSection>

      <LegalSection heading="2. Description of Service">
        <p>
          RevGen BillIQ is a multi-tenant SaaS platform that provides retail businesses with tools for billing,
          point-of-sale transactions, GST-aware invoicing, inventory and stock management, customer and vendor
          management, procurement, and related business analytics. We may add, modify, or remove features from time
          to time.
        </p>
      </LegalSection>

      <LegalSection heading="3. Account Registration and Eligibility">
        <p>
          To use the Service, you must register for an account and provide accurate, current, and complete
          information. You must be at least 18 years old and have the legal authority to enter into a binding
          agreement. You are responsible for maintaining the confidentiality of your login credentials and for all
          activity that occurs under your account. Notify us immediately of any unauthorized use of your account.
        </p>
      </LegalSection>

      <LegalSection heading="4. Subscription Plans and Billing">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            The Service is offered under paid subscription plans, billed in Indian Rupees (₹), as described on our
            pricing page. Plan pricing and feature limits are subject to change with reasonable prior notice.
          </li>
          <li>
            Unless cancelled before the end of the current billing cycle, subscriptions automatically renew for
            successive billing periods at the then-current rate.
          </li>
          <li>
            Fees are billed in advance and are non-refundable except where required by law or expressly stated
            otherwise.
          </li>
          <li>
            If a payment fails or your account falls into arrears, we may suspend or restrict access to the Service
            until payment is received. Continued non-payment may result in termination of your account and, subject
            to our data retention practices, deletion of associated data.
          </li>
          <li>
            You are responsible for any applicable taxes (including GST) associated with your subscription, except
            for taxes based on our net income.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Use the Service for any unlawful purpose or in violation of any applicable law or regulation;</li>
          <li>Attempt to gain unauthorized access to the Service, other tenants' data, or our infrastructure;</li>
          <li>Interfere with or disrupt the integrity or performance of the Service;</li>
          <li>Reverse engineer, decompile, or attempt to extract the source code of the Service, except as permitted by law;</li>
          <li>Upload malicious code or use the Service to store or transmit unlawful content;</li>
          <li>Resell, sublicense, or provide the Service to third parties outside your own organization without our written consent.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Tenant Data Ownership">
        <p>
          As between you and us, you (the tenant) retain all right, title, and interest in and to the business data
          you enter into the Service — including product catalogs, inventory records, customer and vendor records,
          invoices, and transaction data ("Tenant Data"). We do not claim ownership of Tenant Data. We are granted
          only a limited right to host, process, and display Tenant Data solely as necessary to provide the Service
          to you. Upon termination of your account, we will make reasonable efforts to make your Tenant Data
          available for export for a limited period, after which it may be deleted in accordance with our data
          retention practices.
        </p>
      </LegalSection>

      <LegalSection heading="7. Intellectual Property">
        <p>
          The Service, including its software, design, branding, and underlying technology, is owned by RevGen
          BillIQ and its licensors and is protected by intellectual property laws. Except for the limited right to
          use the Service as permitted under these Terms, no rights are granted to you in our intellectual
          property.
        </p>
      </LegalSection>

      <LegalSection heading="8. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, the Service is provided "as is" and "as available"
          without warranties of any kind, express or implied. We shall not be liable for any indirect, incidental,
          special, consequential, or punitive damages, or any loss of profits, revenue, data, or goodwill, arising
          out of or related to your use of the Service. Our total aggregate liability for any claim arising out of
          these Terms or the Service shall not exceed the amount you paid us for the Service in the twelve (12)
          months preceding the claim.
        </p>
      </LegalSection>

      <LegalSection heading="9. Termination">
        <p>
          You may cancel your subscription at any time through your account settings or by contacting support. We
          may suspend or terminate your access to the Service if you breach these Terms, fail to pay applicable
          fees, or if we reasonably believe your use of the Service poses a security or legal risk. Upon
          termination, your right to use the Service will immediately cease, subject to the data export and
          retention provisions described above.
        </p>
      </LegalSection>

      <LegalSection heading="10. Governing Law">
        <p>
          These Terms are governed by the laws of India, without regard to conflict of law principles, and any
          disputes shall be subject to the exclusive jurisdiction of the courts located in [State/City — to be
          finalized]. This section is a placeholder pending confirmation of our registered business jurisdiction.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to These Terms">
        <p>
          We may update these Terms from time to time. We will update the "Last updated" date above and, for
          material changes, provide reasonable notice such as by email or an in-app notice. Continued use of the
          Service after changes take effect constitutes acceptance of the revised Terms.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact Us">
        <p>
          Questions about these Terms can be sent to{' '}
          <a href="mailto:legal@revgenbilliq.com" className="text-primary underline underline-offset-2">
            legal@revgenbilliq.com
          </a>{' '}
          (placeholder address — to be replaced with a verified support contact).
        </p>
      </LegalSection>
      </LegalPageShell>
    </>
  );
}
