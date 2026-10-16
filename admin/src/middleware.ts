import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase();
  const pathname = request.nextUrl.pathname;
  const isCareersDomain = host.includes('careers.mumwesafarisuganda.com') || host.startsWith('careers.');

  // If request is made to the careers domain (careers.mumwesafarisuganda.com)
  if (isCareersDomain) {
    // Exclude static assets, API calls, and Next.js internal chunks
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/static') ||
      pathname.includes('.')
    ) {
      return NextResponse.next();
    }

    // Careers panel is ONLY for applications & recruitment
    // Rewrite all root and portal requests directly to /careers
    if (pathname === '/' || pathname === '/apply' || pathname === '/status' || pathname === '/portal') {
      const url = request.nextUrl.clone();
      url.pathname = '/careers';
      const response = NextResponse.rewrite(url);
      response.headers.set('x-is-careers', '1');
      return response;
    }

    // Block any admin pages on the careers domain by redirecting to /
    if (
      pathname.startsWith('/operations') ||
      pathname.startsWith('/pricing') ||
      pathname.startsWith('/settings') ||
      pathname.startsWith('/tourism') ||
      pathname.startsWith('/banners') ||
      pathname.startsWith('/services-config')
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
