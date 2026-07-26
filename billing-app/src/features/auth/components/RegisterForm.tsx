import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { PhoneNumberField } from '@/features/auth/components/PhoneNumberField';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { withCountryCode } from '@/features/auth/lib/phone';
import type { PhoneType } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';

export function RegisterForm() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    company_name: '',
    legal_name: '',
    email: '',
    phoneNumber: '',
    phoneType: 'mobile' as PhoneType,
    password: '',
    first_name: '',
    last_name: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: 'company_name' | 'legal_name' | 'email' | 'password' | 'first_name' | 'last_name') {
    return (event: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await register({
        company_name: form.company_name,
        legal_name: form.legal_name,
        email: form.email,
        phone: withCountryCode(form.phoneNumber),
        phone_type: form.phoneType,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
      });
      navigate('/check-email', { state: { email: result.user.email } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" required value={form.first_name} onChange={update('first_name')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" required value={form.last_name} onChange={update('last_name')} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="company_name">Company name</Label>
        <Input id="company_name" required minLength={2} value={form.company_name} onChange={update('company_name')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="legal_name">Legal name</Label>
        <Input id="legal_name" required minLength={2} value={form.legal_name} onChange={update('legal_name')} />
      </div>
      <PhoneNumberField
        id="phone"
        required
        number={form.phoneNumber}
        onNumberChange={(value) => setForm((prev) => ({ ...prev, phoneNumber: value }))}
        phoneType={form.phoneType}
        onPhoneTypeChange={(value) => setForm((prev) => ({ ...prev, phoneType: value }))}
      />
      <div className="space-y-1.5">
        <Label htmlFor="reg-email">Email</Label>
        <Input id="reg-email" type="email" required value={form.email} onChange={update('email')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-password">Password</Label>
        <PasswordInput id="reg-password" required minLength={10} value={form.password} onChange={update('password')} />
        <p className="text-xs text-muted-foreground">
          At least 10 characters, with uppercase, lowercase, a number, and a special character.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Starting your trial…' : 'Start Free Trial'}
      </Button>
    </form>
  );
}
