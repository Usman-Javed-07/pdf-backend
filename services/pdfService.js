// services/pdfService.js
import fs from "fs/promises";
import { readFileSync, createReadStream } from "fs";
import { PDFDocument } from "pdf-lib";
import pdfParse from "pdf-parse";
import { execFile } from "child_process";
import path from "path";
import os from "os";

// Prefer soffice.com on Windows (more stable for headless)
const DEFAULT_SOFFICE =
  process.platform === "win32" ? "soffice.com" : "soffice";
const SOFFICE_PATH = process.env.SOFFICE_PATH || DEFAULT_SOFFICE;

// Use a short, space-free temp base on Windows to avoid weird path issues
const DEFAULT_TMP =
  process.platform === "win32"
    ? "C:\\pdf-tools"
    : path.join(os.tmpdir(), "pdf-tools");

const TMP_BASE_DIR = process.env.TMP_DIR || DEFAULT_TMP;

// ------------------ small helpers ------------------
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}
async function pathExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
function randomId() {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}
function safeBaseName(name) {
  const base = path.basename(name, path.extname(name));
  return base.replace(/[^\w\-]+/g, "_").slice(0, 80) || "output";
}
function toFileUrl(p) {
  let full = path.resolve(p).replace(/\\/g, "/");
  if (!full.startsWith("/")) full = "/" + full; // Windows drive letter
  return `file://${full}`;
}

function execFileP(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, (err, stdout, stderr) => {
      const out = {
        stdout: stdout?.toString?.() ?? String(stdout ?? ""),
        stderr: stderr?.toString?.() ?? String(stderr ?? ""),
      };
      if (err) {
        const e = new Error(
          out.stderr || out.stdout || err.message || "execFile error"
        );
        e.stdout = out.stdout;
        e.stderr = out.stderr;
        return reject(e);
      }
      resolve(out);
    });
  });
}

async function assertSofficeAvailable() {
  try {
    await execFileP(SOFFICE_PATH, ["--version"]);
  } catch (e) {
    const hint = e?.stderr || e?.stdout || e?.message || String(e);
    throw new Error(
      `LibreOffice not found or not executable. Set SOFFICE_PATH or install LibreOffice. Details: ${hint}`
    );
  }
}

// ------------------ your existing helpers ------------------
export async function mergePdfs(filePaths) {
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
  pages.forEach((p) => outPdf.addPage(p));
  return Buffer.from(await outPdf.save());
}

export async function pdfToText(filePath) {
  const dataBuffer = readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

// ------------------ LibreOffice strategies ------------------
async function loRun(args) {
  return execFileP(SOFFICE_PATH, args);
}

// Strategy 1: force Writer import and export DOCX
async function loPdfToDocx_writerImport(safePdf, workDir, profileDir) {
  const expected = path.join(workDir, "out.docx");
  const args = [
    `-env:UserInstallation=${toFileUrl(profileDir)}`,
    "--headless",
    "--norestore",
    "--nolockcheck",
    "--nodefault",
    "--nofirststartwizard",
    "--infilter=writer_pdf_import",
    "--convert-to",
    "docx:MS Word 2007 XML",
    "--outdir",
    workDir,
    safePdf,
  ];
  const out = await loRun(args);
  // LO usually names output after input; rename if needed
  const files = await fs.readdir(workDir);
  const produced = files.find((f) => f.toLowerCase().endsWith(".docx"));
  if (!produced) {
    throw new Error(
      `LO(writer_import) produced no DOCX.\nArgs: ${args.join(" ")}\nStdout:\n${
        out.stdout
      }\nStderr:\n${out.stderr}`
    );
  }
  const producedPath = path.join(workDir, produced);
  if (producedPath !== expected) await fs.rename(producedPath, expected);
  return expected;
}

// Strategy 2: PDF -> ODT (writer8), then ODT -> DOCX
async function loPdfToDocx_viaOdt(safePdf, workDir, profileDir) {
  const odt = path.join(workDir, "mid.odt");
  const docx = path.join(workDir, "out.docx");

  // Step A: to ODT
  {
    const args = [
      `-env:UserInstallation=${toFileUrl(profileDir)}`,
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--nodefault",
      "--nofirststartwizard",
      "--infilter=writer_pdf_import",
      "--convert-to",
      "odt:writer8",
      "--outdir",
      workDir,
      safePdf,
    ];
    const out = await loRun(args);
    const files = await fs.readdir(workDir);
    const produced = files.find((f) => f.toLowerCase().endsWith(".odt"));
    if (!produced) {
      throw new Error(
        `LO(viaODT stepA) produced no ODT.\nArgs: ${args.join(" ")}\nStdout:\n${
          out.stdout
        }\nStderr:\n${out.stderr}`
      );
    }
    const producedPath = path.join(workDir, produced);
    if (producedPath !== odt) await fs.rename(producedPath, odt);
  }

  // Step B: ODT -> DOCX
  {
    const args = [
      `-env:UserInstallation=${toFileUrl(profileDir)}`,
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--nodefault",
      "--nofirststartwizard",
      "--convert-to",
      "docx:MS Word 2007 XML",
      "--outdir",
      workDir,
      odt,
    ];
    const out = await loRun(args);
    const files = await fs.readdir(workDir);
    const produced = files.find((f) => f.toLowerCase().endsWith(".docx"));
    if (!produced) {
      throw new Error(
        `LO(viaODT stepB) produced no DOCX.\nArgs: ${args.join(
          " "
        )}\nStdout:\n${out.stdout}\nStderr:\n${out.stderr}`
      );
    }
    const producedPath = path.join(workDir, produced);
    if (producedPath !== docx) await fs.rename(producedPath, docx);
  }

  return docx;
}

// ------------------ Microsoft Word COM (Windows) ------------------
async function mswordPdfToDocx(inputPdf, outDocx) {
  if (process.platform !== "win32") {
    throw new Error("MS Word COM fallback only available on Windows.");
  }

  // Lazy import to avoid errors on non-Windows
  let winax;
  try {
    // eslint-disable-next-line n/no-unsupported-features/es-syntax
    winax = await import("winax");
  } catch (e) {
    throw new Error("winax module not installed. Run: npm i winax");
  }

  const { ActiveXObject } = winax;
  // Word constants
  const wdFormatXMLDocument = 12; // .docx

  // Use sync COM calls wrapped in a Promise
  return new Promise((resolve, reject) => {
    try {
      const word = new ActiveXObject("Word.Application");
      word.Visible = false;
      word.DisplayAlerts = 0;

      const docs = word.Documents;
      // Open PDF directly; Word will convert to editable
      const doc = docs.Open(
        inputPdf,
        false /*ConfirmConversions*/,
        true /*ReadOnly*/
      );

      // Ensure target dir exists
      fs.mkdir(path.dirname(outDocx), { recursive: true })
        .then(() => {
          doc.SaveAs2(outDocx, wdFormatXMLDocument);
          doc.Close(false);
          word.Quit();
          resolve();
        })
        .catch((err) => {
          try {
            doc.Close(false);
          } catch {}
          try {
            word.Quit();
          } catch {}
          reject(err);
        });
    } catch (err) {
      reject(err);
    }
  });
}

// ------------------ Main: PDF → DOCX with fallbacks ------------------
export async function pdfToDocx(inputPath, outRoot = TMP_BASE_DIR) {
  await ensureDir(outRoot);

  // Guard input ext (router should also enforce mimetype/extension)
  const ext = path.extname(inputPath || "").toLowerCase();
  if (ext !== ".pdf") {
    throw new Error(
      `Invalid input: expected a PDF, got "${ext || "unknown"}".`
    );
  }

  const runId = randomId();
  const runDir = path.join(outRoot, `run-${runId}`);
  const profileDir = path.join(runDir, "lo-profile");
  const workDir = path.join(runDir, "work");
  await ensureDir(profileDir);
  await ensureDir(workDir);

  // Copy to a sanitized name without spaces/paren
  const safePdf = path.join(workDir, "input.pdf");
  await fs.copyFile(inputPath, safePdf);

  const finalOut = path.join(outRoot, `${safeBaseName(inputPath)}.docx`);
  // Remove if exists
  await fs.rm(finalOut, { force: true }).catch(() => {});

  let lastErr = null;

  // Try LibreOffice only if available
  let loAvailable = true;
  try {
    await assertSofficeAvailable();
  } catch (e) {
    loAvailable = false;
    lastErr = e;
  }

  if (loAvailable) {
    // Strategy 1: writer import -> docx
    try {
      const produced = await loPdfToDocx_writerImport(
        safePdf,
        workDir,
        profileDir
      );
      await fs.rename(produced, finalOut);
      await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
      return finalOut;
    } catch (e1) {
      lastErr = e1;
      // continue
    }

    // Strategy 2: via ODT
    try {
      const produced = await loPdfToDocx_viaOdt(safePdf, workDir, profileDir);
      await fs.rename(produced, finalOut);
      await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
      return finalOut;
    } catch (e2) {
      lastErr = e2;
      // fall through
    }
  }

  // Strategy 3: MS Word COM fallback (Windows only)
  if (process.platform === "win32") {
    try {
      await mswordPdfToDocx(safePdf, finalOut);
      await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
      return finalOut;
    } catch (e3) {
      lastErr = e3;
    }
  }

  // Nothing worked — include the last error message(s)
  await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
  throw new Error(
    `All converters failed.\nLast error:\n${
      lastErr?.message || String(lastErr)
    }`
  );
}

// ------------------ Express handler ------------------
export async function pdfToDocxHandler(req, res) {
  const file = req.file;
  if (!file)
    return res
      .status(400)
      .json({ error: "Upload a PDF file with field name 'file'." });

  try {
    const outPath = await pdfToDocx(file.path, TMP_BASE_DIR);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.basename(outPath)}"`
    );

    const stream = createReadStream(outPath);
    stream.pipe(res);

    const cleanupAll = async () => {
      await fs.unlink(file.path).catch(() => {});
      // remove the finalized output we just streamed
      await fs.unlink(outPath).catch(() => {});
    };
    stream.on("close", cleanupAll);
    res.on("finish", cleanupAll);
    res.on("close", cleanupAll);
  } catch (err) {
    await fs.unlink(file.path).catch(() => {});
    return res.status(500).json({
      error: "PDF→DOCX failed",
      details: err?.message || "Unknown error",
    });
  }
}
