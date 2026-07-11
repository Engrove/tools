// Renders the tool grid from the build-generated manifest (tools.json)
// and wires up the search filter and theme toggle.

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const search = document.getElementById('search');
const countEl = document.getElementById('count');
const generatedEl = document.getElementById('generated');

let tools = [];

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function cardHtml(tool) {
  const tags = (tool.tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('');
  const date = tool.updated ? `<span class="card-date">${escapeHtml(tool.updated)}</span>` : '';
  const meta = tags || date ? `<div class="card-meta">${tags}${date}</div>` : '';
  const desc = tool.description
    ? `<p class="card-desc">${escapeHtml(tool.description)}</p>`
    : '<p class="card-desc"></p>';

  return `
    <a class="card" href="${escapeHtml(tool.url)}">
      <div class="card-head">
        <span class="card-icon" aria-hidden="true">${escapeHtml(tool.icon || '🛠️')}</span>
        <h2 class="card-title">${escapeHtml(tool.name)}</h2>
      </div>
      ${desc}
      ${meta}
    </a>
  `;
}

function render(list) {
  grid.innerHTML = list.map(cardHtml).join('');
  const hasTools = tools.length > 0;
  const hasMatches = list.length > 0;

  // The empty panel is only for the "no tools at all" case.
  empty.hidden = hasTools;
  grid.hidden = !hasMatches;

  if (!hasTools) {
    countEl.textContent = '';
  } else if (list.length === tools.length) {
    countEl.textContent = `${tools.length} tool${tools.length === 1 ? '' : 's'}`;
  } else {
    countEl.textContent = `${list.length} of ${tools.length}`;
  }
}

function applyFilter() {
  const q = search.value.trim().toLowerCase();
  if (!q) return render(tools);
  const filtered = tools.filter((t) => {
    const haystack = [t.name, t.description, ...(t.tags || [])].join(' ').toLowerCase();
    return haystack.includes(q);
  });
  render(filtered);
}

async function load() {
  try {
    const res = await fetch('tools.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();
    tools = Array.isArray(manifest.tools) ? manifest.tools : [];

    if (manifest.generatedAt) {
      const d = new Date(manifest.generatedAt);
      if (!Number.isNaN(d.getTime())) {
        generatedEl.textContent = `Updated ${d.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}`;
      }
    }
    render(tools);
  } catch (err) {
    grid.hidden = true;
    empty.hidden = false;
    empty.querySelector('.empty-title').textContent = 'Could not load tools';
    console.error('Failed to load tools.json:', err);
  }
}

// ---- Theme toggle -------------------------------------------------------
const THEME_KEY = 'engrove-tools-theme';
const root = document.documentElement;

function setTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}

const stored = localStorage.getItem(THEME_KEY);
if (stored) setTheme(stored);

document.getElementById('theme-toggle').addEventListener('click', () => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const current = root.getAttribute('data-theme') || (prefersDark ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

// ---- Wire up ------------------------------------------------------------
search.addEventListener('input', applyFilter);
load();
