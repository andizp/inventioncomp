// dashboard.js
// - listens for 'session-ready' event (or uses existing window.__SESSION_USER)
// - if user.role === 'admin' injects admin nav items, quick action, and loads announcements

(function () {
  const $ = sel => document.querySelector(sel);

  function injectAdminUI(user) {
    if (!user || user.role !== 'admin') return;

    // inject nav admin links (append a single li)
    const ul = $('.nav-list');
    if (ul) {
      // avoid duplicate insertion
      if (!ul.querySelector('.admin-group')) {
        const li = document.createElement('li');
        li.className = 'nav-item admin-group';
        li.setAttribute('role','none');
        li.innerHTML = `
          <a class="nav-link" href="/admin/data" role="menuitem">Semua Data</a>
          <a class="nav-link" href="/admin/users" role="menuitem">Kelola User</a>
          <a class="nav-link" href="/admin/add-content" role="menuitem">Tambah Konten</a>
        `;
        ul.appendChild(li);
      }
    }

    // add admin quick action in dashboard area
    const qa = $('#quickActions');
    if (qa && !qa.querySelector('.admin-quick-action')) {
      const adminBtn = document.createElement('a');
      adminBtn.className = 'action-btn admin-quick-action';
      adminBtn.href = '/admin/data';
      adminBtn.textContent = 'Kelola Semua Data';
      qa.appendChild(adminBtn);
    }

    // fetch announcements for admin-announcement area (optional)
    fetch('/api/announcements').then(r => r.ok ? r.json() : null).then(arr => {
      if (Array.isArray(arr) && arr.length) {
        const area = $('#adminAnnouncement');
        if (area) {
          area.innerHTML = arr.map(a => `<article class="announcement"><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.body)}</p></article>`).join('');
        }
      }
    }).catch(()=>{/* ignore errors */});
  }

  // small safe escape to avoid accidental injection if API returns HTML
  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // handler for session-ready event
  function onSessionReady(e) {
    const user = (e && e.detail) ? e.detail : window.__SESSION_USER || null;
    injectAdminUI(user);
  }

  // if session already fetched by header-footer, use it immediately
  if (typeof window.__SESSION_USER !== 'undefined') {
    injectAdminUI(window.__SESSION_USER);
  }

  // also listen for future session-ready events
  document.addEventListener('session-ready', onSessionReady);
})();

// /scripts/dashboard.js
// Hero slider minimal: autoplay, prev/next, dots, swipe

(function () {
  function initHeroSlider(selector = '#heroSlider') {
    const root = document.querySelector(selector);
    if (!root) return;

    const slidesWrap = root.querySelector('.slides');
    const slides = Array.from(root.querySelectorAll('.slide'));
    const prevBtn = root.querySelector('.slider-btn.prev');
    const nextBtn = root.querySelector('.slider-btn.next');
    const dotsWrap = root.querySelector('.slider-dots');

    if (!slides.length) return;

    // create dots
    slides.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.index = i;
      if (i === 0) btn.classList.add('active');
      dotsWrap.appendChild(btn);
    });

    const dots = Array.from(dotsWrap.querySelectorAll('button'));
    let idx = 0;
    let animating = false;
    const total = slides.length;

    // move to index
    function goTo(n, instant = false) {
      if (animating) return;
      if (n < 0) n = total - 1;
      if (n >= total) n = 0;
      idx = n;
      const x = - idx * 100;
      if (instant) {
        slidesWrap.style.transition = 'none';
      } else {
        slidesWrap.style.transition = '';
      }
      slidesWrap.style.transform = `translateX(${x}%)`;
      dots.forEach(d => d.classList.remove('active'));
      if (dots[idx]) dots[idx].classList.add('active');
      if (instant) {
        // force reflow then re-enable transition
        void slidesWrap.offsetWidth;
        slidesWrap.style.transition = '';
      }
    }

    // next/prev
    function next() { goTo(idx + 1); }
    function prev() { goTo(idx - 1); }

    nextBtn && nextBtn.addEventListener('click', next);
    prevBtn && prevBtn.addEventListener('click', prev);

    // dot clicks
    dots.forEach(d => d.addEventListener('click', (e) => {
      const i = Number(e.currentTarget.dataset.index);
      goTo(i);
    }));

    // autoplay
    const autoplayAttr = root.dataset.autoplay;
    const interval = parseInt(root.dataset.interval, 10) || 4000;
    let timer = null;
    function startAutoplay() {
      if (autoplayAttr === 'false') return;
      stopAutoplay();
      timer = setInterval(next, interval);
    }
    function stopAutoplay() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    root.addEventListener('mouseenter', stopAutoplay);
    root.addEventListener('mouseleave', startAutoplay);

    // basic touch support (swipe)
    let startX = null;
    let currentX = null;
    let isTouching = false;

    slidesWrap.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length > 1) return;
      isTouching = true;
      startX = e.touches[0].clientX;
      currentX = startX;
      slidesWrap.style.transition = 'none';
      stopAutoplay();
    }, {passive: true});

    slidesWrap.addEventListener('touchmove', (e) => {
      if (!isTouching) return;
      currentX = e.touches[0].clientX;
      const dx = currentX - startX;
      const percent = (dx / root.clientWidth) * 100;
      const base = -idx * 100;
      slidesWrap.style.transform = `translateX(${base + percent}%)`;
    }, {passive: true});

    slidesWrap.addEventListener('touchend', () => {
      if (!isTouching) return;
      isTouching = false;
      const dx = currentX - startX;
      slidesWrap.style.transition = '';
      if (Math.abs(dx) > 40) {
        if (dx < 0) next(); else prev();
      } else {
        goTo(idx, false);
      }
      startAutoplay();
    });

    // keyboard left/right when slider focused
    root.tabIndex = 0;
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    });

    // init
    goTo(0, true);
    startAutoplay();
  }

  // init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initHeroSlider());
  } else {
    initHeroSlider();
  }
})();

(async function(){
  async function loadContents(){
    try {
      const res = await fetch('/api/contents');
      if(!res.ok) return;
      const data = await res.json();
      const container = document.getElementById('dashboardContents');
      if(!container) return;
      container.innerHTML = data.map(item => {
        return `
          <article class="card" data-id="${item.id}" data-title="${escapeHtml(item.title)}" data-desc="${escapeHtml(item.description||'')}" data-img="${item.imageUrl||''}">
            ${item.imageUrl ? `<div class="card-image"><img src="${item.imageUrl}" alt="${escapeHtml(item.title)}"></div>` : ''}
            <div class="card-body">
              <h4 class="card-title">${escapeHtml(item.title)}</h4>
              <p class="card-excerpt">${escapeHtml((item.description||'').slice(0,150))}${(item.description && item.description.length>150)?'...':''}</p>
            </div>
          </article>
        `;
      }).join('');
      // attach click handlers
      // attach click handlers -> buka halaman konten penuh (bukan modal)
      document.querySelectorAll('.card').forEach(c => {
        c.addEventListener('click', ()=> {
          const id = c.dataset.id;
          if (id) {
            // redirect ke route server /content/:id
            window.location.href = '/content/' + encodeURIComponent(id);
          }
        });
      });
    } catch(e){ console.error(e); }
  }
  function escapeHtml(s){
    if(!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  document.getElementById('closeModal').addEventListener('click', ()=> { document.getElementById('contentModal').style.display='none'; });
  // close modal on outside click
  document.getElementById('contentModal').addEventListener('click', (e)=> {
    if(e.target === document.getElementById('contentModal')) document.getElementById('contentModal').style.display='none';
  });

  loadContents();
})();
