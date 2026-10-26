
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const frontend = path.join(root, "frontend");
const standalone = path.join(frontend, ".next", "standalone");

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) {
    console.log(`Optional directory not found: ${source}`);
    return;
  }

  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });

  console.log(`Copied: ${source}`);
  console.log(`     -> ${destination}`);
}

const serverFile = path.join(standalone, "server.js");
const staticSource = path.join(frontend, ".next", "static");
const staticDestination = path.join(standalone, ".next", "static");
const publicSource = path.join(frontend, "public");
const publicDestination = path.join(standalone, "public");

if (!fs.existsSync(serverFile)) {
  console.error(
    "ERROR: Next.js standalone server.js was not found.\n" +
    "Run npm run build inside the frontend folder first."
  );
  process.exit(1);
}

if (!fs.existsSync(staticSource)) {
  console.error(`ERROR: Next.js static directory missing: ${staticSource}`);
  process.exit(1);
}

copyDirectory(staticSource, staticDestination);
copyDirectory(publicSource, publicDestination);

console.log("\nDesktop files are prepared.");
console.log(`Standalone server: ${serverFile}`);
