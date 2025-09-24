import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import { TMP_DIR as CFG_TMP_DIR } from "../config/index.js";

const TMP_DIR = CFG_TMP_DIR || path.join(os.tmpdir(), "pdf-tools");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${unique}-${file.originalname}`);
  },
});

export const uploadAny = multer({ storage });
export const uploadPdf = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isPdf = file.mimetype === "application/pdf" && ext === ".pdf";
    if (isPdf) return cb(null, true);
    cb(new Error("Only PDF files are allowed"));
  },
});
