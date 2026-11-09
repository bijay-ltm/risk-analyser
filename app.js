/**
 * Runs express app [web server]: dash.js
 * Runs cron job: ra.js
 */

import cron from "node-cron";
import { spawn } from "child_process";

const originalLog = console.log;
const originalError = console.error;

const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

console.log = (...args) => {
  originalLog(`${GREEN}[APP]${RESET}`, ...args);
};

console.error = (...args) => {
  originalError(`${GREEN}[APP]${RESET}`, ...args);
};

let riskAnalysisRunning = false;

function runRiskAnalysis() {
  if (riskAnalysisRunning) {
    console.log("Risk analysis service already running. Skipping to run it again...");
    return;
  }

  riskAnalysisRunning = true;

  console.log("Starting Risk analysis service...");

  const process = spawn(
    "node",
    ["ra.js"],
    {
      stdio: "inherit"
    }
  );

  process.on("close", (code) => {
    riskAnalysisRunning = false;

    console.log(
      `Risk analysis service finished with code ${code}`
    );
  });

  process.on("error", (error) => {
    riskAnalysisRunning = false;

    console.error(
      "Risk analysis service failed:",
      error
    );
  });
}

runRiskAnalysis();

cron.schedule("*/5 * * * *", () => {
  runRiskAnalysis();
});

import "./dash.js"; // run dash http server
import "./live-db.js" // run live db feeder