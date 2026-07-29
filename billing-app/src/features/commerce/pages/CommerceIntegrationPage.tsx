import { IntegrationConfigCard } from '@/features/commerce/components/IntegrationConfigCard';
import type { CommercePlatform } from '@/features/commerce/api';

const PLATFORM_LABELS: Record<CommercePlatform, string> = { swiggy: 'Swiggy', zomato: 'Zomato' };

interface CommerceIntegrationPageProps {
  platform: CommercePlatform;
}

export function CommerceIntegrationPage({ platform }: CommerceIntegrationPageProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{PLATFORM_LABELS[platform]}</h1>
        <p className="text-sm text-muted-foreground">Store configuration, order sync, and billing for {PLATFORM_LABELS[platform]}.</p>
      </div>
      <IntegrationConfigCard platform={platform} />
    </div>
  );
}
