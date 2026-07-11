/**
 * AI-CODING NOTE:
 * Responsibility: Enforce preview noindex, Markdown negotiation, and the verified primary-site relationship.
 * Inputs: Request hostname, pathname, Accept header, and static asset binding.
 * Outputs: Response headers plus subtle public-site references on canonical HTML and AI discovery surfaces.
 * Safe edits: Exact public route mappings, verified primary-site identity, and response policy.
 * Do not: Change canonical origin, expose private data, invent content, or inject links into interactive app routes.
 * Verification: npm run check:preview-policy && npm run check:seo.
 */
type PagesContext={request:Request;env:{ASSETS:{fetch(request:Request):Promise<Response>}};next():Promise<Response>};

const PRIMARY_SITE_URL='https://engroveaudio.com';
const PRIMARY_SITE_NAME='Engrove Audio Tools';

const markdownRoute=(pathname:string):string|null=>{
  if(pathname==='/'||pathname==='/for-agents'||pathname==='/for-agents/'||pathname==='/for-agents/index.html')return '/for-agents.md';
  const match=pathname.match(/^\/tools\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  return match?`/tools/${match[1]}/tool.md`:null;
};

const isCanonicalHtmlRoute=(pathname:string):boolean=>
  pathname==='/'||pathname==='/index.html'||pathname==='/for-agents'||pathname==='/for-agents/'||pathname==='/for-agents/index.html'||/^\/tools\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(pathname);

const isAiTextRoute=(pathname:string):boolean=>
  ['/llms.txt','/llms-full.txt','/for-agents.md'].includes(pathname)||/^\/tools\/[a-z0-9]+(?:-[a-z0-9]+)*\/tool\.md$/.test(pathname);

const primaryFooter=()=>`<footer class="site-footer"><div class="wrap"><a href="${PRIMARY_SITE_URL}" rel="home">${PRIMARY_SITE_NAME}</a></div></footer>`;
const primaryDiscovery=()=>`\n\nPrimary public site: ${PRIMARY_SITE_NAME} — ${PRIMARY_SITE_URL}\n`;

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
  if(!response.ok||response.body===null)return new Response(response.body,{status:response.status,statusText:response.statusText,headers});

  const contentType=headers.get('Content-Type')||'';
  if(isCanonicalHtmlRoute(url.pathname)&&contentType.includes('text/html')){
    const html=await response.text();
    const linked=html.includes(PRIMARY_SITE_URL)?html:html.replace('</body>',`${primaryFooter()}</body>`);
    headers.delete('Content-Length');
    return new Response(linked,{status:response.status,statusText:response.statusText,headers});
  }
  if((markdownPath||isAiTextRoute(url.pathname))&&(contentType.includes('text/plain')||contentType.includes('text/markdown'))){
    const text=await response.text();
    const linked=text.includes(PRIMARY_SITE_URL)?text:`${text.trimEnd()}${primaryDiscovery()}`;
    headers.delete('Content-Length');
    return new Response(linked,{status:response.status,statusText:response.statusText,headers});
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
};
