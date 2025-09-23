
import { mergePdfs, splitPdfRange, pdfToText, pdfToDocx } from "../services/pdfService.js";
import fs from "fs/promises";
import { createReadStream } from "fs";
import archiver from "archiver";

export async function mergeHandler(req, res) {
  const files = req.files;
  if (!files || files.length < 2) {
    return res.status(400).json({ error: "Upload at least 2 PDFs" });
  }

  try {
    const paths = files.map(f => f.path);
    const buffer = await mergePdfs(paths);

    // cleanup temp files
    for (const p of paths) await fs.unlink(p).catch(() => {});

    // Set headers for zip
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=result.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });

    // Handle archiver errors
    archive.on("error", err => {
      throw err;
    });

    archive.pipe(res);

    // Add merged PDF as file in zip
    archive.append(buffer, { name: "merged.pdf" });

    // Finalize (don’t await this)
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

    archive.on("error", err => {
      throw err;
    });

    archive.pipe(res);

    // Add the split PDF
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
    archive.on("error", (err) => { throw err; });

    archive.pipe(res);

    // Add the txt file inside zip
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


// export async function pdfToDocxHandler(req, res) {
//   const file = req.file;
//   if (!file) return res.status(400).json({ error: "Upload a PDF file" });

//   try {
//     const outPath = await pdfToDocx(file.path);

//     res.setHeader("Content-Type", "application/zip");
//     res.setHeader("Content-Disposition", "attachment; filename=output.zip");

//     const archive = archiver("zip", { zlib: { level: 9 } });
//     archive.on("error", (err) => { throw err; });

//     archive.pipe(res);

//     // Add the docx file into the zip
//     archive.file(outPath, { name: "output.docx" });

//     archive.finalize();

//     archive.on("end", async () => {
//       await fs.unlink(file.path).catch(() => {});
//       await fs.unlink(outPath).catch(() => {});
//     });
//   } catch (err) {
//     await fs.unlink(file.path).catch(() => {});
//     return res.status(500).json({ error: err.message });
//   }
// }




