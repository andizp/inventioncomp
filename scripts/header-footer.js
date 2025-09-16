// scripts/header-footer.js
// robust header/footer helper: wait for DOM, support fallbacks, idempotent admin inject,
// expose session as window.__SESSION_USER and dispatch 'session-ready'.

(function () {
  // helper
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const safeText = s => (s === undefined || s === null) ? '' : String(s);

  // run after DOM ready
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(() => {
    // find nav elements with fallbacks
    const navToggle = $('#navToggle') || document.querySelector('.hamburger');
    const primaryNav = $('#primaryNav') || document.querySelector('nav.primary') || document.querySelector('nav');
    // ensure ul.nav-list exists
    let navList = primaryNav ? primaryNav.querySelector('.nav-list') : null;
    if (!navList && primaryNav) {
      // try to create an ul if nav has links but no ul
      const links = primaryNav.querySelectorAll('a');
      if (links.length) {
        navList = document.createElement('ul');
        navList.className = 'nav-list';
        // wrap existing anchors into li (non-destructive fallback)
        links.forEach(a => {
          const li = document.createElement('li');
          li.appendChild(a.cloneNode(true));
          navList.appendChild(li);
        });
        primaryNav.innerHTML = '';
        primaryNav.appendChild(navList);
      }
    }

    // nav toggle behavior
    if (navToggle && primaryNav) {
      navToggle.addEventListener('click', () => {
        const open = primaryNav.classList.toggle('open');
        try { navToggle.setAttribute('aria-expanded', open ? 'true' : 'false'); } catch(e){}
      });
      window.addEventListener('resize', () => {
        if (window.innerWidth > 900) primaryNav.classList.remove('open');
      });
    }

    // helper to show/hide guest vs logged-in UI (supports multiple markup variants)
    function showLoggedIn(user) {
      // elements expected in your header; provide fallbacks by creating minimal ones if missing
      let guestEl = $('#guestLinks');
      let loggedEl = $('#loggedIn');

      // if neither exist, try to create a minimal logged area inside .user-area
      const userArea = document.getElementById('userArea') || document.querySelector('.user-area') || primaryNav?.parentElement;
      if (!guestEl && userArea) {
        // create guest link block
        guestEl = document.createElement('div');
        guestEl.id = 'guestLinks';
        guestEl.className = 'guest-links';
        guestEl.innerHTML = '<a class="btn-link" href="/register.html">Register / Login</a>';
        userArea.appendChild(guestEl);
      }
      if (!loggedEl && userArea) {
        loggedEl = document.createElement('div');
        loggedEl.id = 'loggedIn';
        loggedEl.className = 'logged-in';
        loggedEl.hidden = true;
        loggedEl.innerHTML = `
          <div class="user" id="userProfile" tabindex="0">
            <svg class="user-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20a8 8 0 0116 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span id="userName">User</span>
          </div>
          <a id="logoutBtn" class="btn-logout" href="/logout">Logout</a>
        `;
        userArea.appendChild(loggedEl);
      }

      if (guestEl) { guestEl.hidden = true; guestEl.setAttribute('aria-hidden','true'); }
      if (loggedEl) { loggedEl.hidden = false; loggedEl.setAttribute('aria-hidden','false'); }

      const name = user && (user.username || user.name) ? (user.username || user.name) : 'User';
      const userNameEl = $('#userName') || loggedEl && loggedEl.querySelector('#userName');
      if (userNameEl) userNameEl.textContent = name;

      // inject admin menu if role === 'admin' (idempotent)
      if (user && user.role === 'admin' && navList) {
        if (!navList.querySelector('.admin-group')) {
          const li = document.createElement('li');
          li.className = 'admin-group';
          li.innerHTML = `
            <a class="nav-link" href="/admin/data">Semua Data</a>
            <a class="nav-link" href="/admin/users">Kelola User</a>
            <a class="nav-link" href="/admin/content">Tambah Konten</a>
          `;
          navList.appendChild(li);
        }
      }
    }

    function showGuest() {
      const guestEl = $('#guestLinks');
      const loggedEl = $('#loggedIn');
      if (guestEl) { guestEl.hidden = false; guestEl.setAttribute('aria-hidden','false'); }
      if (loggedEl) { loggedEl.hidden = true; loggedEl.setAttribute('aria-hidden','true'); }
      const welcomeTitleEl = $('#welcomeTitle') || $('#welcomeTitleMain');
      if (welcomeTitleEl) welcomeTitleEl.textContent = 'Selamat datang, tamu';
    }

    // fetch session and broadcast
    function fetchSessionAndBroadcast() {
      fetch('/session', { credentials: 'same-origin' })
        .then(res => {
          if (!res.ok) throw new Error('not authenticated');
          return res.json();
        })
        .then(user => {
          // update header UI
          showLoggedIn(user);
          // expose
          window.__SESSION_USER = user || null;
          // dispatch event
          document.dispatchEvent(new CustomEvent('session-ready', { detail: user || null }));
        })
        .catch(() => {
          showGuest();
          window.__SESSION_USER = null;
          document.dispatchEvent(new CustomEvent('session-ready', { detail: null }));
        });
    }

    // set footer year if exists
    (function setYear(){
      const yearEl = $('#year');
      if (yearEl) yearEl.textContent = new Date().getFullYear();
    })();

    // kick off
    fetchSessionAndBroadcast();

    // expose refresh function
    window.headerFooter = window.headerFooter || {};
    window.headerFooter.refreshSession = fetchSessionAndBroadcast;
  });
})();
