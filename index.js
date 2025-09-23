// app.js
import express from "express";
import pdfRoutes from "./routes/pdfRoutes.js";
import { TMP_DIR } from "./config/index.js";
import fs from "fs";

const app = express();
app.use(express.json());

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

app.use("/api", pdfRoutes);

app.get("/", (req, res) => res.send("PDF Tools API"));

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
