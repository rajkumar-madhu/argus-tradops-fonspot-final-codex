import {cookies} from 'next/headers';
import {TOKEN_COOKIE} from '@/lib/session-shared';
import {serverRuntimeConfig} from '@/lib/runtime';
export const dynamic='force-dynamic';
const KINDS=new Set(['ordupd','login','logout','yel_connected']);
// Same-origin proxy for the masked journal CSV: the browser holds the token as a
// cookie, and a plain link to the API origin would carry no Authorization header.
export async function GET(request:Request){
 const url=new URL(request.url);
 const kind=url.searchParams.get('msg_type')||'ordupd';
 if(!KINDS.has(kind))return Response.json({error:'Unknown message type'},{status:400});
 const query=new URLSearchParams({msg_type:kind});
 const q=(url.searchParams.get('q')||'').slice(0,128);
 if(q)query.set('q',q);
 const token=(await cookies()).get(TOKEN_COOKIE)?.value;
 try{
  const res=await fetch(`${process.env.INTERNAL_API_URL||serverRuntimeConfig().apiUrl}/api/journal/records/export?${query}`,{cache:'no-store',signal:AbortSignal.timeout(120000),headers:token?{Authorization:`Bearer ${token}`}:{}});
  if(!res.ok)return Response.json({error:'Export unavailable',status:res.status},{status:res.status});
  return new Response(res.body,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="argus-journal-${kind}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'Export service unavailable'},{status:503});}
}
