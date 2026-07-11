/**
 * AI-CODING NOTE:
 * Responsibility: Enforce preview-host noindex policy and serve generated Markdown representations through content negotiation.
 * Inputs: Request hostname, pathname, Accept header, and static asset binding.
 * Outputs: Response headers or a generated Markdown representation.
 * Safe edits: Exact public route mappings and response policy.
 * Do not: Change canonical origin, expose private data, or invent Markdown content.
 * Verification: npm run check:preview-policy && npm run check:seo.
 */
type PagesContext={request:Request;env:{ASSETS:{fetch(request:Request):Promise<Response>}};next():Promise<Response>};

const markdownRoute=(pathname:string):string|null=>{
  if(pathname==='/'||pathname==='/for-agents'||pathname==='/for-agents/'||pathname==='/for-agents/index.html')return '/for-agents.md';
  const match=pathname.match(/^\/tools\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  return match?`/tools/${match[1]}/tool.md`:null;
};

export const onRequest=async(context:PagesContext):Promise<Response>=>{
  const url=new URL(context.request.url);
  const acceptsMarkdown=(context.request.headers.get('Accept')||'').includes('text/markdown');
  const markdownPath=acceptsMarkdown?markdownRoute(url.pathname):null;
  let response:Response;
  if(markdownPath){
    const assetUrl=new URL(markdownPath,url.origin);
    const asset=await context.env.ASSETS.fetch(new Request(assetUrl,context.request));
    response=asset.ok?asset:await context.next();
  }else response=await context.next();
  const headers=new Headers(response.headers);
  if(markdownPath&&response.ok){headers.set('Content-Type','text/markdown; charset=utf-8');headers.set('Vary','Accept')}
  if(url.hostname.endsWith('.pages.dev'))headers.set('X-Robots-Tag','noindex, nofollow');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
};
