document.addEventListener("DOMContentLoaded", () => {
  // preview gambar (input name/id tetap seperti di HTML)
  const previewImage = (inputId, imgId) => {
    const input = document.getElementById(inputId);
    const img = document.getElementById(imgId);
    if (input && img) {
      input.addEventListener("change", () => {
        if (input.files && input.files[0]) {
          img.src = URL.createObjectURL(input.files[0]);
          img.style.display = "block";
        }
      });
    }
  };

  previewImage("foto", "previewFoto");
  previewImage("fotoIdentitas", "previewIdentitas");
  previewImage("fotoProduk", "previewProduk");

  // preview nama file (legalitas)
  const previewFileName = (inputId, spanId) => {
    const input = document.getElementById(inputId);
    const span = document.getElementById(spanId);
    if (input && span) {
      input.addEventListener("change", () => {
        if (input.files && input.files.length > 0) {
          span.innerText = input.files[0].name;
        } else {
          span.innerText = "";
        }
      });
    }
  };
  previewFileName("legalitas", "previewLegalitas");

  // submit form -> kirim ke /pendaftaran (sesuai server.js)
  const form = document.getElementById("formPendaftaran");
  const hasilDiv = document.getElementById("hasil");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    try {
      const res = await fetch("/daftar", {
        method: "POST",
        body: formData
      });

      const text = await res.text();
      // tampilkan respon server (redirect biasanya, tapi server meng-redirect; fetch menangkap html)
      hasilDiv.innerHTML = text;
    } catch (err) {
      hasilDiv.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    }
  });
});
