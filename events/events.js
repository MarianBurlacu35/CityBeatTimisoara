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
      <div class="event-card" data-event-id="${item.id}">
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
          <div class="event-actions">
            <button class="btn-favorite" data-event-id="${item.id}">
              <img src="/Imagini_landingPage/heart.png" alt="Favorite">
            </button>
            <button class="btn-save" data-event-id="${item.id}">
              <img src="/Imagini_landingPage/flag.png" alt="Save">
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Add event listeners for action buttons and card clicks
    attachEventActions();
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

  function attachEventActions(){
    // Add click listeners for opening event modals
    document.querySelectorAll('.event-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        // Don't open modal if clicking on action buttons
        if (e.target.closest('.event-actions')) return;
        
        const eventId = parseInt(card.getAttribute('data-event-id'));
        const event = eventsData.find(e => e.id === eventId);
        if (event) {
          showEventModal(event);
        }
      });
    });

    // Favorite buttons
    document.querySelectorAll('.btn-favorite').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent card click
        const eventId = parseInt(btn.getAttribute('data-event-id'));
        try {
          const response = await fetch(`http://localhost:5000/api/user/demo/favorite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId })
          });
          if (response.ok) {
            showNotification('Added to favorites!');
            btn.querySelector('img').src = '/Imagini_landingPage/heart-filled.svg';
          }
        } catch (error) {
          showNotification('Error adding to favorites');
        }
      });
    });

    // Save buttons
    document.querySelectorAll('.btn-save').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent card click
        const eventId = parseInt(btn.getAttribute('data-event-id'));
        try {
          const response = await fetch(`http://localhost:5000/api/user/demo/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId })
          });
          if (response.ok) {
            showNotification('Event saved!');
            btn.querySelector('img').src = '/Imagini_landingPage/flag-filled.svg';
          }
        } catch (error) {
          showNotification('Error saving event');
        }
      });
    });
  }

  function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  function showEventModal(event) {
    // Remove any existing modal
    const existing = document.querySelector('.event-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'event-modal';
    modal.innerHTML = `
      <div class="event-modal-backdrop"></div>
      <div class="event-modal-content">
        <div class="event-modal-header">
          <h2>${escapeHtml(event.title)}</h2>
          <button class="close-modal">&times;</button>
        </div>
        <div class="event-modal-body">
          <div class="event-modal-image">
            <img src="${event.thumb}" alt="${escapeHtml(event.title)}" />
          </div>
          <div class="event-modal-details">
            <div class="event-meta-modal">
              <div class="detail-row">
                <span class="icon">📍</span>
                <span>${escapeHtml(event.venue)}, ${escapeHtml(event.city)}</span>
              </div>
              <div class="detail-row">
                <span class="icon">📅</span>
                <span>${event.date}</span>
              </div>
              <div class="detail-row">
                <span class="icon">🕐</span>
                <span>${event.time}</span>
              </div>
            </div>
            <div class="event-description">
              <p>${escapeHtml(event.short)}</p>
            </div>
            ${event.program && event.program.length > 0 ? `
              <div class="event-program">
                <h4>Program</h4>
                ${event.program.map(section => `
                  <div class="program-section">
                    <h5>${escapeHtml(section.title)}</h5>
                    <ul>
                      ${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                  </div>
                `).join('')}
              </div>
            ` : ''}
            <div class="event-contact">
              <h4>Contact</h4>
              <div class="detail-row">
                <span class="icon">📞</span>
                <span>${escapeHtml(event.contact || '+40 123 456 789')}</span>
              </div>
              <div class="detail-row">
                <span class="icon">✉️</span>
                <span>${escapeHtml(event.email || 'contact@citybeat.local')}</span>
              </div>
            </div>
            <div class="event-modal-actions">
              <button class="btn-favorite-modal" data-event-id="${event.id}">
                <img src="/Imagini_landingPage/heart.png" alt="Favorite"> Favorite
              </button>
              <button class="btn-save-modal" data-event-id="${event.id}">
                <img src="/Imagini_landingPage/flag.png" alt="Save"> Save
              </button>
              <button class="btn-share-modal">Share</button>
              <button class="btn-reserve-modal" data-event-id="${event.id}">Reserve</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners
    const closeBtn = modal.querySelector('.close-modal');
    const backdrop = modal.querySelector('.event-modal-backdrop');
    const reserveBtn = modal.querySelector('.btn-reserve-modal');

    closeBtn.addEventListener('click', () => modal.remove());
    backdrop.addEventListener('click', () => modal.remove());

    // Reserve button shows QR popup
    reserveBtn.addEventListener('click', async () => {
      await showReservePopup(event);
    });

    // Favorite and Save buttons in modal
    const favBtn = modal.querySelector('.btn-favorite-modal');
    const saveBtn = modal.querySelector('.btn-save-modal');

    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await fetch(`http://localhost:5000/api/user/demo/favorite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: event.id })
        });
        if (response.ok) {
          showNotification('Added to favorites!');
          favBtn.querySelector('img').src = '/Imagini_landingPage/heart-filled.svg';
        }
      } catch (error) {
        showNotification('Error adding to favorites');
      }
    });

    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const response = await fetch(`http://localhost:5000/api/user/demo/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: event.id })
        });
        if (response.ok) {
          showNotification('Event saved!');
          saveBtn.querySelector('img').src = '/Imagini_landingPage/flag-filled.svg';
        }
      } catch (error) {
        showNotification('Error saving event');
      }
    });
  }

  async function showReservePopup(event) {
    // Get user info
    let userName = 'Nume Prenume';
    try {
      const userResponse = await fetch('http://localhost:5000/api/user/demo');
      if (userResponse.ok) {
        const userData = await userResponse.json();
        if (userData.profile && userData.profile.name) {
          userName = userData.profile.name;
        }
      }
    } catch (error) {
      console.log('Could not fetch user data');
    }

    // Generate QR data with event information
    const eventUrl = `https://citybeat.local/event/${event.id}`;
    const qrData = `Event: ${event.title}\nDate: ${event.date}\nTime: ${event.time}\nVenue: ${event.venue}, ${event.city}\nURL: ${eventUrl}`;
    
    // Create popup
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
            <h3>${escapeHtml(event.title)}</h3>
            <div class="detail-row">
              <span class="icon">📍</span>
              <span>${escapeHtml(event.venue)}, ${escapeHtml(event.city)}</span>
            </div>
            <div class="detail-row">
              <span class="icon">📅</span>
              <span>${event.date}</span>
            </div>
            <div class="detail-row">
              <span class="icon">🕐</span>
              <span>${event.time} (cu acces de la ora 17)</span>
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
    await generateFunctionalQR(qrContainer, qrData);

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
      await fetch(`http://localhost:5000/api/user/demo/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id })
      });
    } catch (error) {
      console.log('Error reserving event');
    }
  }

  async function generateFunctionalQR(container, data) {
    try {
      // Load QR code library dynamically
      if (!window.QRCode) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
        document.head.appendChild(script);
        
        // Wait for library to load
        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }

      // Clear container
      container.innerHTML = '';
      
      // Generate QR code
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, data, {
        width: 140,
        height: 140,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      container.appendChild(canvas);
    } catch (error) {
      console.warn('Failed to generate QR code, falling back to simple pattern:', error);
      generateSimpleQR(container, data);
    }
  }

  function generateSimpleQR(container, data) {
    // Fallback simple QR code representation using CSS
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

  // events
  categorySelect.addEventListener('change', applyFilters);
  dateSelect.addEventListener('change', applyFilters);
  sortSelect.addEventListener('change', applyFilters);

  fetchEvents().then(js=>{ eventsData = js.slice(); populateCategoryOptions(); applyFilters(); }).catch(err=>{ listEl.innerHTML = '<p style="color:#777">Could not load events.</p>'; console.error(err); });
})();
