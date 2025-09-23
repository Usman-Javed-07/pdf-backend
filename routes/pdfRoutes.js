// routes/pdfRoutes.js
import express from "express";
import { uploadPdf } from "../middleware/upload.js";
import {
  mergeHandler,
  splitHandler,
  pdfToTxtHandler,
  pdfToDocxHandler,
} from "../controllers/pdfController.js";

const router = express.Router();

// Handle Multer (fileFilter/size) errors nicely
function multerErrorGuard(handler) {
  return (req, res, next) => {
    // If uploadPdf threw an error, express will place it in 'req.fileValidationError'? Not by default.
    // Safer: wrap handler in try/catch after multer runs. Also add an early check for req.file(s).
    try {
      return handler(req, res, next);
    } catch (e) {
      return res.status(400).json({ error: e.message || "Invalid upload" });
    }
  };
}

// All these tools should be PDF-only
router.post("/merge", uploadPdf.array("files", 10), (req, res, next) => {
  if (!req.files?.length) {
    return res.status(400).json({ error: "Upload at least 2 PDF files (field name 'files')." });
  }
  return mergeHandler(req, res, next);
});

router.post("/split", uploadPdf.single("file"), (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "Upload a PDF file (field name 'file')." });
  }
  return splitHandler(req, res, next);
});

router.post("/pdf-to-txt", uploadPdf.single("file"), (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "Upload a PDF file (field name 'file')." });
  }
  return pdfToTxtHandler(req, res, next);
});

router.post("/pdf-to-docx", uploadPdf.single("file"), (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "Upload a PDF file (field name 'file')." });
  }
  return pdfToDocxHandler(req, res, next);
});

export default router;
