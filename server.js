import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js";

// connect DB
import pool from "./config/dbconnect.js";
import { verifyToken } from "./controllers/authMiddleware.js";

// generate doc number
import generateDocNumber from "./controllers/generate/DocDocument.js";

// upload reimburse
import uploadReimburse from "./reimbusUploadFolder.js";

import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

const isAdmin = (req, res, next) => {
  // middleware to check if user is admin
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ message: "Unauthorized" });
  }
};

// konfigurasi upload folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

// login
app.use("/api/auth", authRoutes);

app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from Express API!" });
});

const PORT = process.env.PORT || 5000;

// admin
app.get("/api/admin", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM users");
    res.json(rows); // kirim ke React
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// layanan
// ambil data layanan
app.get("/api/layanan", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        l.id_layanan,
        l.nama_layanan,
        l.desc_layanan,
        f.id_foto,
        f.foto
      FROM layanan l
      LEFT JOIN foto_layanan f ON f.id_layanan = l.id_layanan
    `);
    // gabungkan data berdasarkan id_layanan
    const result = rows.reduce((acc, row) => {
      let layanan = acc.find((l) => l.id_layanan === row.id_layanan);
      if (!layanan) {
        layanan = {
          id_layanan: row.id_layanan,
          nama_layanan: row.nama_layanan,
          desc_layanan: row.desc_layanan,
          fotos: [],
        };
        acc.push(layanan);
      }

      if (row.id_foto) {
        layanan.fotos.push({
          id_foto: row.id_foto,
          id_layanan: row.id_layanan,
          foto: row.foto,
        });
      }

      return acc;
    }, []);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// tambah layanan
app.post("/api/layanan", upload.single("foto"), async (req, res) => {
  const { nama, deskripsi } = req.body;

  // const potoPath = req.file ? req.file.path : null;
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    // simpan layanan
    const [rows] = await pool.query(
      "INSERT INTO layanan (nama_layanan, desc_layanan) VALUES (?, ?)",
      [nama, deskripsi],
    );

    const idLayanan = rows.insertId;

    // simpan foto layanan
    if (req.file) {
      await conn.query(
        "INSERT INTO foto_layanan (id_layanan, foto) VALUES (?, ?)",
        [idLayanan, req.file.filename],
      );
    }

    await conn.commit();
    res.status(201).json({ message: "Berita berhasil ditambahkan" });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// hapus layanan
// delete foto layanan berdasarkan id layanan
app.delete("/api/foto-layanan/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      "SELECT foto FROM foto_layanan WHERE id_foto = ?",
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Foto layanan tidak ditemukan" });
    }

    const filename = rows[0].foto;
    const filePath = path.join(__dirname, "uploads", filename);

    // Hapus data dari database
    await pool.query("DELETE FROM foto_layanan WHERE id_foto = ?", [id]);

    // Hapus file foto
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ message: "Gagal menghapus foto layanan" });
      }
      res.json({ message: "Foto layanan berhasil dihapus" });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Gagal menghapus foto layanan" });
  }
});

// hapus layanan
app.delete("/api/layanan/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows2] = await pool.query(
      "SELECT id_layanan FROM layanan WHERE id_layanan = ?",
      [id],
    );

    if (rows2.length === 0) {
      return res.status(404).json({ message: "Layanan tidak ditemukan" });
    }

    // Ambil nama file dari database
    const [rows] = await pool.query(
      "SELECT foto FROM foto_layanan WHERE id_layanan = ?",
      [id],
    );

    // hapus semua file foto terkait
    for (const row of rows) {
      const filePath = path.join(__dirname, "uploads", row.foto);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("File berhasil dihapus");
        } else {
          console.log("File tidak ditemukan");
        }
      } catch (err) {
        console.error("Gagal menghapus file:", err);
      }
    }

    // Hapus data dari database
    await pool.query("DELETE FROM foto_layanan WHERE id_layanan = ?", [id]);
    await pool.query("DELETE FROM layanan WHERE id_layanan = ?", [id]);

    res.json({ message: "Layanan berhasil dihapus" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Gagal menghapus layanan" });
  }
});

// edit layanan
app.put("/api/layanan/:id", upload.single("foto"), async (req, res) => {
  const { id } = req.params;
  const { nama, deskripsi } = req.body;

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    await conn.query(
      "UPDATE layanan SET nama_layanan = ?, desc_layanan = ? WHERE id_layanan = ?",
      [nama, deskripsi, id],
    );

    if (req.file) {
      const [old] = await conn.query(
        "SELECT foto FROM foto_layanan WHERE id_layanan = ?",
        [id],
      );

      if (old.length > 0) {
        const oldPath = path.join("uploads", old[0].foto);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      await conn.query(
        "UPDATE foto_layanan SET foto = ? WHERE id_layanan = ?",
        [req.file.filename, id],
      );
    }

    await conn.commit();
    conn.release();
    res.json({ message: "Layanan berhasil diperbarui" });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error(error);
    res.status(500).json({ message: "Gagal memperbarui layanan" });
  }
});

// Berita
// ambil data berita
app.get("/api/berita", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        b.id_berita,
        b.judul_berita,
        b.desc_berita,
        b.date,
        f.id_foto,
        f.foto
      FROM berita b
      LEFT JOIN foto_berita f ON b.id_berita = f.id_berita
      ORDER BY b.id_berita DESC
    `);

    // Gabungkan data berdasarkan id_berita
    const result = rows.reduce((acc, row) => {
      let berita = acc.find((b) => b.id_berita === row.id_berita);
      if (!berita) {
        berita = {
          id_berita: row.id_berita,
          judul_berita: row.judul_berita,
          desc_berita: row.desc_berita,
          date: row.date,
          fotos: [],
        };
        acc.push(berita);
      }
      if (row.id_foto) {
        berita.fotos.push({
          id_foto: row.id_foto,
          foto: row.foto,
        });
      }
      return acc;
    }, []);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ambil data berita berdasarkan id
// GET detail berita + foto
app.get("/api/berita/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rowsBerita] = await pool.query(
      "SELECT * FROM berita WHERE id_berita = ?",
      [id],
    );

    const [rowsFoto] = await pool.query(
      "SELECT * FROM foto_berita WHERE id_berita = ?",
      [id],
    );

    res.json({ ...rowsBerita[0], fotos: rowsFoto });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE foto berdasarkan id foto
app.delete("/api/foto/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Ambil nama file dari database
    const [rows] = await pool.query(
      "SELECT foto FROM foto_berita WHERE id_foto = ?",
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Foto tidak ditemukan" });
    }

    const filename = rows[0].foto;
    const filePath = path.join(__dirname, "uploads", filename);

    // 2️⃣ Hapus data dari database
    await pool.query("DELETE FROM foto_berita WHERE id_foto = ?", [id]);

    // 3️⃣ Hapus file fisik
    fs.unlink(filePath, (err) => {
      if (err) console.error("File tidak ditemukan atau sudah dihapus");
    });

    res.json({ message: "Foto berhasil dihapus" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal menghapus foto" });
  }
});

// delete berita
app.delete("/api/berita/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [rows2] = await pool.query(
      "SELECT id_berita FROM berita WHERE id_berita = ?",
      [id],
    );

    if (rows2.length === 0) {
      return res.status(404).json({ message: "berita tidak ditemukan" });
    }

    // Ambil nama file dari database
    const [rows] = await pool.query(
      "SELECT foto FROM foto_berita WHERE id_berita = ?",
      [id],
    );

    // hapus semua file foto terkait
    for (const row of rows) {
      const filePath = path.join(__dirname, "uploads", row.foto);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("File berhasil dihapus");
        } else {
          console.log("File tidak ditemukan");
        }
      } catch (err) {
        console.error("Gagal menghapus file:", err);
      }
    }
    // Hapus data dari database
    await pool.query("DELETE FROM foto_berita WHERE id_berita = ?", [id]);
    await pool.query("DELETE FROM berita WHERE id_berita = ?", [id]);

    res.json({ message: "Berita berhasil dihapus" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal menghapus berita" });
  }
});

// tambah berita
app.post("/api/berita", upload.array("foto", 5), async (req, res) => {
  const { judul, deskripsi } = req.body;

  // const potoPath = req.file.path ? req.file.path : null;

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    // simpan berita
    const [rows] = await conn.query(
      "INSERT INTO berita (judul_berita, desc_berita) VALUES (?, ?)",
      [judul, deskripsi],
    );
    const idBerita = rows.insertId;

    // simpan foto berita
    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        await conn.query(
          "INSERT INTO foto_berita (id_berita, foto) VALUES (?, ?)",
          [idBerita, file.filename],
        );
      }
    }

    await conn.commit();
    conn.release();

    res.status(201).json({ message: "Berita berhasil ditambahkan" });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// edit berita
app.put("/api/berita/:id", upload.array("foto", 5), async (req, res) => {
  const { id } = req.params;
  const { judul, deskripsi } = req.body;

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    // simpan berita
    await conn.query(
      "UPDATE berita SET judul_berita = ?, desc_berita = ? WHERE id_berita = ?",
      [judul, deskripsi, id],
    );

    // Tambah Foto Baru
    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        await conn.query(
          "INSERT INTO foto_berita (id_berita, foto) VALUES (?, ?)",
          [id, file.filename],
        );
      }
    }

    await conn.commit();
    conn.release();

    res.status(200).json({ message: "Berita berhasil diperbarui" });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// foto client
// ambil data foto client
app.get("/api/foto-client", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM foto_client");
    res.json(rows); // kirim ke React
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// tambah foto client
app.post("/api/add-foto-client", upload.single("foto"), async (req, res) => {
  try {
    const { nama_client } = req.body;

    await pool.query(
      "INSERT INTO foto_client (nama_client, foto) VALUES (?,?)",
      [nama_client, req.file.filename],
    );

    res.status(201).json({ message: "Client Logo berhasil ditambahkan" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// edit foto client
app.put(
  "/api/edit-foto-client/:id",
  upload.single("foto"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { nama_client } = req.body;

      // ambil data lama
      const [rows] = await pool.query(
        "SELECT foto FROM foto_client WHERE id = ?",
        [id],
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "data tidak ditemukan" });
      }

      let newFoto = rows[0].foto;

      // jika ada file baru maka hapus file lama dan update dengan file baru
      if (req.file) {
        if (rows[0].foto) {
          fs.unlinkSync(path.join(__dirname, "uploads", rows[0].foto));
        }
        newFoto = req.file.filename;
      }

      // Update data
      await pool.query(
        "UPDATE foto_client SET nama_client = ?, foto = ? WHERE id = ?",
        [nama_client, newFoto, id],
      );

      res.status(200).json({ message: "Client Logo berhasil diubah" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  },
);

// delete foto client
app.delete("/api/detele-foto-client/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      "SELECT foto FROM foto_client WHERE id = ?",
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "data tidak ditemukan" });
    }

    if (rows[0].foto) {
      fs.unlinkSync(path.join(__dirname, "uploads", rows[0].foto));
    }

    await pool.query("DELETE FROM foto_client WHERE id = ?", [id]);

    res.status(200).json({ message: "Client Logo berhasil dihapus" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// reimburse
// Tambah pengajuan reimbursement
app.post(
  "/api/reimbursements",
  verifyToken,
  uploadReimburse.any(),
  async (req, res) => {
    const conn = await pool.getConnection();

    try {
      const docNumber = await generateDocNumber();
      const user = req.user;

      const { aktivitas, tgl_mulai, tgl_selesai } = req.body;

      await conn.beginTransaction();

      // parsing bukti
      const bukti = req.body.bukti || [];

      // mapping file
      req.files.forEach((file) => {
        const match = file.fieldname.match(/\[(\d+)\]/);

        if (match) {
          const index = match[1];
          if (bukti[index]) {
            bukti[index].proof_file = file.filename;
          }
        }
      });

      // hitung total
      const total = bukti.reduce((acc, item) => {
        return acc + Number(item.jumlah || 0);
      }, 0);

      // insert reimbursement
      const [result] = await conn.query(
        `INSERT INTO reimbursements 
        (document_number, employee_id, employee_name,
        activity_name, start_date, end_date, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          docNumber,
          user.id,
          user.username,
          aktivitas,
          tgl_mulai,
          tgl_selesai,
          total,
        ],
      );

      const reimbursementId = result.insertId;

      // insert detail
      for (const item of bukti) {
        await conn.query(
          `INSERT INTO reimbursement_files
          (id_reimbursement	, jumlah, keterangan, tanggal, namefile)
          VALUES (?, ?, ?, ?, ?)`,
          [
            reimbursementId,
            item.jumlah,
            item.keterangan,
            item.tanggal,
            item.proof_file || null,
          ],
        );
      }

      await conn.commit();
      conn.release();

      res.status(201).json({
        message: "Pengajuan reimburse berhasil",
        document_number: docNumber,
      });
    } catch (err) {
      await conn.rollback();
      conn.release();

      console.error(err);

      res.status(500).json({
        error: err.message,
        message: "Gagal menambahkan pengajuan reimburse",
      });
    }
  },
);

// mengedit pengajuan reimbursement
app.put(
  "/api/edit-reimbursements/:id",
  verifyToken,
  uploadReimburse.any(),
  async (req, res) => {
    const { id } = req.params;
    const { activity_name, start_date, end_date } = req.body;

    let bukti = [];

    try {
      bukti = JSON.parse(req.body.bukti || "[]");
    } catch {
      bukti = [];
    }

    let deletedFiles = [];
    try {
      deletedFiles = JSON.parse(req.body.deletedFiles || "[]");
    } catch {
      deletedFiles = [];
    }

    // 🔥 mapping file
    const buktiMap = {};

    bukti.forEach((item, index) => {
      buktiMap[index] = { ...item };
    });

    req.files.forEach((file) => {
      const match = file.fieldname.match(/bukti\[(\d+)\]\[proof_file\]/);

      if (match) {
        const index = match[1];
        buktiMap[index].proof_file = file.filename;
      }
    });

    const finalBukti = Object.values(buktiMap);

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        "SELECT status FROM reimbursements WHERE id = ?",
        [id],
      );

      if (rows.length === 0) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ message: "Data tidak ditemukan" });
      }

      const currentStatus = rows[0].status;

      if (currentStatus === "Approved") {
        await conn.rollback();
        conn.release();
        return res.status(400).json({
          message: "Reimbursement sudah di-approve dan tidak bisa diubah",
        });
      }

      // hitung total
      const total = finalBukti.reduce((acc, item) => {
        return acc + Number(item.jumlah || 0);
      }, 0);

      await conn.query(
        `UPDATE reimbursements 
         SET activity_name = ?, start_date = ?, end_date = ?, amount = ?, 
         status = 'pending', reject_reason = NULL 
         WHERE id = ?`,
        [activity_name, start_date, end_date, total, id],
      );

      // update/insert bukti baru
      for (const item of finalBukti) {
        const fileName = item.proof_file || item.namefile;

        // kalau data lama (punya id)
        if (item.id) {
          if (item.proof_file && item.namefile) {
            const oldPath = path.join(
              __dirname,
              "uploads/reimbursements",
              item.namefile,
            );

            if (fs.existsSync(oldPath)) {
              await fs.promises.unlink(oldPath);
            }
          }
          await conn.query(
            `UPDATE reimbursement_files
           SET jumlah = ?, keterangan = ?, tanggal = ?, namefile = ?
           WHERE id = ? AND id_reimbursement = ?`,
            [item.jumlah, item.keterangan, item.tanggal, fileName, item.id, id],
          );
        }
        // kalau data baru
        else {
          await conn.query(
            `INSERT INTO reimbursement_files
           (id_reimbursement, jumlah, keterangan, tanggal, namefile)
           VALUES (?, ?, ?, ?, ?)`,
            [id, item.jumlah, item.keterangan, item.tanggal, fileName],
          );
        }
      }

      await conn.commit();
      conn.release();

      res.status(200).json({
        message: "Pengajuan reimburse berhasil diperbarui",
      });
    } catch (err) {
      await conn.rollback();
      conn.release();

      console.error(err);

      res.status(500).json({
        error: err.message,
        message: "Gagal mengedit pengajuan reimburse",
      });
    }
  },
);

// menghapus pengajuan reimbursement
app.delete("/api/delete-reimbursements/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await pool.query(
      "SELECT * FROM reimbursement_files WHERE id_reimbursement = ?",
      [id],
    );

    // hapus file fisik
    for (const row of rows) {
      const filePath = path.join(
        __dirname,
        "uploads/reimbursements",
        row.namefile,
      );
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("File berhasil dihapus");
        } else {
          console.log("File tidak ditemukan");
        }
      } catch (err) {
        console.error("Gagal menghapus file:", err);
      }
    }

    await conn.query("DELETE FROM reimbursements WHERE id = ?", [id]);
    await conn.query(
      "DELETE FROM reimbursement_files WHERE id_reimbursement = ?",
      [id],
    );

    await conn.commit();
    conn.release();

    res.status(200).json({ message: "Pengajuan reimburse berhasil dihapus" });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Ambil riwayat pengajuan reimbursement milik user yang login
app.get("/api/reimbursements/my", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT 
        r.id AS reimbursement_id,
        r.document_number,
        r.activity_name,
        r.start_date,
        r.end_date,
        r.amount,
        r.status,
        r.reject_reason,
        r.created_at,
        f.id AS id_bukti,
        f.jumlah,
        f.keterangan,
        f.tanggal,
        f.namefile
      FROM reimbursements r
      LEFT JOIN reimbursement_files f
        ON r.id = f.id_reimbursement
      WHERE r.employee_id = ?
      ORDER BY f.tanggal ASC`,
      [userId],
    );

    // GROUP DATA
    const map = {};

    rows.forEach((row) => {
      if (!map[row.reimbursement_id]) {
        map[row.reimbursement_id] = {
          id: row.reimbursement_id,
          document_number: row.document_number,
          activity_name: row.activity_name,
          start_date: row.start_date,
          end_date: row.end_date,
          amount: row.amount,
          status: row.status,
          reject_reason: row.reject_reason,
          created_at: row.created_at,
          bukti: [],
        };
      }

      if (row.jumlah !== null) {
        map[row.reimbursement_id].bukti.push({
          id: row.id_bukti,
          jumlah: row.jumlah,
          keterangan: row.keterangan,
          tanggal: row.tanggal,
          namefile: row.namefile,
        });
      }
    });

    res.json(Object.values(map));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengambil riwayat reimburse" });
  }
});

// ambil semua data reimbursement (admin)
app.get("/api/admin/reimbursements", verifyToken, isAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
     SELECT 
  r.id,
  r.document_number,
  r.employee_name,
  r.activity_name,
  r.start_date,
  r.end_date,
  r.amount,
  r.status,
  r.reject_reason,
  r.created_at,

  COALESCE(
    JSON_ARRAYAGG(
      JSON_OBJECT(
        'keterangan', f.keterangan,
        'jumlah', f.jumlah,
        'tanggal', f.tanggal,
        'file', f.namefile
      )
    ),
    JSON_ARRAY()
  ) AS bukti

FROM reimbursements r
LEFT JOIN reimbursement_files f
  ON r.id = f.id_reimbursement

GROUP BY r.id
ORDER BY r.created_at DESC;
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengambil riwayat reimburse" });
  }
});

// mengubah status dari reimbursement
app.patch(
  "/api/admin/reimbursements/:id/status",
  verifyToken,
  isAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { status, reject_reason } = req.body;

    const conn = await pool.getConnection();

    try {
      const [rows] = await conn.query(
        "SELECT status FROM reimbursements WHERE id = ?",
        [id],
      );

      if (rows.length === 0) {
        return res.status(404).json({
          message: "Data tidak ditemukan",
        });
      }

      const currentStatus = rows[0].status;

      if (currentStatus === "Approved") {
        return res.status(400).json({
          message: "Reimbursement sudah di-approve dan tidak bisa diubah",
        });
      }

      const finalRejectionReason = status === "Rejected" ? reject_reason : null;

      await pool.query(
        "UPDATE reimbursements SET status = ?, reject_reason = ? WHERE id = ?",
        [status, finalRejectionReason, id],
      );

      res.status(200).json({ message: "Status berhasil diubah" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Gagal mengubah status" });
    }
  },
);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
