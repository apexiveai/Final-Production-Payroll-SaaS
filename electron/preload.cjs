
"use strict";

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("apexiveDesktop", {
  appName: "ApexiveAI Workforce Payroll",
  platform: process.platform,
  isDesktop: true,
});
