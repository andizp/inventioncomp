// app.js (modified to upload files to Cloudinary)
// NOTE: changes are limited to switching multer to memoryStorage, adding Cloudinary upload helpers,
// and adjusting upload/display/download logic so uploaded files use Cloudinary URLs.
// Other logic and routes are kept unchanged except where required to support Cloudinary.

const express = require ("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const https = require('https');

// import koneksi db yang sudah dipisah
const db = require('./scripts/db.js');

const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const port = process.env.PORT || 3000;

// configure cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_SECRET || ''
});

// Middleware
app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "rahasia_super",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Pastikan folder uploads ada (keberadaan folder tetap dipertahankan untuk kompatibilitas lokal)
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// ----------------- MULTER: use memoryStorage so we can upload buffers to Cloudinary -----------------
const memoryStorage = multer.memoryStorage();
const upload = multer({ storage: memoryStorage });

// ----------------- HELPERS for Cloudinary upload & URL handling -----------------
function uploadBufferToCloudinary(buffer, options = {}){
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

function buildFileUrl(value){
  if(!value) return '';
  // if the stored value already looks like a full URL, return it unchanged
  if(typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) return value;
  // otherwise assume it's a local uploads filename
  return '/uploads/' + encodeURIComponent(String(value));
}

function appendRemoteFileToArchive(archive, remoteUrl, entryName){
  return new Promise((resolve, reject) => {
    try{
      https.get(remoteUrl, (res) => {
        if(res.statusCode && res.statusCode >= 400){
          return resolve(); // skip file on error but don't fail whole archive
        }
        archive.append(res, { name: entryName });
        // resolve when stream 'end' is emitted; but archive.finalize is called later
        res.on('end', () => resolve());
        res.on('error', () => resolve());
      }).on('error', () => resolve());
    }catch(e){
      return resolve();
    }
  });
}

// ----------------- HELPERS -----------------
function isAuthenticated(req, res, next) {
  if (!req.session.userId) return res.redirect("/login.html");
  next();
}

function isAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== "admin") {
    return res.send(`<div class="error-box">Akses ditolak. Hanya admin yang boleh mengakses halaman ini.</div>`);
  }
  next();
}

// --- NEW HELPERS: renderLayout & escapeHtml (for safe templating) ---
function escapeHtml(s){
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderLayout(title, bodyHtml, opts = {}){
  const extraHead = opts.extraHead || '';
  const extraScripts = opts.extraScripts || '';
  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/style/lampiran.css">
    <link rel="stylesheet" href="/style/header-footer.css">
    ${extraHead}
  </head>
  <body>
    <header class="site-header" role="banner">
      <div class="header-inner">
        <a href="/dashboard" class="brand" aria-label="InnoVasi home">
          <div class="logo">I</div>
          <div class="text">InnoVasi</div>
        </a>

        <button id="navToggle" class="hamburger" aria-label="Toggle menu" aria-expanded="false">
          <span class="hamburger-box"><span class="hamburger-inner"></span></span>
        </button>

        <nav id="primaryNav" class="primary" aria-label="Main navigation">
          <ul class="nav-list" role="menubar">
            <li role="none"><a class="nav-link" href="/dashboard" role="menuitem">Dashboard</a></li>
            <li role="none"><a class="nav-link" href="/pendaftaran.html" role="menuitem">Daftar Inovasi</a></li>
            <li role="none"><a class="nav-link" href="/dashboard/data" role="menuitem">Data Inovasi Saya</a></li>
            <!-- admin items will be injected by JS when role === 'admin' -->
          </ul>
        </nav>

        <div class="spacer" aria-hidden="true"></div>

        <div class="user-area" id="userArea">
          <!-- single Register / Login button for guests; JS will replace when logged in -->
          <div id="guestLinks" class="guest-links">
            <a class="btn-link" href="/register.html" role="button">Register / Login</a>
          </div>

          <div id="loggedIn" class="logged-in" hidden>
            <div class="user" id="userProfile" tabindex="0">
              <svg class="user-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M4 20a8 8 0 0116 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span id="userName">User</span>
            </div>
            <a id="logoutBtn" class="btn-logout" href="/logout" title="Logout">
              Logout
            </a>
          </div>
        </div>
      </div>
    </header>
    ${bodyHtml}
    <script src="/scripts/header-footer.js"></script>
    ${extraScripts}
  </body>
  
  </html>`;
}

// ----------------- AUTH ROUTES -----------------

// Registrasi
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.send(`<div class="error-box">Username dan password harus diisi.</div>`);
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  
  db.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], (
    err, result) => {
      if (err) {
        return res.send(`<div class="error-box">Username sudah terdaftar.</div>`);
      }
      res.send(`<div class="success-box">Registrasi berhasil. Silakan <a class="link" href="/login.html">login</a>.</div>`);
  });
});

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.send(`<div class="error-box">Username dan password harus diisi.</div>`);
  }

  db.query("SELECT * FROM users WHERE username = ?", [username], (err, results) => {
    if (err) {
      console.error("Error login:", err);
      return res.send(`<div class="error-box">Terjadi kesalahan saat login.</div>`);
    }

    if (!results.length) {
      return res.send(`<div class="error-box">Username atau password salah.</div>`);
    }

    const user = results[0];
    if (!bcrypt.compareSync(password, user.password)) {
      return res.send(`<div class="error-box">Username atau password salah.</div>`);
    }

    // --- Simpan userId dan role di session ---
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.username = user.username; 

    res.redirect("/dashboard");
  });
});

app.get("/dashboard", isAuthenticated, (req, res) => {
  res.sendFile(__dirname + "/dashboard.html");
});

// --- API untuk ambil data session (kembalikan username juga, aman) ---
app.get("/session", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Belum login" });
  }

  // ambil user real dari DB untuk memastikan data terbaru
  db.query("SELECT id, username, role FROM users WHERE id = ? LIMIT 1", [req.session.userId], (err, results) => {
    if (err) {
      console.error("Error ambil session user:", err);
      return res.status(500).json({ error: "Terjadi kesalahan" });
    }
    if (!results || results.length === 0) {
      return res.status(404).json({ error: "User tidak ditemukan" });
    }

    const user = results[0];
    res.json({
      userId: user.id,
      role: user.role,
      username: user.username
    });
  });
});


// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login.html");
});

// ----------------- FORM PENDAFTARAN -----------------
app.post("/daftar", upload.fields([
  { name: "foto", maxCount: 1 },
  { name: "fotoIdentitas", maxCount: 1 },
  { name: "fotoProduk", maxCount: 10 },
  { name: "legalitas", maxCount: 1 }
]), async (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");

  const data = req.body;
  const files = req.files || {};
  const bidang = Array.isArray(data.bidang) ? data.bidang.join(", ") : data.bidang || null;

  try{
    // upload single files to Cloudinary if present
    let fotoFilename = null;
    if(files.foto && files.foto[0] && files.foto[0].buffer){
      const r = await uploadBufferToCloudinary(files.foto[0].buffer, { folder: 'pendaftaran' });
      fotoFilename = r.secure_url;
    }

    let fotoIdentitasFilename = null;
    if(files.fotoIdentitas && files.fotoIdentitas[0] && files.fotoIdentitas[0].buffer){
      const r = await uploadBufferToCloudinary(files.fotoIdentitas[0].buffer, { folder: 'pendaftaran' });
      fotoIdentitasFilename = r.secure_url;
    }

    let legalitasFilename = null;
    if(files.legalitas && files.legalitas[0] && files.legalitas[0].buffer){
      const r = await uploadBufferToCloudinary(files.legalitas[0].buffer, { folder: 'pendaftaran' });
      legalitasFilename = r.secure_url;
    }

    db.query(
      `INSERT INTO pendaftaran 
        (user_id, nama, email, nomor_hp, indi_kelom, anggota_kelompok, identitas_diri, bidang, nama_produk, latar_belakang, tujuan, uraian, foto, foto_identitas, video_produk, legalitas, inovasi_yang_dihasilkan) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.userId,
        data.namaInovator,
        data.alamatEmail,
        data.nomorHp,
        data.indiKelom,
        data.anggotaKelompok,
        data.identitasDiri,
        bidang,
        data.namaProduk,
        data.latarProduk,
        data.tujuanProduk,
        data.uraianInovasi,
        fotoFilename || null,
        fotoIdentitasFilename || null,
        data.videoProduk || null,
        legalitasFilename || null,
        data.inovasiYangDihasilkan || null
      ],
      async (err, result) => {
        if (err) return res.send(`<div class="error-box">❌ Gagal simpan data: ${err.message}</div>`);

        const pendaftaranId = result.insertId;

        // simpan foto_produk ke tabel terpisah (upload each buffer)
        if (files.fotoProduk && files.fotoProduk.length > 0) {
          for(const file of files.fotoProduk){
            if(file && file.buffer){
              try{
                const r = await uploadBufferToCloudinary(file.buffer, { folder: 'pendaftaran/foto_produk' });
                // store the secure_url into the filename column (keeps DB schema unchanged)
                db.query("INSERT INTO foto_produk (pendaftaran_id, filename) VALUES (?, ?)", [pendaftaranId, r.secure_url]);
              }catch(e){
                console.error('Gagal upload foto produk ke Cloudinary:', e);
              }
            }
          }
        }

        res.send(`<div class="success-box">✅ Data berhasil disimpan. <a href="/dashboard.html">Kembali</a></div>`);
      }
    );
  }catch(e){
    console.error('Upload/DB error:', e);
    return res.send(`<div class="error-box">❌ Gagal proses upload: ${escapeHtml(e.message || String(e))}</div>`);
  }
})

// ----------------- TAMPILAN DATA PENGGUNA (UPDATE: full HTML layout) -----------------
app.get('/dashboard/data', isAuthenticated, (req, res) => {
  db.query('SELECT * FROM pendaftaran WHERE user_id = ?', [req.session.userId], (err, rows) => {
    if (err) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Error ambil data: ${escapeHtml(err.message)}</div></div>`));

    if (!rows || rows.length === 0) {
      const body = `
        <div class="page">
          <div class="no-data-box">
            <h2 class="heading">Belum ada data pendaftaran</h2>
            <div style="margin-top:8px">
              <a class="btn-link" href="/pendaftaran.html">Daftar Inovasi</a>
              <span style="margin:0 8px;color:var(--muted)">&nbsp;|&nbsp;</span>
              <a class="btn-link" href="/dashboard.html">Kembali ke Dashboard</a>
            </div>
          </div>
        </div>
      `;
      return res.send(renderLayout('Data Pendaftaran', body));
    }

    const rowsHtml = rows.map(row => `
      <tr class="table-row">
        <td class="table-cell">${escapeHtml(row.nama)}</td>
        <td class="table-cell">${escapeHtml(row.email)}</td>
        <td class="table-cell">${escapeHtml(row.nomor_hp)}</td>
        <td class="table-cell">${escapeHtml(row.indi_kelom)}</td>
        <td class="table-cell">${escapeHtml(row.anggota_kelompok || '-')}</td>
        <td class="table-cell">${escapeHtml(row.identitas_diri || '-')}</td>
        <td class="table-cell">${escapeHtml(row.bidang || '-')}</td>
        <td class="table-cell">${escapeHtml(row.nama_produk || '-')}</td>
        <td class="table-cell">${escapeHtml(row.latar_belakang || '-')}</td>
        <td class="table-cell">${escapeHtml(row.tujuan || '-')}</td>
        <td class="table-cell">${escapeHtml(row.uraian || '-')}</td>
        <td class="table-cell">${escapeHtml(row.inovasi_yang_dihasilkan || '-')}</td>
        <td class="table-cell"><a class="btn-link" href="/lampiran/${row.id}">Lihat Lampiran</a></td>
        <td class="table-cell">
          <a class="btn-edit" href="/edit/${row.id}">Edit<img src="/pictures/icon/icons8-edit-50 (2).png" alt=""></a><br>
          <a class="btn-delete" href="/delete/${row.id}" onclick="return confirm('Yakin mau hapus data ini?')">Delete<img src="/pictures/icon/icons8-delete-50.png"></a>
        </td>
      </tr>
    `).join('\n');

    const body = `
      <div class="page">
        <h2 class="heading">Data Pendaftaran Anda</h2>
        <div class="table-responsive">
          <table class="data-table" border="1" cellpadding="8">
            <thead class="table-head">
              <tr class="table-row">
                <th class="table-head-cell">Nama</th>
                <th class="table-head-cell">Email</th>
                <th class="table-head-cell">Nomor HP</th>
                <th class="table-head-cell">Individu/Kelompok</th>
                <th class="table-head-cell">Anggota Kelompok</th>
                <th class="table-head-cell">Identitas</th>
                <th class="table-head-cell">Bidang</th>
                <th class="table-head-cell">Nama Produk</th>
                <th class="table-head-cell">Latar Belakang</th>
                <th class="table-head-cell">Tujuan</th>
                <th class="table-head-cell">Uraian</th>
                <th class="table-head-cell">Inovasi Dihasilkan</th>
                <th class="table-head-cell">Lampiran</th>
                <th class="table-head-cell">Aksi</th>
              </tr>
            </thead>
            <tbody class="table-body">
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <br>
        <a class="btn-link" href="/dashboard.html">Kembali ke Dashboard</a>
      </div>

      <script>
        // add data-label attributes to each td (useful if you switch to stacked cards)
        (function(){
          try{
            const table = document.querySelector('.data-table');
            if(!table) return;
            const headers = Array.from(table.querySelectorAll('thead th')).map(h=>h.textContent.trim());
            table.querySelectorAll('tbody tr').forEach(tr=>{
              tr.querySelectorAll('td').forEach((td,i)=> td.setAttribute('data-label', headers[i]||''));
            });
          }catch(e){console.error(e)}
        })();
      </script>
    `;

    res.send(renderLayout('Data Pendaftaran', body));
  });
});

// ------------------ LIHAT LAMPIRAN (user) -----------------
app.get('/lampiran/:id', isAuthenticated, (req, res) => {
  const id = req.params.id;

  db.query("SELECT * FROM pendaftaran WHERE id = ? AND user_id = ?", [id, req.session.userId], (err, rows) => {
    if (err || !rows || rows.length === 0) {
      return res.send(renderLayout('Lampiran - Error', `<div class="page"><div class="error-box">Data tidak ditemukan.</div></div>`));
    }

    const row = rows[0];

    // Ambil semua foto produk dari tabel foto_produk
    db.query("SELECT filename, id FROM foto_produk WHERE pendaftaran_id = ?", [id], (err2, fotos) => {
      if (err2) return res.send(renderLayout('Lampiran - Error', `<div class="page"><div class="error-box">Gagal ambil foto produk.</div></div>`));

      function renderPreview(filename, label = "") {
        if (!filename) return "";
        const ext = path.extname(filename).toLowerCase();
        const url = buildFileUrl(filename);

        const imgExt = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
        const videoExt = [".mp4", ".webm", ".ogg"];
        if (imgExt.includes(ext) || url.startsWith('http')) {
          return `<div class="lampiran-item">${label ? `<div class="file-label">${escapeHtml(label)}</div>` : ""}<img class="lampiran-img" src="${url}" alt="${escapeHtml(label || filename)}"></div>`;
        } else if (videoExt.includes(ext)) {
          return `<div class="lampiran-item">${label ? `<div class="file-label">${escapeHtml(label)}</div>` : ""}<video class="media-preview" controls><source src="${url}">Browser Anda tidak mendukung video.</video></div>`;
        } else if (ext === ".pdf") {
          return `<div class="lampiran-item">${label ? `<div class="file-label">${escapeHtml(label)}</div>` : ""}<a class="file-link" href="${url}" target="_blank">Lihat PDF (${escapeHtml(filename)})</a></div>`;
        } else {
          return `<div class="lampiran-item">${label ? `<div class="file-label">${escapeHtml(label)}</div>` : ""}<a class="file-link" href="${url}" download>Unduh ${escapeHtml(filename)}</a></div>`;
        }
      }

      // Foto produk (bisa banyak)
      let fotoProdukHTML = "";
      if (fotos.length > 0) {
        fotos.forEach((f, idx) => {
          fotoProdukHTML += renderPreview(f.filename, `Foto Produk ${idx + 1}`);
        });
      } else {
        fotoProdukHTML = `<p>Tidak ada foto produk</p>`;
      }

      // file lainnya (identitas, legalitas, pas foto)
      const fotoIdentitasHTML = row.foto_identitas ? renderPreview(row.foto_identitas, "Foto Identitas") : "-";
      const legalitasHTML = row.legalitas ? renderPreview(row.legalitas, "Legalitas") : "-";
      const pasFotoHTML = row.foto ? renderPreview(row.foto, "Pas Foto") : "-";
      const videoProdukHTML = row.video_produk ? `<div class="lampiran-item"><div class="file-label">Video (Link)</div><a class="file-link" href="${escapeHtml(row.video_produk)}" target="_blank">Tonton di YouTube</a></div>` : "-";

      const body = `
        <div class="page">
          <h2 class="heading">Lampiran untuk ${escapeHtml(row.nama_produk || "-")}</h2>

          <h3 class="subheading">Foto Produk</h3>
          <div class="lampiran-grid">
            ${fotoProdukHTML}
          </div>

          <h3 class="subheading">Foto Identitas</h3>
          <div class="lampiran-grid">
            ${fotoIdentitasHTML}
          </div>

          <h3 class="subheading">Legalitas</h3>
          <div class="lampiran-grid">
            ${legalitasHTML}
          </div>

          <h3 class="subheading">Pas Foto</h3>
          <div class="lampiran-grid">
            ${pasFotoHTML}
          </div>

          <h3 class="subheading">Video Produk</h3>
          <div class="lampiran-grid">
            ${videoProdukHTML}
          </div>

          <br><br>
          <a class="btn-link" href="/dashboard/data">Kembali ke Data Pendaftaran</a> |
          <a class="btn-link" href="/download/${row.id}">⬇️ Download Semua Lampiran</a>
        </div>
      `;

      res.send(renderLayout(`Lampiran - ${row.nama_produk || "-"}`, body, {
        extraHead: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css"/>`,
        extraScripts: `<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>`
      }));
    });
  });
});

// ----------------- Download ZIP (user) -----------------
app.get("/download/:id", isAuthenticated, (req, res) => {
  const id = req.params.id;

  db.query("SELECT * FROM pendaftaran WHERE id = ? AND user_id = ?", [id, req.session.userId], (err, rows) => {
    if (err || !rows || rows.length === 0) return res.send(`<div class="error-box">Data tidak ditemukan</div>`);

    const row = rows[0];

    db.query("SELECT filename FROM foto_produk WHERE pendaftaran_id = ?", [id], async (err2, fotos) => {
      if (err2) return res.send(`<div class="error-box">Gagal ambil foto produk</div>`);

      // Set header ZIP
      res.setHeader("Content-Disposition", `attachment; filename=lampiran_${id}.zip`);
      res.setHeader("Content-Type", "application/zip");

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      // Pas foto (if local file exists include; if URL, fetch remote and append)
      const tasks = [];
      if (row.foto) {
        if (String(row.foto).startsWith('http')){
          tasks.push(appendRemoteFileToArchive(archive, row.foto, `Pas_Foto${path.extname(row.foto) || '.jpg'}`));
        } else {
          const local = path.join(__dirname, 'uploads', row.foto);
          if(fs.existsSync(local)) archive.file(local, { name: `Pas_Foto_${row.foto}` });
        }
      }

      if (row.foto_identitas) {
        if (String(row.foto_identitas).startsWith('http')){
          tasks.push(appendRemoteFileToArchive(archive, row.foto_identitas, `Foto_Identitas${path.extname(row.foto_identitas) || '.jpg'}`));
        } else {
          const local = path.join(__dirname, 'uploads', row.foto_identitas);
          if(fs.existsSync(local)) archive.file(local, { name: `Foto_Identitas_${row.foto_identitas}` });
        }
      }

      if (row.legalitas) {
        if (String(row.legalitas).startsWith('http')){
          tasks.push(appendRemoteFileToArchive(archive, row.legalitas, `Legalitas${path.extname(row.legalitas) || '.pdf'}`));
        } else {
          const local = path.join(__dirname, 'uploads', row.legalitas);
          if(fs.existsSync(local)) archive.file(local, { name: `Legalitas_${row.legalitas}` });
        }
      }

      // Semua foto produk
      for(const f of fotos){
        const filename = f.filename;
        if(!filename) continue;
        if(String(filename).startsWith('http')){
          tasks.push(appendRemoteFileToArchive(archive, filename, `Foto_Produk_${path.basename(filename)}`));
        } else {
          const local = path.join(__dirname, 'uploads', filename);
          if(fs.existsSync(local)) archive.file(local, { name: `Foto_Produk_${filename}` });
        }
      }

      // wait all remote append tasks (they resolve even if they skip)
      Promise.all(tasks).then(()=>{
        archive.finalize();
      }).catch(()=> archive.finalize());
    });
  });
});

// ----------------- EDIT DATA (GET FORM) (UPDATE: full HTML layout) -----------------
app.get('/edit/:id', isAuthenticated, (req, res) => {
  const id = req.params.id;
  const userId = req.session.userId;

  // Ambil data pendaftaran + foto produk
  db.query("SELECT * FROM pendaftaran WHERE id = ? AND user_id = ?", [id, userId], (err, rows) => {
    if (err) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Terjadi kesalahan: ${escapeHtml(err.message)}</div></div>`));
    if (!rows || rows.length === 0)
      return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Data tidak ditemukan atau Anda tidak berhak mengedit</div></div>`));

    const row = rows[0];

    // Ambil semua foto produk
    db.query("SELECT * FROM foto_produk WHERE pendaftaran_id = ?", [id], (err2, fotos) => {
      if (err2) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal ambil foto produk: ${escapeHtml(err2.message)}</div></div>`));

      // --- Bidang: pecah jadi array ---
      let bidangText = [];
      if (row.bidang) bidangText = row.bidang.split(",").map(b => b.trim());

      const semuaBidang = [
        "Pertanian dan pangan",
        "Energi",
        "Lingkungan Hidup",
        "Kesehatan, Obat-obatan, dan Kosmetika",
        "Pendidikan",
        "Rekayasa dan Manufaktur",
        "Kerajinan dan Industri Rumah Tangga",
        "Sosial, Budaya, dan Seni"
      ];

      const bidangCheckboxHTML = semuaBidang.map(bidang => {
        const checked = bidangText.includes(bidang) ? "checked" : "";
        return `<label style="display:block;margin-bottom:6px"><input class="form-checkbox" type="checkbox" name="bidang[]" value="${escapeHtml(bidang)}" ${checked}> ${escapeHtml(bidang)}</label>`;
      }).join("\n");

      // HTML untuk foto produk yang sudah ada
      const fotoProdukHTML = fotos.map(f =>
        `<div class="current-file">
          <img class="thumb" src="${buildFileUrl(f.filename)}" width="100" alt="foto produk">
          <a class="btn-delete" href="/lampiran/delete/${f.id}" onclick="return confirm('Hapus foto ini?')">Hapus</a>
        </div>`
      ).join("");

      // --- Render form edit ---
      const body = `
        <div class="page">
          <h2 class="heading">Edit Data Pendaftaran</h2>
          <form class="edit-form" method="POST" action="/edit/${row.id}" enctype="multipart/form-data">
            
            <section class="section identitas">
              <h3 class="subheading">Identitas Inovator</h3>
              <label class="form-label">Nama Inovator</label>
              <input class="form-input" type="text" name="namaInovator" value="${escapeHtml(row.nama)}" required>

              <label class="form-label">Alamat Email</label>
              <input class="form-input" type="email" name="alamatEmail" value="${escapeHtml(row.email)}" required>

              <label class="form-label">Nomor HP/WA</label>
              <input class="form-input" type="text" name="nomorHp" value="${escapeHtml(row.nomor_hp)}" required>

              <label class="form-label">Individu atau Kelompok</label>
              <select class="form-select" name="indiKelom">
                <option value="Individu" ${row.indi_kelom === 'Individu' ? 'selected' : ''}>Individu</option>
                <option value="Kelompok" ${row.indi_kelom === 'Kelompok' ? 'selected' : ''}>Kelompok</option>
              </select>

              <label class="form-label">Anggota Kelompok</label>
              <input class="form-input" type="text" name="anggotaKelompok" value="${escapeHtml(row.anggota_kelompok || '')}">

              <label class="form-label">Identitas Diri</label>
              <select class="form-select" name="identitasDiri">
                <option value="KTP" ${row.identitas_diri === 'KTP' ? 'selected' : ''}>KTP</option>
                <option value="Kartu Mahasiswa" ${row.identitas_diri === 'Kartu Mahasiswa' ? 'selected' : ''}>Kartu Mahasiswa</option>
                <option value="Surat Keterangan Domisili" ${row.identitas_diri === 'Surat Keterangan Domisili' ? 'selected' : ''}>Surat Keterangan Domisili</option>
              </select>

              <label class="form-label">Upload Identitas Diri (opsional)</label>
              <input class="form-input" type="file" name="fotoIdentitas">
              ${row.foto_identitas ? `<div class="current-file">File saat ini: <img class="thumb" src="${buildFileUrl(row.foto_identitas)}" width="100" alt="identitas"></div>` : ''}
            </section>

            <section class="section profil">
              <h3 class="subheading">Profil Inovasi</h3>
              <label class="form-label">Bidang Inovasi</label>
              ${bidangCheckboxHTML}

              <label class="form-label">Judul/Nama Produk</label>
              <input class="form-input" type="text" name="namaProduk" value="${escapeHtml(row.nama_produk || '')}">

              <label class="form-label">Latar Belakang</label>
              <input class="form-input" type="text" name="latarProduk" value="${escapeHtml(row.latar_belakang || '')}">

              <label class="form-label">Tujuan</label>
              <input class="form-input" type="text" name="tujuanProduk" value="${escapeHtml(row.tujuan || '')}">

              <label class="form-label">Uraikan Inovasi</label>
              <input class="form-input" type="text" name="uraianInovasi" value="${escapeHtml(row.uraian || '')}">
            </section>

            <section class="section pendukung">
              <h3 class="subheading">Data Pendukung</h3>

              <label class="form-label">Pas Foto (opsional)</label>
              <input class="form-input" type="file" name="foto">
              ${row.foto ? `<div class="current-file">File saat ini: <img class="thumb" src="${buildFileUrl(row.foto)}" width="100" alt="pas foto"></div>` : ''}

              <br>

              <label class="form-label">Foto Produk (opsional)</label>
              <input class="form-input" type="file" name="fotoProduk" multiple>
              ${fotoProdukHTML}

              <br>

              <label class="form-label">Video Produk (Link YouTube)</label>
              <input class="form-input" type="text" name="videoProduk" value="${escapeHtml(row.video_produk || '')}">

              <label class="form-label">Legalitas (opsional)</label>
              <input class="form-input" type="file" name="legalitas">
              ${row.legalitas ? `<div class="current-file">File saat ini: <a class="link" href="${buildFileUrl(row.legalitas)}" target="_blank">${escapeHtml(row.legalitas)}</a></div>` : ''}

              <label class="form-label">Inovasi yang Dihasilkan</label>
              <select class="form-select" name="inovasiYangDihasilkan">
                <option value="Sudah Dikomersilkan/Dipasarkan" ${row.inovasi_yang_dihasilkan === 'Sudah Dikomersilkan/Dipasarkan' ? 'selected' : ''}>Sudah Dikomersilkan/Dipasarkan</option>
                <option value="Digunakan Hanya dalam Kelompok/Komunitas" ${row.inovasi_yang_dihasilkan === 'Digunakan Hanya dalam Kelompok/Komunitas' ? 'selected' : ''}>Digunakan Hanya dalam Kelompok/Komunitas</option>
                <option value="Prototipe/Rancangan" ${row.inovasi_yang_dihasilkan === 'Prototipe/Rancangan' ? 'selected' : ''}>Prototipe/Rancangan</option>
              </select>

              <div style="margin-top:12px">
                <button type="submit">Update Data</button>
                <a class="btn-link" href="/dashboard/data" style="margin-left:12px">Batal</a>
              </div>
            </section>
          </form>
        </div>
      `;

      res.send(renderLayout('Edit Pendaftaran', body));
    });
  });
});

// Hapus satu foto produk (diklik dari edit / lampiran)
app.get('/lampiran/delete/:id', isAuthenticated, (req, res) => {
  const fotoId = req.params.id;

  // 1) ambil record foto_produk dulu
  db.query('SELECT * FROM foto_produk WHERE id = ?', [fotoId], (err, fotoRows) => {
    if (err) {
      console.error('Error ambil foto_produk:', err);
      return res.send(`<div class="error-box">Gagal ambil data foto: ${escapeHtml(err?.message || err)}</div>`);
    }
    if (!fotoRows || fotoRows.length === 0) {
      return res.send(`<div class="error-box">Foto tidak ditemukan.</div>`);
    }

    const foto = fotoRows[0];
    const pendaftaranId = foto.pendaftaran_id;
    const filename = foto.filename;

    // 2) cek kepemilikan pendaftaran (agar user tidak bisa hapus foto orang lain)
    db.query('SELECT user_id FROM pendaftaran WHERE id = ?', [pendaftaranId], (err2, pdRows) => {
      if (err2) {
        console.error('Error ambil pendaftaran:', err2);
        return res.send(`<div class="error-box">Gagal verifikasi pemilik data.</div>`);
      }
      if (!pdRows || pdRows.length === 0) {
        return res.send(`<div class="error-box">Data pendaftaran terkait tidak ditemukan.</div>`);
      }

      const ownerId = pdRows[0].user_id;

      // hanya pemilik atau admin yang boleh hapus
      if (req.session.userId !== ownerId && req.session.role !== 'admin') {
        return res.send(`<div class="error-box">Anda tidak berhak menghapus foto ini.</div>`);
      }

      // 3) hapus row dari foto_produk
      db.query('DELETE FROM foto_produk WHERE id = ?', [fotoId], (err3, result) => {
        if (err3) {
          console.error('Error hapus foto_produk:', err3);
          return res.send(`<div class="error-box">Gagal hapus foto: ${escapeHtml(err3.message)}</div>`);
        }

        // 4) kalau file ada di local, hapus fisik. Jika file adalah URL Cloudinary, kita skip physical unlink
        if (filename && !String(filename).startsWith('http')) {
          const filePath = path.join(__dirname, 'uploads', filename);
          if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (unlinkErr) => {
              if (unlinkErr) console.error('Gagal hapus file fisik:', unlinkErr);
              const back = req.get('Referer') || (req.session.role === 'admin' ? `/admin/lampiran/${pendaftaranId}` : `/edit/${pendaftaranId}`);
              return res.redirect(back);
            });
            return; // jangan redirect dua kali
          }
        }

        // jika file tidak ditemukan atau tidak perlu dihapus, langsung redirect
        const back = req.get('Referer') || (req.session.role === 'admin' ? `/admin/lampiran/${pendaftaranId}` : `/edit/${pendaftaranId}`);
        return res.redirect(back);
      });
    });
  });
});

// ----------------- EDIT DATA (POST SAVE) -----------------
app.post("/edit/:id", upload.fields([
  { name: "foto", maxCount: 1 },
  { name: "fotoIdentitas", maxCount: 1 },
  { name: "fotoProduk", maxCount: 10 }, // allow multiple
  { name: "legalitas", maxCount: 1 }
]), isAuthenticated, async (req, res) => {
  const data = req.body;
  const files = req.files || {};
  const id = req.params.id;

  // --- Bidang ---
  let bidang = "";
  if (data.bidang) {
    if (Array.isArray(data.bidang)) {
      bidang = data.bidang.map(b => b.trim()).join(", ");
    } else {
      bidang = data.bidang.trim();
    }
  }

  try{
    const foto = files.foto ? (files.foto[0] ? files.foto[0].buffer : undefined) : undefined;
    const fotoIdentitas = files.fotoIdentitas ? (files.fotoIdentitas[0] ? files.fotoIdentitas[0].buffer : undefined) : undefined;
    const newFotoProdukBuffers = files.fotoProduk ? files.fotoProduk.map(f => f.buffer) : [];
    const legalitasBuf = files.legalitas ? (files.legalitas[0] ? files.legalitas[0].buffer : undefined) : undefined;

    let fotoFilename = undefined;
    if(foto){
      const r = await uploadBufferToCloudinary(foto, { folder: 'pendaftaran' });
      fotoFilename = r.secure_url;
    }
    let fotoIdentitasFilename = undefined;
    if(fotoIdentitas){
      const r = await uploadBufferToCloudinary(fotoIdentitas, { folder: 'pendaftaran' });
      fotoIdentitasFilename = r.secure_url;
    }
    let legalitasFilename = undefined;
    if(legalitasBuf){
      const r = await uploadBufferToCloudinary(legalitasBuf, { folder: 'pendaftaran' });
      legalitasFilename = r.secure_url;
    }

    const newFotoProduk = [];
    if(newFotoProdukBuffers.length > 0){
      for(const buf of newFotoProdukBuffers){
        if(buf){
          try{
            const r = await uploadBufferToCloudinary(buf, { folder: 'pendaftaran/foto_produk' });
            newFotoProduk.push(r.secure_url);
          }catch(e){ console.error('Gagal upload foto produk baru:', e); }
        }
      }
    }

    // --- Update data utama pendaftaran ---
    const setClauses = [
      "nama = ?",
      "email = ?",
      "nomor_hp = ?",
      "indi_kelom = ?",
      "anggota_kelompok = ?",
      "identitas_diri = ?",
      "bidang = ?",
      "nama_produk = ?",
      "latar_belakang = ?",
      "tujuan = ?",
      "uraian = ?"
    ];

    const params = [
      data.namaInovator,
      data.alamatEmail,
      data.nomorHp,
      data.indiKelom,
      data.anggotaKelompok,
      data.identitasDiri,
      bidang,
      data.namaProduk,
      data.latarProduk,
      data.tujuanProduk,
      data.uraianInovasi
    ];

    if (fotoFilename) {
      setClauses.push("foto = ?");
      params.push(fotoFilename);
    }
    if (fotoIdentitasFilename) {
      setClauses.push("foto_identitas = ?");
      params.push(fotoIdentitasFilename);
    }
    if (legalitasFilename) {
      setClauses.push("legalitas = ?");
      params.push(legalitasFilename);
    }

    setClauses.push("video_produk = ?");
    params.push(data.videoProduk || null);

    setClauses.push("inovasi_yang_dihasilkan = ?");
    params.push(data.inovasiYangDihasilkan || null);

    params.push(id, req.session.userId);

    const sql = `UPDATE pendaftaran SET ${setClauses.join(", ")} WHERE id = ? AND user_id = ?`;

    db.query(sql, params, (err) => {
      if (err) {
        return res.send(`<div class="error-box">Gagal update data: ${err.message}</div>`);
      }

      // --- Tambah foto produk baru ke tabel foto_produk ---
      if (newFotoProduk.length > 0) {
        const values = newFotoProduk.map(fn => [id, fn]);
        db.query("INSERT INTO foto_produk (pendaftaran_id, filename) VALUES ?", [values], (err2) => {
          if (err2) return res.send(`<div class="error-box">Data update tapi gagal simpan foto baru: ${err2.message}</div>`);
          res.send(`<div class="success-box">Data berhasil diupdate dan foto baru ditambahkan. <a class="link" href="/dashboard/data">Kembali ke Data Pendaftaran</a></div>`);
        });
      } else {
        res.send(`<div class="success-box">Data berhasil diupdate. <a class="link" href="/dashboard/data">Kembali ke Data Pendaftaran</a></div>`);
      }
    });
  }catch(e){
    console.error('Edit upload error:', e);
    return res.send(`<div class="error-box">Gagal proses upload: ${escapeHtml(e.message || String(e))}</div>`);
  }
});

// ------------------ LIHAT SEMUA DATA (ADMIN) (UPDATE: full HTML layout) -----------------
app.get('/admin/data', isAdmin, (req, res) => {
  const sql = `
    SELECT p.*, u.username 
    FROM pendaftaran p 
    JOIN users u ON p.user_id = u.id
    ORDER BY p.id DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Error ambil data: ${escapeHtml(err.message)}</div></div>`));
    if (!rows || rows.length === 0) {
      return res.send(renderLayout('Semua Data', `<div class="page"><div class="no-data-box"><h2 class="heading">Belum ada data pendaftaran</h2><a class="btn-link" href="/dashboard.html">Kembali ke Dashboard</a></div></div>`));
    }

    // ambil semua foto_produk untuk semua pendaftaran yang di-list
    const ids = rows.map(r => r.id);
    db.query("SELECT pendaftaran_id, filename FROM foto_produk WHERE pendaftaran_id IN (?)", [ids], (err2, fotos) => {
      if (err2) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Error ambil foto_produk: ${escapeHtml(err2.message)}</div></div>`));

      // mapping id -> array filenames
      const fotoMap = {};
      fotos.forEach(f => {
        if (!fotoMap[f.pendaftaran_id]) fotoMap[f.pendaftaran_id] = [];
        fotoMap[f.pendaftaran_id].push(f.filename);
      });

      const rowsHtml = rows.map(row => {
        // kumpulkan lampiran: pas foto, foto_identitas, legalitas, foto_produk
        const attachments = [];
        if (row.foto) attachments.push({file: row.foto, label: 'Pas Foto'});
        if (row.foto_identitas) attachments.push({file: row.foto_identitas, label: 'Identitas'});
        if (row.legalitas) attachments.push({file: row.legalitas, label: 'Legalitas'});
        const produkFotos = fotoMap[row.id] || [];
        produkFotos.forEach((fn, idx) => attachments.push({file: fn, label: `Foto ${idx+1}`}));

        // buat HTML kecil untuk preview (maks 4 thumbnail, sisanya dihitung)
        const maxPreview = 4;
        const previewFiles = attachments.slice(0, maxPreview);
        const attachPreview = previewFiles.map(a => {
          const ext = (a.file || '').split('.').pop().toLowerCase();
          const imgExt = ['jpg','jpeg','png','gif','webp','svg'];
          if (imgExt.includes(ext) || String(a.file).startsWith('http')) {
            return `<img class="thumb-small" src="${buildFileUrl(a.file)}" alt="${escapeHtml(a.label)}">`;
          } else {
            return `<div style="font-size:12px;padding:4px 6px;border-radius:4px;background:#f3f3f3;border:1px solid #e6e6e6;">${escapeHtml(a.label)}</div>`;
          }
        }).join('');

        const remaining = Math.max(0, attachments.length - maxPreview);
        const attachCountBadge = attachments.length > 0 ? `<span class="attach-count">${attachments.length} file${remaining>0 ? ` (+${remaining})` : ''}</span>` : '-';

        return `
          <tr class="table-row">
            <td class="table-cell">${row.id}</td>
            <td class="table-cell username-cell">${escapeHtml(row.username)}</td>
            <td class="table-cell">${escapeHtml(row.nama || '-')}</td>
            <td class="table-cell">${escapeHtml(row.email || '-')}</td>
            <td class="table-cell">${escapeHtml(row.nomor_hp || '-')}</td>
            <td class="table-cell">${escapeHtml(row.bidang || '-')}</td>
            <td class="table-cell">${escapeHtml(row.nama_produk || '-')}</td>
            <td class="table-cell">${escapeHtml(row.inovasi_yang_dihasilkan || '-')}</td>
            <td class="table-cell">
              <div class="attach-cell">
                ${attachPreview}
                ${attachCountBadge}
                <div style="margin-left:auto;">
                  <a class="btn-link" href="/admin/lampiran/${row.id}">Lihat Semua</a>
                </div>
              </div>
            </td>
            <td class="table-cell">
              <a class="btn-delete" href="/admin/delete/${row.id}" onclick="return confirm('Yakin mau hapus data ini?')">Delete<img src="/pictures/icon/icons8-delete-50 (2).png" alt=""></a><br>
              <a class="btn-link" href="/admin/download/${row.id}">⬇️ Download</a>
            </td>
          </tr>
        `;
      }).join('\n');

      const body = `
        <div class="page">
          <h2 class="heading">Semua Data Pendaftaran</h2>
          <div class="table-responsive">
            <table class="data-table" border="1" cellpadding="8" style="width:100%; border-collapse:collapse; min-width:900px;">
              <thead class="table-head">
                <tr class="table-row">
                  <th class="table-head-cell">ID</th>
                  <th class="table-head-cell">Username</th>
                  <th class="table-head-cell">Nama</th>
                  <th class="table-head-cell">Email</th>
                  <th class="table-head-cell">No. HP</th>
                  <th class="table-head-cell">Bidang</th>
                  <th class="table-head-cell">Produk</th>
                  <th class="table-head-cell">Inovasi</th>
                  <th class="table-head-cell">Lampiran</th>
                  <th class="table-head-cell">Aksi</th>
                </tr>
              </thead>
              <tbody class="table-body">
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <br><a class="btn-link" href="/dashboard.html">Kembali ke Dashboard</a>
        </div>
      `;

      res.send(renderLayout('Semua Data Pendaftaran (Admin)', body));
    });
  });
});

// Admin bisa lihat lampiran siapa saja (UPDATE: full HTML layout)
app.get('/admin/lampiran/:id', isAdmin, (req, res) => {
  const id = req.params.id;

  db.query("SELECT * FROM pendaftaran WHERE id = ?", [id], (err, rows) => {
    if (err || !rows || rows.length === 0) {
      return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Data tidak ditemukan.</div></div>`));
    }
    const row = rows[0];

    db.query("SELECT filename, id FROM foto_produk WHERE pendaftaran_id = ?", [id], (err2, fotos) => {
      if (err2) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal ambil foto produk.</div></div>`));

      function renderPreview(filename, label = "") {
        if (!filename) return "";
        const ext = path.extname(filename).toLowerCase();
        const url = buildFileUrl(filename);
        const imgExt = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
        const videoExt = [".mp4", ".webm", ".ogg"];
        if (imgExt.includes(ext) || url.startsWith('http')) {
          return `<div class="lampiran-item"><div class="file-label">${escapeHtml(label)}</div><img class="lampiran-img" src="${url}" alt="${escapeHtml(label || filename)}"></div>`;
        } else if (videoExt.includes(ext)) {
          return `<div class="lampiran-item"><div class="file-label">${escapeHtml(label)}</div><video class="media-preview" controls><source src="${url}">Browser Anda tidak mendukung video.</video></div>`;
        } else if (ext === ".pdf") {
          return `<div class="lampiran-item"><div class="file-label">${escapeHtml(label)}</div><a class="file-link" href="${url}" target="_blank">Lihat PDF (${escapeHtml(filename)})</a></div>`;
        } else {
          return `<div class="lampiran-item"><div class="file-label">${escapeHtml(label)}</div><a class="file-link" href="${url}" download>Unduh ${escapeHtml(filename)}</a></div>`;
        }
      }

      let fotoProdukHTML = "";
      if (fotos.length > 0) {
        fotos.forEach((f, idx) => { fotoProdukHTML += renderPreview(f.filename, `Foto Produk ${idx+1}`); });
      } else {
        fotoProdukHTML = `<p>Tidak ada foto produk</p>`;
      }

      const fotoIdentitasHTML = row.foto_identitas ? renderPreview(row.foto_identitas, "Foto Identitas") : "-";
      const legalitasHTML = row.legalitas ? renderPreview(row.legalitas, "Legalitas") : "-";
      const pasFotoHTML = row.foto ? renderPreview(row.foto, "Pas Foto") : "-";
      const videoProdukHTML = row.video_produk ? `<div class="lampiran-item"><div class="file-label">Video (Link)</div><a class="file-link" href="${escapeHtml(row.video_produk)}" target="_blank">Tonton di YouTube</a></div>` : "-";

      const body = `
        <div class="page">
          <h2 class="heading">Lampiran - ${escapeHtml(row.nama_produk || '-')}</h2>
          <p><strong>Pengirim:</strong> ${escapeHtml(row.user_id)} &nbsp; | &nbsp; <strong>Nama:</strong> ${escapeHtml(row.nama || '-')}</p>

          <h3 class="subheading">Foto Produk</h3>
          <div class="lampiran-grid">${fotoProdukHTML}</div>

          <h3 class="subheading">Foto Identitas</h3>
          <div class="lampiran-grid">${fotoIdentitasHTML}</div>

          <h3 class="subheading">Legalitas</h3>
          <div class="lampiran-grid">${legalitasHTML}</div>

          <h3 class="subheading">Pas Foto</h3>
          <div class="lampiran-grid">${pasFotoHTML}</div>

          <h3 class="subheading">Video Produk</h3>
          <div class="lampiran-grid">${videoProdukHTML}</div>

          <br><br>
          <a class="btn-link" href="/admin/data">Kembali ke Semua Data</a> |
          <a class="btn-link" href="/admin/download/${row.id}">⬇️ Download Semua Lampiran</a>
        </div>
      `;

      res.send(renderLayout(`Admin - Lampiran ${row.nama_produk || '-'}`, body));
    });
  });
});

// admin download ZIP (bisa untuk semua pendaftaran)
app.get("/admin/download/:id", isAdmin, (req, res) => {
  const id = req.params.id;
  db.query("SELECT * FROM pendaftaran WHERE id = ?", [id], (err, rows) => {
    if (err || !rows || rows.length === 0) return res.send(`<div class="error-box">Data tidak ditemukan</div>`);
    const row = rows[0];

    db.query("SELECT filename FROM foto_produk WHERE pendaftaran_id = ?", [id], async (err2, fotos) => {
      if (err2) return res.send(`<div class="error-box">Gagal ambil foto produk</div>`);

      res.setHeader("Content-Disposition", `attachment; filename=lampiran_${id}.zip`);
      res.setHeader("Content-Type", "application/zip");

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      const tasks = [];
      if (row.foto) {
        if (String(row.foto).startsWith('http')){
          tasks.push(appendRemoteFileToArchive(archive, row.foto, `Pas_Foto${path.extname(row.foto) || '.jpg'}`));
        } else {
          const local = path.join(__dirname, 'uploads', row.foto);
          if(fs.existsSync(local)) archive.file(local, { name: `Pas_Foto_${row.foto}` });
        }
      }

      if (row.foto_identitas) {
        if (String(row.foto_identitas).startsWith('http')){
          tasks.push(appendRemoteFileToArchive(archive, row.foto_identitas, `Foto_Identitas${path.extname(row.foto_identitas) || '.jpg'}`));
        } else {
          const local = path.join(__dirname, 'uploads', row.foto_identitas);
          if(fs.existsSync(local)) archive.file(local, { name: `Foto_Identitas_${row.foto_identitas}` });
        }
      }

      if (row.legalitas) {
        if (String(row.legalitas).startsWith('http')){
          tasks.push(appendRemoteFileToArchive(archive, row.legalitas, `Legalitas${path.extname(row.legalitas) || '.pdf'}`));
        } else {
          const local = path.join(__dirname, 'uploads', row.legalitas);
          if(fs.existsSync(local)) archive.file(local, { name: `Legalitas_${row.legalitas}` });
        }
      }

      for(const f of fotos){
        const filename = f.filename;
        if(!filename) continue;
        if(String(filename).startsWith('http')){
          tasks.push(appendRemoteFileToArchive(archive, filename, `Foto_Produk_${path.basename(filename)}`));
        } else {
          const local = path.join(__dirname, 'uploads', filename);
          if(fs.existsSync(local)) archive.file(local, { name: `Foto_Produk_${filename}` });
        }
      }

      Promise.all(tasks).then(()=>{
        archive.finalize();
      }).catch(()=> archive.finalize());
    });
  });
});

// ----------------- KELOLA USER (ADMIN) -----------------
// GET daftar user (UPDATE: full HTML layout)
app.get('/admin/users', isAdmin, (req, res) => {
  db.query("SELECT id, username, role FROM users", (err, rows) => {
    if (err) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Error: ${escapeHtml(err.message)}</div></div>`));

    const rowsHtml = rows.map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml((u.role||'user').toLowerCase())}</td>
        <td>
          <form method="POST" action="/admin/set-role/${u.id}">
            <select name="role">
              <option value="user" ${( (u.role||'user').toLowerCase() === 'user') ? 'selected' : ''}>User</option>
              <option value="admin" ${( (u.role||'user').toLowerCase() === 'admin') ? 'selected' : ''}>Admin</option>
            </select>
            <button type="submit">Update</button>
          </form>
        </td>
      </tr>
    `).join('\n');

    const body = `
      <div class="page">
        <h2 class="heading">Daftar User</h2>
        <div class="table-responsive">
          <table class="data-table" border="1" cellpadding="8">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
        <br><a class="btn-link" href="/dashboard.html">Kembali ke Dashboard</a>
      </div>
    `;

    res.send(renderLayout('Kelola User (Admin)', body));
  });
});

// POST update role
app.post("/admin/set-role/:id", isAdmin, (req, res) => {
  const newRole = req.body.role;
  const userId = req.params.id;

  if (!["user", "admin"].includes(newRole)) {
    return res.send(`<div class="error-box">Role tidak valid</div>`);
  }

  db.query("UPDATE users SET role = ? WHERE id = ?", [newRole, userId], (err) => {
    if (err) return res.send(`<div class="error-box">Gagal update role: ${err.message}</div>`);
    res.redirect("/admin/users");
  });
});

// ----------------- DELETE DATA (USER) -----------------
app.get("/delete/:id", isAuthenticated, (req, res) => {
  const id = req.params.id;

  // 1. Ambil semua nama file yang terkait sebelum delete
  const sqlSelect = `
    SELECT foto, foto_identitas, legalitas 
    FROM pendaftaran 
    WHERE id = ? AND user_id = ?
  `;
  db.query(sqlSelect, [id, req.session.userId], (err, rows) => {
    if (err) return res.send(`<div class="error-box">Gagal ambil data sebelum hapus: ${err.message}</div>`);
    if (!rows || rows.length === 0) {
      return res.send(`<div class="error-box">Data tidak ditemukan atau Anda tidak berhak menghapus</div>`);
    }

    const row = rows[0];

    // 2. Ambil semua foto produk di tabel foto_produk
    db.query("SELECT filename FROM foto_produk WHERE pendaftaran_id = ?", [id], (err2, fotos) => {
      if (err2) return res.send(`<div class="error-box">Gagal ambil foto produk: ${err2.message}</div>`);

      // 3. Hapus data pendaftaran (ON DELETE CASCADE akan hapus foto_produk juga)
      db.query("DELETE FROM pendaftaran WHERE id = ? AND user_id = ?", [id, req.session.userId], (err3, result) => {
        if (err3) return res.send(`<div class="error-box">Gagal hapus data: ${err3.message}</div>`);
        if (result.affectedRows === 0) {
          return res.send(`<div class="error-box">Data tidak ditemukan atau Anda tidak berhak menghapus</div>`);
        }

        // 4. Hapus file fisik (jika ada). Untuk Cloudinary-stored URLs, tidak ada file lokal, jadi skip.
        const allFiles = [];
        if (row.foto && !String(row.foto).startsWith('http')) allFiles.push(row.foto);
        if (row.foto_identitas && !String(row.foto_identitas).startsWith('http')) allFiles.push(row.foto_identitas);
        if (row.legalitas && !String(row.legalitas).startsWith('http')) allFiles.push(row.legalitas);
        fotos.forEach(f => { if(f.filename && !String(f.filename).startsWith('http')) allFiles.push(f.filename); });

        allFiles.forEach(file => {
          const filePath = path.join(__dirname, "uploads", file);
          if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
              if (err) console.error(`Gagal hapus file: ${file}`, err);
            });
          }
        });

        // 5. Selesai
        res.send(`<div class="success-box">Data dan semua lampiran berhasil dihapus. <a class="link" href="/dashboard/data">Kembali ke Data Pendaftaran</a></div>`);
      });
    });
  });
});

// ----------------- DELETE DATA (ADMIN) -----------------
app.get("/admin/delete/:id", isAdmin, (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM pendaftaran WHERE id = ?", [id], (err, result) => {
    if (err) {
      return res.send(`<div class="error-box">Gagal hapus data: ${err.message}</div>`);
    }
    if (result.affectedRows === 0) {
      return res.send(`<div class="error-box">Data tidak ditemukan</div>`);
    }
    res.send(`<div class="success-box">Data berhasil dihapus. <a class="link" href="/admin/data">Kembali ke Semua Data</a></div>`);
  });
});

// ----------------- DASHBOARD CONTENT (ADMIN CRUD) (Cloudinary-enabled) -----------------
// Pastikan block ini ditempatkan setelah definisi `upload` dan `isAdmin` dan sebelum app.listen

// Form penambahan konten (admin)
app.get('/admin/content', isAdmin, (req, res) => {
  db.query('SELECT * FROM dashboard_content ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.send(renderLayout('Kelola Konten Dashboard', `<div class="page"><div class="error-box">Error: ${escapeHtml(err.message)}</div></div>`));

    const rowsHtml = (rows || []).map(r => {
      const imageUrl = r.image ? buildFileUrl(r.image) : null;
      return `
        <tr>
          <td>${r.id}</td>
          <td>${escapeHtml(r.title)}</td>
          <td>${escapeHtml(new Date(r.created_at).toLocaleString())}</td>
          <td>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" width="80" alt="thumb">` : '-'}</td>
          <td>
            <form method="POST" action="/admin/content/delete/${r.id}" onsubmit="return confirm('Hapus konten ini?')">
              <button type="submit">Hapus</button>
            </form>
          </td>
        </tr>
      `;
    }).join('');

    const body = `
      <div class="page">
        <h2 class="heading">Kelola Konten Dashboard</h2>

        <section class="form-section">
          <h3 class="section-title">Tambah Konten Baru</h3>
          <form method="POST" action="/admin/content/create" enctype="multipart/form-data">
            <div style="margin-bottom:8px">
              <label>Judul</label><br>
              <input name="title" required style="width:100%; padding:8px" />
            </div>
            <div style="margin-bottom:8px">
              <label>Deskripsi</label><br>
              <textarea name="description" rows="4" style="width:100%; padding:8px"></textarea>
            </div>
            <div style="margin-bottom:8px">
              <label>Gambar (opsional)</label><br>
              <input type="file" name="image" accept="image/*" />
            </div>
            <div>
              <button type="submit">Simpan Konten</button>
            </div>
          </form>
        </section>

        <section style="margin-top:18px">
          <h3 class="section-title">Daftar Konten</h3>
          <div class="table-responsive">
            <table border="1" cellpadding="8" style="width:100%; border-collapse:collapse;">
              <thead><tr><th>ID</th><th>Judul</th><th>Waktu</th><th>Gambar</th><th>Aksi</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </section>

        <br><a class="btn-link" href="/dashboard.html">Kembali ke Dashboard</a>
      </div>
    `;

    res.send(renderLayout('Kelola Konten Dashboard', body));
  });
});

// Create content (upload gambar optional) - Cloudinary-enabled
app.post('/admin/content/create', isAdmin, upload.single('image'), async (req, res) => {
  const title = (req.body.title || '').trim();
  const description = req.body.description || null;

  if (!title) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Judul harus diisi.</div></div>`));

  try {
    let storedImage = null;

    // Jika file di-upload (memoryStorage => buffer tersedia), upload ke Cloudinary
    if (req.file && req.file.buffer) {
      try {
        const r = await uploadBufferToCloudinary(req.file.buffer, { folder: 'dashboard_content' });
        if (r && r.secure_url) storedImage = r.secure_url;
      } catch (e) {
        console.error('Gagal upload gambar konten ke Cloudinary:', e);
        // lanjutkan tanpa gambar
      }
    } else if (req.file && req.file.filename) {
      // legacy: kalau ada filename (lokal) simpan seperti semula
      storedImage = req.file.filename;
    }

    db.query('INSERT INTO dashboard_content (title, description, image) VALUES (?, ?, ?)', [title, description, storedImage], (err, result) => {
      if (err) {
        return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal simpan: ${escapeHtml(err.message)}</div></div>`));
      }
      res.redirect('/admin/content');
    });
  } catch (e) {
    console.error('Error pada create content:', e);
    return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal proses: ${escapeHtml(e.message || String(e))}</div></div>`));
  }
});

// Hapus konten (hapus db record + hapus file jika file lokal)
app.post('/admin/content/delete/:id', isAdmin, (req, res) => {
  const id = req.params.id;
  db.query('SELECT image FROM dashboard_content WHERE id = ?', [id], (err, rows) => {
    if (err) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Error: ${escapeHtml(err.message)}</div></div>`));
    if (!rows || rows.length === 0) return res.redirect('/admin/content');

    const image = rows[0].image;
    db.query('DELETE FROM dashboard_content WHERE id = ?', [id], (err2) => {
      if (err2) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal hapus: ${escapeHtml(err2.message)}</div></div>`));

      // Jika image adalah path/file lokal (bukan URL), hapus fisik
      if (image && !String(image).startsWith('http')) {
        const fp = path.join(__dirname, 'uploads', image);
        if (fs.existsSync(fp)) {
          fs.unlink(fp, (e) => { if (e) console.error('Gagal hapus file:', e); });
        }
      }
      // Jika image adalah URL (mis. Cloudinary), kita sengaja tidak memanggil cloudinary.uploader.destroy()
      // agar tidak perlu menyimpan public_id di DB — konsisten dengan perilaku file lainnya di aplikasi Anda.

      res.redirect('/admin/content');
    });
  });
});

// API publik (dipakai oleh dashboard client-side) -> return JSON list konten (image URLs resolved)
app.get('/api/contents', (req, res) => {
  db.query('SELECT id, title, description, image, created_at FROM dashboard_content ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Gagal ambil data' });

    const result = (rows || []).map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      imageUrl: r.image ? buildFileUrl(r.image) : null,
      created_at: r.created_at
    }));
    res.json(result);
  });
});

// ----------------- VIEW SINGLE CONTENT PAGE -----------------
app.get('/content/:id', (req, res) => {
  const id = req.params.id;
  db.query('SELECT id, title, description, image, created_at FROM dashboard_content WHERE id = ? LIMIT 1', [id], (err, rows) => {
    if (err) {
      return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal ambil data: ${escapeHtml(err.message || '')}</div></div>`));
    }
    if (!rows || rows.length === 0) {
      return res.send(renderLayout('Konten Tidak Ditemukan', `<div class="page"><div class="error-box">Konten tidak ditemukan.</div></div>`));
    }

    const item = rows[0];
    let imageUrl = item.image ? buildFileUrl(item.image) : null;

    const body = `
      <div class="page" style="max-width:900px;margin:20px auto;padding:18px;">
        <a class="btn-link" href="/dashboard.html" style="display:inline-block;margin-bottom:12px">&larr; Kembali ke Dashboard</a>
        <article style="background:#fff;border-radius:12px;padding:18px;border:1px solid var(--border);">
          ${imageUrl ? `<div style="margin-bottom:14px"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title)}" style="width:100%; height:auto; max-height:520px; object-fit:cover; border-radius:8px;"></div>` : ''}
          <h1 style="margin:0 0 6px">${escapeHtml(item.title)}</h1>
          <div style="color:var(--muted); font-size:0.92rem; margin-bottom:12px">${escapeHtml(new Date(item.created_at).toLocaleString())}</div>
          <div style="line-height:1.6; color:var(--text)">${escapeHtml(item.description || '')}</div>
        </article>
      </div>
    `;

    res.send(renderLayout(item.title || 'Konten', body));
  });
});

// ----------------- AKUN - GANTI USERNAME / PASSWORD -----------------
app.get('/account', isAuthenticated, (req, res) => {
  // ambil data user untuk menampilkan username sekarang (mengambil dari DB untuk sinkron)
  db.query('SELECT id, username FROM users WHERE id = ? LIMIT 1', [req.session.userId], (err, rows) => {
    if (err) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal ambil data user: ${escapeHtml(err.message)}</div></div>`));
    if (!rows || rows.length === 0) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">User tidak ditemukan.</div></div>`));
    const user = rows[0];

    const body = `
      <div class="page" style="max-width:720px;margin:20px auto;">
        <h2 class="heading">Pengaturan Akun</h2>

        <section style="margin-top:12px;background:#fff;padding:16px;border-radius:8px;border:1px solid var(--border);">
          <h3 style="margin:0 0 8px">Username saat ini</h3>
          <p style="margin:0 0 12px"><strong>${escapeHtml(user.username)}</strong></p>

          <form method="POST" action="/account/change-username">
            <div style="margin-bottom:8px">
              <label>Username baru</label><br>
              <input name="newUsername" required style="width:100%;padding:8px" />
            </div>
            <div style="margin-bottom:8px">
              <label>Masukkan password Anda untuk verifikasi</label><br>
              <input type="password" name="currentPasswordForUsername" required style="width:100%;padding:8px" />
            </div>
            <div>
              <button type="submit">Ganti Username</button>
            </div>
          </form>
        </section>

        <section style="margin-top:16px;background:#fff;padding:16px;border-radius:8px;border:1px solid var(--border);">
          <h3 style="margin:0 0 8px">Ganti Password</h3>
          <form method="POST" action="/account/change-password">
            <div style="margin-bottom:8px">
              <label>Password saat ini</label><br>
              <input type="password" name="currentPassword" required style="width:100%;padding:8px" />
            </div>
            <div style="margin-bottom:8px">
              <label>Password baru</label><br>
              <input type="password" name="newPassword" required minlength="6" style="width:100%;padding:8px" />
            </div>
            <div style="margin-bottom:8px">
              <label>Konfirmasi password baru</label><br>
              <input type="password" name="confirmNewPassword" required minlength="6" style="width:100%;padding:8px" />
            </div>
            <div>
              <button type="submit">Ganti Password</button>
            </div>
          </form>
        </section>

        <br><a class="btn-link" href="/dashboard.html">Kembali ke Dashboard</a>
      </div>
    `;

    res.send(renderLayout('Pengaturan Akun', body));
  });
});

// Change username
app.post('/account/change-username', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const newUsername = (req.body.newUsername || '').trim();
  const currentPassword = req.body.currentPasswordForUsername || '';

  if (!newUsername) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Username baru harus diisi.</div></div>`));

  // ambil user untuk cek password & cek username duplicate
  db.query('SELECT id, username, password FROM users WHERE id = ? LIMIT 1', [userId], (err, rows) => {
    if (err) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal: ${escapeHtml(err.message)}</div></div>`));
    if (!rows || rows.length === 0) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">User tidak ditemukan.</div></div>`));

    const user = rows[0];

    // verifikasi password
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Password salah. Username tidak diubah.</div></div>`));
    }

    // cek apakah username baru sudah dipakai
    db.query('SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1', [newUsername, userId], (err2, dupRows) => {
      if (err2) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal: ${escapeHtml(err2.message)}</div></div>`));
      if (dupRows && dupRows.length > 0) {
        return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Username sudah digunakan, silakan pilih yang lain.</div></div>`));
      }

      // update username
      db.query('UPDATE users SET username = ? WHERE id = ?', [newUsername, userId], (err3) => {
        if (err3) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal update username: ${escapeHtml(err3.message)}</div></div>`));
        // perbarui session agar header menampilkan username baru
        req.session.username = newUsername;
        res.send(renderLayout('Sukses', `<div class="page"><div class="success-box">Username berhasil diubah menjadi <strong>${escapeHtml(newUsername)}</strong>. <a class="link" href="/account">Kembali ke Pengaturan</a></div></div>`));
      });
    });
  });
});

// Change password
app.post('/account/change-password', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const currentPassword = req.body.currentPassword || '';
  const newPassword = req.body.newPassword || '';
  const confirmNew = req.body.confirmNewPassword || '';

  if (!currentPassword || !newPassword || !confirmNew) {
    return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Semua field harus diisi.</div></div>`));
  }
  if (newPassword !== confirmNew) {
    return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Konfirmasi password tidak cocok.</div></div>`));
  }
  if (newPassword.length < 6) {
    return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Password baru minimal 6 karakter.</div></div>`));
  }

  db.query('SELECT password FROM users WHERE id = ? LIMIT 1', [userId], (err, rows) => {
    if (err) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal: ${escapeHtml(err.message)}</div></div>`));
    if (!rows || rows.length === 0) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">User tidak ditemukan.</div></div>`));

    const hashed = rows[0].password;
    if (!bcrypt.compareSync(currentPassword, hashed)) {
      return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Password saat ini salah.</div></div>`));
    }

    const newHashed = bcrypt.hashSync(newPassword, 10);
    db.query('UPDATE users SET password = ? WHERE id = ?', [newHashed, userId], (err2) => {
      if (err2) return res.send(renderLayout('Error', `<div class="page"><div class="error-box">Gagal update password: ${escapeHtml(err2.message)}</div></div>`));
      res.send(renderLayout('Sukses', `<div class="page"><div class="success-box">Password berhasil diubah. Silakan login kembali jika perlu. <a class="link" href="/dashboard.html">Kembali ke Dashboard</a></div></div>`));
    });
  });
});

// ----------------- START SERVER -----------------
app.get('/', (req, res) => {
  res.send('Server sudah jalan di Railway!');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});


