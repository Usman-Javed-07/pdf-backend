// services/pdfService.js
import fs from "fs/promises";
import { readFileSync, createReadStream, unlinkSync } from "fs";
import { PDFDocument } from "pdf-lib";
import pdfParse from "pdf-parse";
import { exec } from "child_process";
import { TMP_DIR } from "../config/index.js";
import { promisify } from "util";
const execP = promisify(exec);

async function cleanup(filepath) {
  try { await fs.unlink(filepath); } catch (e) { /* ignore */ }
}

export async function mergePdfs(filePaths) {
  // Accepts array of full file paths, returns Buffer of merged PDF
  const mergedPdf = await PDFDocument.create();
  for (const p of filePaths) {
    const bytes = await fs.readFile(p);
    const pdf = await PDFDocument.load(bytes);
    const copied = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copied.forEach((page) => mergedPdf.addPage(page));
  }
  const out = await mergedPdf.save();
  return Buffer.from(out);
}

export async function splitPdfRange(filePath, from, to) {
  // from and to are 1-based inclusive
  const data = await fs.readFile(filePath);
  const src = await PDFDocument.load(data);
  const total = src.getPageCount();
  if (from < 1) from = 1;
  if (to > total) to = total;
  if (from > to) throw new Error("Invalid page range");

  const outPdf = await PDFDocument.create();
  const indices = [];
  for (let i = from - 1; i <= to - 1; i++) indices.push(i);
  const pages = await outPdf.copyPages(src, indices);
  pages.forEach(p => outPdf.addPage(p));
  return Buffer.from(await outPdf.save());
}

export async function pdfToText(filePath) {
  const dataBuffer = readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text; // plain text
}

async function checkSoffice() {
  try {
    await execP("soffice --version");
    return true;
  } catch (err) {
    throw new Error("LibreOffice (soffice) not found. Install it server-side.");
  }
}

export async function docxToPdf(inputPath, outputDir = TMP_DIR) {
  await checkSoffice();
  // LibreOffice converts in-place to outputDir
  const cmd = `soffice --headless --convert-to pdf --outdir ${outputDir} ${inputPath}`;
  await execP(cmd);
  // produced filename: same base name with .pdf
  const outPath = `${outputDir}/${inputPath.split('/').pop().replace(/\.[^/.]+$/, "")}.pdf`;
  return outPath;
}

export async function pdfToDocx(inputPath, outputDir = TMP_DIR) {
  await checkSoffice();
  const cmd = `soffice --headless --convert-to docx --outdir ${outputDir} ${inputPath}`;
  await execP(cmd);
  const outPath = `${outputDir}/${inputPath.split('/').pop().replace(/\.[^/.]+$/, "")}.docx`;
  return outPath;
}
