import { Suspense } from 'react';
import LoginForm from './LoginForm';

// Disable static prerendering - this page uses auth cookies + search params
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
