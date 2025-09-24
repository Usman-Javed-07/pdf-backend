import {
  mergePdfs,
  splitPdfRange,
  pdfToText,
  pdfToDocx,
} from "../services/pdfService.js";
import fs from "fs/promises";
import { createReadStream } from "fs";
import archiver from "archiver";
import Tesseract from "tesseract.js";
import path from "path";

export async function mergeHandler(req, res) {
  const files = req.files;
  if (!files || files.length < 2) {
    return res.status(400).json({ error: "Upload at least 2 PDFs" });
  }

  try {
    const paths = files.map((f) => f.path);
    const buffer = await mergePdfs(paths);
    for (const p of paths) await fs.unlink(p).catch(() => {});
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=result.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(res);

    archive.append(buffer, { name: "merged.pdf" });

    archive.finalize();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function splitHandler(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Upload a PDF file" });

  try {
    const from = parseInt(req.query.from || "1", 10);
    const to = parseInt(req.query.to || "1", 10);

    const buffer = await splitPdfRange(file.path, from, to);
    await fs.unlink(file.path).catch(() => {});

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=split.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(res);

    archive.append(buffer, { name: `split-${from}-${to}.pdf` });

    archive.finalize();
  } catch (err) {
    await fs.unlink(file.path).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}

export async function pdfToTxtHandler(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Upload a PDF file" });

  try {
    const text = await pdfToText(file.path);
    await fs.unlink(file.path).catch(() => {});

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=output.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(res);

    archive.append(text, { name: "output.txt" });

    archive.finalize();
  } catch (err) {
    await fs.unlink(file.path).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}

export async function pdfToDocxHandler(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Upload a PDF file" });
  try {
    const outPath = await pdfToDocx(file.path);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${outPath.split("/").pop()}`
    );
    const stream = createReadStream(outPath);
    stream.pipe(res);
    stream.on("end", async () => {
      await fs.unlink(file.path).catch(() => {});
      await fs.unlink(outPath).catch(() => {});
    });
  } catch (err) {
    await fs.unlink(file.path).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}

export async function ocrImageToTextHandler(req, res) {
  // Accept either single or multiple uploads
  const uploaded = [];
  if (req.file) uploaded.push(req.file);
  if (req.files && req.files.length) uploaded.push(...req.files);

  if (!uploaded.length) {
    return res.status(400).json({ error: "Upload at least one image file" });
  }

  // Prepare zip stream
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=ocr_output.zip");
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => { throw err; });
  archive.pipe(res);

  try {
    for (const f of uploaded) {
      // Run OCR
      const { data: { text } } = await Tesseract.recognize(f.path, "eng");

      // Name the output text file after the image
      const base = path.basename(f.originalname || f.filename || "image", path.extname(f.originalname || f.filename || ""));
      archive.append(text || "", { name: `${base || "image"}.txt` });

      // Clean up the uploaded file
      await fs.unlink(f.path).catch(() => {});
    }

    await archive.finalize();
  } catch (err) {
    // Best-effort cleanup
    await Promise.all(uploaded.map(u => fs.unlink(u.path).catch(() => {})));
    return res.status(500).json({ error: err.message || "OCR failed" });
  }
}