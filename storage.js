(function exposeDcOpsStorage(global) {
  "use strict";

  const STORAGE_KEY = "dcOpsShiftArchive";
  const CURRENT_SCHEMA_VERSION = 1;
  const MAX_ARCHIVED_SHIFTS = 50;
  const DIFFICULTIES = new Set(["EASY", "NORMAL", "HARD"]);
  const CATEGORIES = new Set(["SERVER", "STORAGE", "NETWORK", "POWER", "COOLING"]);
  const GRADES = new Set(["S", "A", "B", "C", "D", "F"]);

  function createEmptyArchive() {
    return { schemaVersion: CURRENT_SCHEMA_VERSION, nextShiftSequence: 1, shifts: [] };
  }

  function isFiniteNumber(value) {
    return Number.isFinite(value);
  }

  function isValidShiftRecord(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return false;
    if (record.schemaVersion !== CURRENT_SCHEMA_VERSION) return false;
    if (!/^SHIFT-\d{4,}$/.test(record.shiftId ?? "")) return false;
    if (!isFiniteNumber(record.startedAt) || !isFiniteNumber(record.endedAt) || record.endedAt < record.startedAt) return false;
    if (!DIFFICULTIES.has(record.difficulty)) return false;
    if (!GRADES.has(record.grade) || typeof record.endReason !== "string" || !isFiniteNumber(record.durationSeconds)) return false;
    if (record.investigationCoverage !== null && !isFiniteNumber(record.investigationCoverage)) return false;
    const numericFields = [
      "finalScore", "availability", "incidentsGenerated", "incidentsResolved", "unresolvedCount",
      "slaBreaches", "slaCompliance", "averageMttr", "diagnosisAccuracy", "actionAccuracy",
      "commandsExecuted", "usefulCommands", "invalidCommands"
    ];
    if (numericFields.some((field) => !isFiniteNumber(record[field]))) return false;
    if (!Array.isArray(record.categoryAnalytics) || !record.categoryAnalytics.every((category) =>
      category && typeof category === "object" && CATEGORIES.has(category.category) &&
      ["generated", "resolved", "slaBreached", "averageMttr"].every((field) => isFiniteNumber(category[field])) &&
      (category.slaCompliance === null || isFiniteNumber(category.slaCompliance))
    )) return false;
    if (!Array.isArray(record.incidentHistory) || !record.incidentHistory.every((ticket) =>
      ticket && typeof ticket.ticketId === "string" && CATEGORIES.has(ticket.category) &&
      isFiniteNumber(ticket.createdAt) && isFiniteNumber(ticket.resolvedAt) &&
      Array.isArray(ticket.terminalHistory) && Array.isArray(ticket.eventHistory)
    )) return false;
    if (!Array.isArray(record.unresolvedTickets) || !record.unresolvedTickets.every((ticket) =>
      ticket && typeof ticket.ticketId === "string" && CATEGORIES.has(ticket.category) && isFiniteNumber(ticket.createdAt) && typeof ticket.stage === "string"
    )) return false;
    if (!record.operatorSummary || typeof record.operatorSummary !== "object" || Array.isArray(record.operatorSummary) ||
      !Array.isArray(record.operatorSummary.strong) || !record.operatorSummary.strong.every((item) => typeof item === "string") ||
      !Array.isArray(record.operatorSummary.needsImprovement) || !record.operatorSummary.needsImprovement.every((item) => typeof item === "string")) return false;
    return true;
  }

  function validateArchive(value) {
    const warnings = [];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { valid: false, unsupported: false, archive: createEmptyArchive(), warnings: ["Archive root is not an object."] };
    }
    if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      return {
        valid: false,
        unsupported: Number.isFinite(value.schemaVersion),
        archive: createEmptyArchive(),
        warnings: [`Unsupported archive schema: ${String(value.schemaVersion)}`]
      };
    }
    if (!Array.isArray(value.shifts)) {
      return { valid: false, unsupported: false, archive: createEmptyArchive(), warnings: ["Archive shifts is not an array."] };
    }

    const validShifts = value.shifts.filter((record, index) => {
      const valid = isValidShiftRecord(record);
      if (!valid) warnings.push(`Ignored corrupted Shift record at index ${index}.`);
      return valid;
    }).sort((left, right) => right.endedAt - left.endedAt);
    const seenIds = new Set();
    const shifts = validShifts.filter((record) => {
      if (seenIds.has(record.shiftId)) {
        warnings.push(`Ignored duplicate Shift ID ${record.shiftId}.`);
        return false;
      }
      seenIds.add(record.shiftId);
      return true;
    }).slice(0, MAX_ARCHIVED_SHIFTS);
    const highestSequence = shifts.reduce((highest, shift) => {
      const sequence = Number(shift.shiftId.replace("SHIFT-", ""));
      return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
    }, 0);
    const requestedNext = Number(value.nextShiftSequence);
    const nextShiftSequence = Math.max(
      highestSequence + 1,
      Number.isInteger(requestedNext) && requestedNext > 0 ? requestedNext : 1
    );
    return {
      valid: true,
      unsupported: false,
      archive: { schemaVersion: CURRENT_SCHEMA_VERSION, nextShiftSequence, shifts },
      warnings
    };
  }

  function getAdapter(adapter) {
    if (adapter) return adapter;
    try {
      return global.localStorage ?? null;
    } catch (error) {
      console.warn("DC OPS Archive: LocalStorage is unavailable.", error);
      return null;
    }
  }

  function loadArchive(adapter) {
    const storage = getAdapter(adapter);
    if (!storage) return { ...createEmptyArchive(), warnings: ["LocalStorage is unavailable."], storageAvailable: false };
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return { ...createEmptyArchive(), warnings: [], storageAvailable: true };
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        console.warn("DC OPS Archive: corrupted JSON was ignored.");
        return { ...createEmptyArchive(), warnings: ["Corrupted archive JSON was ignored."], storageAvailable: true };
      }
      const result = validateArchive(parsed);
      result.warnings.forEach((warning) => console.warn(`DC OPS Archive: ${warning}`));
      return { ...result.archive, warnings: result.warnings, storageAvailable: true, unsupported: result.unsupported };
    } catch (error) {
      console.warn("DC OPS Archive: load failed.", error);
      return { ...createEmptyArchive(), warnings: ["Archive could not be loaded."], storageAvailable: false };
    }
  }

  function saveArchive(archive, adapter) {
    const storage = getAdapter(adapter);
    if (!storage) return { ok: false, reason: "LocalStorage is unavailable." };
    const validation = validateArchive(archive);
    if (!validation.valid) return { ok: false, reason: validation.warnings[0] ?? "Archive validation failed." };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(validation.archive));
      return { ok: true, archive: validation.archive, warnings: validation.warnings };
    } catch (error) {
      console.warn("DC OPS Archive: save failed.", error);
      return { ok: false, reason: "Archive could not be saved." };
    }
  }

  function addShiftRecord(snapshot, adapter) {
    const archive = loadArchive(adapter);
    if (archive.unsupported) return { ok: false, reason: "Unsupported archive schema was preserved.", archive, record: null };
    const sequence = archive.nextShiftSequence;
    const record = {
      ...snapshot,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      shiftId: `SHIFT-${String(sequence).padStart(4, "0")}`
    };
    if (!isValidShiftRecord(record)) return { ok: false, reason: "Shift snapshot validation failed.", archive, record: null };
    const nextArchive = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      nextShiftSequence: sequence + 1,
      shifts: [record, ...archive.shifts]
        .sort((left, right) => right.endedAt - left.endedAt)
        .slice(0, MAX_ARCHIVED_SHIFTS)
    };
    const saved = saveArchive(nextArchive, adapter);
    return saved.ok
      ? { ok: true, archive: { ...saved.archive, warnings: saved.warnings ?? [], storageAvailable: true }, record }
      : { ok: false, reason: saved.reason, archive, record: null };
  }

  function deleteShiftRecord(shiftId, adapter) {
    const archive = loadArchive(adapter);
    if (archive.unsupported) return { ok: false, reason: "Unsupported archive schema was preserved.", archive };
    const shifts = archive.shifts.filter((shift) => shift.shiftId !== shiftId);
    if (shifts.length === archive.shifts.length) return { ok: false, reason: "Shift record was not found.", archive };
    const saved = saveArchive({ ...archive, shifts }, adapter);
    return saved.ok
      ? { ok: true, archive: { ...saved.archive, warnings: [], storageAvailable: true } }
      : { ok: false, reason: saved.reason, archive };
  }

  function clearArchive(adapter) {
    const storage = getAdapter(adapter);
    if (!storage) return { ok: false, reason: "LocalStorage is unavailable.", archive: createEmptyArchive() };
    try {
      storage.removeItem(STORAGE_KEY);
      return { ok: true, archive: { ...createEmptyArchive(), warnings: [], storageAvailable: true } };
    } catch (error) {
      console.warn("DC OPS Archive: clear failed.", error);
      return { ok: false, reason: "Archive could not be cleared.", archive: loadArchive(adapter) };
    }
  }

  const api = Object.freeze({
    STORAGE_KEY,
    CURRENT_SCHEMA_VERSION,
    MAX_ARCHIVED_SHIFTS,
    createEmptyArchive,
    isValidShiftRecord,
    validateArchive,
    loadArchive,
    saveArchive,
    addShiftRecord,
    deleteShiftRecord,
    clearArchive
  });

  global.DCOpsStorage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
