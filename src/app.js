/**
 * AI-CODING NOTE:
 * Responsibility: progressively enhance the server-generated hub inventory with client-side filtering and theme persistence.
 * Inputs: static semantic cards already present in index.html.
 * Outputs: optional interactive filtering and theme state; no crawlable content ownership.
 * Safe edits: non-destructive UI enhancement.
 * Do not: fetch or generate the canonical tool inventory, remove static links, or become the source of SEO content.
 * Verification: npm run build, npm run check:seo, browser smoke with JavaScript enabled and disabled.
 */
const grid = document.getElementById('grid');
const cards = grid ? [...grid.querySelectorAll('.card')] : [];

if (grid && cards.length) {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <label class="search" for="search">
      <span class="search-icon" aria-hidden="true">🔍</span>
      <input id="search" type="search" placeholder="Filter tools…" autocomplete="off" spellcheck="false">
    </label>
    <span id="count" class="count" aria-live="polite"></span>
  `;
  grid.parentElement?.insertBefore(toolbar, grid);
  const search = toolbar.querySelector('#search');
  const count = toolbar.querySelector('#count');

  const applyFilter = () => {
    const query = String(search?.value || '').trim().toLowerCase();
    let visible = 0;
    for (const card of cards) {
      const match = !query || card.textContent.toLowerCase().includes(query);
      card.hidden = !match;
      if (match) visible += 1;
    }
    if (count) count.textContent = query ? `${visible} of ${cards.length}` : `${cards.length} tool${cards.length === 1 ? '' : 's'}`;
  };

  search?.addEventListener('input', applyFilter);
  applyFilter();
}

const THEME_KEY = 'engrove-tools-theme';
const root = document.documentElement;
const stored = localStorage.getItem(THEME_KEY);
if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored);

const themeToggle = document.getElementById('theme-toggle');
themeToggle?.addEventListener('click', () => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const current = root.getAttribute('data-theme') || (prefersDark ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
});
