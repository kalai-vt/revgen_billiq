import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useController, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import { PhoneNumberField } from '@/features/auth/components/PhoneNumberField';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { withCountryCode } from '@/features/auth/lib/phone';
import { ApiError } from '@/lib/api-client';

// Mirrors backend/app/core/password_policy.py::validate_password_strength — keep these two in
// sync so the client never accepts a password the server would reject (or vice versa).
const registerSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required'),
  last_name: z.string().trim().min(1, 'Last name is required'),
  company_name: z.string().trim().min(2, 'Company name must be at least 2 characters'),
  legal_name: z.string().trim().min(2, 'Legal name must be at least 2 characters'),
  phoneNumber: z
    .string()
    .min(1, 'Phone number is required')
    .regex(/^\d{10,12}$/, 'Enter a valid phone number'),
  phoneType: z.enum(['mobile', 'landline']),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters long')
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/\d/, 'Password must include at least one number')
    .regex(/[^\w\s]/, 'Password must include at least one special character'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const { register: registerTenant } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      company_name: '',
      legal_name: '',
      phoneNumber: '',
      phoneType: 'mobile',
      email: '',
      password: '',
    },
  });

  const { field: phoneNumberField, fieldState: phoneNumberState } = useController({
    control,
    name: 'phoneNumber',
  });
  const { field: phoneTypeField } = useController({ control, name: 'phoneType' });

  async function onSubmit(values: RegisterFormValues) {
    setError(null);
    setLoading(true);
    try {
      const result = await registerTenant({
        company_name: values.company_name,
        legal_name: values.legal_name,
        email: values.email,
        phone: withCountryCode(values.phoneNumber),
        phone_type: values.phoneType,
        password: values.password,
        first_name: values.first_name,
        last_name: values.last_name,
      });
      navigate('/check-email', { state: { email: result.user.email } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" {...register('first_name')} />
          {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" {...register('last_name')} />
          {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="company_name">Company name</Label>
        <Input id="company_name" {...register('company_name')} />
        {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="legal_name">Legal name</Label>
        <Input id="legal_name" {...register('legal_name')} />
        {errors.legal_name && <p className="text-xs text-destructive">{errors.legal_name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <PhoneNumberField
          id="phone"
          number={phoneNumberField.value}
          onNumberChange={phoneNumberField.onChange}
          phoneType={phoneTypeField.value}
          onPhoneTypeChange={phoneTypeField.onChange}
        />
        {phoneNumberState.error && <p className="text-xs text-destructive">{phoneNumberState.error.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-email">Email</Label>
        <Input id="reg-email" type="email" {...register('email')} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-password">Password</Label>
        <PasswordInput id="reg-password" {...register('password')} />
        <p className="text-xs text-muted-foreground">
          At least 10 characters, with uppercase, lowercase, a number, and a special character.
        </p>
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        By creating an account, you agree to our{' '}
        <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Starting your trial…' : 'Start Free Trial'}
      </Button>
    </form>
  );
}
