/**
 * AI-CODING NOTE:
 * Responsibility: enforce preview-host noindex policy and serve generated Markdown representations by content negotiation.
 * Inputs: Cloudflare Pages request and generated static assets.
 * Outputs: response headers or Markdown asset response.
 * Safe edits: hostname policy, exact Markdown route map and response headers.
 * Do not: change canonical origin, create runtime API claims or expose non-generated files.
 * Verification: npm run check:preview-policy and preview deployment smoke.
 */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const MARKDOWN_ROUTES: Readonly<Record<string, string>> = Object.freeze({
  '/for-agents/': '/for-agents.md',
  '/for-agents': '/for-agents.md',
});

export const onRequest: PagesFunction<Env> = async context => {
  const url = new URL(context.request.url);
  const markdownPath = MARKDOWN_ROUTES[url.pathname];
  if (markdownPath && (context.request.headers.get('Accept') || '').includes('text/markdown')) {
    const markdownRequest = new Request(new URL(markdownPath, url), context.request);
    const response = await context.env.ASSETS.fetch(markdownRequest);
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/markdown; charset=utf-8');
    headers.set('Vary', 'Accept');
    if (url.hostname.endsWith('.pages.dev')) headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, {status: response.status, headers});
  }

  const response = await context.next();
  if (!url.hostname.endsWith('.pages.dev')) return response;
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
};
