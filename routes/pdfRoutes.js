import express from "express";
import { uploadPdf } from "../middleware/upload.js";
import {
  mergeHandler,
  splitHandler,
  pdfToTxtHandler,
  pdfToDocxHandler,
  ocrImageToTextHandler,
} from "../controllers/pdfController.js";
import multer from "multer";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/merge", uploadPdf.array("files", 10), (req, res, next) => {
  if (!req.files?.length) {
    return res
      .status(400)
      .json({ error: "Upload at least 2 PDF files (field name 'files')." });
  }
  return mergeHandler(req, res, next);
});

router.post("/split", uploadPdf.single("file"), (req, res, next) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "Upload a PDF file (field name 'file')." });
  }
  return splitHandler(req, res, next);
});

router.post("/pdf-to-txt", uploadPdf.single("file"), (req, res, next) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "Upload a PDF file (field name 'file')." });
  }
  return pdfToTxtHandler(req, res, next);
});

router.post("/pdf-to-docx", uploadPdf.single("file"), (req, res, next) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "Upload a PDF file (field name 'file')." });
  }
  return pdfToDocxHandler(req, res, next);
});

router.post("/ocr", upload.any(), ocrImageToTextHandler);

export default router;
