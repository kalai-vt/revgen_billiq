import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as authApi from '@/features/auth/api';
import type { PhoneType } from '@/features/auth/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { PhoneNumberField } from '@/features/auth/components/PhoneNumberField';
import { TeamMemberFormDialog } from '@/features/auth/components/TeamMemberFormDialog';
import { TeamMemberTable } from '@/features/auth/components/TeamMemberTable';
import { stripCountryCode, withCountryCode } from '@/features/auth/lib/phone';
import { hasFeature } from '@/features/plans/lib/planConfig';
import { PlanUsageCard } from '@/features/plans/components/PlanUsageCard';
import { AvatarUploadControl } from '@/features/settings/components/AvatarUploadControl';
import { BillingSettingsForm } from '@/features/settings/components/BillingSettingsForm';
import { BusinessPreferencesForm } from '@/features/settings/components/BusinessPreferencesForm';
import { ChangePasswordForm } from '@/features/settings/components/ChangePasswordForm';
import { InvoiceSettingsForm } from '@/features/settings/components/InvoiceSettingsForm';
import { LoginHistoryTable } from '@/features/settings/components/LoginHistoryTable';
import { ProductConfigurationForm } from '@/features/settings/components/ProductConfigurationForm';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api-client';

interface NavSection {
  id: string;
  label: string;
  visible: boolean;
}

export function SettingsPage() {
  const { user, tenant, plan, setTenant, setUser } = useAuth();
  const isOwner = user?.role === 'owner';
  const isManager = user?.role === 'manager';
  const canManageUsers = hasFeature(plan, 'user_management');

  const [form, setForm] = useState({
    company_name: tenant?.company_name ?? '',
    phoneNumber: stripCountryCode(tenant?.phone ?? ''),
    phoneType: (tenant?.phone_type ?? 'mobile') as PhoneType,
    timezone: tenant?.timezone ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      authApi.updateTenant({
        company_name: form.company_name,
        phone: withCountryCode(form.phoneNumber),
        phone_type: form.phoneType,
        timezone: form.timezone,
      }),
    onSuccess: (updated) => {
      setTenant(updated);
      toast.success('Company information updated');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    mobile: user?.mobile ?? '',
  });
  const [profileError, setProfileError] = useState<string | null>(null);

  const profileMutation = useMutation({
    mutationFn: () =>
      authApi.updateProfile({
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        mobile: profileForm.mobile || null,
      }),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success('Profile updated');
    },
    onError: (err) => setProfileError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    profileMutation.mutate();
  }

  const sections: NavSection[] = [
    { id: 'profile', label: 'Profile', visible: true },
    { id: 'company', label: 'Company Information', visible: true },
    { id: 'plan', label: 'Plan & Usage', visible: isOwner },
    { id: 'billing', label: 'Billing Settings', visible: isOwner },
    { id: 'product-config', label: 'Product Configuration', visible: isOwner },
    { id: 'invoice-settings', label: 'Invoice Settings', visible: isOwner },
    { id: 'business-preferences', label: 'Business Preferences', visible: isOwner },
    { id: 'team', label: 'Team', visible: isOwner || isManager },
  ].filter((s) => s.visible);

  return (
    <div className="flex h-full min-h-0 gap-8">
      <aside className="hidden w-52 shrink-0 md:block">
        <div className="sticky top-0 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Profile, company, billing, and team.</p>
          </div>
          <nav className="flex flex-col gap-0.5 text-sm">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {section.label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth">
        <div className="max-w-4xl space-y-8 pb-10">
          <div className="md:hidden">
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Profile, company, billing, and team.</p>
          </div>

          <Card id="profile" className={cn('scroll-mt-4')}>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your personal details, photo, and account security.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <AvatarUploadControl />

              <form onSubmit={handleProfileSubmit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="first_name">First name</Label>
                  <Input
                    id="first_name"
                    required
                    value={profileForm.first_name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, first_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last_name">Last name</Label>
                  <Input
                    id="last_name"
                    required
                    value={profileForm.last_name}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mobile">Mobile</Label>
                  <Input
                    id="mobile"
                    value={profileForm.mobile}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, mobile: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input id="profile-email" disabled value={user?.email ?? ''} />
                </div>
                {profileError && <p className="text-sm text-destructive sm:col-span-2">{profileError}</p>}
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={profileMutation.isPending}>
                    {profileMutation.isPending ? 'Saving…' : 'Save profile'}
                  </Button>
                </div>
              </form>

              <div className="border-t pt-6">
                <h3 className="mb-4 text-sm font-medium">Change password</h3>
                <ChangePasswordForm />
              </div>

              <div className="border-t pt-6">
                <h3 className="mb-4 text-sm font-medium">Login history</h3>
                <LoginHistoryTable />
              </div>
            </CardContent>
          </Card>

          <Card id="company" className="scroll-mt-4">
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>{isOwner ? 'Only owners can edit these settings.' : 'View-only for your role.'}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="company_name">Company name</Label>
                  <Input
                    id="company_name"
                    disabled={!isOwner}
                    value={form.company_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    disabled={!isOwner}
                    value={form.timezone}
                    onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <PhoneNumberField
                    id="phone"
                    disabled={!isOwner}
                    number={form.phoneNumber}
                    onNumberChange={(value) => setForm((prev) => ({ ...prev, phoneNumber: value }))}
                    phoneType={form.phoneType}
                    onPhoneTypeChange={(value) => setForm((prev) => ({ ...prev, phoneType: value }))}
                  />
                </div>
                {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
                {isOwner && (
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={mutation.isPending}>
                      {mutation.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {isOwner && (
            <Card id="plan" className="scroll-mt-4">
              <CardHeader>
                <CardTitle>Plan &amp; Usage</CardTitle>
                <CardDescription>Your current plan, limits, and usage.</CardDescription>
              </CardHeader>
              <CardContent>
                <PlanUsageCard />
              </CardContent>
            </Card>
          )}

          {isOwner && (
            <Card id="billing" className="scroll-mt-4">
              <CardHeader>
                <CardTitle>Billing Settings</CardTitle>
                <CardDescription>GST, invoice numbering, currency, branding, and theme.</CardDescription>
              </CardHeader>
              <CardContent>
                <BillingSettingsForm />
              </CardContent>
            </Card>
          )}

          {isOwner && (
            <Card id="product-config" className="scroll-mt-4">
              <CardHeader>
                <CardTitle>Product Configuration</CardTitle>
                <CardDescription>How products are identified and searched across your business.</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductConfigurationForm />
              </CardContent>
            </Card>
          )}

          {isOwner && (
            <Card id="invoice-settings" className="scroll-mt-4">
              <CardHeader>
                <CardTitle>Invoice Settings</CardTitle>
                <CardDescription>Starting number, decimal precision, date format, and receipt footer.</CardDescription>
              </CardHeader>
              <CardContent>
                <InvoiceSettingsForm />
              </CardContent>
            </Card>
          )}

          {isOwner && (
            <Card id="business-preferences" className="scroll-mt-4">
              <CardHeader>
                <CardTitle>Business Preferences</CardTitle>
                <CardDescription>Control how billing behaves for your team.</CardDescription>
              </CardHeader>
              <CardContent>
                <BusinessPreferencesForm />
              </CardContent>
            </Card>
          )}

          {(isOwner || isManager) && (
            <Card id="team" className="scroll-mt-4">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Team</CardTitle>
                  <CardDescription>
                    {canManageUsers
                      ? 'Manage who has access to this organization.'
                      : 'Upgrade to Explore plan and above to add team members.'}
                  </CardDescription>
                </div>
                {isOwner && canManageUsers && <TeamMemberFormDialog />}
              </CardHeader>
              <CardContent>
                <TeamMemberTable />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
