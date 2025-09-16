// db.js
// Inisialisasi koneksi MySQL dan export koneksi sebagai module

const mysql = require("mysql2");

// konfigurasi koneksi ke MySQL
const db = mysql.createConnection({
  host: "sql.freedb.tech",   // ganti jika pakai server luar
  user: "freedb_andri",        // username MySQL
  password: "kcW?HmbZ8AJg9c2",        // password MySQL
  database: "freedb_invention_db" // nama database MySQL
});

// cek koneksi
db.connect(err => {
  if (err) {
    console.error("Gagal konek ke MySQL:", err);
  } else {
    console.log("Terkoneksi ke MySQL");
  }
});

module.exports = db;

