(function(){
  const apiBase = window.citybeatApiBase || 'http://localhost:5000';
  const user = 'demo';
  const els = {
    name: document.getElementById('pf-name'),
    summary: document.getElementById('pf-summary'),
    email: document.getElementById('pf-email'),
    country: document.getElementById('pf-country'),
    city: document.getElementById('pf-city'),
    street: document.getElementById('pf-street'),
    save: document.getElementById('pf-save'),
    cancel: document.getElementById('pf-cancel'),
    avatarInput: document.getElementById('avatar-input'),
    avatarPreview: document.getElementById('avatar-preview')
  };

  function showProfile(p){
    els.name.value = p.name || '';
    els.summary.value = p.summary || '';
    els.email.value = p.email || '';
    els.country.value = p.country || '';
    els.city.value = p.city || '';
    els.street.value = p.street || '';
    if(p.avatarDataUrl || p.avatar){ const src = p.avatarDataUrl || p.avatar; els.avatarPreview.innerHTML = '<img src="'+src+'">'; els.avatarPreview.dataset.avatar = src; } else { els.avatarPreview.innerHTML = '<div style="color:#888">No avatar</div>' }
    
    // Sync with localStorage for header updates
    if(p.name) localStorage.setItem('userName', p.name);
    if(p.email) localStorage.setItem('userEmail', p.email);
    if(p.avatarDataUrl || p.avatar) localStorage.setItem('userAvatar', p.avatarDataUrl || p.avatar);
  }

  async function load(){
    // First try to load from localStorage if available
    const storedName = localStorage.getItem('userName');
    const storedEmail = localStorage.getItem('userEmail');
    const storedAvatar = localStorage.getItem('userAvatar');
    
    if(storedName || storedEmail) {
      const initialProfile = {
        name: storedName || '',
        email: storedEmail || '',
        avatarDataUrl: storedAvatar || ''
      };
      showProfile(initialProfile);
    }
    
    try{
      const res = await fetch(apiBase + '/api/user/'+user+'/profile');
      if(res.ok){ const json = await res.json(); showProfile(json); }
      else { 
        // If API fails but we have localStorage data, keep it
        if(!storedName && !storedEmail) showProfile({}); 
      }
    }catch(e){ 
      // If API fails but we have localStorage data, keep it
      if(!storedName && !storedEmail) showProfile({}); 
    }
  }

  function toBase64(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

  els.avatarInput.addEventListener('change', async (e)=>{
    const f = e.target.files && e.target.files[0];
    const fileLabel = document.getElementById('file-upload-label');
    
    if(!f) {
      // No file selected
      if(fileLabel) {
        fileLabel.classList.remove('has-file');
        fileLabel.textContent = 'Choose Photo';
      }
      return;
    }
    
    // File selected - update button style and text
    if(fileLabel) {
      fileLabel.classList.add('has-file');
      fileLabel.textContent = f.name.length > 20 ? f.name.substring(0, 17) + '...' : f.name;
    }
    
    try{ const b = await toBase64(f); els.avatarPreview.innerHTML = '<img src="'+b+'">'; els.avatarPreview.dataset.avatar = b; }catch(err){ console.error(err); }
  });

  els.save.addEventListener('click', async ()=>{
    const payload = {
      name: els.name.value,
      summary: els.summary.value,
      email: els.email.value,
      country: els.country.value,
      city: els.city.value,
      street: els.street.value,
      avatarDataUrl: els.avatarPreview.dataset.avatar || null
    };
    
    // Update localStorage immediately
    if(payload.name) localStorage.setItem('userName', payload.name);
    if(payload.email) localStorage.setItem('userEmail', payload.email);
    if(payload.avatarDataUrl) localStorage.setItem('userAvatar', payload.avatarDataUrl);
    
    // Update header profile menu immediately
    updateHeaderProfile();
    
    try{
      const res = await fetch(apiBase + '/api/user/'+user+'/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      if(res.ok){ 
        alert('Profile saved');
        
        // Reset file input after successful save
        const fileLabel = document.getElementById('file-upload-label');
        if(fileLabel) {
          fileLabel.classList.remove('has-file');
          fileLabel.textContent = 'Choose Photo';
        }
        els.avatarInput.value = '';
        
        if(window.refreshNotifications) window.refreshNotifications();
      }
      else { alert('Failed to save profile'); }
    }catch(e){ alert('Network error'); }
  });

  els.cancel.addEventListener('click', ()=>{ 
    // Reset file input and custom button
    const fileLabel = document.getElementById('file-upload-label');
    if(fileLabel) {
      fileLabel.classList.remove('has-file');
      fileLabel.textContent = 'Choose Photo';
    }
    els.avatarInput.value = '';
    
    load(); 
  });

  // Function to update header profile menu with current data
  function updateHeaderProfile() {
    const userName = localStorage.getItem('userName') || 'Milo James';
    const userEmail = localStorage.getItem('userEmail') || 'milo.james@example.com';
    const userAvatar = localStorage.getItem('userAvatar') || 'https://randomuser.me/api/portraits/men/75.jpg';
    
    // Update profile menu if it exists
    const profileMenu = document.querySelector('.profile-menu');
    if(profileMenu) {
      const nameEl = profileMenu.querySelector('.pm-name');
      const emailEl = profileMenu.querySelector('.pm-email');
      const imgEl = profileMenu.querySelector('.pm-header img');
      
      if(nameEl) nameEl.textContent = userName;
      if(emailEl) emailEl.textContent = userEmail;
      if(imgEl) imgEl.src = userAvatar;
    }
    
    // Update profile image in header
    const headerProfileImg = document.querySelector('.profile-img');
    if(headerProfileImg) headerProfileImg.src = userAvatar;
    
    // Trigger a global update if the function exists
    if(window.updateGlobalProfile) {
      window.updateGlobalProfile(userName, userEmail, userAvatar);
    }
  }

  load();
})();
