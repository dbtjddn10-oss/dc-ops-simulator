"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Analytics = require("../analytics.js");

let checks = 0;
function test(name, callback) {
  callback();
  checks += 1;
  process.stdout.write(`PASS ${String(checks).padStart(2, "0")} · ${name}\n`);
}

function loadCatalog() {
  const source = fs.readFileSync(path.join(__dirname, "..", "incidents.js"), "utf8");
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "incidents.js" });
  return context.window.DCOpsData;
}

const data = loadCatalog();
const rank = { EASY: 1, NORMAL: 2, HARD: 3 };
const pool = (difficulty) => data.incidents.filter((incident) => rank[incident.minDifficulty] <= rank[difficulty]);

test("Incident Catalog validation passes", () => assert.equal(data.validation.valid, true));
test("Incident Catalog contains 15 unique records", () => {
  assert.equal(data.incidents.length, 15);
  assert.equal(new Set(data.incidents.map((incident) => incident.incidentId)).size, 15);
});
test("Each Category contains three Incidents", () => {
  assert.deepEqual(Object.values(data.validation.categoryCounts), [3, 3, 3, 3, 3]);
});
test("Difficulty pools remain 7 / 12 / 15", () => {
  assert.deepEqual([pool("EASY").length, pool("NORMAL").length, pool("HARD").length], [7, 12, 15]);
});
test("MTTR formatter handles seconds", () => assert.equal(Analytics.formatDuration(37.24), "37.2s"));
test("MTTR formatter handles minutes", () => assert.equal(Analytics.formatDuration(74.56), "1m 14.6s"));
test("History sorts newest resolved record first", () => {
  assert.deepEqual(Analytics.sortHistory([{ ticketId: "A", resolvedAt: 1 }, { ticketId: "B", resolvedAt: 2 }]).map((item) => item.ticketId), ["B", "A"]);
});
test("History Category and SLA filters combine", () => {
  const records = [
    { category: "SERVER", slaBreached: false, resolvedAt: 1 },
    { category: "SERVER", slaBreached: true, resolvedAt: 2 },
    { category: "NETWORK", slaBreached: true, resolvedAt: 3 }
  ];
  assert.equal(Analytics.filterHistory(records, "SERVER", "BREACHED").length, 1);
});
test("Category Analytics counts generated, resolved and breached", () => {
  const result = Analytics.calculateCategoryAnalytics(
    [{ category: "SERVER", countedInShift: true, createdAt: 0, resolvedAt: 10000, slaBreached: false }],
    [{ category: "SERVER", countedInShift: true, slaBreached: true }]
  ).find((item) => item.category === "SERVER");
  assert.deepEqual({ generated: result.generated, resolved: result.resolved, breached: result.slaBreached }, { generated: 2, resolved: 1, breached: 1 });
  assert.equal(result.averageMttr, 10);
});
test("Hard Investigation Coverage includes unresolved tickets", () => {
  const result = Analytics.calculateInvestigationCoverage([
    { difficulty: "HARD", investigationRequired: true, countedInShift: true, requiredEvidenceCount: 2, countedUsefulCommands: ["top", "uptime"] },
    { difficulty: "HARD", investigationRequired: true, countedInShift: true, requiredEvidenceCount: 2, countedUsefulCommands: ["top"] }
  ]);
  assert.deepEqual(result, { required: 2, completed: 1, incomplete: 1, coverage: 50 });
});
test("Optional tickets do not enter Hard Investigation Coverage", () => {
  assert.equal(Analytics.calculateInvestigationCoverage([{ difficulty: "NORMAL", investigationRequired: false }]).coverage, null);
});
test("RCA report is generated from ticket and play records", () => {
  const report = Analytics.buildIncidentReport({
    ticketId: "TKT-0001", incidentId: "INC-001", title: "Nginx Service Down", category: "SERVER", severity: "P2",
    difficulty: "HARD", affectedRack: "Rack 01", symptom: "HTTP failure", createdAt: 1000, resolvedAt: 38200,
    slaSeconds: 55, appliedSlaSeconds: 44, slaBreached: false, correctDiagnosis: "Nginx Service Down",
    rootCause: "nginx stopped", correctAction: "restart nginx", rewardScore: 125,
    terminalHistory: [{ command: "systemctl status nginx", valid: true }, { command: "journalctl -u nginx", valid: true }],
    countedUsefulCommands: ["systemctl status nginx", "journalctl -u nginx"], investigationEvidence: ["systemctl status nginx"],
    requiredEvidenceCount: 2, investigationRequired: true, eventHistory: [{ type: "INCIDENT_CREATED", timestamp: 1000 }]
  });
  assert.equal(report.summary.mttrSeconds, 37.2);
  assert.equal(report.summary.slaResult, "SLA MET");
  assert.match(report.rca.lessonsLearned, /Service 상태와 로그/);
  assert.equal(report.timeline.length, 1);
});
test("Operator Summary uses rule thresholds", () => {
  const result = Analytics.buildOperatorSummary({ slaCompliance: 100, diagnosisAccuracy: 92, actionAccuracy: 60, resolved: 2, averageMttr: 20, averageAppliedSla: 40 });
  assert.deepEqual(result.strong, ["SLA Compliance", "Diagnosis Accuracy", "MTTR"]);
  assert.deepEqual(result.needsImprovement, ["Action Accuracy"]);
});

process.stdout.write(`\n${checks} automated checks passed.\n`);
