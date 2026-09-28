'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required')
});

const signupSchema = loginSchema.extend({
  name: z.string().min(2, 'Name is required'),
  organizationName: z.string().min(2, 'Organization name is required'),
  organizationSlug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only')
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginValues & Partial<SignupValues>>({
    resolver: zodResolver(mode === 'login' ? loginSchema : signupSchema) as never,
    defaultValues: { email: '', password: '' }
  });

  async function onSubmit(values: LoginValues & Partial<SignupValues>) {
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? 'Something went wrong');
        return;
      }

      toast.success(mode === 'login' ? 'Welcome back' : 'Workspace created');
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error — please try again');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">
          {mode === 'login' ? 'Sign in' : 'Create your workspace'}
        </h1>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {mode === 'signup' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" {...form.register('name')} placeholder="Ada Admin" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="organizationName">Organization</Label>
              <Input id="organizationName" {...form.register('organizationName')} placeholder="Acme AI Labs" />
              {form.formState.errors.organizationName && (
                <p className="text-xs text-destructive">{form.formState.errors.organizationName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="organizationSlug">Workspace URL</Label>
              <Input id="organizationSlug" {...form.register('organizationSlug')} placeholder="acme-ai" />
              {form.formState.errors.organizationSlug && (
                <p className="text-xs text-destructive">{form.formState.errors.organizationSlug.message}</p>
              )}
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...form.register('email')} placeholder="you@company.com" />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...form.register('password')} placeholder="••••••••" />
          {form.formState.errors.password && (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? 'Please wait…'
            : mode === 'login'
              ? 'Sign in'
              : 'Create workspace'}
        </Button>
      </form>
    </div>
  );
}

