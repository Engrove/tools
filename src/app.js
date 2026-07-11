/**
 * AI-CODING NOTE:
 * Responsibility: Enhance the statically rendered hub with filtering and browser-local theme state.
 * Inputs: Existing semantic tool cards and local theme preference.
 * Outputs: Client-side visibility and count changes only.
 * Safe edits: Filtering, accessibility, and presentation behavior.
 * Do not: Fetch or own canonical tool inventory, routes, metadata, freshness, or claims.
 * Verification: npm run build && npm run check:html && npm run check:routes.
 */
const cards=[...document.querySelectorAll('[data-tool-slug]')];
const grid=document.getElementById('grid');
const empty=document.getElementById('empty');
const search=document.getElementById('search');
const count=document.getElementById('count');

function render(){
  const query=search.value.trim().toLowerCase();
  let visible=0;
  for(const card of cards){const match=!query||(card.dataset.search||'').includes(query);card.hidden=!match;if(match)visible+=1}
  count.textContent=visible===cards.length?`${cards.length} tool${cards.length===1?'':'s'}`:`${visible} of ${cards.length}`;
  empty.hidden=visible!==0;
  grid.hidden=visible===0;
}

const key='engrove-tools-theme';
const root=document.documentElement;
const stored=localStorage.getItem(key);
if(stored==='light'||stored==='dark')root.dataset.theme=stored;
document.getElementById('theme-toggle').addEventListener('click',()=>{
  const current=root.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  const next=current==='dark'?'light':'dark';
  root.dataset.theme=next;
  localStorage.setItem(key,next);
});
search.addEventListener('input',render);
render();
