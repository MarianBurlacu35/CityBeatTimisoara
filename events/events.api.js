(function(){
  // events.api.js - prefers server-side pagination (/api/events), falls back to static /events/events.json
  const listEl = document.getElementById('events-list');
  const pagerEl = document.getElementById('pager');
  const categorySelect = document.getElementById('filter-category');
  const dateSelect = document.getElementById('filter-date');
  const sortSelect = document.getElementById('filter-sort');
  if(!listEl || !pagerEl || !categorySelect || !dateSelect || !sortSelect) return;

  const PAGE_SIZE = 6;
  let currentPage = 1;
  let useApi = true;
  // chosen API base (empty string means same-origin). We'll detect which base works in populateCategories.
  let chosenApiBase = '';
  const API_BASE_CANDIDATES = ['', 'http://localhost:5000', 'http://127.0.0.1:5000'];

  function escapeHtml(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function renderItems(items){
    listEl.innerHTML = items.map(item=>`\n      <div class="event-card">\n        <div class="event-thumb" style="background-image:url(${item.thumb})"></div>\n        <div class="event-body">\n          <h3 class="event-title">${escapeHtml(item.title)}</h3>\n          <p class="event-desc">${escapeHtml(item.short)}</p>\n          <div class="event-meta">\n            <span>${item.date} · ${item.time}</span>\n            <span>·</span>\n            <span>${escapeHtml(item.venue)}</span>\n            <span>·</span>\n            <span>${escapeHtml(item.city)}</span>\n          </div>\n        </div>\n      </div>\n    `).join('');
  }

  function renderPager(total, page){
    const pages = Math.max(1, Math.ceil(total/PAGE_SIZE));
    pagerEl.innerHTML = '';

    const prev = document.createElement('button'); prev.textContent = 'Prev'; prev.disabled = page<=1; prev.onclick = ()=>{ if(page>1) fetchPage(page-1); };
    const next = document.createElement('button'); next.textContent = 'Next'; next.disabled = page>=pages; next.onclick = ()=>{ if(page<pages) fetchPage(page+1); };

    pagerEl.appendChild(prev);
    for(let i=1;i<=pages;i++){
      const b = document.createElement('button'); b.textContent = ''+i; if(i===page) b.classList.add('active'); b.onclick = ()=>{ fetchPage(i); };
      pagerEl.appendChild(b);
    }
    pagerEl.appendChild(next);
  }

  function buildQuery(page){
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    const cat = categorySelect.value; if(cat) params.set('category', cat);
    const dateFilter = dateSelect.value; if(dateFilter && dateFilter !== 'all') params.set('dateFilter', dateFilter==='next7'?'7days':dateFilter);
    const sort = sortSelect.value; if(sort){
      const map = { 'date_asc':'date-asc','date_desc':'date-desc','alpha_asc':'title-asc','alpha_desc':'title-desc' };
      const s = map[sort] || sort;
      params.set('sort', s);
    }
    return params.toString();
  }

  function fetchPage(page){
    currentPage = page || 1;
    if(!useApi){ return fetchStaticAndRender(); }
    const qs = buildQuery(currentPage);
    const base = chosenApiBase || '';
    fetch(base + '/api/events?' + qs).then(r=>{ if(!r.ok) throw new Error('api error'); return r.json(); }).then(js=>{
      if(!js || typeof js.total === 'undefined') throw new Error('bad api response');
      renderItems(js.items || []);
      renderPager(js.total || 0, js.page || currentPage);
    }).catch(err=>{
      console.warn('API fetch failed, falling back to static events.json', err);
      useApi = false;
      fetchStaticAndRender();
    });
  }

  function fetchStaticAndRender(){
    fetch('/events/events.json').then(r=>{ if(!r.ok) throw new Error('static fetch failed'); return r.json(); }).then(all=>{
      const cats = Array.from(new Set(all.map(e=>e.category))).sort();
      categorySelect.innerHTML = '<option value="">All Categories</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');

      const cat = categorySelect.value;
      const dateFilter = dateSelect.value;
      const sort = sortSelect.value;
      const now = new Date();
      let filtered = all.filter(e=>{
        if(cat && e.category !== cat) return false;
        if(dateFilter==='today'){
          const d = new Date(e.date);
          if(d.toDateString() !== now.toDateString()) return false;
        } else if(dateFilter==='next7' || dateFilter==='7days'){
          const d = new Date(e.date);
          const diff = (d - now)/(1000*60*60*24);
          if(diff < 0 || diff > 7) return false;
        }
        return true;
      });
      if(sort==='date_asc') filtered.sort((a,b)=>new Date(a.date)-new Date(b.date));
      if(sort==='date_desc') filtered.sort((a,b)=>new Date(b.date)-new Date(a.date));
      if(sort==='alpha_asc') filtered.sort((a,b)=>a.title.localeCompare(b.title));
      if(sort==='alpha_desc') filtered.sort((a,b)=>b.title.localeCompare(a.title));

      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total/PAGE_SIZE));
      if(currentPage > pages) currentPage = 1;
      const start = (currentPage-1)*PAGE_SIZE;
      const pageItems = filtered.slice(start, start+PAGE_SIZE);
      renderItems(pageItems);
      renderPager(total, currentPage);
    }).catch(err=>{
      listEl.innerHTML = '<p style="color:#777">Could not load events.</p>';
      console.error(err);
    });
  }

  function populateCategories(){
    // try each candidate base until one responds; prefer a lightweight categories endpoint
    const tryBase = async (idx) => {
      if(idx >= API_BASE_CANDIDATES.length){
        useApi = false;
        return fetchStaticAndRender();
      }
      const base = API_BASE_CANDIDATES[idx] || '';
      // first try a lightweight categories endpoint
      const catUrl = base + '/api/events/categories';
      try{
        const r = await fetch(catUrl);
        if(r.ok){
          const cats = await r.json();
          if(Array.isArray(cats) && cats.length){
            categorySelect.innerHTML = '<option value="">All Categories</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
            chosenApiBase = base;
            return fetchPage(1);
          }
        }
      }catch(e){
        // fall through and try the full /api/events?page=1&pageSize=1000
      }

      // fallback: try fetching a large page and derive categories
      const url = base + '/api/events?page=1&pageSize=1000';
      try{
        const r2 = await fetch(url);
        if(!r2.ok) throw new Error('no api');
        const js = await r2.json();
        const items = js.items || [];
        const cats = Array.from(new Set(items.map(e=>e.category))).sort();
        categorySelect.innerHTML = '<option value="">All Categories</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
        chosenApiBase = base;
        return fetchPage(1);
      }catch(err){
        return tryBase(idx+1);
      }
    };
    tryBase(0);
  }

  categorySelect.addEventListener('change', ()=>{ currentPage = 1; if(useApi) fetchPage(1); else fetchStaticAndRender(); });
  dateSelect.addEventListener('change', ()=>{ currentPage = 1; if(useApi) fetchPage(1); else fetchStaticAndRender(); });
  sortSelect.addEventListener('change', ()=>{ currentPage = 1; if(useApi) fetchPage(1); else fetchStaticAndRender(); });

  populateCategories();

})();
