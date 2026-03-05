import multer from "multer";
import path from "path";
import fs from "fs";

const reimburseDir = "uploads/reimbursements";

if (!fs.existsSync(reimburseDir)) {
  fs.mkdirSync(reimburseDir, { recursive: true });
}

const reimburseStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, reimburseDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  },
});

const uploadReimburse = multer({
  storage: reimburseStorage,
  //   limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("File harus gambar"));
    }
    cb(null, true);
  },
});

export default uploadReimburse;
