
"use strict";

const {
  app,
  BrowserWindow,
  dialog,
  shell,
} = require("electron");

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const APP_PORT = 3210;
const APP_URL = `http://127.0.0.1:${APP_PORT}/login`;

let mainWindow = null;
let serverProcess = null;
let isQuitting = false;

app.setName("ApexiveAI Workforce Payroll");

function getStandaloneServerPath() {
  return path.join(
    app.getAppPath(),
    "frontend",
    ".next",
    "standalone",
    "server.js"
  );
}

function checkServer() {
  return new Promise((resolve) => {
    const request = http.get(
      `http://127.0.0.1:${APP_PORT}/login`,
      (response) => {
        response.resume();
        resolve(response.statusCode >= 200 && response.statusCode < 500);
      }
    );

    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });

    request.on("error", () => resolve(false));
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function startNextServer() {
  if (await checkServer()) return;

  const serverPath = getStandaloneServerPath();

  if (!fs.existsSync(serverPath)) {
    throw new Error(
      `Next.js standalone server not found:\n${serverPath}\n\n` +
      "Run the desktop build preparation script first."
    );
  }

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(APP_PORT),
      HOSTNAME: "127.0.0.1",
    },
    windowsHide: true,
    stdio: "ignore",
  });

  serverProcess.on("error", (error) => {
    console.error("Unable to start Next.js server:", error);
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await checkServer()) return;
    if (serverProcess && serverProcess.exitCode !== null) break;
    await wait(500);
  }

  throw new Error(
    "The local web server did not start. Check the standalone build."
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 680,
    title: "ApexiveAI Workforce Payroll",
    backgroundColor: "#080D18",
    show: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), "electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${APP_PORT}/`)) {
      event.preventDefault();

      if (url.startsWith("https://")) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await startNextServer();
    createWindow();
  } catch (error) {
    console.error(error);

    dialog.showErrorBox(
      "ApexiveAI Workforce Payroll",
      String(error.message || error)
    );

    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && !isQuitting) {
    createWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;

  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
