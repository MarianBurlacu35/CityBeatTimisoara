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
    // store last rendered items for modal lookup
    window._lastPageItems = items;
    listEl.innerHTML = items.map(item=>{
      const thumb = item.thumb || item.Thumb || 'https://images.unsplash.com/photo-1505685296765-3a2736de412f?w=800&q=60';
      return `\n      <div class="event-card" data-event-id="${item.id}">\n        <div class="event-thumb" style="background-image:url('${thumb}')"></div>\n        <div class="event-body">\n          <h3 class="event-title">${escapeHtml(item.title)}</h3>\n          <p class="event-desc">${escapeHtml(item.short)}</p>\n          <div class="event-meta">\n            <span>${item.date} · ${item.time}</span>\n            <span>·</span>\n            <span>${escapeHtml(item.venue)}</span>\n            <span>·</span>\n            <span>${escapeHtml(item.city)}</span>\n          </div>\n        </div>\n      </div>\n    `;
    }).join('');

    // attach click handlers to open modal with event details
    setTimeout(()=>{
      const cards = listEl.querySelectorAll('.event-card');
      cards.forEach(c=>{
        c.style.cursor = 'pointer';
        c.addEventListener('click', ()=>{
          const id = Number(c.getAttribute('data-event-id'));
          const item = (window._lastPageItems || []).find(x=>Number(x.id)===id);
          if(item) showEventModal(item);
        });
      });
    },0);
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

  // Modal / popup UI
  function showEventModal(item){
    // defaults
  const contact = item.contact || item.Contact || item.phone || '+40 123 456 789';
  const email = item.email || item.Email || 'contact@citybeat.local';

    // remove any existing modal
    const existing = document.getElementById('cb-event-modal'); if(existing) existing.remove();

    const modal = document.createElement('div'); modal.id = 'cb-event-modal'; modal.className = 'cb-modal';
    modal.innerHTML = `
      <div class="cb-modal-backdrop"></div>
      <div class="cb-modal-panel">
        <button class="cb-modal-close" aria-label="Close">×</button>
        <div class="cb-modal-grid">
          <div class="cb-modal-left">
            <img src="${item.thumb}" alt="${escapeHtml(item.title)}" class="cb-event-image" />
          </div>
          <div class="cb-modal-right">
            <h2 class="cb-event-title">${escapeHtml(item.title)}</h2>
            <div class="cb-event-sub">${escapeHtml(item.date)} · ${escapeHtml(item.time)} · ${escapeHtml(item.city)} · ${escapeHtml(item.venue)}</div>
            <p class="cb-event-desc-full">${escapeHtml(item.short)}</p>

                <div class="cb-event-schedule">
                  <h4>Program</h4>
                  <div class="cb-schedule-columns">
                    ${ (item.program || item.Program || []).map(s => `
                      <div>
                        <strong>${escapeHtml(s.title || s.Title || '')}</strong>
                        <ul>
                          ${(s.items || s.Items || []).map(it => `<li>${escapeHtml(it)}</li>`).join('')}
                        </ul>
                      </div>
                    `).join('') }
                  </div>
                </div>

            <div class="cb-contact-details">
              <strong>Contact details :</strong>
              <div>Phone : <span class="cb-contact-phone">${escapeHtml(contact)}</span></div>
              <div>Email : <span class="cb-contact-email">${escapeHtml(email)}</span></div>
            </div>

            <div class="cb-modal-actions">
              <button class="cb-btn cb-btn-cancel" style="background:#CF142B; display:none;">Cancel participation</button>
              <button class="cb-btn cb-btn-share">Share</button>
              <button class="cb-btn cb-btn-reserve" style="background:var(--purple); color:#fff;">Reserve</button>
            </div>

            <div class="cb-share-list" style="display:none">
              <a href="#" class="cb-share-item" data-share="facebook"><svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg"><path d="M22 12.07C22 6.48 17.52 2 11.93 2S2 6.48 2 12.07c0 4.99 3.66 9.12 8.44 9.93v-7.03H8.08v-2.9h2.36V9.41c0-2.33 1.38-3.61 3.5-3.61.  1.02 0 2.09.18 2.09.18v2.3h-1.18c-1.16 0-1.52.72-1.52 1.46v1.75h2.59l-.41 2.9h-2.18v7.03C18.34 21.19 22 17.06 22 12.07z"/></svg> Facebook</a>
              <a href="#" class="cb-share-item" data-share="instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="#E1306C" xmlns="http://www.w3.org/2000/svg"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 6a5 5 0 1 0 .001 10.001A5 5 0 0 0 12 8zm4.5-.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/></svg> Instagram</a>
              <a href="#" class="cb-share-item" data-share="tiktok"><svg width="18" height="18" viewBox="0 0 24 24" fill="#000" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v12.5A4.5 4.5 0 1 1 9.5 12V9.5h3V2h-1.5z"/></svg> TikTok</a>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // handlers
    const closeBtn = modal.querySelector('.cb-modal-close');
    const backdrop = modal.querySelector('.cb-modal-backdrop');
    const reserveBtn = modal.querySelector('.cb-btn-reserve');
    const cancelBtn = modal.querySelector('.cb-btn-cancel');
    const shareBtn = modal.querySelector('.cb-btn-share');
    const shareList = modal.querySelector('.cb-share-list');

    function closeModal(){ modal.remove(); }
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    reserveBtn.addEventListener('click', ()=>{
      // show cancel button when reserved
      cancelBtn.style.display = 'inline-block';
      reserveBtn.disabled = true;
      reserveBtn.textContent = 'Reserved';
    });

    cancelBtn.addEventListener('click', ()=>{
      // cancel participation
      cancelBtn.style.display = 'none';
      reserveBtn.disabled = false;
      reserveBtn.textContent = 'Reserve';
    });

    shareBtn.addEventListener('click', ()=>{
      shareList.style.display = shareList.style.display === 'none' ? 'block' : 'none';
    });

    // close on escape
    function onKey(e){ if(e.key === 'Escape') closeModal(); }
    document.addEventListener('keydown', onKey);
    modal.addEventListener('remove', ()=>{ document.removeEventListener('keydown', onKey); });
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
