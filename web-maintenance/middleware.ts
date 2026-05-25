import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Maintenance-mode gate.
 *
 * Enable: set NEXT_PUBLIC_MAINTENANCE_MODE=true in your env / EAS / Vercel dashboard.
 * Bypass: visit /?bypass=<MAINTENANCE_BYPASS_TOKEN> once — sets a cookie good for 24 h.
 *
 * The bypass lets you preview the live site while maintenance is active.
 */

const MAINTENANCE = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';
const BYPASS_TOKEN = process.env.MAINTENANCE_BYPASS_TOKEN ?? '';
const COOKIE_NAME = 'jag_maintenance_bypass';
const COOKIE_TTL = 60 * 60 * 24; // 24 hours in seconds

// Paths that are always reachable even during maintenance
const ALLOWED = [
  '/maintenance',
  '/api/waitlist',       // so email signups still work
  '/_next',
  '/favicon.ico',
  '/logo',
  '/menu.pdf',
];

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Always allow explicitly permitted paths
  if (ALLOWED.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check bypass token in query string (one-time visit to activate cookie)
  const queryToken = searchParams.get('bypass');
  if (BYPASS_TOKEN && queryToken === BYPASS_TOKEN) {
    const url = request.nextUrl.clone();
    url.searchParams.delete('bypass');
    const response = NextResponse.redirect(url);
    response.cookies.set(COOKIE_NAME, 'true', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: COOKIE_TTL,
      path: '/',
    });
    return response;
  }

  // Honour active bypass cookie
  const bypassCookie = request.cookies.get(COOKIE_NAME)?.value;
  if (bypassCookie === 'true') {
    return NextResponse.next();
  }

  // Redirect everything else to the maintenance page
  if (MAINTENANCE) {
    const url = request.nextUrl.clone();
    url.pathname = '/maintenance';
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and Next.js internals.
     * Tweak the negative lookahead if you have other static directories.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf|woff2?)).*)',
  ],
};
