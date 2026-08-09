(function exposeFloorWorkflow(global) {
  "use strict";

  function normalizeCommand(command) {
    return String(command ?? "").trim().replaceAll(/\s+/g, " ");
  }

  function createVerificationState(usefulCommands, now = Date.now()) {
    const requiredCommand = (Array.isArray(usefulCommands) ? usefulCommands : [])
      .map(normalizeCommand)
      .find(Boolean) ?? "uptime";
    return {
      status: "pending",
      requiredCommands: [requiredCommand],
      completedCommands: [],
      healthyEvidence: `Healthy state confirmed with: ${requiredCommand}`,
      appliedAt: now,
      passedAt: null
    };
  }

  function applyVerificationCommand(verification, command, now = Date.now()) {
    const normalized = normalizeCommand(command);
    if (!verification || verification.status !== "pending" || !verification.requiredCommands.includes(normalized)) {
      return false;
    }
    if (!verification.completedCommands.includes(normalized)) {
      verification.completedCommands.push(normalized);
    }
    const passed = verification.requiredCommands
      .every((requiredCommand) => verification.completedCommands.includes(requiredCommand));
    if (passed) {
      verification.status = "passed";
      verification.passedAt = now;
    }
    return passed;
  }

  const api = Object.freeze({ normalizeCommand, createVerificationState, applyVerificationCommand });
  global.DCOpsWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
