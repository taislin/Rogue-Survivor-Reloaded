import express from "express";
import path from "path";

const PORT = Number(process.env.PORT ?? 8080);
const DIST = path.resolve(__dirname, "../../dist");

const app = express();

// Serve the Vite-built bundle
app.use(
  express.static(DIST, {
    // Correct MIME types for Vite outputs
    setHeaders(res, filePath) {
      if (filePath.endsWith(".js"))   res.setHeader("Content-Type", "application/javascript");
      if (filePath.endsWith(".mjs"))  res.setHeader("Content-Type", "application/javascript");
      if (filePath.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
    },
  }),
);

// SPA fallback: anything not matched serves index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[RogueSurvivor] Production server running at http://localhost:${PORT}`);
});
