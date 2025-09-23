// controllers/pdfController.js
import { mergePdfs, splitPdfRange, pdfToText, docxToPdf, pdfToDocx } from "../services/pdfService.js";
import fs from "fs/promises";
import { createReadStream } from "fs";

export async function mergeHandler(req, res) {
  // Accepts multiple uploaded files (field name: files)
  const files = req.files;
  if (!files || files.length < 2) return res.status(400).json({ error: "Upload at least 2 PDFs" });
  try {
    const paths = files.map(f => f.path);
    const buffer = await mergePdfs(paths);
    // cleanup uploads
    for (const p of paths) await fs.unlink(p).catch(()=>{});
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=merged.pdf");
    res.send(buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function splitHandler(req, res) {
  // files[0] required; query: from, to (1-based)
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Upload a PDF file" });
  const from = parseInt(req.query.from || "1", 10);
  const to = parseInt(req.query.to || "1", 10);
  try {
    const buffer = await splitPdfRange(file.path, from, to);
    await fs.unlink(file.path).catch(()=>{});
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=split-${from}-${to}.pdf`);
    res.send(buffer);
  } catch (err) {
    await fs.unlink(file.path).catch(()=>{});
    return res.status(500).json({ error: err.message });
  }
}

export async function pdfToTxtHandler(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Upload a PDF file" });
  try {
    const text = await pdfToText(file.path);
    await fs.unlink(file.path).catch(()=>{});
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (err) {
    await fs.unlink(file.path).catch(()=>{});
    return res.status(500).json({ error: err.message });
  }
}

export async function docxToPdfHandler(req, res) {
  // Accepts uploaded docx -> returns pdf
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Upload a DOCX file" });
  try {
    const outPath = await docxToPdf(file.path);
    // stream output
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${outPath.split('/').pop()}`);
    const stream = createReadStream(outPath);
    stream.pipe(res);
    stream.on("end", async () => {
      await fs.unlink(file.path).catch(()=>{});
      await fs.unlink(outPath).catch(()=>{});
    });
  } catch (err) {
    await fs.unlink(file.path).catch(()=>{});
    return res.status(500).json({ error: err.message });
  }
}

export async function pdfToDocxHandler(req, res) {
  // Accepts uploaded pdf -> returns docx
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Upload a PDF file" });
  try {
    const outPath = await pdfToDocx(file.path);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename=${outPath.split('/').pop()}`);
    const stream = createReadStream(outPath);
    stream.pipe(res);
    stream.on("end", async () => {
      await fs.unlink(file.path).catch(()=>{});
      await fs.unlink(outPath).catch(()=>{});
    });
  } catch (err) {
    await fs.unlink(file.path).catch(()=>{});
    return res.status(500).json({ error: err.message });
  }
}
