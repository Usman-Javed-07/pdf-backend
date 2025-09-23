import multer from "multer";
import fs from "fs";
import { TMP_DIR } from "../config/index.js";

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${unique}-${file.originalname}`);
  },
});

export const upload = multer({ storage });
