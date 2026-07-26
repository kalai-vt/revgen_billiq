import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import * as settingsApi from '@/features/settings/api';
import { FieldToggle } from '@/features/invoice-designer/components/FieldToggle';
import type { PanelProps } from '@/features/invoice-designer/components/panels/types';
import { ApiError } from '@/lib/api-client';

const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'twitter', 'youtube'] as const;

export function BrandingPanel({ config, onChange }: PanelProps) {
  const branding = config.branding;
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });

  const [profile, setProfile] = useState({
    tagline: '', address_line1: '', address_line2: '', city: '', state: '', pincode: '',
    website: '', pan_number: '', fssai_number: '', drug_license_number: '', msme_udyam_number: '',
    feedback_url: '', social_links: {} as Record<string, string>,
  });

  useEffect(() => {
    if (!settings) return;
    setProfile({
      tagline: settings.tagline ?? '',
      address_line1: settings.address_line1 ?? '',
      address_line2: settings.address_line2 ?? '',
      city: settings.city ?? '',
      state: settings.state ?? '',
      pincode: settings.pincode ?? '',
      website: settings.website ?? '',
      pan_number: settings.pan_number ?? '',
      fssai_number: settings.fssai_number ?? '',
      drug_license_number: settings.drug_license_number ?? '',
      msme_udyam_number: settings.msme_udyam_number ?? '',
      feedback_url: settings.feedback_url ?? '',
      social_links: settings.social_links ?? {},
    });
  }, [settings]);

  const mutation = useMutation({
    mutationFn: () =>
      settingsApi.updateSettings({
        tagline: profile.tagline || null,
        address_line1: profile.address_line1 || null,
        address_line2: profile.address_line2 || null,
        city: profile.city || null,
        state: profile.state || null,
        pincode: profile.pincode || null,
        website: profile.website || null,
        pan_number: profile.pan_number || null,
        fssai_number: profile.fssai_number || null,
        drug_license_number: profile.drug_license_number || null,
        msme_udyam_number: profile.msme_udyam_number || null,
        feedback_url: profile.feedback_url || null,
        social_links: Object.keys(profile.social_links).length ? profile.social_links : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Business profile updated');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to update business profile'),
  });

  function field<K extends keyof typeof profile>(key: K, value: (typeof profile)[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function toggle<K extends keyof typeof branding>(key: K, value: boolean) {
    onChange((cfg) => ({ ...cfg, branding: { ...cfg.branding, [key]: value } }));
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Business profile</h3>
          <p className="text-xs text-muted-foreground">
            Shared across every template. Logo, business name, GSTIN, and phone are edited in Billing Settings.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tagline</Label>
            <Input value={profile.tagline} onChange={(e) => field('tagline', e.target.value)} placeholder="Retail Store" />
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input value={profile.website} onChange={(e) => field('website', e.target.value)} placeholder="www.example.com" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address line 1</Label>
            <Input value={profile.address_line1} onChange={(e) => field('address_line1', e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address line 2</Label>
            <Input value={profile.address_line2} onChange={(e) => field('address_line2', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={profile.city} onChange={(e) => field('city', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input value={profile.state} onChange={(e) => field('state', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Pincode</Label>
            <Input value={profile.pincode} onChange={(e) => field('pincode', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>PAN Number</Label>
            <Input value={profile.pan_number} onChange={(e) => field('pan_number', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>FSSAI License</Label>
            <Input value={profile.fssai_number} onChange={(e) => field('fssai_number', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Drug License</Label>
            <Input value={profile.drug_license_number} onChange={(e) => field('drug_license_number', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>MSME/Udyam Number</Label>
            <Input value={profile.msme_udyam_number} onChange={(e) => field('msme_udyam_number', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Feedback link</Label>
            <Input value={profile.feedback_url} onChange={(e) => field('feedback_url', e.target.value)} placeholder="For the feedback QR" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((platform) => (
            <div key={platform} className="space-y-1.5">
              <Label className="capitalize">{platform}</Label>
              <Input
                value={profile.social_links[platform] ?? ''}
                onChange={(e) =>
                  setProfile((prev) => ({ ...prev, social_links: { ...prev.social_links, [platform]: e.target.value } }))
                }
                placeholder={`https://${platform}.com/yourbusiness`}
              />
            </div>
          ))}
        </div>

        <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save business profile'}
        </Button>
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Show on this template</h3>
          <p className="text-xs text-muted-foreground">Toggle which branding fields appear on this document type.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <FieldToggle id="b-logo" label="Logo" checked={branding.show_logo} onChange={(v) => toggle('show_logo', v)} />
          <FieldToggle id="b-name" label="Business name" checked={branding.show_business_name} onChange={(v) => toggle('show_business_name', v)} />
          <FieldToggle id="b-tagline" label="Tagline" checked={branding.show_tagline} onChange={(v) => toggle('show_tagline', v)} />
          <FieldToggle id="b-address" label="Address" checked={branding.show_address} onChange={(v) => toggle('show_address', v)} />
          <FieldToggle id="b-phone" label="Phone number" checked={branding.show_phone} onChange={(v) => toggle('show_phone', v)} />
          <FieldToggle id="b-email" label="Email" checked={branding.show_email} onChange={(v) => toggle('show_email', v)} />
          <FieldToggle id="b-website" label="Website" checked={branding.show_website} onChange={(v) => toggle('show_website', v)} />
          <FieldToggle id="b-gstin" label="GSTIN" checked={branding.show_gstin} onChange={(v) => toggle('show_gstin', v)} />
          <FieldToggle id="b-pan" label="PAN Number" checked={branding.show_pan} onChange={(v) => toggle('show_pan', v)} />
          <FieldToggle id="b-fssai" label="FSSAI License" checked={branding.show_fssai} onChange={(v) => toggle('show_fssai', v)} />
          <FieldToggle id="b-drug" label="Drug License" checked={branding.show_drug_license} onChange={(v) => toggle('show_drug_license', v)} />
          <FieldToggle id="b-msme" label="MSME/Udyam Number" checked={branding.show_msme_udyam} onChange={(v) => toggle('show_msme_udyam', v)} />
        </div>

        <FieldToggle
          id="b-social"
          label="Social media links"
          checked={branding.show_social_links}
          onChange={(v) => toggle('show_social_links', v)}
        />
        {branding.show_social_links && (
          <div className="ml-6 flex flex-wrap gap-2">
            {SOCIAL_PLATFORMS.map((platform) => {
              const checked = branding.social_links_to_show.includes(platform);
              return (
                <FieldToggle
                  key={platform}
                  id={`b-social-${platform}`}
                  label={platform}
                  checked={checked}
                  onChange={(value) =>
                    onChange((cfg) => ({
                      ...cfg,
                      branding: {
                        ...cfg.branding,
                        social_links_to_show: value
                          ? [...cfg.branding.social_links_to_show, platform]
                          : cfg.branding.social_links_to_show.filter((p) => p !== platform),
                      },
                    }))
                  }
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
