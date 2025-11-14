(function(){
  // events.js - loads events.json, renders with filters and pager (6 per page)
  const container = document.getElementById('events-root');
  if(!container) return;

  const listEl = document.getElementById('events-list');
  const pagerEl = document.getElementById('pager');
  const categorySelect = document.getElementById('filter-category');
  const dateSelect = document.getElementById('filter-date');
  const sortSelect = document.getElementById('filter-sort');

  let eventsData = [];
  let filtered = [];
  const PAGE_SIZE = 6;
  let currentPage = 1;

  function fetchEvents(){
    return fetch('/events/events.json').then(r=>r.json());
  }

  function populateCategoryOptions(){
    const cats = Array.from(new Set(eventsData.map(e=>e.category))).sort();
    categorySelect.innerHTML = '<option value="">All Categories</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  }

  function applyFilters(){
    const cat = categorySelect.value;
    const dateFilter = dateSelect.value; // '', 'today', '7days'
    const sort = sortSelect.value;
    const now = new Date();

    filtered = eventsData.filter(e=>{
      if(cat && e.category !== cat) return false;
      if(dateFilter==='today'){
        const d = new Date(e.date);
        if(d.toDateString() !== now.toDateString()) return false;
      } else if(dateFilter==='7days'){
        const d = new Date(e.date);
        const diff = (d - now)/(1000*60*60*24);
        if(diff < 0 || diff > 7) return false;
      }
      return true;
    });

    if(sort==='date-asc') filtered.sort((a,b)=>new Date(a.date)-new Date(b.date));
    if(sort==='date-desc') filtered.sort((a,b)=>new Date(b.date)-new Date(a.date));
    if(sort==='title-asc') filtered.sort((a,b)=>a.title.localeCompare(b.title));
    if(sort==='title-desc') filtered.sort((a,b)=>b.title.localeCompare(a.title));

    currentPage = 1;
    renderPage();
  }

  function renderPage(){
    const start = (currentPage-1)*PAGE_SIZE;
    const pageItems = filtered.slice(start, start+PAGE_SIZE);

    listEl.innerHTML = pageItems.map(item=>`
      <div class="event-card">
        <div class="event-thumb" style="background-image:url(${item.thumb})"></div>
        <div class="event-body">
          <h3 class="event-title">${escapeHtml(item.title)}</h3>
          <p class="event-desc">${escapeHtml(item.short)}</p>
          <div class="event-meta">
            <span>${item.date} · ${item.time}</span>
            <span>·</span>
            <span>${escapeHtml(item.venue)}</span>
            <span>·</span>
            <span>${escapeHtml(item.city)}</span>
          </div>
        </div>
      </div>
    `).join('');

    renderPager();
  }

  function renderPager(){
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total/PAGE_SIZE));
    pagerEl.innerHTML = '';
    const prev = document.createElement('button'); prev.textContent = 'Prev'; prev.disabled = currentPage===1; prev.onclick = ()=>{ currentPage--; renderPage(); };
    const next = document.createElement('button'); next.textContent = 'Next'; next.disabled = currentPage===pages; next.onclick = ()=>{ currentPage++; renderPage(); };

    pagerEl.appendChild(prev);

    for(let i=1;i<=pages;i++){
      const b = document.createElement('button'); b.textContent = ''+i; if(i===currentPage) b.classList.add('active'); b.onclick = ()=>{ currentPage=i; renderPage(); };
      pagerEl.appendChild(b);
    }

    pagerEl.appendChild(next);
  }

  function escapeHtml(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // events
  categorySelect.addEventListener('change', applyFilters);
  dateSelect.addEventListener('change', applyFilters);
  sortSelect.addEventListener('change', applyFilters);

  fetchEvents().then(js=>{ eventsData = js.slice(); populateCategoryOptions(); applyFilters(); }).catch(err=>{ listEl.innerHTML = '<p style="color:#777">Could not load events.</p>'; console.error(err); });
})();
