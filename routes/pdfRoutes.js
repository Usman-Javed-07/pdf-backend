// routes/pdfRoutes.js
import express from "express";
import { upload } from "../middleware/upload.js";
import {
  mergeHandler,
  splitHandler,
  pdfToTxtHandler,
  pdfToDocxHandler
} from "../controllers/pdfController.js";

const router = express.Router();

// Merge: multipart form, field name "files" (multiple)
router.post("/merge", upload.array("files", 10), mergeHandler);

// Split: single file field "file", query params from & to (1-based)
router.post("/split", upload.single("file"), splitHandler);

// PDF -> TXT
router.post("/pdf-to-txt", upload.single("file"), pdfToTxtHandler);

// PDF -> DOCX
router.post("/pdf-to-docx", upload.single("file"), pdfToDocxHandler);

export default router;
