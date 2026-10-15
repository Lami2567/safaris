import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // If request is made to the careers domain (careers.mumwesafarisuganda.com)
  if (host.includes('careers.mumwesafarisuganda.com')) {
    // Exclude static assets, API calls, and Next.js internal chunks
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname.startsWith('/static') ||
      pathname.includes('.')
    ) {
      return NextResponse.next();
    }

    // Rewrite root path '/' or '/apply' to '/careers'
    if (pathname === '/' || pathname === '/apply' || pathname === '/status') {
      const url = request.nextUrl.clone();
      url.pathname = '/careers';
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
