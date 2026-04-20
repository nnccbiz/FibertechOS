/**
 * Next.js middleware: protects all routes behind authentication.
 * Runs on every request. Unauthenticated users are redirected to /login.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Routes that anonymous users are allowed to visit
const PUBLIC_ROUTES = [
  '/login',
  '/request-access',
  '/auth/callback',
  '/set-password',
  '/forgot-password',
];

// API routes that must remain accessible without a session (self-service flows)
const PUBLIC_API_ROUTES = [
  '/api/access-requests', // POST from request-access page
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets and Next internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // Allow public routes
  if (
    PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/')) ||
    PUBLIC_API_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))
  ) {
    return NextResponse.next();
  }

  // Use Supabase to check if the user has a valid session
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Force password change on first login (temp passwords set must_change_password=true)
  const mustChangePassword = user.user_metadata?.must_change_password === true;
  if (mustChangePassword && pathname !== '/set-password') {
    return NextResponse.redirect(new URL('/set-password', req.url));
  }

  // User has a session. Allow. RLS policies enforce what they can read/write.
  return response;
}

export const config = {
  matcher: [
    // Protect all routes EXCEPT static files and _next
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
