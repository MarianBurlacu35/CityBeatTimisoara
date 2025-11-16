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
  // expose for other scripts (notifications in header) so they can use the same API host
  window.citybeatApiBase = window.citybeatApiBase || '';
  const API_BASE_CANDIDATES = ['', 'http://localhost:5000', 'http://127.0.0.1:5000'];
  // If user navigated with a category in the URL (e.g. /events/index.html?category=Music), apply it
  const initialCategory = new URLSearchParams(location.search).get('category') || '';
  // If user navigated with an eventId (e.g. /events/index.html?eventId=12) open its modal after loading
  const initialEventId = Number(new URLSearchParams(location.search).get('eventId') || 0) || 0;
  // optional strict search query (header search) and location param
  const initialQuery = new URLSearchParams(location.search).get('q') || '';
  const initialLoc = new URLSearchParams(location.search).get('loc') || '';
  let pendingOpenEventId = 0;
  let initialEventHandled = false;
  let userActions = { favorites: [], saved: [], reserved: [] };

  function escapeHtml(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function renderItems(items){
    // store last rendered items for modal lookup
    window._lastPageItems = items;
    listEl.innerHTML = items.map(item=>{
  const thumb = item.thumb || item.Thumb || 'https://images.unsplash.com/photo-1505685296765-3a2736de412f?w=800&q=60';
  const isFav = userActions.favorites && userActions.favorites.indexOf(Number(item.id)) !== -1;
  const isSaved = userActions.saved && userActions.saved.indexOf(Number(item.id)) !== -1;
  return `\n      <div class="event-card" data-event-id="${item.id}">\n        <div class="event-thumb" style="background-image:url('${thumb}')"></div>\n        <div class="event-body">\n          <h3 class="event-title">${escapeHtml(item.title)}</h3>\n          <p class="event-desc">${escapeHtml(item.short)}</p>\n          <div class="event-meta">\n            <span>${item.date} · ${item.time}</span>\n            <span>·</span>\n            <span>${escapeHtml(item.venue)}</span>\n            <span>·</span>\n            <span>${escapeHtml(item.city)}</span>\n          </div>\n          <div class="event-actions">\n            <button class="evt-fav ${isFav? 'is-active':''}" data-event-id="${item.id}" title="Favorite"><img src="${isFav? '/Imagini_landingPage/heart-filled.svg' : '/Imagini_landingPage/heart.png'}" alt="fav"></button>\n            <button class="evt-save ${isSaved? 'is-active':''}" data-event-id="${item.id}" title="Save"><img src="${isSaved? '/Imagini_landingPage/flag-filled.svg' : '/Imagini_landingPage/flag.png'}" alt="save"></button>\n          </div>\n        </div>\n      </div>\n    `;
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
        // action buttons
        const favBtn = c.querySelector('.evt-fav');
        const saveBtn = c.querySelector('.evt-save');
        if(favBtn){ favBtn.addEventListener('click', async (ev)=>{ ev.stopPropagation(); const id = Number(favBtn.getAttribute('data-event-id'));
            // optimistic UI: toggle immediately then confirm with server
            const wasActive = favBtn.classList.contains('is-active');
            favBtn.classList.toggle('is-active');
            // swap icon for immediate feedback
            const favImg = favBtn.querySelector('img'); if(favImg) favImg.src = favBtn.classList.contains('is-active') ? '/Imagini_landingPage/heart-filled.svg' : '/Imagini_landingPage/heart.png';
            const ok = await toggleFavorite(id);
            if(!ok){ // revert if server failed
              if(wasActive) favBtn.classList.add('is-active'); else favBtn.classList.remove('is-active');
              const favImg2 = favBtn.querySelector('img'); if(favImg2) favImg2.src = favBtn.classList.contains('is-active') ? '/Imagini_landingPage/heart-filled.svg' : '/Imagini_landingPage/heart.png';
            } else {
              // keep in sync with server state (toggleFavorite updated userActions)
              if(userActions.favorites.indexOf(id)!==-1) favBtn.classList.add('is-active'); else favBtn.classList.remove('is-active');
              const favImg3 = favBtn.querySelector('img'); if(favImg3) favImg3.src = favBtn.classList.contains('is-active') ? '/Imagini_landingPage/heart-filled.svg' : '/Imagini_landingPage/heart.png';
            }
        }); }
        if(saveBtn){ saveBtn.addEventListener('click', async (ev)=>{ ev.stopPropagation(); const id = Number(saveBtn.getAttribute('data-event-id'));
            const wasActive2 = saveBtn.classList.contains('is-active');
            saveBtn.classList.toggle('is-active');
            // swap icon immediately
            const saveImg = saveBtn.querySelector('img'); if(saveImg) saveImg.src = saveBtn.classList.contains('is-active') ? '/Imagini_landingPage/flag-filled.svg' : '/Imagini_landingPage/flag.png';
            const ok2 = await toggleSave(id);
            if(!ok2){ if(wasActive2) saveBtn.classList.add('is-active'); else saveBtn.classList.remove('is-active');
              const saveImg2 = saveBtn.querySelector('img'); if(saveImg2) saveImg2.src = saveBtn.classList.contains('is-active') ? '/Imagini_landingPage/flag-filled.svg' : '/Imagini_landingPage/flag.png';
            }
            else { if(userActions.saved.indexOf(id)!==-1) saveBtn.classList.add('is-active'); else saveBtn.classList.remove('is-active'); }
        }); }
      });
      // if there's a pending event id to open (redirect from main page), try to open it now
      if((initialEventId || pendingOpenEventId) && !initialEventHandled){
        const want = pendingOpenEventId || initialEventId;
        const found = (window._lastPageItems || []).find(x=>Number(x.id)===Number(want));
        if(found){
          initialEventHandled = true;
          pendingOpenEventId = 0;
          // open modal after a short delay to ensure DOM handlers are ready
          setTimeout(()=> showEventModal(found), 120);
        }
      }
    },0);
  }

  // user actions helpers
  function getCurrentUser(){ return localStorage.getItem('user') || 'demo'; }

  async function loadUserActions(){
    try{
      const user = getCurrentUser();
      const base = chosenApiBase || window.citybeatApiBase || '';
      const r = await fetch((base || '') + '/api/user/' + encodeURIComponent(user) + '/actions');
      if(!r.ok) return;
      const js = await r.json();
      userActions.favorites = (js.favorites || []).map(x=>Number(x));
      userActions.saved = (js.saved || []).map(x=>Number(x));
      userActions.reserved = (js.reserved || []).map(x=>Number(x));
    }catch(e){ console.warn('loadUserActions failed', e); }
  }

  // returns true on success, false on failure
  async function toggleFavorite(eventId){
    try{
      const user = getCurrentUser();
  const base = chosenApiBase || window.citybeatApiBase || '';
  const r = await fetch((base || '') + '/api/user/' + encodeURIComponent(user) + '/favorite', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ eventId }) });
      if(!r.ok) { console.warn('fav failed', r.status); return false; }
      const js = await r.json();
      userActions.favorites = (js.favorites || []).map(x=>Number(x));
      window.refreshNotifications && window.refreshNotifications();
      return true;
    }catch(e){ console.warn('toggleFavorite error', e); return false; }
  }

  // returns true on success, false on failure
  async function toggleSave(eventId){
    try{
      const user = getCurrentUser();
  const base = chosenApiBase || window.citybeatApiBase || '';
  const r = await fetch((base || '') + '/api/user/' + encodeURIComponent(user) + '/save', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ eventId }) });
      if(!r.ok) { console.warn('save failed', r.status); return false; }
      const js = await r.json();
      userActions.saved = (js.saved || []).map(x=>Number(x));
      window.refreshNotifications && window.refreshNotifications();
      return true;
    }catch(e){ console.warn('toggleSave error', e); return false; }
  }

  // returns true on success, false on failure
  async function reserveEvent(eventId){
    try{
      const user = getCurrentUser();
  const base = chosenApiBase || window.citybeatApiBase || '';
  const r = await fetch((base || '') + '/api/user/' + encodeURIComponent(user) + '/reserve', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ eventId }) });
      if(!r.ok) { console.warn('reserve failed', r.status); return false; }
      const js = await r.json();
      userActions.reserved = (js.reserved || []).map(x=>Number(x));
      window.refreshNotifications && window.refreshNotifications();
      return true;
    }catch(e){ console.warn('reserveEvent error', e); return false; }
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
    // include strict title or location search if present in URL
    if(initialQuery) params.set('q', initialQuery);
    if(initialLoc) params.set('loc', initialLoc);
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
      // scroll to top when changing pages so user sees the new results
      try{ if(window && window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(e){ window.scrollTo(0,0); }
      // if an initial event id is requested but not found in this page, fetch a large page to locate it
      if(initialEventId && !initialEventHandled){
        const foundHere = (js.items || []).find(x=> Number(x.id) === Number(initialEventId));
        if(!foundHere){
          // fetch a big page to find the index and compute the page that contains the event
          fetch(base + '/api/events?page=1&pageSize=1000').then(r2=> r2.json()).then(allJs=>{
            const all = allJs.items || [];
            const idx = all.findIndex(x=> Number(x.id) === Number(initialEventId));
            if(idx >= 0){
              const pageNum = Math.floor(idx / PAGE_SIZE) + 1;
              pendingOpenEventId = initialEventId;
              fetchPage(pageNum);
            }
          }).catch(()=>{});
        }
      }
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
        if(initialQuery){ if(!String(e.title || e.Title || '').toLowerCase().includes(String(initialQuery).toLowerCase())) return false; }
        if(initialLoc){ const locL = String(initialLoc).toLowerCase(); if(!String(e.city || e.City || '').toLowerCase().includes(locL) && !String(e.venue || e.Venue || '').toLowerCase().includes(locL)) return false; }
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
  // scroll to top when changing pages (static fallback)
  try{ if(window && window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(e){ window.scrollTo(0,0); }
      // handle initialEventId when using static fallback
      if(initialEventId && !initialEventHandled){
        const foundHere = pageItems.find(x=> Number(x.id) === Number(initialEventId));
        if(foundHere){
          initialEventHandled = true;
          setTimeout(()=> showEventModal(foundHere), 120);
        } else {
          const idx = filtered.findIndex(x=> Number(x.id) === Number(initialEventId));
          if(idx >= 0){
            const pageNum = Math.floor(idx / PAGE_SIZE) + 1;
            currentPage = pageNum;
            const start2 = (currentPage-1)*PAGE_SIZE;
            const pageItems2 = filtered.slice(start2, start2+PAGE_SIZE);
            renderItems(pageItems2);
            renderPager(total, currentPage);
            try{ if(window && window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(e){ window.scrollTo(0,0); }
            const found = pageItems2.find(x=> Number(x.id) === Number(initialEventId));
            if(found){ initialEventHandled = true; setTimeout(()=> showEventModal(found), 120); }
          }
        }
      }
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
    const modalThumb = item.thumb || item.Thumb || 'https://images.unsplash.com/photo-1505685296765-3a2736de412f?w=800&q=60';
    modal.innerHTML = `
      <div class="cb-modal-backdrop"></div>
      <div class="cb-modal-panel">
        <button class="cb-modal-close" aria-label="Close">×</button>
        <div class="cb-modal-grid">
          <div class="cb-modal-left">
            <img src="${modalThumb}" alt="${escapeHtml(item.title)}" class="cb-event-image" />
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
              <button class="cb-btn cb-btn-fav ${ userActions.favorites && userActions.favorites.indexOf(Number(item.id))!==-1 ? 'is-active' : '' }" title="Favorite"><img src="${ userActions.favorites && userActions.favorites.indexOf(Number(item.id))!==-1 ? '/Imagini_landingPage/heart-filled.svg' : '/Imagini_landingPage/heart.png' }" alt="fav"></button>
              <button class="cb-btn cb-btn-save ${ userActions.saved && userActions.saved.indexOf(Number(item.id))!==-1 ? 'is-active' : '' }" title="Save"><img src="${ userActions.saved && userActions.saved.indexOf(Number(item.id))!==-1 ? '/Imagini_landingPage/flag-filled.svg' : '/Imagini_landingPage/flag.png' }" alt="save"></button>
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

    reserveBtn.addEventListener('click', async ()=>{
      const id = Number(item.id);
      // Show QR popup instead of simple reservation
      showQRCodePopup(item);
      closeModal();
    });

    cancelBtn.addEventListener('click', ()=>{
      // cancel participation
      cancelBtn.style.display = 'none';
      reserveBtn.disabled = false;
      reserveBtn.textContent = 'Reserve';
    });

  // favorite / save buttons in modal
  const favBtnModal = modal.querySelector('.cb-btn-fav');
  const saveBtnModal = modal.querySelector('.cb-btn-save');
  if(favBtnModal){ favBtnModal.addEventListener('click', async ()=>{
    const id = Number(item.id);
    const wasActive = favBtnModal.classList.contains('is-active');
    favBtnModal.classList.toggle('is-active');
    const favImgModal = favBtnModal.querySelector('img'); if(favImgModal) favImgModal.src = favBtnModal.classList.contains('is-active') ? '/Imagini_landingPage/heart-filled.svg' : '/Imagini_landingPage/heart.png';
    const ok = await toggleFavorite(id);
    if(!ok){ // revert
      if(wasActive) favBtnModal.classList.add('is-active'); else favBtnModal.classList.remove('is-active');
      const favImgModal2 = favBtnModal.querySelector('img'); if(favImgModal2) favImgModal2.src = favBtnModal.classList.contains('is-active') ? '/Imagini_landingPage/heart-filled.svg' : '/Imagini_landingPage/heart.png';
    } else {
      // sync card button too
      const cardBtn = document.querySelector('.evt-fav[data-event-id="'+item.id+'"]'); if(cardBtn){ if(userActions.favorites.indexOf(id)!==-1) cardBtn.classList.add('is-active'); else cardBtn.classList.remove('is-active'); const cbImg = cardBtn.querySelector('img'); if(cbImg) cbImg.src = cardBtn.classList.contains('is-active') ? '/Imagini_landingPage/heart-filled.svg' : '/Imagini_landingPage/heart.png'; }
    }
  }); }
  if(saveBtnModal){ saveBtnModal.addEventListener('click', async ()=>{
    const id = Number(item.id);
    const wasActive2 = saveBtnModal.classList.contains('is-active');
    saveBtnModal.classList.toggle('is-active');
    const saveImgModal = saveBtnModal.querySelector('img'); if(saveImgModal) saveImgModal.src = saveBtnModal.classList.contains('is-active') ? '/Imagini_landingPage/flag-filled.svg' : '/Imagini_landingPage/flag.png';
    const ok2 = await toggleSave(id);
    if(!ok2){ if(wasActive2) saveBtnModal.classList.add('is-active'); else saveBtnModal.classList.remove('is-active'); const saveImgModal2 = saveBtnModal.querySelector('img'); if(saveImgModal2) saveImgModal2.src = saveBtnModal.classList.contains('is-active') ? '/Imagini_landingPage/flag-filled.svg' : '/Imagini_landingPage/flag.png'; }
    else { const cardBtn2 = document.querySelector('.evt-save[data-event-id="'+item.id+'"]'); if(cardBtn2){ if(userActions.saved.indexOf(id)!==-1) cardBtn2.classList.add('is-active'); else cardBtn2.classList.remove('is-active'); const cbImg2 = cardBtn2.querySelector('img'); if(cbImg2) cbImg2.src = cardBtn2.classList.contains('is-active') ? '/Imagini_landingPage/flag-filled.svg' : '/Imagini_landingPage/flag.png'; } }
  }); }

    shareBtn.addEventListener('click', ()=>{
      shareList.style.display = shareList.style.display === 'none' ? 'block' : 'none';
    });

    // Add event listeners for share items
    const shareItems = modal.querySelectorAll('.cb-share-item');
    shareItems.forEach(shareItem => {
      shareItem.addEventListener('click', (e) => {
        e.preventDefault();
        const platform = shareItem.getAttribute('data-share');
        handleShareClick(platform);
      });
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
            // if a category was passed via URL, pre-select it
            if(initialCategory){
              const found = cats.find(x=>x === initialCategory);
              if(found) categorySelect.value = initialCategory;
            }
            chosenApiBase = base;
            exposeApiBase();
            await loadUserActions();
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
        if(initialCategory){
          const found2 = cats.find(x=>x === initialCategory);
          if(found2) categorySelect.value = initialCategory;
        }
  chosenApiBase = base;
  exposeApiBase();
  await loadUserActions();
  return fetchPage(1);
      }catch(err){
        return tryBase(idx+1);
      }
    };
    // detect API base and then load user actions and the first page (tryBase will call loadUserActions)
    tryBase(0);
  }

  // after chosenApiBase is determined, expose it to other scripts
  function exposeApiBase(){
    try{ window.citybeatApiBase = chosenApiBase || ''; }catch(e){}
  }

  categorySelect.addEventListener('change', ()=>{ currentPage = 1; if(useApi) fetchPage(1); else fetchStaticAndRender(); });
  dateSelect.addEventListener('change', ()=>{ currentPage = 1; if(useApi) fetchPage(1); else fetchStaticAndRender(); });
  sortSelect.addEventListener('change', ()=>{ currentPage = 1; if(useApi) fetchPage(1); else fetchStaticAndRender(); });

  populateCategories();

  // QR Code Popup Function
  async function showQRCodePopup(event) {
    // Get user info
    let userName = 'Nume Prenume';
    try {
      const userResponse = await fetch((chosenApiBase || '') + '/api/user/demo');
      if (userResponse.ok) {
        const userData = await userResponse.json();
        if (userData.profile && userData.profile.name) {
          userName = userData.profile.name;
        }
      }
    } catch (error) {
      console.log('Could not fetch user data');
    }

    // Generate QR code data (functional URL)
    const qrUrl = `https://www.eventbrite.com/e/beach-music-festival-${event.id}`;
    
    // Create QR popup
    const popup = document.createElement('div');
    popup.className = 'reserve-popup';
    popup.innerHTML = `
      <div class="reserve-popup-content">
        <div class="reserve-header">
          <h2>Rezervare Confirmată</h2>
          <button class="close-popup">&times;</button>
        </div>
        <div class="reserve-body">
          <div class="qr-section">
            <div id="qrcode"></div>
            <p class="qr-code-text">9XLRMKT7VBW3</p>
          </div>
          <div class="event-details">
            <h3>${escapeHtml(event.title || event.Title || '')}</h3>
            <div class="detail-row">
              <span class="icon">📍</span>
              <span>${escapeHtml((event.venue || event.Venue || '') + ', ' + (event.city || event.City || ''))}</span>
            </div>
            <div class="detail-row">
              <span class="icon">📅</span>
              <span>${event.date || event.Date || ''}</span>
            </div>
            <div class="detail-row">
              <span class="icon">🕐</span>
              <span>${event.time || event.Time || ''} (cu acces de la ora 17)</span>
            </div>
            <div class="detail-row">
              <span class="icon">👤</span>
              <span>${userName}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(popup);

    // Generate functional QR code using qrcode.js library
    const qrContainer = popup.querySelector('#qrcode');
    generateFunctionalQR(qrContainer, qrUrl);

    // Close popup functionality
    const closeBtn = popup.querySelector('.close-popup');
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(popup);
    });

    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        document.body.removeChild(popup);
      }
    });

    // Reserve the event in backend
    try {
      await reserveEvent(event.id || event.Id);
    } catch (error) {
      console.log('Error reserving event');
    }
  }

  function generateFunctionalQR(container, url) {
    // Load QR code library and generate functional QR code
    if (window.QRCode) {
      // Library already loaded
      new QRCode(container, {
        text: url,
        width: 140,
        height: 140,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      // Load QR code library dynamically
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
      script.onload = () => {
        // Generate QR code using qrcode library
        QRCode.toCanvas(container, url, {
          width: 140,
          height: 140,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        }, function (error) {
          if (error) {
            console.error('QR Code generation failed:', error);
            // Fallback to simple pattern
            generateSimpleQR(container, url);
          }
        });
      };
      script.onerror = () => {
        // Fallback if library fails to load
        generateSimpleQR(container, url);
      };
      document.head.appendChild(script);
    }
  }

  function handleShareClick(platform) {
    // Random links for each platform
    const randomLinks = {
      facebook: [
        'https://www.facebook.com/events/',
        'https://www.facebook.com/pg/CityBeatEvents/events/',
        'https://www.facebook.com/groups/timisoraevenings/',
        'https://www.facebook.com/eventsinbucharestro/',
        'https://www.facebook.com/nightoutbucharest/',
        'https://www.facebook.com/romanianfestivals/',
        'https://www.facebook.com/livemusicro/',
        'https://www.facebook.com/concertebucuresti/',
        'https://www.facebook.com/muzicalive/',
        'https://www.facebook.com/teatruinbucuresti/'
      ],
      instagram: [
        'https://www.instagram.com/citybeat_events/',
        'https://www.instagram.com/explore/tags/timisoraevenings/',
        'https://www.instagram.com/explore/tags/bucharestevents/',
        'https://www.instagram.com/explore/tags/romanianculture/',
        'https://www.instagram.com/explore/tags/livemusicro/',
        'https://www.instagram.com/explore/tags/concertero/',
        'https://www.instagram.com/explore/tags/festivals/',
        'https://www.instagram.com/explore/tags/nightlifero/',
        'https://www.instagram.com/explore/tags/teatru/',
        'https://www.instagram.com/explore/tags/artevents/'
      ],
      tiktok: [
        '@citybeat_official',
        '@romanianmusic',
        '@bucharestvibes',
        '@timisoara_life',
        '@liveconcerts',
        '@festivalvibes',
        '@nightlife_ro',
        '@culturalro',
        '@eventshappening',
        '@musiclovers_ro'
      ]
    };

    const links = randomLinks[platform];
    if (!links || links.length === 0) {
      console.warn(`No links available for platform: ${platform}`);
      return;
    }

    // Select random link
    const randomIndex = Math.floor(Math.random() * links.length);
    let targetUrl = links[randomIndex];

    // For TikTok, if it starts with @, convert to full URL
    if (platform === 'tiktok' && targetUrl.startsWith('@')) {
      targetUrl = `https://www.tiktok.com/${targetUrl}`;
    }

    // Open in new window/tab
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }

  function generateSimpleQR(container, data) {
    // Simple QR code representation using CSS as fallback
    container.innerHTML = `
      <div class="qr-grid">
        ${Array.from({length: 21}, (_, i) => 
          Array.from({length: 21}, (_, j) => {
            const isBlack = (i + j + data.length) % 3 === 0 || 
                          (i % 4 === 0 && j % 4 === 0) ||
                          (i < 7 && j < 7) ||
                          (i < 7 && j > 13) ||
                          (i > 13 && j < 7);
            return `<div class="qr-cell ${isBlack ? 'black' : 'white'}"></div>`;
          }).join('')
        ).join('')}
      </div>
    `;
  }

})();
