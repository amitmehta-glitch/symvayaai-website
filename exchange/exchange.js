(function(){
  var PRO=['Builder','Guardian','Enabler'], ORG=['Solution provider','Company'];
  function groupOf(door){return PRO.indexOf(door)>-1?'pro':(ORG.indexOf(door)>-1?'org':'');}

  // Registration form: show the fields that fit the chosen door
  var reg=document.querySelector('form[name="exchange-register"]');
  function applyDoor(){
    if(!reg) return;
    var door=reg.elements.door.value, g=groupOf(door);
    reg.querySelectorAll('fieldset[data-for]').forEach(function(fs){
      var on=!!door && (fs.dataset.for===g || fs.dataset.for===door);
      fs.hidden=!on;
      fs.querySelectorAll('input,select,textarea').forEach(function(el){
        el.disabled=!on;
        var rf=el.dataset.reqFor; if(rf) el.required=on && (rf===g||rf===door);
      });
    });
    reg.querySelectorAll('[data-label-for]').forEach(function(s){
      s.hidden = g ? s.dataset.labelFor!==g : s.dataset.labelFor!=='pro';
    });
  }
  function setDoor(door){
    if(!reg||!door) return;
    for(var i=0;i<reg.elements.door.options.length;i++){ if(reg.elements.door.options[i].text===door){ reg.elements.door.selectedIndex=i; } }
    applyDoor();
  }
  if(reg){
    reg.elements.door.addEventListener('change',applyDoor);
    var q=new URLSearchParams(location.search);
    if(q.get('door')) setDoor(q.get('door'));
    applyDoor();
    if(q.get('fellow')==='1'){ var f=document.getElementById('rg-fellow'); if(f) f.checked=true; }
    document.querySelectorAll('a[data-door]').forEach(function(a){
      a.addEventListener('click',function(e){
        e.preventDefault(); setDoor(a.dataset.door);
        document.getElementById('register').scrollIntoView({behavior:'smooth'});
        history.replaceState(null,'','?door='+encodeURIComponent(a.dataset.door)+'#register');
        setTimeout(function(){reg.elements['name'].focus({preventScroll:true});},500);
      });
    });
  }

  // Submit to Netlify Forms without leaving the page; only show success if Netlify accepted it
  document.querySelectorAll('form[data-netlify]').forEach(function(form){
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var btn=form.querySelector('button[type=submit]'), st=form.querySelector('.status');
      st.className='status'; st.textContent='Sending…'; btn.disabled=true;
      var data=new URLSearchParams(new FormData(form)).toString();
      fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:data})
        .then(function(r){
          if(!r.ok) throw new Error(r.status);
          var box=document.createElement('div'); box.className='done'; box.setAttribute('tabindex','-1');
          box.innerHTML='<h3>Thank you. You’re on the list.</h3><p>A member of the SymVaya team will read your details and email you. The Exchange launches on 15 December 2026, and we’ll invite cohorts in the order people registered.</p>';
          form.replaceWith(box); box.focus();
        })
        .catch(function(){
          btn.disabled=false; st.className='status err';
          st.innerHTML='Sorry, that didn’t go through. Please try again, or email <a href="mailto:amitmehta@symvayaai.com">amitmehta@symvayaai.com</a>.';
        });
    });
  });
})();
