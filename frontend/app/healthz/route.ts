// Kubernetes probe target. Answers from the Node process alone: it renders no
// page and calls no backend, so an API outage cannot restart healthy web pods
// (API readiness is probed on the API pods themselves).
export const dynamic='force-dynamic';
export function GET(){
 return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});
}
