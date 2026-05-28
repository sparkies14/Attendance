import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token.' }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('att_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 86400,
  });
  return res;
}
