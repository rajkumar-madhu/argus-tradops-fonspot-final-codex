import {cookies} from 'next/headers';
import {TOKEN_COOKIE} from '@/lib/session-shared';
import {serverRuntimeConfig} from '@/lib/runtime';
import {fileQuery} from '@/lib/file-analytics';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const params=Object.fromEntries(new URL(request.url).searchParams);
 const token=(await cookies()).get(TOKEN_COOKIE)?.value;
 try{
  const res=await fetch(`${process.env.INTERNAL_API_URL||serverRuntimeConfig().apiUrl}/api/files/queues/export?${fileQuery(params,{limit:'',offset:''})}`,{cache:'no-store',signal:AbortSignal.timeout(120000),headers:token?{Authorization:`Bearer ${token}`}:{}});
  if(!res.ok)return Response.json({error:'Export unavailable',status:res.status},{status:res.status});
  return new Response(res.body,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="argus-queues-filtered.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'Export service unavailable'},{status:503});}
}
