(function(){
  const apiBase = window.citybeatApiBase || 'http://localhost:5000';
  const user = 'demo';
  const notifToggle = document.getElementById('notif-toggle');
  const btnPass = document.getElementById('btn-pass-change');
  const curPass = document.getElementById('cur-pass');
  const newPass = document.getElementById('new-pass');
  const confirmPass = document.getElementById('confirm-pass');

  async function load(){
    try{
      const res = await fetch(apiBase + '/api/user/'+user);
      if(res.ok){ const j = await res.json(); notifToggle.checked = !!j.notificationsEnabled; return; }
    }catch(e){}
    notifToggle.checked = true;
  }

  notifToggle.addEventListener('change', async ()=>{
    try{
      const res = await fetch(apiBase + '/api/user/'+user+'/settings/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:!!notifToggle.checked})});
      if(!res.ok){ alert('Failed to update'); }
      else { if(window.refreshNotifications) window.refreshNotifications(); }
    }catch(e){ alert('Network error'); }
  });

  btnPass.addEventListener('click', async ()=>{
    if(newPass.value !== confirmPass.value){ alert('New passwords do not match'); return; }
    try{
      const res = await fetch(apiBase + '/api/user/'+user+'/change-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({oldPassword:curPass.value,newPassword:newPass.value})});
      if(res.ok){ alert('Password changed'); curPass.value='';newPass.value='';confirmPass.value=''; }
      else{ const t = await res.text(); alert('Failed: '+t); }
    }catch(e){ alert('Network error'); }
  });

  load();
})();
