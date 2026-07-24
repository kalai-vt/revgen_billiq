import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { hasFeature } from '@/features/plans/lib/planConfig';

export function WhatsAppShareButton() {
  const { plan } = useAuth();
  const enabled = hasFeature(plan, 'whatsapp_invoice');

  if (!enabled) {
    return (
      <Button type="button" variant="outline" disabled title="Available on Explore plan and above">
        <MessageCircle className="size-4" />
        Share on WhatsApp
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800"
      onClick={() => toast.info('WhatsApp sharing is coming soon.')}
    >
      <MessageCircle className="size-4" />
      Share on WhatsApp
    </Button>
  );
}
