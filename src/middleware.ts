import { NextRequest,NextResponse } from 'next/server';
export function middleware(request:NextRequest){
 const nonce=btoa(crypto.randomUUID());
 const isDev=process.env.NODE_ENV==='development';
 const csp=[
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev?" 'unsafe-eval'":''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
 ].join('; ');
 const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',csp);
 const response=NextResponse.next({request:{headers}});
 response.headers.set('Content-Security-Policy',csp);
 response.headers.set('Cache-Control','no-store, no-cache, must-revalidate, private');
 return response;
}
export const config={matcher:[{source:'/((?!api|_next/static|_next/image|favicon.ico).*)',missing:[{type:'header',key:'next-router-prefetch'},{type:'header',key:'purpose',value:'prefetch'}]}]};
