// PDF
import PDFDocument from "pdfkit";

// DB
import pool from "../config/dbconnect.js";

// file system
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// fix __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔥 FORMAT TANGGAL
const formatTanggal = (date) => {
  return new Date(date).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

// 🔥 FORMAT RUPIAH
const formatRupiah = (value) => {
  if (!value) return "Rp 0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);
};

// HELPER: Garis Horizontal
const generateHr = (doc, y) => {
  doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
};

export const generatePDF = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT 
        r.document_number,
        r.activity_name,
        r.start_date,
        r.end_date,
        r.status,
        u.username,
        f.keterangan,
        f.tanggal,
        f.jumlah,
        f.namefile
      FROM reimbursements r
      LEFT JOIN users u ON r.employee_id = u.id
      LEFT JOIN reimbursement_files f 
        ON r.id = f.id_reimbursement
      WHERE r.id = ?`,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }

    const data = rows[0];

    const doc = new PDFDocument({ margin: 50, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=reimbursement-${data.document_number}.pdf`,
    );

    doc.pipe(res);

    // ================= HEADER PERUSAHAAN =================

    // logo
    const logoPath = path.join(__dirname, "../../client/src/assets/logo-1.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { fit: [60, 60] });
    }

    doc
      .fillColor("#444444")
      .fontSize(18)
      .text("REIMBURSEMENT", 50, 50, { align: "right" });
    doc
      .fontSize(10)
      .text(`Doc No: ${data.document_number}`, 50, 75, { align: "right" });

    const startX = 120;
    doc
      .fillColor("#000000")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("PT Indonesia Sukses Bersaudara", startX, 50);
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(
        "Ruko Freshmarket Cikunir ( Kadatuan Koffie ) Blok I.2 No.1",
        startX,
        65,
      );
    doc.text("Phone: (021) 1234567 | Web: www.perusahaan.com", startX, 80);
    doc.text("Email: finance@perusahaan.com", startX, 95);

    generateHr(doc, 120);

    // ================= INFO PENGAJUAN =================
    const infoTop = 135;
    doc.font("Helvetica-Bold").text("Detail Pemohon:", 50, infoTop);
    doc.font("Helvetica-Bold").text("Detail Aktivitas:", 300, infoTop);

    // Pemohon Info (Kiri)
    doc.font("Helvetica").text("Nama", 50, infoTop + 15);
    doc.text(":", 100, infoTop + 15);
    doc.text(data.username, 110, infoTop + 15);

    doc.text("Status", 50, infoTop + 30);
    doc.text(":", 100, infoTop + 30);
    doc.text(data.status, 110, infoTop + 30);

    // Aktivitas Info (Kanan)
    doc.text("Aktivitas", 300, infoTop + 15);
    doc.text(":", 380, infoTop + 15);
    doc.text(data.activity_name, 390, infoTop + 15, { width: 150 });

    doc.text("Tgl Mulai", 300, infoTop + 30);
    doc.text(":", 380, infoTop + 30);
    doc.text(formatTanggal(data.start_date), 390, infoTop + 30);

    doc.text("Tgl Selesai", 300, infoTop + 45);
    doc.text(":", 380, infoTop + 45);
    doc.text(formatTanggal(data.end_date), 390, infoTop + 45);

    // ================= TABLE =================
    const tableTop = 220;
    const rowHeight = 130;
    let y = tableTop;

    const col = {
      no: 50,
      aktivitas: 90,
      tanggal: 240,
      biaya: 340,
      bukti: 440,
    };

    // 🔥 HEADER TABLE DENGAN BACKGROUND
    doc.rect(50, y, 500, 25).fill("#f6f6f6");
    doc.fillColor("#000000").font("Helvetica-Bold");

    // Align teks header secara proporsional ke tengah vertikal kotak
    const headerTextY = y + 7;
    doc.text("No", col.no + 10, headerTextY);
    doc.text("Keterangan", col.aktivitas, headerTextY);
    doc.text("Tanggal", col.tanggal, headerTextY);
    doc.text("Biaya", col.biaya, headerTextY, { width: 80, align: "right" });
    doc.text("Bukti", col.bukti, headerTextY);

    generateHr(doc, y + 25);
    y += 35;
    doc.font("Helvetica");

    // ================= DATA =================
    rows.forEach((item, index) => {
      // Pindah halaman jika tidak muat
      if (y + rowHeight > 700) {
        doc.addPage();
        y = 50;
        // Opsional: Bikin header tabel ulang di halaman baru di sini jika mau
      }

      const textY = y + 10; // Margin atas untuk teks agar tidak nempel di garis

      doc.text(index + 1, col.no + 10, textY);
      doc.text(item.keterangan || "-", col.aktivitas, textY, { width: 140 });
      doc.text(
        item.tanggal ? formatTanggal(item.tanggal) : "-",
        col.tanggal,
        textY,
      );
      doc.text(formatRupiah(item.jumlah), col.biaya, textY, {
        width: 80,
        align: "right",
      });

      // 🔥 IMAGE
      if (item.namefile) {
        const imgPath = path.join(
          __dirname,
          "../uploads/reimbursements",
          item.namefile,
        );

        if (fs.existsSync(imgPath)) {
          try {
            // Gambar di-align sedikit ke bawah agar sejajar rapi
            doc.image(imgPath, col.bukti, textY - 5, { fit: [100, 100] });
          } catch {
            doc.text("[Image Error]", col.bukti, textY);
          }
        } else {
          doc.text("No Image", col.bukti, textY);
        }
      }

      y += rowHeight;
      generateHr(doc, y - 10); // Garis pemisah antar baris
    });

    // ================= TOTAL =================
    const total = rows.reduce((acc, item) => acc + Number(item.jumlah || 0), 0);

    doc.font("Helvetica-Bold").fontSize(12);
    // Background highlight untuk total
    doc.rect(290, y, 260, 30).fill("#f6f6f6");
    doc.fillColor("#000000");

    doc.text("TOTAL :", 300, y + 9);
    doc.text(formatRupiah(total), col.biaya, y + 9, {
      width: 80,
      align: "right",
    });

    y += 60;

    // ================= TANDA TANGAN (SIGNATURES) =================
    if (y + 100 > 750) {
      // Cek ruang sisa
      doc.addPage();
      y = 50;
    }

    doc.fontSize(10).font("Helvetica");
    doc.text(`Jakarta, ${formatTanggal(new Date())}`, 400, y);

    doc.text("Disetujui Oleh,", 80, y + 20);
    doc.text("Pemohon,", 420, y + 20);

    // Garis nama
    doc.text("_______________________", 60, y + 80);
    doc.text("_______________________", 400, y + 80);

    doc.text("Finance / HRD", 75, y + 95);
    doc.text(data.username, 400, y + 95, { width: 120, align: "center" });

    // ================= FOOTER =================
    const totalPages = doc.bufferedPageRange
      ? doc.bufferedPageRange().count
      : 1;
    doc
      .fontSize(8)
      .fillColor("#aaaaaa")
      .text(
        `Dicetak otomatis oleh sistem pada ${formatTanggal(new Date())}`,
        50,
        780,
        { align: "center", width: 500 },
      );

    doc.end();
  } catch (error) {
    console.error("PDF ERROR:", error);
    res.status(500).json({ message: "Gagal generate PDF" });
  }
};
