import express from "express";
import { upload } from "../middleware/upload.js";
import {
  mergeHandler,
  splitHandler,
  pdfToTxtHandler,
  pdfToDocxHandler,
} from "../controllers/pdfController.js";

const router = express.Router();

router.post("/merge", upload.array("files", 10), mergeHandler);

router.post("/split", upload.single("file"), splitHandler);

router.post("/pdf-to-txt", upload.single("file"), pdfToTxtHandler);

router.post("/pdf-to-docx", upload.single("file"), pdfToDocxHandler);

export default router;
