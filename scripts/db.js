// db.js
// Inisialisasi koneksi MySQL dan export koneksi sebagai module

const mysql = require("mysql2");

// konfigurasi koneksi ke MySQL
const db = mysql.createConnection({
  host: "127.0.0.1",   // ganti jika pakai server luar
  user: "root",        // username MySQL
  password: "1234",        // password MySQL
  database: "invention_db" // nama database MySQL
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
