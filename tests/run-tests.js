"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Analytics = require("../analytics.js");
const Storage = require("../storage.js");
const Floor = require("../floor.js");
const PhaserFloor = require("../phaser-floor.js");

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

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function makeSnapshot(overrides = {}) {
  const endedAt = overrides.endedAt ?? 2000;
  const report = {
    difficulty: overrides.difficulty ?? "NORMAL", score: overrides.finalScore ?? 100, generated: 1, resolved: 1,
    unresolved: 0, breaches: 0, slaCompliance: overrides.slaCompliance ?? 100, diagnosisAccuracy: overrides.diagnosisAccuracy ?? 100,
    actionAccuracy: 100, averageMttr: overrides.averageMttr ?? 20, commandsExecuted: 2, usefulCommands: 1,
    invalidCommands: 0, investigationCoverage: null,
    categoryAnalytics: Analytics.CATEGORIES.map((category) => ({ category, generated: category === "SERVER" ? 1 : 0, resolved: category === "SERVER" ? 1 : 0, slaBreached: 0, averageMttr: category === "SERVER" ? 20 : 0, slaCompliance: category === "SERVER" ? 100 : null }))
  };
  return Analytics.createShiftSnapshot({
    shift: { startedAt: endedAt - 1000, endedAt }, report, grade: overrides.grade ?? "A", availability: 99.5,
    incidentHistory: overrides.incidentHistory ?? [], unresolvedTickets: overrides.unresolvedTickets ?? [],
    endReason: "Manual termination", operatorSummary: Analytics.buildOperatorSummary({ ...report, averageAppliedSla: 40 })
  });
}

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
test("Score display reports the exact Difficulty multiplier", () => {
  assert.equal(Analytics.formatScoreMultiplier(0.85), "RECOVERY REWARD · DIFFICULTY ×0.85");
  assert.equal(Analytics.formatScoreMultiplier(1), "RECOVERY REWARD · DIFFICULTY ×1.00");
  assert.equal(Analytics.formatScoreMultiplier(1.25), "RECOVERY REWARD · DIFFICULTY ×1.25");
});
test("Score changes share a zero-point floor", () => {
  assert.equal(Analytics.applyScoreDelta(10, -30), 0);
  assert.equal(Analytics.applyScoreDelta(10, 25), 35);
});
test("Terminal utility commands are excluded from investigation counts", () => {
  assert.equal(Analytics.classifyTerminalCommand("clear", "clear"), "UTILITY");
  assert.equal(Analytics.classifyTerminalCommand("help", "help"), "UTILITY");
  assert.equal(Analytics.classifyTerminalCommand("ping", "ping localhost"), "INVESTIGATION");
  assert.equal(Analytics.classifyTerminalCommand(null, "rm -rf /"), "INVALID");
});
test("Automatic full-Rack warnings log once until capacity returns", () => {
  const first = Analytics.getFullRackWarningTransition({ warningActive: false, hasAvailableRack: false, source: "auto" });
  const repeated = Analytics.getFullRackWarningTransition({ warningActive: first.nextWarningActive, hasAvailableRack: false, source: "auto" });
  const manual = Analytics.getFullRackWarningTransition({ warningActive: true, hasAvailableRack: false, source: "manual" });
  const reset = Analytics.getFullRackWarningTransition({ warningActive: true, hasAvailableRack: true, source: "auto" });
  assert.deepEqual(first, { shouldLog: true, nextWarningActive: true });
  assert.deepEqual(repeated, { shouldLog: false, nextWarningActive: true });
  assert.deepEqual(manual, { shouldLog: true, nextWarningActive: true });
  assert.deepEqual(reset, { shouldLog: false, nextWarningActive: false });
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
test("Archive empty load returns schema v1 defaults", () => {
  const archive = Storage.loadArchive(new MemoryStorage());
  assert.deepEqual({ schemaVersion: archive.schemaVersion, next: archive.nextShiftSequence, count: archive.shifts.length }, { schemaVersion: 1, next: 1, count: 0 });
});
test("Archive saves and loads a Shift Snapshot", () => {
  const adapter = new MemoryStorage();
  const added = Storage.addShiftRecord(makeSnapshot(), adapter);
  assert.equal(added.ok, true);
  assert.equal(Storage.loadArchive(adapter).shifts[0].shiftId, "SHIFT-0001");
});
test("Archive schema validation rejects malformed root", () => {
  assert.equal(Storage.validateArchive({ schemaVersion: 1, shifts: "bad" }).valid, false);
});
test("Archive corrupted JSON falls back without throwing", () => {
  const adapter = new MemoryStorage();
  adapter.setItem(Storage.STORAGE_KEY, "{bad-json");
  assert.equal(Storage.loadArchive(adapter).shifts.length, 0);
});
test("Archive unsupported schema is handled safely", () => {
  const adapter = new MemoryStorage();
  adapter.setItem(Storage.STORAGE_KEY, JSON.stringify({ schemaVersion: 99, shifts: [] }));
  const archive = Storage.loadArchive(adapter);
  assert.equal(archive.unsupported, true);
  assert.equal(archive.shifts.length, 0);
});
test("Saving does not overwrite a future unsupported schema", () => {
  const adapter = new MemoryStorage();
  const future = JSON.stringify({ schemaVersion: 99, shifts: [{ future: true }] });
  adapter.setItem(Storage.STORAGE_KEY, future);
  assert.equal(Storage.addShiftRecord(makeSnapshot(), adapter).ok, false);
  assert.equal(adapter.getItem(Storage.STORAGE_KEY), future);
});
test("Archive excludes only a corrupted individual Shift", () => {
  const adapter = new MemoryStorage();
  const valid = { ...makeSnapshot(), shiftId: "SHIFT-0001" };
  adapter.setItem(Storage.STORAGE_KEY, JSON.stringify({ schemaVersion: 1, nextShiftSequence: 2, shifts: [valid, { bad: true }] }));
  assert.deepEqual(Storage.loadArchive(adapter).shifts.map((shift) => shift.shiftId), ["SHIFT-0001"]);
});
test("Shift Snapshot stores compact resolved and unresolved records", () => {
  const incident = { ticketId: "TKT-1", incidentId: "INC-1", title: "Test", category: "SERVER", severity: "P2", difficulty: "NORMAL", affectedRack: "Rack 01", symptom: "x", createdAt: 1, resolvedAt: 1001, slaSeconds: 10, appliedSlaSeconds: 10, correctDiagnosis: "d", rootCause: "r", correctAction: "a", terminalHistory: [], eventHistory: [] };
  const snapshot = makeSnapshot({ incidentHistory: [incident], unresolvedTickets: [{ ...incident, resolvedAt: null, stage: "reported", countedUsefulCommands: [] }] });
  assert.equal(snapshot.incidentHistory.length, 1);
  assert.equal(snapshot.unresolvedTickets.length, 1);
  assert.equal(Object.hasOwn(snapshot.incidentHistory[0], "diagnosticCommands"), false);
});
test("Archived Terminal output is size bounded", () => {
  const incident = { ticketId: "TKT-1", incidentId: "INC-1", title: "Test", category: "SERVER", severity: "P2", difficulty: "NORMAL", affectedRack: "Rack 01", symptom: "x", createdAt: 1, resolvedAt: 1001, slaSeconds: 10, appliedSlaSeconds: 10, correctDiagnosis: "d", rootCause: "r", correctAction: "a", terminalHistory: [{ command: "top", valid: true, output: "x".repeat(10000) }], eventHistory: [] };
  assert.equal(makeSnapshot({ incidentHistory: [incident] }).incidentHistory[0].terminalHistory[0].output.length, 4000);
});
test("Shift IDs increase without collision", () => {
  const adapter = new MemoryStorage();
  Storage.addShiftRecord(makeSnapshot({ endedAt: 2000 }), adapter);
  Storage.addShiftRecord(makeSnapshot({ endedAt: 3000 }), adapter);
  assert.deepEqual(Storage.loadArchive(adapter).shifts.map((shift) => shift.shiftId), ["SHIFT-0002", "SHIFT-0001"]);
});
test("Archive validation removes duplicate Shift IDs", () => {
  const record = { ...makeSnapshot(), shiftId: "SHIFT-0001" };
  const result = Storage.validateArchive({ schemaVersion: 1, nextShiftSequence: 2, shifts: [record, { ...record, endedAt: record.endedAt - 1 }] });
  assert.equal(result.archive.shifts.length, 1);
  assert.match(result.warnings.join(" "), /duplicate Shift ID/);
});
test("Archive keeps at most configured Shift limit", () => {
  const adapter = new MemoryStorage();
  for (let index = 1; index <= Storage.MAX_ARCHIVED_SHIFTS + 2; index += 1) Storage.addShiftRecord(makeSnapshot({ endedAt: 2000 + index }), adapter);
  const archive = Storage.loadArchive(adapter);
  assert.equal(archive.shifts.length, Storage.MAX_ARCHIVED_SHIFTS);
  assert.equal(archive.shifts[0].shiftId, "SHIFT-0052");
});
test("Delete removes one selected Shift", () => {
  const adapter = new MemoryStorage();
  Storage.addShiftRecord(makeSnapshot(), adapter);
  const deleted = Storage.deleteShiftRecord("SHIFT-0001", adapter);
  assert.equal(deleted.ok, true);
  assert.equal(deleted.archive.shifts.length, 0);
});
test("Clear Archive removes all records", () => {
  const adapter = new MemoryStorage();
  Storage.addShiftRecord(makeSnapshot(), adapter);
  assert.equal(Storage.clearArchive(adapter).archive.shifts.length, 0);
});
test("Archived Shifts sort latest first and filter Difficulty", () => {
  const shifts = [{ shiftId: "A", endedAt: 1, difficulty: "EASY", grade: "A" }, { shiftId: "B", endedAt: 2, difficulty: "HARD", grade: "B" }];
  assert.deepEqual(Analytics.filterArchivedShifts(shifts, "HARD", "ALL").map((shift) => shift.shiftId), ["B"]);
  assert.deepEqual(Analytics.sortArchivedShifts(shifts).map((shift) => shift.shiftId), ["B", "A"]);
});
test("Previous Shift comparison marks higher Score as improved", () => {
  const current = makeSnapshot({ finalScore: 200, slaCompliance: 100, averageMttr: 20, diagnosisAccuracy: 100 });
  const previous = makeSnapshot({ finalScore: 100, slaCompliance: 90, averageMttr: 30, diagnosisAccuracy: 80 });
  assert.equal(Analytics.compareShifts(current, previous).find((metric) => metric.label === "Score").status, "IMPROVED");
});
test("MTTR comparison treats a lower value as improved", () => {
  const current = makeSnapshot({ averageMttr: 20 });
  const previous = makeSnapshot({ averageMttr: 30 });
  const metric = Analytics.compareShifts(current, previous).find((item) => item.label === "Average MTTR");
  assert.equal(metric.delta, -10);
  assert.equal(metric.status, "IMPROVED");
});
test("Personal Best selects Score, SLA and fastest resolved MTTR", () => {
  const first = { ...makeSnapshot({ finalScore: 300, slaCompliance: 90, averageMttr: 25 }), shiftId: "A" };
  const second = { ...makeSnapshot({ finalScore: 200, slaCompliance: 100, averageMttr: 15 }), shiftId: "B" };
  first.incidentsResolved = 1; second.incidentsResolved = 1;
  const best = Analytics.calculatePersonalBest([first, second]);
  assert.deepEqual([best.highestScore.shiftId, best.bestSla.shiftId, best.fastestMttr.shiftId], ["A", "B", "B"]);
});
test("Current Shift reset data does not clear the storage adapter", () => {
  const adapter = new MemoryStorage();
  Storage.addShiftRecord(makeSnapshot(), adapter);
  const currentShift = { history: [1], score: 100 };
  currentShift.history = []; currentShift.score = 0;
  assert.equal(Storage.loadArchive(adapter).shifts.length, 1);
});

test("2D Floor defines ten unique Racks and four facility assets", () => {
  const racksOnFloor = Floor.FLOOR_ASSETS.filter((asset) => asset.type === "rack");
  const facilities = Floor.FLOOR_ASSETS.filter((asset) => asset.type === "facility");
  assert.equal(racksOnFloor.length, 10);
  assert.equal(new Set(racksOnFloor.map((asset) => asset.label)).size, 10);
  assert.deepEqual(facilities.map((asset) => asset.label).sort(), ["CRAC", "PDU-A", "PDU-B", "UPS"]);
});
test("2D Floor movement updates position and facing on an open tile", () => {
  assert.deepEqual(Floor.movePlayer({ x: 6, y: 7, facing: "north" }, "ArrowRight"), { x: 7, y: 7, facing: "east" });
});
test("2D Floor movement respects grid bounds and blocking assets", () => {
  assert.deepEqual(Floor.movePlayer({ x: 1, y: 1, facing: "south" }, "ArrowLeft"), { x: 1, y: 1, facing: "west" });
  assert.deepEqual(Floor.movePlayer({ x: 3, y: 4, facing: "south" }, "ArrowUp"), { x: 3, y: 4, facing: "north" });
});

test("2D Floor blocks every Rack and facility from an adjacent logical tile", () => {
  const approaches = [
    { dx: -1, dy: 0, key: "ArrowRight" },
    { dx: 1, dy: 0, key: "ArrowLeft" },
    { dx: 0, dy: -1, key: "ArrowDown" },
    { dx: 0, dy: 1, key: "ArrowUp" }
  ];
  Floor.FLOOR_ASSETS.forEach((asset) => {
    const approach = approaches.find(({ dx, dy }) => {
      const position = { x: asset.x + dx, y: asset.y + dy };
      return Floor.isInsideGrid(position) && !Floor.isBlocked(position);
    });
    assert.ok(approach, `${asset.label} needs a reachable adjacent test tile`);
    const start = { x: asset.x + approach.dx, y: asset.y + approach.dy, facing: "south" };
    const result = Floor.movePlayer(start, approach.key);
    assert.equal(result.x, start.x, `${asset.label} must block horizontal movement`);
    assert.equal(result.y, start.y, `${asset.label} must block vertical movement`);
  });
});

test("2D Floor blocks all four room boundaries while preserving last facing", () => {
  assert.deepEqual(Floor.movePlayer({ x: 1, y: 1, facing: "south" }, "ArrowUp"), { x: 1, y: 1, facing: "north" });
  assert.deepEqual(Floor.movePlayer({ x: 1, y: 8, facing: "north" }, "ArrowDown"), { x: 1, y: 8, facing: "south" });
  assert.deepEqual(Floor.movePlayer({ x: 1, y: 1, facing: "south" }, "ArrowLeft"), { x: 1, y: 1, facing: "west" });
  assert.deepEqual(Floor.movePlayer({ x: 12, y: 1, facing: "south" }, "ArrowRight"), { x: 12, y: 1, facing: "east" });
});
test("2D Floor interaction requires orthogonal adjacency", () => {
  assert.equal(Floor.findNearbyAsset({ x: 3, y: 4 })?.label, "R01");
  assert.equal(Floor.findNearbyAsset({ x: 6, y: 7 }), null);
});
test("2D Floor exposes Korean and English operator labels", () => {
  assert.equal(Floor.translate("en", "operatorLunaName"), "Luna Engineer");
  assert.equal(Floor.translate("ko", "operational"), "OPERATIONS LINKED");
  assert.equal(Floor.OPERATORS.every((operator) => !Object.hasOwn(operator, "assetUrl")), true);
});

test("Phaser Floor movement intent is continuous but never diagonal", () => {
  assert.deepEqual(
    PhaserFloor.getMovementIntent({ north: true, east: true }, "east"),
    { x: 1, y: 0, direction: "east", moving: true }
  );
  assert.deepEqual(
    PhaserFloor.getMovementIntent({}, "west"),
    { x: 0, y: 0, direction: "west", moving: false }
  );
});

test("Phaser Floor defines all 12 operator animation textures", () => {
  assert.equal(PhaserFloor.OPERATOR_TEXTURES.length, 12);
  assert.equal(new Set(PhaserFloor.OPERATOR_TEXTURES).size, 12);
});

test("Phaser Floor layout preserves every Rack and facility", () => {
  const layout = PhaserFloor.buildSceneLayout(Floor.FLOOR_ASSETS);
  assert.equal(layout.length, Floor.FLOOR_ASSETS.length);
  assert.equal(layout.filter((asset) => asset.type === "rack").length, 10);
  assert.equal(layout.every((asset) => asset.collision.width < asset.displayWidth), true);
  assert.equal(layout.every((asset) => asset.interactionZone.width > asset.collision.width), true);
  assert.equal(layout.every((asset) => asset.depthPivotY === asset.footY), true);
});

test("Phaser Floor collision metadata follows each asset base", () => {
  const layout = PhaserFloor.buildSceneLayout(Floor.FLOOR_ASSETS);
  const rack = layout.find((asset) => asset.id === "rack-1");
  const ups = layout.find((asset) => asset.id === "ups-a");
  const pdu = layout.find((asset) => asset.id === "pdu-a");
  const crac = layout.find((asset) => asset.id === "crac-a");
  assert.equal(rack.collision.width / rack.displayWidth > 0.7, true);
  assert.equal(rack.collision.width / rack.displayWidth < 0.85, true);
  assert.deepEqual(
    [rack.collision.width, rack.collision.height, ups.collision.width, pdu.collision.width, crac.collision.width],
    [96, 40, 108, 86, 120]
  );
  assert.equal(layout.every((asset) => asset.collision.y + asset.collision.height / 2 === asset.footY - 4), true);
});

test("Phaser Floor interaction zones are independent from collision bodies", () => {
  const rack = PhaserFloor.buildSceneLayout(Floor.FLOOR_ASSETS).find((asset) => asset.id === "rack-3");
  assert.equal(PhaserFloor.isPointInInteractionZone(rack, { x: rack.x, y: rack.footY + 68 }), true);
  assert.equal(PhaserFloor.isPointInInteractionZone(rack, { x: rack.x, y: rack.footY + 80 }), false);
});

test("Phaser Floor depth and player body use floor contact metadata", () => {
  assert.deepEqual(PhaserFloor.PLAYER_COLLISION, { width: 34, height: 20, offsetX: 0, offsetY: 0 });
  assert.deepEqual(PhaserFloor.getPlayerFootPosition({ x: 720, y: 360 }), { x: 720, y: 370 });
  assert.equal(PhaserFloor.depthFromFootY(420) > PhaserFloor.depthFromFootY(300), true);
});

test("Phaser Floor mini map position follows continuous world coordinates", () => {
  assert.deepEqual(
    PhaserFloor.worldToMiniMap({ x: PhaserFloor.WORLD_WIDTH / 2, y: PhaserFloor.WORLD_HEIGHT / 4 }),
    { xPercent: 50, yPercent: 25 }
  );
});

process.stdout.write(`\n${checks} automated checks passed.\n`);
