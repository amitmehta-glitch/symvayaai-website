/* SymVaya AI — small site script: mobile menu, Navigator question tabs, contact form */
document.documentElement.classList.remove('no-js');
document.documentElement.classList.add('js');

// Mobile menu
(function () {
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('site-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? 'Close' : 'Menu';
  });
})();

// Footer year
document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

// Enterprise AI Navigator: question tabs
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.qtab'));
  if (!tabs.length) return;
  function select(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(t); });
    t.addEventListener('keydown', function (e) {
      var k = e.key, n = null;
      if (k === 'ArrowDown' || k === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      if (k === 'ArrowUp' || k === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
      if (k === 'Home') n = tabs[0];
      if (k === 'End') n = tabs[tabs.length - 1];
      if (n) { e.preventDefault(); select(n, true); }
    });
  });
  select(tabs[0]);
})();

// Contact form
(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var status = document.getElementById('form-status');
  var interest = form.querySelector('#interest');

  // Pre-select the topic from links like contact.html?interest=catalyst
  try {
    var q = new URLSearchParams(window.location.search).get('interest');
    if (q && interest && interest.querySelector('option[value="' + q + '"]')) interest.value = q;
  } catch (e) {}

  function show(kind, msg) {
    status.className = 'form-status show ' + kind;
    status.textContent = msg;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    if (form.querySelector('[name="_gotcha"]').value) return; // spam trap

    var endpoint = form.getAttribute('action') || '';
    var to = form.getAttribute('data-email');
    var data = new FormData(form);

    // Until a real Formspree form ID is set, open the visitor's email app instead.
    if (endpoint.indexOf('YOUR_FORM_ID') !== -1) {
      var topic = interest.options[interest.selectedIndex].text;
      var body = 'Name: ' + data.get('name') + '\nCompany: ' + (data.get('company') || '') +
        '\nRole: ' + (data.get('role') || '') + '\nPhone: ' + (data.get('phone') || '') +
        '\nTopic: ' + topic + '\n\n' + data.get('message');
      window.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('Website enquiry: ' + topic) +
        '&body=' + encodeURIComponent(body);
      show('info', 'Your email app should open with this message filled in. If it does not, write to ' + to + ' or call +91 89207 74814.');
      return;
    }

    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Sending…';
    fetch(endpoint, { method: 'POST', body: data, headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('status ' + r.status);
        form.reset();
        show('ok', 'Message sent. We will be in touch soon.');
      })
      .catch(function () {
        show('err', 'The message did not go through. Email ' + to + ' or call +91 89207 74814 and we will pick it up from there.');
      })
      .then(function () { btn.disabled = false; btn.textContent = 'Send message'; });
  });
})();
