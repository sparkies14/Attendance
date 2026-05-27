import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PROTECTED_PATHS = ['/insights'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PATHS.some(p => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get('att_token')?.value;
  if (!token) return redirectToLogin(req);

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    // Forward user identity to server components via request headers.
    // Server components read these with: const h = await headers(); h.get('x-user-name')
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-id',    String(payload.user_id ?? ''));
    requestHeaders.set('x-user-email', String(payload.email ?? ''));
    requestHeaders.set('x-user-role',  String(payload.role ?? ''));
    requestHeaders.set('x-user-name',  String(payload.name ?? ''));

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return redirectToLogin(req);
  }
}

function redirectToLogin(req: NextRequest) {
  return NextResponse.redirect(
    new URL(process.env.NEXT_PUBLIC_API_URL + '/index.html')
  );
}

export const config = {
  matcher: ['/insights/:path*'],
};
