(function startDcOpsGame() {
  "use strict";

  // ---------------- v1.0 설정 ----------------
  const APP_VERSION = "v1.0";
  const Workflow = window.DCOpsWorkflow;
  // URL의 테스트 값은 브라우저 회귀 테스트용입니다. 일반 실행에서는 아래 기본값이 사용됩니다.
  const query = new URLSearchParams(window.location.search);
  const testNumber = (name, fallback) => {
    const value = Number(query.get(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };

  const SHIFT_CONFIG = Object.freeze({
    durationSeconds: testNumber("shiftSeconds", 180),
    simulatedStartMinutes: 22 * 60,
    simulatedDurationMinutes: 8 * 60
  });
  const PLAYER_MOVE_TRANSITION_MS = 105;
  // Keep the legacy ID for Shift/Archive compatibility; Phaser maps it to ops-front-v2/operator-a.
  const FLOOR_OPERATOR_ID = "rookie";

  const testAutoMinMs = query.has("autoMinMs") ? testNumber("autoMinMs", 15000) : null;
  const testAutoMaxMs = query.has("autoMaxMs") ? testNumber("autoMaxMs", 30000) : null;

  // 난이도 밸런스 숫자는 이 객체 한 곳에서 조정합니다.
  const DIFFICULTY_CONFIG = Object.freeze({
    EASY: Object.freeze({
      label: "EASY",
      rank: 1,
      autoIncidentMinMs: testAutoMinMs ?? 20000,
      autoIncidentMaxMs: testAutoMaxMs ?? 35000,
      slaMultiplier: 1.25,
      scoreMultiplier: 0.85,
      investigationRequired: false,
      showInvestigationHint: true,
      investigationGradePenaltyMax: 0
    }),
    NORMAL: Object.freeze({
      label: "NORMAL",
      rank: 2,
      autoIncidentMinMs: testAutoMinMs ?? 15000,
      autoIncidentMaxMs: testAutoMaxMs ?? 30000,
      slaMultiplier: 1,
      scoreMultiplier: 1,
      investigationRequired: false,
      showInvestigationHint: false,
      investigationGradePenaltyMax: 0
    }),
    HARD: Object.freeze({
      label: "HARD",
      rank: 3,
      autoIncidentMinMs: testAutoMinMs ?? 10000,
      autoIncidentMaxMs: testAutoMaxMs ?? 22000,
      slaMultiplier: 0.8,
      scoreMultiplier: 1.25,
      investigationRequired: true,
      showInvestigationHint: false,
      investigationGradePenaltyMax: 10
    })
  });

  // Incident가 늘어날 때 P1~P4 또는 기존 문자열을 여기에 추가하면 Queue 정렬에 반영됩니다.
  const SEVERITY = Object.freeze({
    p1: Object.freeze({ label: "P1", priority: 4 }),
    critical: Object.freeze({ label: "P1", priority: 4 }),
    p2: Object.freeze({ label: "P2", priority: 3 }),
    high: Object.freeze({ label: "P2", priority: 3 }),
    p3: Object.freeze({ label: "P3", priority: 2 }),
    medium: Object.freeze({ label: "P3", priority: 2 }),
    p4: Object.freeze({ label: "P4", priority: 1 }),
    low: Object.freeze({ label: "P4", priority: 1 })
  });

  // 최종 등급 계산 규칙을 한곳에서 조정할 수 있습니다.
  const GRADE_CONFIG = Object.freeze({
    weights: Object.freeze({ sla: 0.4, diagnosis: 0.2, action: 0.2, score: 0.2 }),
    scoreTarget: 500,
    unresolvedPenalty: 10,
    thresholds: Object.freeze([
      Object.freeze({ grade: "S", minimum: 95 }),
      Object.freeze({ grade: "A", minimum: 85 }),
      Object.freeze({ grade: "B", minimum: 75 }),
      Object.freeze({ grade: "C", minimum: 65 }),
      Object.freeze({ grade: "D", minimum: 50 })
    ])
  });

  const STATUS_INFO = Object.freeze({
    healthy: Object.freeze({ ko: "정상", en: "Healthy", color: "green" }),
    warning: Object.freeze({ ko: "경고", en: "Warning", color: "yellow" }),
    critical: Object.freeze({ ko: "장애", en: "Critical", color: "red" })
  });

  const INCIDENTS = Array.isArray(window.DCOpsData?.incidents)
    ? window.DCOpsData.incidents
    : [];
  const Analytics = window.DCOpsAnalytics;
  const Storage = window.DCOpsStorage;
  const Floor = window.DCOpsFloor;
  const initialArchive = Storage.loadArchive();

  function randomBetween(min, max) {
    return Math.round(min + Math.random() * (max - min));
  }

  function createNormalMetrics(isWarning = false) {
    return {
      CPU: isWarning ? randomBetween(67, 78) : randomBetween(18, 48),
      RAM: isWarning ? randomBetween(70, 82) : randomBetween(32, 65),
      Disk: randomBetween(28, 72),
      Network: randomBetween(20, 61)
    };
  }

  function createEmptyStats() {
    return {
      generatedIncidents: 0,
      resolvedIncidents: 0,
      slaBreaches: 0,
      correctDiagnoses: 0,
      wrongDiagnoses: 0,
      correctActions: 0,
      wrongActions: 0,
      totalResolutionTime: 0,
      unresolvedIncidents: 0,
      commandsExecuted: 0,
      usefulCommands: 0,
      invalidCommands: 0
    };
  }

  const racks = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    status: index === 4 ? "warning" : "healthy",
    ticket: null,
    metrics: createNormalMetrics(index === 4),
    terminalHistory: []
  }));

  // 새 교대 때 Rack 05의 Warning을 포함한 최초 상태로 돌아가기 위한 스냅샷입니다.
  const initialRackState = racks.map((rack) => ({
    status: rack.status,
    metrics: { ...rack.metrics }
  }));

  const game = {
    score: 0,
    availability: 100,
    temperature: 21.4,
    selectedId: null,
    ticketSequence: 0,
    lastIncidentId: null,
    incidentHistory: [],
    historyFilters: { category: "ALL", sla: "ALL" },
    selectedHistoryTicketId: null,
    archive: initialArchive,
    archiveFilters: { difficulty: "ALL", grade: "ALL" },
    selectedArchiveShiftId: null,
    selectedArchiveIncidentTicketId: null,
    archiveConfirmAction: null,
    fullRackWarningActive: false,
    selectedDifficulty: "NORMAL",
    floor: {
      player: { x: 6, y: 7, facing: "north" },
      phaserPlayer: null,
      operatorId: FLOOR_OPERATOR_ID,
      language: "ko",
      nearbyAssetId: null
    },
    stats: createEmptyStats(),
    shift: {
      status: "IDLE",
      difficulty: null,
      startedAt: null,
      endedAt: null,
      endsAt: null,
      remainingSeconds: SHIFT_CONFIG.durationSeconds,
      autoIncidentTimerId: null,
      heartbeatIntervalId: null,
      archived: false
    }
  };
  let floorMotionTimerId = null;
  let phaserFloorController = null;
  let terminalHistoryIndex = null;
  let terminalHistoryDraft = "";
  let terminalScrollFrameId = null;
  let activeScenePopup = "none";

  const elements = {
    rackGrid: document.querySelector("#rackGrid"),
    eventLog: document.querySelector("#eventLog"),
    toast: document.querySelector("#toast"),
    score: document.querySelector("#score"),
    scoreTrend: document.querySelector("#scoreTrend"),
    availability: document.querySelector("#availability"),
    temperature: document.querySelector("#temperature"),
    incidentCount: document.querySelector("#incidentCount"),
    incidentTrend: document.querySelector("#incidentTrend"),
    tempTrend: document.querySelector("#tempTrend"),
    selectedRack: document.querySelector("#selectedRack"),
    selectedState: document.querySelector("#selectedState"),
    ticketPanel: document.querySelector("#ticketPanel"),
    ticketEmpty: document.querySelector("#ticketEmpty"),
    ticketContent: document.querySelector("#ticketContent"),
    ticketId: document.querySelector("#ticketId"),
    ticketCategory: document.querySelector("#ticketCategory"),
    ticketSeverity: document.querySelector("#ticketSeverity"),
    ticketTitle: document.querySelector("#ticketTitle"),
    ticketRack: document.querySelector("#ticketRack"),
    ticketSla: document.querySelector("#ticketSla"),
    ticketSymptom: document.querySelector("#ticketSymptom"),
    ticketHint: document.querySelector("#ticketHint"),
    investigationProgress: document.querySelector("#investigationProgress"),
    investigationCurrent: document.querySelector("#investigationCurrent"),
    investigationRequired: document.querySelector("#investigationRequired"),
    investigationBar: document.querySelector("#investigationBar"),
    investigationState: document.querySelector("#investigationState"),
    ticketDiagnosis: document.querySelector("#ticketDiagnosis"),
    ticketDiagnosisText: document.querySelector("#ticketDiagnosisText"),
    ticketRootCause: document.querySelector("#ticketRootCause"),
    decisionPanel: document.querySelector("#decisionPanel"),
    decisionStep: document.querySelector("#decisionStep"),
    decisionTitle: document.querySelector("#decisionTitle"),
    decisionProgress: document.querySelector("#decisionProgress"),
    decisionGuide: document.querySelector("#decisionGuide"),
    decisionOptions: document.querySelector("#decisionOptions"),
    incidentBtn: document.querySelector("#incidentBtn"),
    diagnoseBtn: document.querySelector("#diagnoseBtn"),
    recoverBtn: document.querySelector("#recoverBtn"),
    diagnosisGateMessage: document.querySelector("#diagnosisGateMessage"),
    shiftStatus: document.querySelector("#shiftStatus"),
    shiftGameTime: document.querySelector("#shiftGameTime"),
    shiftRemaining: document.querySelector("#shiftRemaining"),
    shiftSlaBreaches: document.querySelector("#shiftSlaBreaches"),
    currentDifficulty: document.querySelector("#currentDifficulty"),
    difficultySelector: document.querySelector("#difficultySelector"),
    difficultySummary: document.querySelector("#difficultySummary"),
    startShiftBtn: document.querySelector("#startShiftBtn"),
    endShiftBtn: document.querySelector("#endShiftBtn"),
    endShiftConfirmModal: document.querySelector("#endShiftConfirmModal"),
    cancelEndShiftBtn: document.querySelector("#cancelEndShiftBtn"),
    confirmEndShiftBtn: document.querySelector("#confirmEndShiftBtn"),
    incidentQueue: document.querySelector("#incidentQueue"),
    queueEmpty: document.querySelector("#queueEmpty"),
    queueCount: document.querySelector("#queueCount"),
    reportModal: document.querySelector("#reportModal"),
    reportGrade: document.querySelector("#reportGrade"),
    reportScore: document.querySelector("#reportScore"),
    reportGenerated: document.querySelector("#reportGenerated"),
    reportResolved: document.querySelector("#reportResolved"),
    reportUnresolved: document.querySelector("#reportUnresolved"),
    reportBreaches: document.querySelector("#reportBreaches"),
    reportSlaCompliance: document.querySelector("#reportSlaCompliance"),
    reportDiagnosisAccuracy: document.querySelector("#reportDiagnosisAccuracy"),
    reportActionAccuracy: document.querySelector("#reportActionAccuracy"),
    reportMttr: document.querySelector("#reportMttr"),
    reportCommands: document.querySelector("#reportCommands"),
    reportUsefulCommands: document.querySelector("#reportUsefulCommands"),
    reportInvalidCommands: document.querySelector("#reportInvalidCommands"),
    reportDifficulty: document.querySelector("#reportDifficulty"),
    reportInvestigationCoverage: document.querySelector("#reportInvestigationCoverage"),
    reportCategoryPerformance: document.querySelector("#reportCategoryPerformance"),
    reportOperatorSummary: document.querySelector("#reportOperatorSummary"),
    historyOpenBtn: document.querySelector("#historyOpenBtn"),
    historyButtonCount: document.querySelector("#historyButtonCount"),
    historyModal: document.querySelector("#historyModal"),
    historyCloseBtn: document.querySelector("#historyCloseBtn"),
    historyCategoryFilters: document.querySelector("#historyCategoryFilters"),
    historySlaFilters: document.querySelector("#historySlaFilters"),
    historyList: document.querySelector("#historyList"),
    historyEmpty: document.querySelector("#historyEmpty"),
    historyResultCount: document.querySelector("#historyResultCount"),
    historyDetail: document.querySelector("#historyDetail"),
    historyDetailEmpty: document.querySelector("#historyDetailEmpty"),
    historyDetailContent: document.querySelector("#historyDetailContent"),
    archiveOpenBtn: document.querySelector("#archiveOpenBtn"),
    archiveButtonCount: document.querySelector("#archiveButtonCount"),
    archiveModal: document.querySelector("#archiveModal"),
    archiveCloseBtn: document.querySelector("#archiveCloseBtn"),
    archiveClearBtn: document.querySelector("#archiveClearBtn"),
    archiveNotice: document.querySelector("#archiveNotice"),
    archiveDifficultyFilters: document.querySelector("#archiveDifficultyFilters"),
    archiveGradeFilters: document.querySelector("#archiveGradeFilters"),
    archivePersonalBest: document.querySelector("#archivePersonalBest"),
    archiveList: document.querySelector("#archiveList"),
    archiveEmpty: document.querySelector("#archiveEmpty"),
    archiveResultCount: document.querySelector("#archiveResultCount"),
    archiveDetail: document.querySelector("#archiveDetail"),
    archiveDetailEmpty: document.querySelector("#archiveDetailEmpty"),
    archiveDetailContent: document.querySelector("#archiveDetailContent"),
    archiveConfirmModal: document.querySelector("#archiveConfirmModal"),
    archiveConfirmTitle: document.querySelector("#archiveConfirmTitle"),
    archiveConfirmDescription: document.querySelector("#archiveConfirmDescription"),
    archiveConfirmCancelBtn: document.querySelector("#archiveConfirmCancelBtn"),
    archiveConfirmActionBtn: document.querySelector("#archiveConfirmActionBtn"),
    terminalRackLabel: document.querySelector("#terminalRackLabel"),
    terminalSensor: document.querySelector("#terminalSensor"),
    terminalOutput: document.querySelector("#terminalOutput"),
    terminalForm: document.querySelector("#terminalForm"),
    terminalPrompt: document.querySelector("#terminalPrompt"),
    terminalInput: document.querySelector("#terminalInput"),
    terminalRunBtn: document.querySelector("#terminalRunBtn"),
    terminalClearBtn: document.querySelector("#terminalClearBtn"),
    floorStage: document.querySelector("#floorStage"),
    phaserFloorMount: document.querySelector("#phaserFloorMount"),
    phaserFloorStatus: document.querySelector("#phaserFloorStatus"),
    floorAssets: document.querySelector("#floorAssets"),
    floorPlayer: document.querySelector("#floorPlayer"),
    floorPlayerGlyph: document.querySelector("#floorPlayerGlyph"),
    floorPlayerLabel: document.querySelector("#floorPlayerLabel"),
    floorInteractionStatus: document.querySelector("#floorInteractionStatus"),
    floorInteractionPrompt: document.querySelector("#floorInteractionPrompt"),
    floorHudTime: document.querySelector("#floorHudTime"),
    floorHudDifficulty: document.querySelector("#floorHudDifficulty"),
    floorHudScore: document.querySelector("#floorHudScore"),
    floorHudIncidents: document.querySelector("#floorHudIncidents"),
    floorMode: document.querySelector(".floor-mode"),
    floorBriefing: document.querySelector(".floor-briefing"),
    floorMenuToggleBtn: document.querySelector("#floorMenuToggleBtn"),
    floorMenuPanel: document.querySelector("#floorMenuPanel"),
    floorStartShiftBtn: document.querySelector("#floorStartShiftBtn"),
    floorTriggerIncidentBtn: document.querySelector("#floorTriggerIncidentBtn"),
    floorHistoryBtn: document.querySelector("#floorHistoryBtn"),
    floorArchiveBtn: document.querySelector("#floorArchiveBtn"),
    floorDashboardBtn: document.querySelector("#floorDashboardBtn"),
    returnFloorViewBtn: document.querySelector("#returnFloorViewBtn"),
    legacyOperations: document.querySelector(".legacy-operations"),
    floorIncidentEmpty: document.querySelector("#floorIncidentEmpty"),
    floorIncidentContent: document.querySelector("#floorIncidentContent"),
    floorIncidentTicket: document.querySelector("#floorIncidentTicket"),
    floorIncidentCategory: document.querySelector("#floorIncidentCategory"),
    floorIncidentName: document.querySelector("#floorIncidentName"),
    floorIncidentRack: document.querySelector("#floorIncidentRack"),
    floorIncidentSeverity: document.querySelector("#floorIncidentSeverity"),
    floorIncidentStage: document.querySelector("#floorIncidentStage"),
    floorIncidentSla: document.querySelector("#floorIncidentSla"),
    floorIncidentHint: document.querySelector("#floorIncidentHint"),
    floorIncidentPopup: document.querySelector("#floorIncidentPopup"),
    floorIncidentOpenBtn: document.querySelector("#floorIncidentOpenBtn"),
    floorIncidentCloseBtn: document.querySelector("#floorIncidentCloseBtn"),
    floorIncidentButtonCount: document.querySelector("#floorIncidentButtonCount"),
    floorObjectives: document.querySelector("#floorObjectives"),
    floorObjectivesPopup: document.querySelector("#floorObjectivesPopup"),
    floorObjectivesOpenBtn: document.querySelector("#floorObjectivesOpenBtn"),
    floorObjectivesCloseBtn: document.querySelector("#floorObjectivesCloseBtn"),
    floorTerminalPopup: document.querySelector("#floorTerminalPopup"),
    floorTerminalCloseBtn: document.querySelector("#floorTerminalCloseBtn"),
    floorTerminalWorkflow: document.querySelector("#floorTerminalWorkflow"),
    floorTerminalWorkflowStep: document.querySelector("#floorTerminalWorkflowStep"),
    floorTerminalWorkflowStatus: document.querySelector("#floorTerminalWorkflowStatus"),
    floorTerminalWorkflowGuide: document.querySelector("#floorTerminalWorkflowGuide"),
    floorTerminalWorkflowBtn: document.querySelector("#floorTerminalWorkflowBtn"),
    floorWorkflowPopup: document.querySelector("#floorWorkflowPopup"),
    floorWorkflowCloseBtn: document.querySelector("#floorWorkflowCloseBtn"),
    floorWorkflowEyebrow: document.querySelector("#floorWorkflowEyebrow"),
    floorWorkflowTitle: document.querySelector("#floorWorkflowTitle"),
    floorWorkflowRack: document.querySelector("#floorWorkflowRack"),
    floorWorkflowTicket: document.querySelector("#floorWorkflowTicket"),
    floorWorkflowSymptom: document.querySelector("#floorWorkflowSymptom"),
    floorWorkflowEvidenceLabel: document.querySelector("#floorWorkflowEvidenceLabel"),
    floorWorkflowEvidenceCount: document.querySelector("#floorWorkflowEvidenceCount"),
    floorWorkflowEvidenceList: document.querySelector("#floorWorkflowEvidenceList"),
    floorWorkflowGuide: document.querySelector("#floorWorkflowGuide"),
    floorWorkflowOptions: document.querySelector("#floorWorkflowOptions"),
    floorWorkflowFeedback: document.querySelector("#floorWorkflowFeedback"),
    languageToggle: document.querySelector("#languageToggle"),
    newShiftBtn: document.querySelector("#newShiftBtn"),
    appVersion: document.querySelector("#appVersion")
  };

  let toastTimer;

  const managedModals = [
    elements.reportModal,
    elements.historyModal,
    elements.archiveModal,
    elements.endShiftConfirmModal,
    elements.archiveConfirmModal
  ];

  function syncModalState() {
    document.body.classList.toggle("modal-open", managedModals.some((modal) => !modal.hidden));
  }

  function showModal(modal, focusTarget) {
    modal.hidden = false;
    syncModalState();
    focusTarget?.focus();
  }

  function hideModal(modal, returnFocus) {
    modal.hidden = true;
    syncModalState();
    returnFocus?.focus();
  }

  function changeScore(delta) {
    game.score = Analytics.applyScoreDelta(game.score, delta);
    return game.score;
  }

  function rackLabel(id) {
    return `Rack ${String(id).padStart(2, "0")}`;
  }

  function getIncident(rack) {
    return rack.ticket;
  }

  function getCurrentDifficultyKey() {
    return game.shift.difficulty ?? game.selectedDifficulty;
  }

  function getDifficultyConfig(key = getCurrentDifficultyKey()) {
    return DIFFICULTY_CONFIG[key] ?? DIFFICULTY_CONFIG.NORMAL;
  }

  function getAvailableIncidents(difficultyKey = getCurrentDifficultyKey()) {
    const selectedRank = getDifficultyConfig(difficultyKey).rank;
    return INCIDENTS.filter((incident) => {
      const minimumRank = DIFFICULTY_CONFIG[incident.minDifficulty]?.rank;
      return Number.isFinite(minimumRank) && minimumRank <= selectedRank;
    });
  }

  function calculateRequiredEvidence(usefulCommands) {
    const uniqueCommands = new Set(Array.isArray(usefulCommands) ? usefulCommands : []);
    if (uniqueCommands.size === 0) return 0;
    return Math.min(2, uniqueCommands.size);
  }

  function getEvidenceCount(ticket) {
    return new Set(ticket?.countedUsefulCommands ?? []).size;
  }

  function hasRequiredEvidence(ticket) {
    if (!ticket?.investigationRequired) return true;
    return getEvidenceCount(ticket) >= ticket.requiredEvidenceCount;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function recordTicketEvent(ticket, type, detail = "", timestamp = Date.now()) {
    if (!ticket) return;
    if (!Array.isArray(ticket.eventHistory)) ticket.eventHistory = [];
    ticket.eventHistory.push({ type, detail: String(detail || ""), timestamp });
  }

  function cloneOptions(options) {
    return Array.isArray(options) ? options.map((option) => ({ ...option })) : null;
  }

  function createResolvedRecord(ticket, awardedScore) {
    const resolvedAt = Number(ticket.resolvedAt) || Date.now();
    return {
      ...ticket,
      resolvedAt,
      mttrSeconds: Math.max(0, (resolvedAt - ticket.createdAt) / 1000),
      awardedScore,
      terminalHistory: ticket.terminalHistory.map((record) => ({ ...record })),
      investigationEvidence: [...ticket.investigationEvidence],
      countedUsefulCommands: [...ticket.countedUsefulCommands],
      eventHistory: ticket.eventHistory.map((event) => ({ ...event })),
      diagnosisOptions: cloneOptions(ticket.diagnosisOptions),
      actionOptions: cloneOptions(ticket.actionOptions),
      verification: ticket.verification ? {
        ...ticket.verification,
        requiredCommands: [...ticket.verification.requiredCommands],
        completedCommands: [...ticket.verification.completedCommands]
      } : null,
      wrongDiagnoses: [...ticket.wrongDiagnoses],
      wrongActions: [...ticket.wrongActions],
      diagnosticCommands: { ...(ticket.diagnosticCommands ?? {}) },
      previousMetrics: ticket.previousMetrics ? { ...ticket.previousMetrics } : null
    };
  }

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  }

  function createChoiceOptions(ticket, valueKey) {
    const correctLabel = String(ticket?.[valueKey] ?? "").trim();
    if (!correctLabel) return [];

    const normalize = (label) => String(label).trim().replaceAll(/\s+/g, " ").toLowerCase();
    const usedLabels = new Set([normalize(correctLabel)]);
    const distractors = [];

    const sameCategory = INCIDENTS.filter((incident) => incident?.category === ticket.category);
    const otherCategories = INCIDENTS.filter((incident) => incident?.category !== ticket.category);

    [...shuffle(sameCategory), ...shuffle(otherCategories)].forEach((incident) => {
      if (!incident || incident.incidentId === ticket.incidentId || distractors.length >= 2) return;
      const label = String(incident[valueKey] ?? "").trim();
      const normalized = normalize(label);
      if (!label || usedLabels.has(normalized)) return;
      usedLabels.add(normalized);
      distractors.push({
        optionId: `${valueKey}-${incident.incidentId}`,
        label,
        isCorrect: false
      });
    });

    return shuffle([
      { optionId: `${valueKey}-${ticket.incidentId}`, label: correctLabel, isCorrect: true },
      ...distractors
    ]);
  }

  function severityInfo(severity) {
    return SEVERITY[String(severity ?? "").toLowerCase()] ?? { label: "P4", priority: 0 };
  }

  function getSlaRemaining(ticket) {
    if (Number.isFinite(ticket.slaFrozenRemaining)) return ticket.slaFrozenRemaining;
    return Math.max(0, Math.ceil((ticket.slaDeadline - Date.now()) / 1000));
  }

  function formatClock(seconds) {
    const safeSeconds = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  function formatSimulatedTime(totalMinutes) {
    const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
  }

  // ---------------- 안전한 Simulated Linux Terminal ----------------
  const HELP_OUTPUT = `AVAILABLE SIMULATED COMMANDS

SYSTEM
  hostname
  uptime
  dmesg

RESOURCES
  top
  free -m

STORAGE
  df -h
  iostat
  mount

NETWORK
  ping [host]
  curl [url]
  nslookup [host]
  cat /etc/resolv.conf
  ss -lntp
  ip addr
  ethtool eth0
  traceroute [host]

SERVICE
  systemctl status nginx
  journalctl -u nginx

HARDWARE
  ipmitool sensor

TERMINAL
  help
  clear`;

  const EXACT_TERMINAL_COMMANDS = new Set([
    "help",
    "clear",
    "hostname",
    "uptime",
    "dmesg",
    "df -h",
    "iostat",
    "mount",
    "free -m",
    "top",
    "cat /etc/resolv.conf",
    "ethtool eth0",
    "ipmitool sensor",
    "systemctl status nginx",
    "journalctl -u nginx",
    "ss -lntp",
    "ip addr"
  ]);

  function normalizeTerminalCommand(value) {
    return String(value ?? "").trim().replaceAll(/\s+/g, " ");
  }

  function parseTerminalCommand(value) {
    const normalized = normalizeTerminalCommand(value);
    if (!normalized) return { normalized, canonical: null };
    if (EXACT_TERMINAL_COMMANDS.has(normalized)) {
      return { normalized, canonical: normalized };
    }
    if (normalized === "ping" || normalized.startsWith("ping ")) {
      return { normalized, canonical: "ping" };
    }
    if (normalized === "curl" || normalized.startsWith("curl ")) {
      return { normalized, canonical: "curl" };
    }
    if (normalized === "traceroute" || normalized.startsWith("traceroute ")) {
      return { normalized, canonical: "traceroute" };
    }
    if (normalized === "nslookup" || normalized.startsWith("nslookup ")) {
      return { normalized, canonical: "nslookup" };
    }
    return { normalized, canonical: null };
  }

  function terminalTarget(normalizedCommand, fallback) {
    const [, ...parts] = normalizedCommand.split(" ");
    return parts.join(" ") || fallback;
  }

  const DEFAULT_TERMINAL_OUTPUTS = Object.freeze({
    help: () => HELP_OUTPUT,
    hostname: (rack) => `rack${String(rack.id).padStart(2, "0")}.dc-ops.local`,
    uptime: (rack) => `22:${String(10 + rack.id).padStart(2, "0")}:08 up 47 days, 4:${rack.id}2, 1 user, load average: 0.${rack.id}8, 0.42, 0.31`,
    dmesg: () => `[    0.000000] Linux version 6.8.0-dcops\n[    1.842117] EXT4-fs (sda1): mounted filesystem with ordered data mode\n[    3.103824] eth0: Link is Up - 1000Mbps/Full\n[ 4821.445210] system health check: no recent critical hardware errors`,
    "df -h": (rack) => {
      const percent = rack.metrics.Disk;
      const used = Math.round(50 * percent / 100);
      return `Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        50G   ${String(used).padStart(2, " ")}G   ${String(50 - used).padStart(2, " ")}G  ${percent}% /\n/dev/sdb1       200G  108G   92G  54% /data`;
    },
    "free -m": (rack) => {
      const total = 8192;
      const used = Math.round(total * rack.metrics.RAM / 100);
      const free = total - used;
      return `              total        used        free      shared  buff/cache   available\nMem:           ${total}        ${used}        ${free}         128        1024        ${Math.max(0, free + 512)}\nSwap:          2048         128        1920`;
    },
    iostat: () => `Linux 6.8.0-dcops\n\navg-cpu:  %user  %system  %iowait  %idle\n           8.20     2.10      0.60  89.10\n\nDevice  r/s   w/s  await  %util\nsda     8.4  12.1   1.84   7.20`,
    mount: () => `/dev/sda1 on / type ext4 (rw,relatime,errors=remount-ro)\n/dev/sdb1 on /data type ext4 (rw,relatime)`,
    top: (rack) => {
      const busy = Math.min(96, rack.metrics.CPU);
      const idle = Math.max(4, 100 - busy);
      return `top - 22:20:18 up 47 days, 4:12, 1 user, load average: 0.68, 0.52, 0.40\n%Cpu(s): ${busy.toFixed(1)} us,  2.0 sy,  0.0 ni, ${idle.toFixed(1)} id\nPID   USER   %CPU   %MEM   COMMAND\n938   www    12.4    1.2   nginx\n1102  root    3.1    0.8   node_exporter\n721   root    0.3    0.4   sshd`;
    },
    "systemctl status nginx": () => `● nginx.service - A high performance web server\n   Loaded: loaded (/lib/systemd/system/nginx.service; enabled)\n   Active: active (running) since 22:00:08\n Main PID: 938 (nginx)`,
    "journalctl -u nginx": () => `Aug 08 22:00:08 systemd[1]: Started A high performance web server.\nAug 08 22:00:08 nginx[938]: configuration file /etc/nginx/nginx.conf test is successful\n-- No recent errors --`,
    "ss -lntp": () => `State   Recv-Q  Send-Q   Local Address:Port   Process\nLISTEN  0       511      0.0.0.0:80          users:((\"nginx\",pid=938,fd=6))\nLISTEN  0       128      0.0.0.0:22          users:((\"sshd\",pid=721,fd=3))`,
    "ip addr": (rack) => `2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n    inet 10.20.${rack.id}.15/24 brd 10.20.${rack.id}.255 scope global eth0\n    link/ether 02:42:ac:14:0${rack.id}:0f`,
    "cat /etc/resolv.conf": () => `search dc-ops.local\nnameserver 10.20.0.53\noptions timeout:2 attempts:2`,
    "ethtool eth0": () => `Settings for eth0:\n\tSpeed: 1000Mb/s\n\tDuplex: Full\n\tLink detected: yes\nNIC statistics:\n\trx_errors: 0\n\ttx_errors: 0\n\trx_dropped: 0`,
    "ipmitool sensor": () => `PSU1 Status      | 0x01 | ok\nPSU2 Status      | 0x01 | ok\nFan1 RPM         | 7200 | ok\nFan2 RPM         | 7100 | ok\nInlet Temp       | 22.4 | degrees C | ok\nSystem Voltage   | 230  | Volts | ok`,
    ping: (rack, command) => {
      const target = terminalTarget(command, `10.20.${rack.id}.1`);
      return `PING ${target} (${target}) 56(84) bytes of data.\n64 bytes from ${target}: icmp_seq=1 ttl=63 time=0.${rack.id}8 ms\n64 bytes from ${target}: icmp_seq=2 ttl=63 time=0.${rack.id + 2}1 ms\n--- ${target} ping statistics ---\n2 packets transmitted, 2 received, 0% packet loss`;
    },
    curl: (_rack, command) => {
      const target = terminalTarget(command, "localhost");
      return `HTTP/1.1 200 OK\nServer: nginx/1.24.0\nContent-Type: text/html\nX-Simulated-Target: ${target}\n\nDC OPS service healthy`;
    },
    nslookup: (_rack, command) => {
      const target = terminalTarget(command, "api.dc-ops.local");
      return `Server:         10.20.0.53\nAddress:        10.20.0.53#53\n\nName:   ${target}\nAddress: 10.20.10.25`;
    },
    traceroute: (rack, command) => {
      const target = terminalTarget(command, `10.20.${rack.id}.1`);
      return `traceroute to ${target}, 30 hops max\n 1  10.20.${rack.id}.1  0.411 ms  0.390 ms  0.372 ms\n 2  ${target}  0.882 ms  0.851 ms  0.840 ms`;
    }
  });

  function createVerificationState(ticket) {
    return Workflow.createVerificationState(ticket?.usefulCommands);
  }

  function isVerificationCommand(ticket, parsedCommand) {
    return ticket?.stage === "verification"
      && Boolean(parsedCommand.canonical)
      && ticket.verification?.requiredCommands?.includes(parsedCommand.canonical);
  }

  function getVerificationOutput(rack, parsedCommand) {
    const outputBuilder = DEFAULT_TERMINAL_OUTPUTS[parsedCommand.canonical];
    return outputBuilder
      ? outputBuilder(rack, parsedCommand.normalized)
      : `${parsedCommand.normalized}\nSystem state: healthy`;
  }

  function getTerminalSession(rack) {
    if (!rack) return null;
    return rack.ticket?.terminalHistory ?? rack.terminalHistory;
  }

  function getTerminalOutput(rack, parsedCommand) {
    if (rack.ticket?.stage === "verification" && parsedCommand.canonical) {
      return getVerificationOutput(rack, parsedCommand);
    }
    const ticketOutput = rack.ticket?.diagnosticCommands?.[parsedCommand.canonical];
    const targetCommands = new Set(["ping", "curl", "nslookup", "traceroute"]);
    const hasExplicitTarget = targetCommands.has(parsedCommand.canonical) && parsedCommand.normalized !== parsedCommand.canonical;
    if (typeof ticketOutput === "string" && !hasExplicitTarget) return ticketOutput;
    const outputBuilder = DEFAULT_TERMINAL_OUTPUTS[parsedCommand.canonical];
    return outputBuilder ? outputBuilder(rack, parsedCommand.normalized) : "";
  }

  function scrollTerminalToLatest() {
    if (terminalScrollFrameId !== null) cancelAnimationFrame(terminalScrollFrameId);
    terminalScrollFrameId = requestAnimationFrame(() => {
      terminalScrollFrameId = requestAnimationFrame(() => {
        elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight;
        terminalScrollFrameId = null;
      });
    });
  }

  function finalizeTerminalRender(scrollToBottom, previousScrollTop) {
    if (scrollToBottom) {
      scrollTerminalToLatest();
      return;
    }
    if (activeScenePopup === "terminal") {
      elements.terminalOutput.scrollTop = Math.min(previousScrollTop, elements.terminalOutput.scrollHeight);
    }
  }

  function renderTerminal({ scrollToBottom = false } = {}) {
    const rack = racks.find((item) => item.id === game.selectedId);
    const previousScrollTop = elements.terminalOutput.scrollTop;
    elements.terminalOutput.innerHTML = "";

    if (!rack) {
      elements.terminalRackLabel.textContent = "NO RACK SELECTED";
      elements.terminalPrompt.textContent = "operator@rack--:~$";
      elements.terminalInput.disabled = true;
      elements.terminalRunBtn.disabled = true;
      elements.terminalInput.placeholder = "Rack을 선택하세요";
      elements.terminalClearBtn.disabled = true;
      elements.terminalSensor.hidden = true;
      const message = document.createElement("div");
      message.className = "terminal-welcome";
      message.textContent = "Select a Rack to open a safe simulated terminal session.";
      elements.terminalOutput.append(message);
      finalizeTerminalRender(scrollToBottom, previousScrollTop);
      return;
    }

    const rackNumber = String(rack.id).padStart(2, "0");
    const prompt = `operator@rack${rackNumber}:~$`;
    const history = getTerminalSession(rack);
    elements.terminalRackLabel.textContent = rackLabel(rack.id).toUpperCase();
    elements.terminalPrompt.textContent = prompt;
    elements.terminalInput.disabled = false;
    elements.terminalRunBtn.disabled = false;
    elements.terminalInput.placeholder = "명령어 입력 (help)";
    elements.terminalClearBtn.disabled = false;

    const sensorAlert = rack.ticket?.sensorAlert;
    elements.terminalSensor.hidden = !sensorAlert;
    elements.terminalSensor.textContent = sensorAlert ?? "";

    if (!history.length) {
      const message = document.createElement("div");
      message.className = "terminal-welcome";
      message.textContent = `Connected to rack${rackNumber}. Type 'help' to list simulated commands.`;
      elements.terminalOutput.append(message);
    }

    history.forEach((record) => {
      const entry = document.createElement("div");
      const command = document.createElement("div");
      const promptText = document.createElement("span");
      const output = document.createElement("pre");
      entry.className = "terminal-entry";
      command.className = "terminal-entry-command";
      promptText.className = "prompt";
      promptText.textContent = `${record.prompt} `;
      command.append(promptText, document.createTextNode(record.command));
      output.className = `terminal-entry-output${record.valid ? "" : " error"}`;
      output.textContent = record.output;
      entry.append(command, output);
      if (record.useful) {
        const evidence = document.createElement("span");
        evidence.className = "terminal-evidence";
        evidence.textContent = "EVIDENCE CAPTURED";
        entry.append(evidence);
      }
      elements.terminalOutput.append(entry);
    });

    finalizeTerminalRender(scrollToBottom, previousScrollTop);
  }

  function clearTerminalSession() {
    const rack = racks.find((item) => item.id === game.selectedId);
    const history = getTerminalSession(rack);
    if (!history) return;
    history.length = 0;
    renderTerminal({ scrollToBottom: true });
    elements.terminalInput.focus();
  }

  function executeTerminalCommand(rawCommand) {
    const rack = racks.find((item) => item.id === game.selectedId);
    if (!rack) return;
    const parsed = parseTerminalCommand(rawCommand);
    if (!parsed.normalized) return;

    const commandType = Analytics.classifyTerminalCommand(parsed.canonical, parsed.normalized);
    if (commandType === "UTILITY" && parsed.canonical === "clear") {
      clearTerminalSession();
      return;
    }
    if (game.shift.status === "RUNNING" && commandType !== "UTILITY") game.stats.commandsExecuted += 1;

    const ticket = rack.ticket;
    let valid = Boolean(parsed.canonical);
    let useful = false;
    let output;
    let verificationPassed = false;

    if (!valid) {
      const unknownCommand = parsed.normalized.split(" ")[0];
      output = `command not found: ${unknownCommand}`;
      if (game.shift.status === "RUNNING") game.stats.invalidCommands += 1;
    } else {
      output = getTerminalOutput(rack, parsed);
      const usefulForIncident = ticket?.usefulCommands?.includes(parsed.canonical);
      const alreadyCounted = ticket?.countedUsefulCommands?.includes(parsed.canonical);
      useful = Boolean(usefulForIncident && !alreadyCounted);
      if (useful) {
        ticket.countedUsefulCommands.push(parsed.canonical);
        ticket.investigationEvidence.push(parsed.normalized);
        if (game.shift.status === "RUNNING" && ticket.countedInShift) {
          game.stats.usefulCommands += 1;
        }
      }
      if (isVerificationCommand(ticket, parsed)) {
        verificationPassed = Workflow.applyVerificationCommand(ticket.verification, parsed.canonical);
        if (verificationPassed) {
          output = `${output}\n\nVERIFICATION PASSED\nINCIDENT RESOLVED`;
        }
      }
    }

    const executedAt = Date.now();
    getTerminalSession(rack).push({
      prompt: elements.terminalPrompt.textContent,
      command: parsed.normalized,
      output,
      valid,
      useful,
      executedAt
    });
    if (ticket) {
      recordTicketEvent(ticket, "COMMAND_EXECUTED", parsed.normalized, executedAt);
      if (useful) recordTicketEvent(ticket, "EVIDENCE_CAPTURED", parsed.canonical, executedAt);
    }
    if (verificationPassed) {
      recordTicketEvent(ticket, "VERIFICATION_PASSED", parsed.canonical, ticket.verification.passedAt);
      resolveIncident(rack, { floorVerification: true, verificationCommand: parsed.normalized });
      renderTerminal({ scrollToBottom: true });
      return;
    }
    updateTicketPanel();
    updateActionControls();
    renderTerminalWorkflow();
    renderTerminal({ scrollToBottom: true });
  }

  function handleTerminalSubmit(event) {
    event.preventDefault();
    const command = elements.terminalInput.value;
    elements.terminalInput.value = "";
    terminalHistoryIndex = null;
    terminalHistoryDraft = "";
    executeTerminalCommand(command);
    elements.terminalInput.focus();
  }

  function handleTerminalHistoryKeydown(event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const rack = racks.find((item) => item.id === game.selectedId);
    const commands = getTerminalSession(rack)?.map((record) => record.command) ?? [];
    if (!commands.length) return;

    event.preventDefault();
    if (event.key === "ArrowUp") {
      if (terminalHistoryIndex === null) {
        terminalHistoryDraft = elements.terminalInput.value;
        terminalHistoryIndex = commands.length - 1;
      } else {
        terminalHistoryIndex = Math.max(0, terminalHistoryIndex - 1);
      }
      elements.terminalInput.value = commands[terminalHistoryIndex];
    } else if (terminalHistoryIndex !== null && terminalHistoryIndex < commands.length - 1) {
      terminalHistoryIndex += 1;
      elements.terminalInput.value = commands[terminalHistoryIndex];
    } else if (terminalHistoryIndex !== null) {
      terminalHistoryIndex = null;
      elements.terminalInput.value = terminalHistoryDraft;
    }
    elements.terminalInput.setSelectionRange(elements.terminalInput.value.length, elements.terminalInput.value.length);
  }

  function resetTerminalHistoryNavigation() {
    terminalHistoryIndex = null;
    terminalHistoryDraft = "";
  }

  // ---------------- 화면 그리기 ----------------
  function floorText(key, variables = {}) {
    return Floor.translate(game.floor.language, key, variables);
  }

  function getFloorOperator() {
    return Floor.OPERATORS.find((operator) => operator.id === game.floor.operatorId) ?? Floor.OPERATORS[0];
  }

  function workflowCopy(korean, english) {
    return game.floor.language === "en" ? english : korean;
  }

  function renderTerminalWorkflow() {
    const rack = racks.find((item) => item.id === game.selectedId);
    const ticket = rack?.ticket;
    const lastResolution = rack?.lastFloorResolution;
    elements.floorTerminalWorkflow.hidden = !ticket && !lastResolution;
    if (!ticket && !lastResolution) return;

    elements.floorTerminalWorkflowBtn.hidden = false;
    if (!ticket && lastResolution) {
      elements.floorTerminalWorkflow.className = "terminal-workflow resolved";
      elements.floorTerminalWorkflowStep.textContent = "VERIFICATION PASSED";
      elements.floorTerminalWorkflowStatus.textContent = "INCIDENT RESOLVED";
      elements.floorTerminalWorkflowGuide.textContent = workflowCopy(
        `${lastResolution.ticketId} 복구가 확인되어 Rack이 정상 상태로 전환되었습니다.`,
        `${lastResolution.ticketId} recovery was verified and the Rack returned to healthy state.`
      );
      elements.floorTerminalWorkflowBtn.hidden = true;
      return;
    }

    const evidenceCount = getEvidenceCount(ticket);
    const requiredCount = ticket.requiredEvidenceCount;
    elements.floorTerminalWorkflow.className = `terminal-workflow stage-${ticket.stage}`;

    if (ticket.stage === "verification") {
      const requiredCommand = ticket.verification?.requiredCommands?.[0] ?? "uptime";
      elements.floorTerminalWorkflowStep.textContent = "RECOVERY APPLIED";
      elements.floorTerminalWorkflowStatus.textContent = "VERIFICATION PENDING";
      elements.floorTerminalWorkflowGuide.textContent = workflowCopy(
        `Terminal에서 ${requiredCommand} 명령으로 정상 복구 여부를 확인하세요.`,
        `Run ${requiredCommand} in Terminal to verify the healthy state.`
      );
      elements.floorTerminalWorkflowBtn.hidden = true;
      return;
    }

    elements.floorTerminalWorkflowStep.textContent = "INCIDENT INVESTIGATION";
    elements.floorTerminalWorkflowStatus.textContent = requiredCount > 0
      ? `EVIDENCE ${Math.min(evidenceCount, requiredCount)} / ${requiredCount}`
      : `EVIDENCE ${evidenceCount} / OPTIONAL`;
    if (ticket.stage === "verification") {
      showToast("Recovery가 적용되었습니다. Terminal Verification을 완료하세요.");
      return;
    }
    if (ticket.stage === "action") {
      elements.floorTerminalWorkflowGuide.textContent = workflowCopy(
        "Root Cause가 확인되었습니다. 올바른 Recovery Action을 선택하세요.",
        "Root Cause confirmed. Select the correct Recovery Action."
      );
      elements.floorTerminalWorkflowBtn.textContent = workflowCopy("Recovery 선택", "SELECT RECOVERY");
      elements.floorTerminalWorkflowBtn.disabled = false;
      return;
    }

    const evidenceReady = hasRequiredEvidence(ticket);
    elements.floorTerminalWorkflowGuide.textContent = evidenceReady
      ? workflowCopy("Diagnosis를 시작할 수 있습니다.", "Diagnosis is ready.")
      : workflowCopy("추가 Evidence가 필요합니다.", "More Evidence is required.");
    elements.floorTerminalWorkflowBtn.textContent = ticket.stage === "diagnosis"
      ? workflowCopy("진단 계속", "CONTINUE DIAGNOSIS")
      : workflowCopy("진단하기", "DIAGNOSE");
    elements.floorTerminalWorkflowBtn.disabled = !evidenceReady;
  }

  function renderFloorWorkflowPopup() {
    if (!['diagnosis', 'recovery'].includes(activeScenePopup)) return;
    const rack = racks.find((item) => item.id === game.selectedId);
    const ticket = rack?.ticket;
    if (!ticket) return;

    const isDiagnosis = activeScenePopup === "diagnosis";
    const options = isDiagnosis ? ticket.diagnosisOptions : ticket.actionOptions;
    const attempted = isDiagnosis ? ticket.wrongDiagnoses : ticket.wrongActions;
    elements.floorWorkflowEyebrow.textContent = isDiagnosis ? "INCIDENT INVESTIGATION" : "RECOVERY CONTROL";
    elements.floorWorkflowTitle.textContent = isDiagnosis ? "ROOT CAUSE DIAGNOSIS" : "RECOVERY ACTION";
    elements.floorWorkflowRack.textContent = ticket.affectedRack;
    elements.floorWorkflowTicket.textContent = ticket.ticketId;
    elements.floorWorkflowSymptom.textContent = ticket.symptom;
    elements.floorWorkflowEvidenceLabel.textContent = isDiagnosis ? "COLLECTED EVIDENCE" : "CONFIRMED ROOT CAUSE";
    elements.floorWorkflowEvidenceCount.textContent = isDiagnosis
      ? ticket.requiredEvidenceCount > 0
        ? `${Math.min(getEvidenceCount(ticket), ticket.requiredEvidenceCount)} / ${ticket.requiredEvidenceCount}`
        : `${getEvidenceCount(ticket)} / OPTIONAL`
      : ticket.correctDiagnosis;
    const evidenceItems = isDiagnosis
      ? ticket.investigationEvidence
      : [ticket.rootCause];
    elements.floorWorkflowEvidenceList.innerHTML = evidenceItems.length
      ? evidenceItems.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")
      : `<li>${escapeHtml(workflowCopy("수집된 Evidence가 없습니다.", "No Evidence collected."))}</li>`;
    elements.floorWorkflowGuide.textContent = isDiagnosis
      ? workflowCopy("Evidence를 근거로 올바른 Root Cause를 선택하세요.", "Select the Root Cause supported by the Evidence.")
      : workflowCopy("확인된 Root Cause에 맞는 Recovery Action을 선택하세요.", "Select the Recovery Action that matches the confirmed Root Cause.");
    elements.floorWorkflowOptions.innerHTML = (options ?? []).map((option, index) => {
      const wasWrong = attempted.includes(option.optionId);
      return `<button class="floor-workflow-option${wasWrong ? " wrong" : ""}" type="button" data-floor-kind="${isDiagnosis ? "diagnosis" : "action"}" data-option-id="${escapeHtml(option.optionId)}" ${wasWrong ? "disabled" : ""}><span>${String.fromCharCode(65 + index)}</span>${escapeHtml(option.label)}</button>`;
    }).join("");
    elements.floorWorkflowFeedback.hidden = attempted.length === 0;
    elements.floorWorkflowFeedback.textContent = attempted.length
      ? workflowCopy("선택이 올바르지 않습니다. 다른 Evidence와 선택지를 다시 확인하세요.", "Incorrect choice. Review the Evidence and remaining options.")
      : "";
  }

  function openFloorWorkflowFromTerminal() {
    const rack = racks.find((item) => item.id === game.selectedId);
    const ticket = rack?.ticket;
    if (!ticket) return;
    if (ticket.stage === "reported") diagnoseSelected();
    if (ticket.stage === "diagnosis") setScenePopup("diagnosis");
    if (ticket.stage === "action") setScenePopup("recovery");
  }

  function isPhaserFloorReady() {
    return Boolean(phaserFloorController?.isReady());
  }

  function focusFloorScene() {
    if (isPhaserFloorReady()) phaserFloorController.focus();
    else elements.floorStage.focus({ preventScroll: true });
  }

  function setScenePopup(nextPopup = "none") {
    const popup = ["terminal", "objectives", "incident", "diagnosis", "recovery"].includes(nextPopup) ? nextPopup : "none";
    const workflowOpen = popup === "diagnosis" || popup === "recovery";
    activeScenePopup = popup;
    elements.floorMode.dataset.activePopup = popup;
    elements.floorTerminalPopup.hidden = popup !== "terminal";
    elements.floorObjectivesPopup.hidden = popup !== "objectives";
    elements.floorIncidentPopup.hidden = popup !== "incident";
    elements.floorWorkflowPopup.hidden = !workflowOpen;
    elements.floorObjectivesOpenBtn.setAttribute("aria-expanded", String(popup === "objectives"));
    elements.floorIncidentOpenBtn.setAttribute("aria-expanded", String(popup === "incident"));

    if (popup === "terminal") {
      renderTerminal({ scrollToBottom: true });
      requestAnimationFrame(() => {
        if (!elements.terminalInput.disabled) elements.terminalInput.focus({ preventScroll: true });
      });
      return;
    }

    if (document.activeElement === elements.terminalInput) elements.terminalInput.blur();
    if (popup === "objectives") requestAnimationFrame(() => elements.floorObjectivesCloseBtn.focus({ preventScroll: true }));
    if (popup === "incident") requestAnimationFrame(() => elements.floorIncidentCloseBtn.focus({ preventScroll: true }));
    if (workflowOpen) {
      renderFloorWorkflowPopup();
      requestAnimationFrame(() => elements.floorWorkflowCloseBtn.focus({ preventScroll: true }));
    }
    if (popup === "none") requestAnimationFrame(focusFloorScene);
  }

  function closeScenePopup() {
    if (activeScenePopup === "none") return false;
    setScenePopup("none");
    return true;
  }

  function updateFloorInteractionStatus(assetId = game.floor.nearbyAssetId) {
    const asset = Floor.FLOOR_ASSETS.find((item) => item.id === assetId);
    if (!asset) {
      elements.floorInteractionStatus.textContent = floorText("nearbyNone");
      return;
    }
    const statusKey = asset.type === "rack" ? "nearbyRack" : "nearbyFacility";
    elements.floorInteractionStatus.textContent = floorText(statusKey, { asset: asset.label });
  }

  function syncPhaserFloorState() {
    if (!phaserFloorController) return;
    const activeIncidentRack = racks.find((rack) => rack.ticket);
    phaserFloorController.setRackStates(Floor.FLOOR_ASSETS
      .filter((asset) => asset.type === "rack")
      .map((asset) => {
        const rack = racks.find((item) => item.id === asset.rackId);
        return {
          rackId: asset.rackId,
          state: rack?.ticket ? "critical" : rack?.status === "warning" ? "warning" : "normal",
          incident: Boolean(rack?.ticket),
          selected: game.selectedId === asset.rackId,
          planned: !rack
        };
      }));
    phaserFloorController.setActiveIncidentRack(activeIncidentRack?.id ?? null);
    phaserFloorController.setSelectedRack(game.selectedId);
    phaserFloorController.setOperator(game.floor.operatorId);
    phaserFloorController.setLanguage(game.floor.language);
    phaserFloorController.setShiftState({
      status: game.shift.status,
      difficulty: getCurrentDifficultyKey(),
      score: game.score,
      remainingSeconds: game.shift.remainingSeconds
    });
  }

  function renderFloor() {
    const nearbyAsset = isPhaserFloorReady()
      ? Floor.FLOOR_ASSETS.find((asset) => asset.id === game.floor.nearbyAssetId) ?? null
      : Floor.findNearbyAsset(game.floor.player);
    if (!isPhaserFloorReady()) game.floor.nearbyAssetId = nearbyAsset?.id ?? null;

    elements.floorAssets.innerHTML = Floor.FLOOR_ASSETS.map((asset) => {
      const rack = asset.type === "rack" && asset.rackId <= racks.length
        ? racks.find((item) => item.id === asset.rackId)
        : null;
      const classes = ["floor-asset", asset.type === "facility" ? "facility" : "rack"];
      if (asset.type === "rack" && !rack) classes.push("planned");
      if (rack?.ticket) classes.push("incident");
      else if (rack?.status === "warning") classes.push("warning");
      if (rack && game.selectedId === rack.id) classes.push("selected");
      if (nearbyAsset?.id === asset.id) classes.push("nearby");
      const state = rack ? floorText("operational") : asset.type === "rack" ? floorText("planned") : asset.facilityType;
      const rackAssetState = rack?.ticket ? "critical" : rack?.status === "warning" ? "warning" : "normal";
      const assetPath = asset.type === "rack"
        ? `assets/equipment/rack-${rackAssetState}.svg`
        : `assets/equipment/${asset.facilityType.toLowerCase()}.svg`;
      const warning = rack?.ticket
        ? `<img class="rack-warning" src="assets/ui/warning-diamond.svg" alt="" aria-hidden="true" draggable="false">`
        : "";
      const visual = `<span class="floor-asset__visual" aria-hidden="true">
        <img class="floor-equipment-svg floor-equipment-svg--${asset.type === "rack" ? "rack" : asset.facilityType.toLowerCase()}" src="${assetPath}" alt="" draggable="false">${warning}
      </span>`;
      return `<button class="${classes.join(" ")}" type="button" data-floor-asset-id="${asset.id}" style="grid-column:${asset.x};grid-row:${asset.y}" aria-label="${asset.label}, ${state}">
        <strong>${asset.label}</strong>${visual}<small>${state}</small>
      </button>`;
    }).join("");

    const operator = getFloorOperator();
    elements.floorPlayer.style.setProperty("--player-x", game.floor.player.x);
    elements.floorPlayer.style.setProperty("--player-y", game.floor.player.y);
    elements.floorPlayer.style.setProperty("--player-left", `${((game.floor.player.x - 0.5) / Floor.GRID_WIDTH) * 100}%`);
    elements.floorPlayer.style.setProperty("--player-top", `${((game.floor.player.y - 0.5) / Floor.GRID_HEIGHT) * 100}%`);
    elements.floorPlayer.style.setProperty("--player-move-duration", `${PLAYER_MOVE_TRANSITION_MS}ms`);
    elements.floorPlayer.dataset.facing = game.floor.player.facing;
    elements.floorPlayer.dataset.tone = operator.tone;
    elements.floorPlayerGlyph.textContent = operator.glyph;
    elements.floorPlayerLabel.textContent = floorText(operator.nameKey);
    elements.floorInteractionPrompt.style.setProperty("--prompt-x", nearbyAsset?.x ?? game.floor.player.x);
    elements.floorInteractionPrompt.style.setProperty("--prompt-y", nearbyAsset?.y ?? game.floor.player.y);
    elements.floorInteractionPrompt.hidden = !nearbyAsset;

    updateFloorInteractionStatus(nearbyAsset?.id ?? null);

    syncPhaserFloorState();
  }

  function renderFloorBriefing() {
    const selectedRack = racks.find((rack) => rack.id === game.selectedId);
    const incidentRack = selectedRack?.ticket ? selectedRack : racks.find((rack) => rack.ticket);
    const ticket = incidentRack?.ticket;
    const activeIncidentCount = racks.filter((rack) => rack.ticket).length;
    elements.floorIncidentButtonCount.textContent = String(activeIncidentCount);
    elements.floorIncidentOpenBtn.classList.toggle("has-incident", activeIncidentCount > 0);
    elements.floorBriefing.classList.toggle("has-incident", Boolean(ticket));
    elements.floorIncidentEmpty.hidden = Boolean(ticket);
    elements.floorIncidentContent.hidden = !ticket;
    if (!ticket) {
      elements.floorObjectives.innerHTML = ["objectiveSelectRack", "objectiveCollectEvidence", "objectiveDiagnose", "objectiveRecover"]
        .map((key) => `<li><i aria-hidden="true"></i>${escapeHtml(floorText(key))}</li>`)
        .join("");
      return;
    }

    const diagnosed = ["action", "verification"].includes(ticket.stage);
    const recoveryApplied = ticket.stage === "verification";
    const evidenceCollected = getEvidenceCount(ticket) > 0;
    elements.floorIncidentTicket.textContent = ticket.ticketId;
    elements.floorIncidentCategory.textContent = ticket.category;
    elements.floorIncidentCategory.className = `category-${ticket.category.toLowerCase()}`;
    elements.floorIncidentName.textContent = diagnosed ? ticket.title : "UNIDENTIFIED INCIDENT";
    elements.floorIncidentRack.textContent = rackLabel(incidentRack.id);
    elements.floorIncidentSeverity.textContent = ticket.severity;
    elements.floorIncidentStage.textContent = recoveryApplied
      ? workflowCopy("검증 대기", "VERIFICATION")
      : floorText(diagnosed ? "stageAction" : "stageReported");
    elements.floorIncidentSla.textContent = ticket.slaBreached ? "BREACH" : formatClock(getSlaRemaining(ticket));
    elements.floorIncidentHint.textContent = ticket.investigationHint || ticket.symptom;

    const objectives = [
      { key: "objectiveSelectRack", complete: game.selectedId === incidentRack.id },
      { key: "objectiveCollectEvidence", complete: evidenceCollected },
      { key: "objectiveDiagnose", complete: diagnosed },
      { key: "objectiveRecover", complete: recoveryApplied }
    ];
    elements.floorObjectives.innerHTML = objectives.map((objective) =>
      `<li class="${objective.complete ? "complete" : ""}"><i aria-hidden="true"></i>${escapeHtml(floorText(objective.key))}</li>`
    ).join("");
  }

  function applyFloorLanguage() {
    document.documentElement.lang = game.floor.language;
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = floorText(node.dataset.i18n);
    });
    elements.languageToggle.querySelectorAll("[data-language]").forEach((button) => {
      const selected = button.dataset.language === game.floor.language;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    renderFloor();
    renderFloorBriefing();
    renderTerminalWorkflow();
    renderFloorWorkflowPopup();
  }

  function renderRacks(focusSelected = false) {
    elements.rackGrid.innerHTML = racks.map((rack) => {
      const info = STATUS_INFO[rack.status];
      const ticket = getIncident(rack);
      const selected = game.selectedId === rack.id ? "selected" : "";
      const diagnosed = ["action", "verification"].includes(ticket?.stage) ? "diagnosed" : "";
      const metrics = Object.entries(rack.metrics).map(([name, value]) => {
        const lowNetwork = rack.status === "critical" && name === "Network" && value <= 10;
        const level = lowNetwork ? "high low" : value >= 85 ? "high" : value >= 70 ? "medium" : "";
        return `<div class="metric"><div class="metric-row"><span>${name}</span><span class="metric-value">${value}%</span></div><div class="bar"><div class="bar-fill ${level}" style="width:${value}%"></div></div></div>`;
      }).join("");

      return `<button class="rack ${rack.status} ${selected} ${diagnosed}" type="button" data-rack-id="${rack.id}" aria-pressed="${game.selectedId === rack.id}" aria-label="${rackLabel(rack.id)}, ${info.ko} ${info.en}">
        <div class="rack-top"><span class="rack-name">${rackLabel(rack.id)}</span><span class="status ${rack.status}"><i class="status-dot"></i>${info.en}</span></div>
        <div class="server-slots" aria-hidden="true">${"<span class=\"slot\"></span>".repeat(7)}</div>
        <div class="metrics">${metrics}</div>
        <div class="diagnosis">원인 · ROOT CAUSE<br><strong>${ticket ? escapeHtml(ticket.correctDiagnosis) : ""}</strong></div>
      </button>`;
    }).join("");

    if (focusSelected && game.selectedId !== null) {
      elements.rackGrid.querySelector(`[data-rack-id="${game.selectedId}"]`)?.focus();
    }
  }

  function updateDashboard() {
    const openCount = racks.filter((rack) => rack.ticket).length;
    elements.score.innerHTML = `${game.score}<span class="stat-unit">PTS</span>`;
    elements.availability.innerHTML = `${game.availability.toFixed(2)}<span class="stat-unit">%</span>`;
    elements.temperature.innerHTML = `${game.temperature.toFixed(1)}<span class="stat-unit">°C</span>`;
    elements.incidentCount.innerHTML = `${openCount}<span class="stat-unit">OPEN</span>`;
    elements.incidentTrend.textContent = openCount ? "즉시 대응 필요" : "모든 서비스 정상";
    elements.tempTrend.textContent = game.temperature >= 25 ? "온도 상승 감지" : "냉각 시스템 정상";
    elements.floorHudScore.textContent = `${game.score} PTS`;
    elements.floorHudIncidents.textContent = String(openCount);

    const selected = racks.find((rack) => rack.id === game.selectedId);
    if (!selected) {
      elements.selectedRack.textContent = "선택 없음";
      elements.selectedState.textContent = "—";
      elements.selectedState.style.color = "var(--muted)";
      return;
    }
    const info = STATUS_INFO[selected.status];
    elements.selectedRack.textContent = rackLabel(selected.id);
    elements.selectedState.textContent = `${info.ko} · ${info.en}`;
    elements.selectedState.style.color = `var(--${info.color})`;
  }

  function updateTicketPanel() {
    const rack = racks.find((item) => item.id === game.selectedId);
    const ticket = rack?.ticket;
    if (!ticket || rack.status !== "critical") {
      elements.ticketPanel.className = "ticket-panel empty";
      elements.ticketEmpty.hidden = false;
      elements.ticketContent.hidden = true;
      elements.ticketHint.hidden = true;
      elements.investigationProgress.hidden = true;
      return;
    }

    const remaining = getSlaRemaining(ticket);
    const diagnosed = ["action", "verification"].includes(ticket.stage);
    elements.ticketPanel.className = `ticket-panel${ticket.slaBreached ? " sla-breached" : ""}`;
    elements.ticketEmpty.hidden = true;
    elements.ticketContent.hidden = false;
    elements.ticketId.textContent = ticket.ticketId;
    elements.ticketCategory.textContent = ticket.category;
    elements.ticketCategory.className = `ticket-category category-${ticket.category.toLowerCase()}`;
    elements.ticketSeverity.textContent = ticket.severity;
    elements.ticketTitle.textContent = diagnosed ? ticket.title : "UNIDENTIFIED INCIDENT";
    elements.ticketRack.textContent = ticket.affectedRack;
    elements.ticketSla.textContent = ticket.slaBreached ? "BREACH" : formatClock(remaining);
    elements.ticketSymptom.textContent = ticket.symptom;
    const ticketDifficulty = getDifficultyConfig(ticket.difficulty);
    const showHint = ticketDifficulty.showInvestigationHint && Boolean(ticket.investigationHint);
    elements.ticketHint.hidden = !showHint;
    elements.ticketHint.textContent = showHint ? `INVESTIGATION HINT · ${ticket.investigationHint}` : "";

    const evidenceCount = getEvidenceCount(ticket);
    const evidenceAvailable = hasRequiredEvidence(ticket);
    elements.investigationProgress.hidden = !ticket.investigationRequired;
    elements.investigationProgress.className = `investigation-progress${evidenceAvailable ? " available" : ""}`;
    elements.investigationCurrent.textContent = Math.min(evidenceCount, ticket.requiredEvidenceCount);
    elements.investigationRequired.textContent = ticket.requiredEvidenceCount;
    elements.investigationBar.style.width = `${ticket.requiredEvidenceCount
      ? Math.min(100, evidenceCount / ticket.requiredEvidenceCount * 100)
      : 100}%`;
    elements.investigationState.textContent = evidenceAvailable
      ? "DIAGNOSIS AVAILABLE"
      : "DIAGNOSIS LOCKED";
    elements.ticketDiagnosis.hidden = !diagnosed;
    elements.ticketDiagnosisText.textContent = diagnosed ? ticket.correctDiagnosis : "—";
    elements.ticketRootCause.textContent = diagnosed ? ticket.rootCause : "—";
  }

  function updateDecisionPanel() {
    const rack = racks.find((item) => item.id === game.selectedId);
    const ticket = rack?.ticket;
    if (!ticket || !["diagnosis", "action"].includes(ticket.stage)) {
      elements.decisionPanel.hidden = true;
      elements.decisionOptions.innerHTML = "";
      return;
    }

    const isDiagnosis = ticket.stage === "diagnosis";
    const options = isDiagnosis ? ticket.diagnosisOptions : ticket.actionOptions;
    const attempted = isDiagnosis ? ticket.wrongDiagnoses : ticket.wrongActions;
    elements.decisionPanel.hidden = false;
    elements.decisionPanel.className = `decision-panel${isDiagnosis ? "" : " action-stage"}`;
    elements.decisionStep.textContent = isDiagnosis ? "STEP 01 · DIAGNOSIS" : "STEP 02 · ACTION";
    elements.decisionTitle.textContent = isDiagnosis ? "진단 후보를 선택하세요" : "복구 Action을 선택하세요";
    elements.decisionProgress.textContent = isDiagnosis ? "1 / 2" : "2 / 2";
    elements.decisionGuide.textContent = isDiagnosis
      ? "증상과 모니터링 수치를 근거로 판단하세요."
      : "공개된 Root Cause에 맞는 조치를 선택하세요.";
    elements.decisionOptions.setAttribute("aria-label", isDiagnosis ? "Diagnosis 후보" : "Action 후보");
    elements.decisionOptions.innerHTML = (options ?? []).map((option, index) => {
      const wasWrong = attempted.includes(option.optionId);
      return `<button class="decision-option${wasWrong ? " wrong" : ""}" type="button" data-kind="${isDiagnosis ? "diagnosis" : "action"}" data-option-id="${escapeHtml(option.optionId)}" data-letter="${String.fromCharCode(65 + index)}" ${wasWrong ? "disabled" : ""}>${escapeHtml(option.label)}</button>`;
    }).join("");
  }

  function updateActionControls() {
    const rack = racks.find((item) => item.id === game.selectedId);
    const ticket = rack?.ticket;
    const locked = Boolean(
      rack?.status === "critical" &&
      ticket?.investigationRequired &&
      ticket.stage === "reported" &&
      !hasRequiredEvidence(ticket)
    );
    const verificationPending = ticket?.stage === "verification";
    elements.diagnoseBtn.disabled = locked || verificationPending;
    elements.diagnoseBtn.textContent = verificationPending
      ? "검증 대기 · VERIFY IN TERMINAL"
      : locked ? "진단 잠김 · DIAGNOSE LOCKED" : "진단 · DIAGNOSE";
    elements.diagnosisGateMessage.hidden = !locked && !verificationPending;
    if (verificationPending) {
      elements.diagnosisGateMessage.textContent = `Verification required: ${ticket.verification?.requiredCommands?.join(", ") ?? "uptime"}`;
    } else if (locked) {
      const remaining = Math.max(0, ticket.requiredEvidenceCount - getEvidenceCount(ticket));
      elements.diagnosisGateMessage.textContent = `Investigation required: ${remaining} more evidence`;
    } else {
      elements.diagnosisGateMessage.textContent = "";
    }
  }

  function getStageLabel(stage) {
    return { reported: "미진단", diagnosis: "진단 중", action: "ACTION", verification: "VERIFY" }[stage] ?? "UNKNOWN";
  }

  function getOpenQueue() {
    return racks.filter((rack) => rack.ticket).map((rack) => ({ rack, ticket: rack.ticket }));
  }

  function updateIncidentQueue() {
    const queue = getOpenQueue().sort((left, right) => {
      const breachDifference = Number(right.ticket.slaBreached) - Number(left.ticket.slaBreached);
      if (breachDifference) return breachDifference;
      const severityDifference = severityInfo(right.ticket.severity).priority - severityInfo(left.ticket.severity).priority;
      if (severityDifference) return severityDifference;
      return getSlaRemaining(left.ticket) - getSlaRemaining(right.ticket);
    });

    elements.queueCount.textContent = `${queue.length} OPEN`;
    elements.queueEmpty.hidden = queue.length > 0;
    elements.incidentQueue.innerHTML = queue.map(({ rack, ticket }) => {
      const remaining = getSlaRemaining(ticket);
      const breached = ticket.slaBreached;
      const urgent = !breached && remaining <= 10;
      return `<button class="queue-item${breached ? " breached" : urgent ? " urgent" : ""}${game.selectedId === rack.id ? " selected" : ""}" type="button" data-queue-rack-id="${rack.id}">
        <span class="queue-ticket"><strong>${ticket.ticketId}</strong><small>${rackLabel(rack.id)} <span class="queue-category category-${ticket.category.toLowerCase()}">${ticket.category}</span></small></span>
        <span class="queue-severity">${severityInfo(ticket.severity).label}</span>
        <span class="queue-stage">${getStageLabel(ticket.stage)}</span>
        <span class="queue-sla">${breached ? "BREACH" : formatClock(remaining)}</span>
      </button>`;
    }).join("");
  }

  function getFilteredHistory() {
    return Analytics.filterHistory(
      game.incidentHistory,
      game.historyFilters.category,
      game.historyFilters.sla
    );
  }

  function timelineLabel(event) {
    const labels = {
      INCIDENT_CREATED: "INCIDENT CREATED",
      COMMAND_EXECUTED: "COMMAND",
      EVIDENCE_CAPTURED: "EVIDENCE CAPTURED",
      DIAGNOSIS_STARTED: "DIAGNOSIS STARTED",
      WRONG_DIAGNOSIS: "WRONG DIAGNOSIS",
      DIAGNOSIS_CONFIRMED: "DIAGNOSIS CONFIRMED",
      WRONG_ACTION: "WRONG ACTION",
      RECOVERY_COMPLETED: "RECOVERY COMPLETED",
      SLA_BREACHED: "SLA BREACHED"
    };
    return labels[event.type] ?? event.type.replaceAll("_", " ");
  }

  function buildIncidentDetailMarkup(ticket) {
    if (!ticket) return "";
    const report = Analytics.buildIncidentReport(ticket);
    const summary = report.summary;
    const investigation = report.investigation;
    const evidenceCount = new Set(investigation.evidence).size;
    const evidenceLabel = investigation.investigationRequired
      ? `${Math.min(evidenceCount, investigation.requiredEvidenceCount)} / ${investigation.requiredEvidenceCount} REQUIRED`
      : `OPTIONAL INVESTIGATION · ${evidenceCount} useful commands captured`;
    const commandItems = investigation.commands.length
      ? investigation.commands.map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join("")
      : "<li>NO COMMANDS RECORDED</li>";
    const evidenceItems = investigation.evidence.length
      ? investigation.evidence.map((command) => `<li>✓ <code>${escapeHtml(command)}</code></li>`).join("")
      : "<li>NO USEFUL EVIDENCE CAPTURED</li>";
    const evidenceDetails = ticket.terminalHistory.length
      ? ticket.terminalHistory.map((record) => `<details class="evidence-output"><summary>${record.useful ? "EVIDENCE · " : "COMMAND · "}${escapeHtml(record.command)}</summary><pre>${escapeHtml(record.output)}</pre></details>`).join("")
      : "";
    const timeline = report.timeline.length
      ? report.timeline.map((event) => {
        const elapsed = Math.max(0, (event.timestamp - ticket.createdAt) / 1000);
        return `<li><time>${escapeHtml(Analytics.formatDuration(elapsed))}</time><div><strong>${escapeHtml(timelineLabel(event))}</strong>${event.detail ? `<span>${escapeHtml(event.detail)}</span>` : ""}<small>${escapeHtml(Analytics.formatTimestamp(event.timestamp))}</small></div></li>`;
      }).join("")
      : '<li class="timeline-empty">NO TIMELINE EVENTS</li>';

    return `
      <header class="incident-report-heading">
        <div><span>${escapeHtml(summary.ticketId)}</span><h3>${escapeHtml(summary.title)}</h3></div>
        <span class="history-sla ${ticket.slaBreached ? "breached" : "met"}">${escapeHtml(summary.slaResult)}</span>
      </header>
      <section class="incident-report-section">
        <h4>INCIDENT SUMMARY</h4>
        <dl class="incident-summary-grid">
          <div><dt>TICKET / INCIDENT</dt><dd>${escapeHtml(summary.ticketId)} · ${escapeHtml(summary.incidentId)}</dd></div>
          <div><dt>CATEGORY / SEVERITY</dt><dd>${escapeHtml(summary.category)} · ${escapeHtml(summary.severity)}</dd></div>
          <div><dt>DIFFICULTY / RACK</dt><dd>${escapeHtml(summary.difficulty)} · ${escapeHtml(summary.rack)}</dd></div>
          <div><dt>CREATED</dt><dd>${escapeHtml(Analytics.formatTimestamp(summary.createdAt))}</dd></div>
          <div><dt>RESOLVED</dt><dd>${escapeHtml(Analytics.formatTimestamp(summary.resolvedAt))}</dd></div>
          <div><dt>MTTR</dt><dd>${escapeHtml(Analytics.formatDuration(summary.mttrSeconds))}</dd></div>
          <div><dt>ORIGINAL / APPLIED SLA</dt><dd>${summary.originalSlaSeconds}s / ${summary.appliedSlaSeconds}s</dd></div>
          <div><dt>SLA RESULT</dt><dd>${escapeHtml(summary.slaResult)}</dd></div>
        </dl>
        <p class="report-symptom"><strong>SYMPTOM</strong>${escapeHtml(summary.symptom)}</p>
      </section>
      <section class="incident-report-section split-report-section">
        <div><h4>ROOT CAUSE</h4><strong>${escapeHtml(report.rootCause.diagnosis)}</strong><p>${escapeHtml(report.rootCause.detail)}</p></div>
        <div><h4>RECOVERY</h4><strong>+${report.recovery.awardedScore} PTS</strong><p>${escapeHtml(report.recovery.action)}</p></div>
      </section>
      <section class="incident-report-section">
        <h4>INVESTIGATION</h4>
        <div class="evidence-status">${escapeHtml(evidenceLabel)}</div>
        <div class="investigation-columns">
          <div><h5>COMMANDS EXECUTED</h5><ul>${commandItems}</ul></div>
          <div><h5>INVESTIGATION EVIDENCE</h5><ul>${evidenceItems}</ul></div>
        </div>
        <p class="invalid-command-count">INVALID COMMANDS · ${investigation.invalidCommandCount}</p>
        ${evidenceDetails ? `<details class="terminal-evidence-details"><summary>TERMINAL EVIDENCE DETAIL</summary>${evidenceDetails}</details>` : ""}
      </section>
      <section class="incident-report-section">
        <h4>INCIDENT TIMELINE</h4>
        <ol class="incident-timeline">${timeline}</ol>
      </section>
      <section class="incident-report-section rca-section">
        <h4>ROOT CAUSE ANALYSIS</h4>
        <ol class="rca-list">
          <li><strong>What Happened</strong><p>${escapeHtml(report.rca.whatHappened)}</p></li>
          <li><strong>Symptoms</strong><p>${escapeHtml(report.rca.symptoms)}</p></li>
          <li><strong>Investigation</strong><p>${escapeHtml(report.rca.investigation)}</p></li>
          <li><strong>Root Cause</strong><p>${escapeHtml(report.rca.rootCause)}</p></li>
          <li><strong>Recovery Action</strong><p>${escapeHtml(report.rca.recoveryAction)}</p></li>
          <li><strong>SLA / MTTR Result</strong><p>${escapeHtml(report.rca.result)}</p></li>
          <li><strong>Lessons Learned</strong><p>${escapeHtml(report.rca.lessonsLearned)}</p></li>
        </ol>
      </section>`;
  }

  function renderHistoryDetail(ticket) {
    elements.historyDetailEmpty.hidden = Boolean(ticket);
    elements.historyDetailContent.hidden = !ticket;
    elements.historyDetailContent.innerHTML = buildIncidentDetailMarkup(ticket);
  }

  function renderHistory() {
    const records = getFilteredHistory();
    elements.historyButtonCount.textContent = game.incidentHistory.length;
    elements.historyResultCount.textContent = `${records.length} RECORD${records.length === 1 ? "" : "S"}`;
    elements.historyEmpty.hidden = records.length > 0;

    if (!records.some((ticket) => ticket.ticketId === game.selectedHistoryTicketId)) {
      game.selectedHistoryTicketId = records[0]?.ticketId ?? null;
    }
    elements.historyList.innerHTML = records.map((ticket) => {
      const mttr = Analytics.getMttrSeconds(ticket);
      const selected = ticket.ticketId === game.selectedHistoryTicketId;
      return `<button class="history-item${selected ? " selected" : ""}" type="button" data-history-ticket-id="${escapeHtml(ticket.ticketId)}" aria-pressed="${selected}">
        <span class="history-item-top"><strong>${escapeHtml(ticket.ticketId)}</strong><span class="queue-category category-${ticket.category.toLowerCase()}">${escapeHtml(ticket.category)}</span><b>${escapeHtml(ticket.severity)}</b></span>
        <span class="history-item-title">${escapeHtml(ticket.title)}</span>
        <span class="history-item-meta">${escapeHtml(ticket.affectedRack)} · ${escapeHtml(ticket.difficulty)} · ${escapeHtml(Analytics.formatTimestamp(ticket.resolvedAt))}</span>
        <span class="history-item-result ${ticket.slaBreached ? "breached" : "met"}">${Analytics.getSlaResult(ticket)} · MTTR ${escapeHtml(Analytics.formatDuration(mttr))}</span>
      </button>`;
    }).join("");

    const selectedTicket = records.find((ticket) => ticket.ticketId === game.selectedHistoryTicketId) ?? null;
    renderHistoryDetail(selectedTicket);
  }

  function updateHistoryFilters() {
    elements.historyCategoryFilters.querySelectorAll("[data-history-category]").forEach((button) => {
      const selected = button.dataset.historyCategory === game.historyFilters.category;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    elements.historySlaFilters.querySelectorAll("[data-history-sla]").forEach((button) => {
      const selected = button.dataset.historySla === game.historyFilters.sla;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function openHistory() {
    hideModal(elements.archiveModal);
    updateHistoryFilters();
    renderHistory();
    showModal(elements.historyModal, elements.historyCloseBtn);
  }

  function closeHistory() {
    hideModal(elements.historyModal, elements.historyOpenBtn);
  }

  function handleHistoryFilter(event) {
    const categoryButton = event.target.closest("[data-history-category]");
    const slaButton = event.target.closest("[data-history-sla]");
    if (!categoryButton && !slaButton) return;
    if (categoryButton) game.historyFilters.category = categoryButton.dataset.historyCategory;
    if (slaButton) game.historyFilters.sla = slaButton.dataset.historySla;
    game.selectedHistoryTicketId = null;
    updateHistoryFilters();
    renderHistory();
  }

  function handleHistorySelection(event) {
    const button = event.target.closest("[data-history-ticket-id]");
    if (!button) return;
    game.selectedHistoryTicketId = button.dataset.historyTicketId;
    renderHistory();
    elements.historyDetail.scrollTop = 0;
  }

  function formatArchiveDate(timestamp, includeTime = false) {
    if (!Number.isFinite(Number(timestamp))) return "—";
    return new Intl.DateTimeFormat("ko-KR", includeTime
      ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }
      : { year: "numeric", month: "2-digit", day: "2-digit" }
    ).format(new Date(Number(timestamp)));
  }

  function setArchiveNotice(message = "", kind = "") {
    elements.archiveNotice.hidden = !message;
    elements.archiveNotice.textContent = message;
    elements.archiveNotice.className = `archive-notice${kind ? ` ${kind}` : ""}`;
  }

  function getFilteredArchive() {
    return Analytics.filterArchivedShifts(
      game.archive.shifts,
      game.archiveFilters.difficulty,
      game.archiveFilters.grade
    );
  }

  function renderArchiveFilters() {
    elements.archiveDifficultyFilters.querySelectorAll("[data-archive-difficulty]").forEach((button) => {
      const selected = button.dataset.archiveDifficulty === game.archiveFilters.difficulty;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    elements.archiveGradeFilters.querySelectorAll("[data-archive-grade]").forEach((button) => {
      const selected = button.dataset.archiveGrade === game.archiveFilters.grade;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function renderPersonalBest() {
    const best = Analytics.calculatePersonalBest(game.archive.shifts);
    if (!best) {
      elements.archivePersonalBest.innerHTML = "";
      elements.archivePersonalBest.hidden = true;
      return;
    }
    elements.archivePersonalBest.hidden = false;
    elements.archivePersonalBest.innerHTML = `
      <div class="personal-best-heading"><p class="eyebrow">THIS BROWSER'S SIMULATION RECORDS</p><h3 id="personalBestTitle">PERSONAL BEST</h3></div>
      <div><small>HIGHEST SCORE</small><strong>${best.highestScore.finalScore} PTS</strong><span>${escapeHtml(best.highestScore.shiftId)}</span></div>
      <div><small>BEST SLA COMPLIANCE</small><strong>${best.bestSla.slaCompliance.toFixed(1)}%</strong><span>${escapeHtml(best.bestSla.shiftId)}</span></div>
      <div><small>FASTEST AVG MTTR</small><strong>${best.fastestMttr ? Analytics.formatDuration(best.fastestMttr.averageMttr) : "N/A"}</strong><span>${best.fastestMttr ? escapeHtml(best.fastestMttr.shiftId) : "NO RESOLVED INCIDENTS"}</span></div>`;
  }

  function renderComparison(shift) {
    const sorted = Analytics.sortArchivedShifts(game.archive.shifts);
    const index = sorted.findIndex((record) => record.shiftId === shift.shiftId);
    const previous = index >= 0 ? sorted[index + 1] : null;
    const comparison = Analytics.compareShifts(shift, previous);
    if (!comparison) return `<section class="archive-section"><h4>PREVIOUS SHIFT COMPARISON</h4><p class="archive-muted">이전 Shift 기록이 없어 비교할 수 없습니다.</p></section>`;
    const items = comparison.map((metric) => {
      const digits = metric.label === "Score" ? 0 : 1;
      const sign = metric.delta > 0 ? "+" : "";
      const directionHint = metric.lowerIsBetter ? "lower is better" : "higher is better";
      return `<div class="comparison-item ${metric.status.toLowerCase()}">
        <small>${escapeHtml(metric.label)} · ${directionHint}</small>
        <strong>${sign}${metric.delta.toFixed(digits)}${metric.suffix}</strong>
        <span>${metric.status}</span>
      </div>`;
    }).join("");
    return `<section class="archive-section"><h4>PREVIOUS SHIFT COMPARISON</h4><p class="archive-muted">${escapeHtml(previous.shiftId)} 대비</p><div class="comparison-grid">${items}</div></section>`;
  }

  function renderArchiveShiftDetail(shift) {
    elements.archiveDetailEmpty.hidden = Boolean(shift);
    elements.archiveDetailContent.hidden = !shift;
    if (!shift) {
      elements.archiveDetailContent.innerHTML = "";
      return;
    }

    if (game.selectedArchiveIncidentTicketId) {
      const incident = shift.incidentHistory.find((ticket) => ticket.ticketId === game.selectedArchiveIncidentTicketId);
      if (incident) {
        elements.archiveDetailContent.innerHTML = `<button class="archive-back-btn" type="button" data-archive-back-to-shift>← BACK TO ${escapeHtml(shift.shiftId)}</button>${buildIncidentDetailMarkup(incident)}`;
        return;
      }
      game.selectedArchiveIncidentTicketId = null;
    }

    const categoryCards = shift.categoryAnalytics.map((category) => `
      <article class="category-performance-card category-${category.category.toLowerCase()}">
        <h4>${escapeHtml(category.category)}</h4>
        <strong>${category.resolved} / ${category.generated} Resolved</strong>
        <span>${category.slaBreached} SLA Breached</span>
        <span>SLA ${category.slaCompliance === null ? "N/A" : `${category.slaCompliance.toFixed(1)}%`}</span>
        <span>Avg MTTR ${Analytics.formatDuration(category.averageMttr)}</span>
      </article>`).join("");
    const operator = shift.operatorSummary;
    const operatorList = (items, empty) => items.length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p>${empty}</p>`;
    const resolvedItems = shift.incidentHistory.length
      ? shift.incidentHistory.map((ticket) => `<button class="archive-incident-item" type="button" data-archive-incident-id="${escapeHtml(ticket.ticketId)}">
        <span><strong>${escapeHtml(ticket.ticketId)}</strong><b class="queue-category category-${ticket.category.toLowerCase()}">${escapeHtml(ticket.category)}</b><i>${escapeHtml(ticket.severity)}</i></span>
        <em>${escapeHtml(ticket.title)}</em><small>${escapeHtml(ticket.affectedRack)} · ${Analytics.getSlaResult(ticket)} · MTTR ${Analytics.formatDuration(Analytics.getMttrSeconds(ticket))}</small>
      </button>`).join("")
      : `<p class="archive-muted">NO RESOLVED INCIDENTS</p>`;
    const unresolvedItems = shift.unresolvedTickets.length
      ? shift.unresolvedTickets.map((ticket) => `<li><span><strong>${escapeHtml(ticket.ticketId)}</strong> <b class="queue-category category-${ticket.category.toLowerCase()}">${escapeHtml(ticket.category)}</b> ${escapeHtml(ticket.severity)}</span><em>${escapeHtml(ticket.title)}</em><small>${escapeHtml(ticket.affectedRack)} · ${ticket.slaBreached ? "SLA BREACHED" : "SLA OPEN"} · ${escapeHtml(ticket.stage.toUpperCase())}</small></li>`).join("")
      : `<li class="archive-muted">ALL GENERATED INCIDENTS RESOLVED</li>`;
    const investigationCoverage = shift.investigationCoverage === null ? "OPTIONAL / N/A" : `${shift.investigationCoverage.toFixed(1)}%`;

    elements.archiveDetailContent.innerHTML = `
      <header class="archive-record-heading">
        <div><span>${escapeHtml(shift.shiftId)}</span><h3>${formatArchiveDate(shift.endedAt)} · ${escapeHtml(shift.difficulty)}</h3></div>
        <div><strong>GRADE ${escapeHtml(shift.grade)}</strong><button class="archive-delete-btn" type="button" data-delete-shift-id="${escapeHtml(shift.shiftId)}">DELETE SHIFT</button></div>
      </header>
      <section class="archive-summary-grid">
        <div><small>STARTED</small><strong>${formatArchiveDate(shift.startedAt, true)}</strong></div>
        <div><small>ENDED</small><strong>${formatArchiveDate(shift.endedAt, true)}</strong></div>
        <div><small>DURATION</small><strong>${Analytics.formatDuration(shift.durationSeconds)}</strong></div>
        <div><small>END REASON</small><strong>${escapeHtml(shift.endReason)}</strong></div>
        <div><small>FINAL SCORE</small><strong>${shift.finalScore} PTS</strong></div>
        <div><small>AVAILABILITY</small><strong>${shift.availability.toFixed(2)}%</strong></div>
      </section>
      <section class="archive-section"><h4>OPERATIONS</h4><div class="archive-metric-grid">
        <div><small>GENERATED</small><strong>${shift.incidentsGenerated}</strong></div><div><small>RESOLVED</small><strong>${shift.incidentsResolved}</strong></div>
        <div><small>UNRESOLVED</small><strong>${shift.unresolvedCount}</strong></div><div><small>SLA BREACHED</small><strong>${shift.slaBreaches}</strong></div>
        <div><small>SLA COMPLIANCE</small><strong>${shift.slaCompliance.toFixed(1)}%</strong></div><div><small>AVERAGE MTTR</small><strong>${Analytics.formatDuration(shift.averageMttr)}</strong></div>
      </div></section>
      <section class="archive-section split-archive-section">
        <div><h4>ACCURACY</h4><p>Diagnosis <strong>${shift.diagnosisAccuracy.toFixed(1)}%</strong></p><p>Action <strong>${shift.actionAccuracy.toFixed(1)}%</strong></p></div>
        <div><h4>INVESTIGATION</h4><p>Commands <strong>${shift.commandsExecuted}</strong> · Useful <strong>${shift.usefulCommands}</strong> · Invalid <strong>${shift.invalidCommands}</strong></p><p>Coverage <strong>${investigationCoverage}</strong></p></div>
      </section>
      <section class="archive-section"><h4>CATEGORY PERFORMANCE</h4><div class="category-performance">${categoryCards}</div></section>
      <section class="archive-section"><h4>OPERATOR SUMMARY</h4><div class="operator-summary"><div><strong>STRONG</strong>${operatorList(operator.strong, "No standout metric")}</div><div><strong>NEEDS IMPROVEMENT</strong>${operatorList(operator.needsImprovement, "No metric below threshold")}</div><small>${escapeHtml(operator.note)}</small></div></section>
      ${renderComparison(shift)}
      <section class="archive-section"><h4>RESOLVED INCIDENT RECORDS</h4><div class="archive-incident-list">${resolvedItems}</div></section>
      <section class="archive-section unresolved-section"><h4>UNRESOLVED AT SHIFT END</h4><ul>${unresolvedItems}</ul></section>`;
  }

  function renderArchive() {
    const records = getFilteredArchive();
    elements.archiveButtonCount.textContent = game.archive.shifts.length;
    elements.archiveResultCount.textContent = `${records.length} RECORD${records.length === 1 ? "" : "S"}`;
    elements.archiveEmpty.hidden = records.length > 0;
    elements.archiveClearBtn.disabled = game.archive.shifts.length === 0;
    renderArchiveFilters();
    renderPersonalBest();
    if (!records.some((shift) => shift.shiftId === game.selectedArchiveShiftId)) {
      game.selectedArchiveShiftId = records[0]?.shiftId ?? null;
      game.selectedArchiveIncidentTicketId = null;
    }
    elements.archiveList.innerHTML = records.map((shift) => {
      const selected = shift.shiftId === game.selectedArchiveShiftId;
      return `<button class="archive-item${selected ? " selected" : ""}" type="button" data-archive-shift-id="${escapeHtml(shift.shiftId)}" aria-pressed="${selected}">
        <span><strong>${escapeHtml(shift.shiftId)}</strong><b>GRADE ${escapeHtml(shift.grade)}</b></span>
        <em>${formatArchiveDate(shift.endedAt)} · ${escapeHtml(shift.difficulty)}</em>
        <small>${shift.incidentsResolved} / ${shift.incidentsGenerated} Resolved · SLA ${shift.slaCompliance.toFixed(1)}%</small>
        <small>MTTR ${Analytics.formatDuration(shift.averageMttr)} · Score ${shift.finalScore}</small>
      </button>`;
    }).join("");
    const selected = records.find((shift) => shift.shiftId === game.selectedArchiveShiftId) ?? null;
    renderArchiveShiftDetail(selected);
  }

  function openArchive() {
    hideModal(elements.historyModal);
    game.archive = Storage.loadArchive();
    if (game.archive.warnings?.length) setArchiveNotice("일부 저장 기록을 읽지 못해 안전하게 제외했습니다.", "warning");
    else if (!game.archive.storageAvailable) setArchiveNotice("LocalStorage를 사용할 수 없어 Archive가 저장되지 않습니다.", "warning");
    else setArchiveNotice();
    renderArchive();
    showModal(elements.archiveModal, elements.archiveCloseBtn);
  }

  function closeArchive() {
    hideModal(elements.archiveModal, elements.archiveOpenBtn);
    game.selectedArchiveIncidentTicketId = null;
  }

  function handleArchiveFilter(event) {
    const difficulty = event.target.closest("[data-archive-difficulty]");
    const grade = event.target.closest("[data-archive-grade]");
    if (!difficulty && !grade) return;
    if (difficulty) game.archiveFilters.difficulty = difficulty.dataset.archiveDifficulty;
    if (grade) game.archiveFilters.grade = grade.dataset.archiveGrade;
    game.selectedArchiveShiftId = null;
    game.selectedArchiveIncidentTicketId = null;
    renderArchive();
  }

  function handleArchiveSelection(event) {
    const shiftButton = event.target.closest("[data-archive-shift-id]");
    const incidentButton = event.target.closest("[data-archive-incident-id]");
    const backButton = event.target.closest("[data-archive-back-to-shift]");
    const deleteButton = event.target.closest("[data-delete-shift-id]");
    if (shiftButton) {
      game.selectedArchiveShiftId = shiftButton.dataset.archiveShiftId;
      game.selectedArchiveIncidentTicketId = null;
      renderArchive();
    } else if (incidentButton) {
      game.selectedArchiveIncidentTicketId = incidentButton.dataset.archiveIncidentId;
      renderArchive();
      elements.archiveDetail.scrollTop = 0;
    } else if (backButton) {
      game.selectedArchiveIncidentTicketId = null;
      renderArchive();
    } else if (deleteButton) {
      openArchiveConfirmation("delete", deleteButton.dataset.deleteShiftId);
    }
  }

  function openArchiveConfirmation(action, shiftId = null) {
    game.archiveConfirmAction = { action, shiftId };
    const clear = action === "clear";
    elements.archiveConfirmTitle.textContent = clear ? "CLEAR ALL ARCHIVE RECORDS?" : `DELETE ${shiftId}?`;
    elements.archiveConfirmDescription.textContent = clear
      ? "이 브라우저에 저장된 모든 완료 Shift 기록을 삭제합니다. 현재 Shift에는 영향을 주지 않습니다."
      : "선택한 완료 Shift Snapshot만 삭제합니다. 현재 Shift에는 영향을 주지 않습니다.";
    elements.archiveConfirmActionBtn.textContent = clear ? "전체 삭제 · CLEAR ALL" : "삭제 · DELETE";
    showModal(elements.archiveConfirmModal, elements.archiveConfirmCancelBtn);
  }

  function closeArchiveConfirmation() {
    hideModal(elements.archiveConfirmModal, elements.archiveCloseBtn);
    game.archiveConfirmAction = null;
  }

  function confirmArchiveAction() {
    const pending = game.archiveConfirmAction;
    if (!pending) return;
    const result = pending.action === "clear"
      ? Storage.clearArchive()
      : Storage.deleteShiftRecord(pending.shiftId);
    hideModal(elements.archiveConfirmModal);
    game.archiveConfirmAction = null;
    if (!result.ok) {
      setArchiveNotice(result.reason ?? "Archive 작업을 완료하지 못했습니다.", "warning");
      return;
    }
    game.archive = result.archive;
    game.selectedArchiveShiftId = null;
    game.selectedArchiveIncidentTicketId = null;
    setArchiveNotice(pending.action === "clear" ? "모든 Archive 기록을 삭제했습니다." : `${pending.shiftId} 기록을 삭제했습니다.`, "success");
    renderArchive();
  }

  function updateShiftPanel() {
    const shift = game.shift;
    const statusClass = shift.status.toLowerCase();
    elements.shiftStatus.className = `shift-status ${statusClass}`;
    elements.shiftStatus.textContent = shift.status;
    elements.shiftSlaBreaches.textContent = game.stats.slaBreaches;

    let progress = 0;
    if (shift.status === "RUNNING") {
      progress = Math.min(1, Math.max(0, (Date.now() - shift.startedAt) / (SHIFT_CONFIG.durationSeconds * 1000)));
    } else if (shift.status === "ENDED") {
      progress = 1;
    }
    elements.shiftGameTime.textContent = formatSimulatedTime(
      SHIFT_CONFIG.simulatedStartMinutes + SHIFT_CONFIG.simulatedDurationMinutes * progress
    );
    elements.floorHudTime.textContent = elements.shiftGameTime.textContent;
    elements.shiftRemaining.textContent = formatClock(shift.remainingSeconds);
    elements.startShiftBtn.disabled = shift.status !== "IDLE";
    elements.startShiftBtn.textContent = shift.status === "RUNNING"
      ? floorText("shiftRunningLabel")
      : shift.status === "ENDED"
        ? floorText("shiftEndedLabel")
        : floorText("startShiftLabel");
    elements.floorStartShiftBtn.textContent = elements.startShiftBtn.textContent;
    elements.floorStartShiftBtn.disabled = shift.status !== "IDLE";
    elements.floorTriggerIncidentBtn.disabled = shift.status === "ENDED";
    elements.endShiftBtn.textContent = floorText("endShiftLabel");
    elements.endShiftBtn.hidden = shift.status !== "RUNNING";
    elements.endShiftBtn.disabled = shift.status !== "RUNNING";
    elements.incidentBtn.disabled = shift.status === "ENDED";

    const difficultyKey = getCurrentDifficultyKey();
    const difficulty = getDifficultyConfig(difficultyKey);
    elements.currentDifficulty.textContent = difficulty.label;
    elements.floorHudDifficulty.textContent = difficulty.label;
    elements.currentDifficulty.className = difficultyKey.toLowerCase();
    elements.difficultySummary.textContent = `SLA ×${difficulty.slaMultiplier.toFixed(2)} · SCORE ×${difficulty.scoreMultiplier.toFixed(2)} · INVESTIGATION ${difficulty.investigationRequired ? "REQUIRED" : "OPTIONAL"}`;
    if (shift.status === "IDLE") elements.scoreTrend.textContent = Analytics.formatScoreMultiplier(difficulty.scoreMultiplier);
    elements.difficultySelector.querySelectorAll("[data-difficulty]").forEach((button) => {
      const selected = button.dataset.difficulty === difficultyKey;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = shift.status !== "IDLE";
    });
  }

  function recalculateTemperature() {
    const temperatures = racks.filter((rack) => rack.ticket).map((rack) => rack.ticket.temperature);
    game.temperature = temperatures.length ? Math.max(21.4, ...temperatures) : 21.4;
  }

  function refreshUI(focusSelected = false) {
    renderRacks(focusSelected);
    renderFloor();
    renderFloorBriefing();
    updateDashboard();
    updateTicketPanel();
    updateDecisionPanel();
    updateActionControls();
    updateIncidentQueue();
    updateShiftPanel();
    renderTerminal();
    renderTerminalWorkflow();
    renderFloorWorkflowPopup();
    elements.historyButtonCount.textContent = game.incidentHistory.length;
    elements.archiveButtonCount.textContent = game.archive.shifts.length;
    if (!elements.historyModal.hidden) renderHistory();
    if (!elements.archiveModal.hidden) renderArchive();
  }

  // ---------------- Incident, Diagnosis, Action ----------------
  function triggerIncident(source = "manual") {
    if (game.shift.status === "ENDED") {
      showToast("종료된 교대에서는 새 Incident를 만들 수 없습니다.", "error");
      return false;
    }
    if (!INCIDENTS.length) {
      showToast("등록된 Incident 데이터가 없습니다.", "error");
      addLog("WARNING", "Incident 생성 실패 - 데이터 없음");
      return false;
    }

    const candidates = racks.filter((rack) => rack.status !== "critical" && !rack.ticket);
    const rackWarning = Analytics.getFullRackWarningTransition({
      warningActive: game.fullRackWarningActive,
      hasAvailableRack: candidates.length > 0,
      source
    });
    game.fullRackWarningActive = rackWarning.nextWarningActive;
    if (!candidates.length) {
      if (source === "manual") showToast("모든 Rack에 장애가 발생했습니다. 먼저 복구하세요.", "error");
      if (rackWarning.shouldLog) addLog("WARNING", `추가 Incident 생성 실패 - 가용 Rack 없음 (${source === "manual" ? "MANUAL" : "AUTO"})`);
      return false;
    }

    const difficultyKey = getCurrentDifficultyKey();
    const availableIncidents = getAvailableIncidents(difficultyKey);
    if (!availableIncidents.length) {
      showToast(`${difficultyKey} 난이도에서 사용 가능한 Incident가 없습니다.`, "error");
      addLog("WARNING", `Incident 생성 실패 - ${difficultyKey} Pool 비어 있음`);
      return false;
    }

    const repeatSafePool = availableIncidents.length > 1
      ? availableIncidents.filter((incident) => incident.incidentId !== game.lastIncidentId)
      : availableIncidents;
    const rack = candidates[Math.floor(Math.random() * candidates.length)];
    const incident = repeatSafePool[Math.floor(Math.random() * repeatSafePool.length)];
    rack.lastFloorResolution = null;
    game.lastIncidentId = incident.incidentId;
    const ticketId = `TKT-${String(++game.ticketSequence).padStart(4, "0")}`;
    const createdAt = Date.now();
    const countedInShift = game.shift.status === "RUNNING";
    const difficulty = getDifficultyConfig(difficultyKey);
    const appliedSlaSeconds = Math.max(1, Math.round(incident.slaSeconds * difficulty.slaMultiplier));
    const rewardScore = Math.max(0, Math.round(incident.score * difficulty.scoreMultiplier));
    const requiredEvidenceCount = difficulty.investigationRequired
      ? calculateRequiredEvidence(incident.usefulCommands)
      : 0;

    rack.ticket = {
      ...incident,
      difficulty: difficultyKey,
      affectedRack: rackLabel(rack.id),
      ticketId,
      createdAt,
      resolvedAt: null,
      appliedSlaSeconds,
      rewardScore,
      slaDeadline: createdAt + appliedSlaSeconds * 1000,
      slaBreached: false,
      slaPenaltyApplied: false,
      slaFrozenRemaining: null,
      stage: "reported",
      diagnosisOptions: null,
      actionOptions: null,
      verification: null,
      wrongDiagnoses: [],
      wrongActions: [],
      terminalHistory: [],
      investigationEvidence: [],
      countedUsefulCommands: [],
      eventHistory: [{ type: "INCIDENT_CREATED", detail: `${incident.title} · ${rackLabel(rack.id)}`, timestamp: createdAt }],
      investigationRequired: difficulty.investigationRequired,
      requiredEvidenceCount,
      prematureRecoveryPenalized: false,
      countedInShift,
      previousStatus: rack.status,
      previousMetrics: { ...rack.metrics }
    };
    rack.status = "critical";
    rack.metrics = { CPU: incident.cpu, RAM: incident.ram, Disk: incident.disk, Network: incident.network };
    if (countedInShift) game.stats.generatedIncidents += 1;
    game.selectedId = rack.id;
    game.availability = Math.max(0, game.availability - 0.85);
    recalculateTemperature();

    addLog("ALERT", `${ticketId} ${rackLabel(rack.id)} Critical / ${incident.symptom} (SLA ${appliedSlaSeconds}s · ${difficultyKey})`);
    showToast(`${ticketId}: ${rackLabel(rack.id)}에 Critical Incident 발생`, "error");
    refreshUI();
    return true;
  }

  function diagnoseSelected() {
    const rack = racks.find((item) => item.id === game.selectedId);
    if (!rack) {
      showToast("먼저 Critical 상태의 Rack을 선택하세요.", "error");
      addLog("WARNING", "진단 실패 - 선택된 Rack 없음");
      return;
    }
    if (rack.status !== "critical" || !rack.ticket) {
      showToast("선택한 Rack은 Critical 상태가 아닙니다.", "error");
      addLog("WARNING", `${rackLabel(rack.id)} 진단 불필요 - Critical 아님`);
      return;
    }

    const ticket = rack.ticket;
    if (ticket.investigationRequired && !hasRequiredEvidence(ticket)) {
      const remaining = Math.max(0, ticket.requiredEvidenceCount - getEvidenceCount(ticket));
      showToast(`Hard Mode: Investigation Evidence가 ${remaining}개 더 필요합니다.`, "error");
      addLog("INVESTIGATION", `${ticket.ticketId} diagnosis locked / ${remaining} evidence required`);
      updateActionControls();
      return;
    }
    if (ticket.stage === "action") {
      showToast("진단 완료 상태입니다. 올바른 Action을 선택하세요.");
      updateDecisionPanel();
      return;
    }
    if (ticket.stage === "diagnosis") {
      showToast("진단이 진행 중입니다. 후보 중 하나를 선택하세요.");
      updateDecisionPanel();
      return;
    }

    ticket.stage = "diagnosis";
    ticket.diagnosisOptions = createChoiceOptions(ticket, "correctDiagnosis");
    recordTicketEvent(ticket, "DIAGNOSIS_STARTED", "Diagnosis options opened");
    addLog("DIAG", `${rackLabel(rack.id)} diagnosis started`);
    showToast("진단 후보가 준비되었습니다. 증상과 수치를 확인하세요.");
    refreshUI();
  }

  function recoverSelected() {
    const rack = racks.find((item) => item.id === game.selectedId);
    if (!rack) {
      showToast("복구할 Rack을 먼저 선택하세요.", "error");
      addLog("WARNING", "복구 실패 - 선택된 Rack 없음");
      return;
    }
    if (rack.status !== "critical" || !rack.ticket) {
      showToast("선택한 Rack에는 복구할 Critical 장애가 없습니다.", "error");
      addLog("WARNING", `${rackLabel(rack.id)} 복구 불필요 - 정상 운영 중`);
      return;
    }
    if (rack.ticket.stage === "verification") {
      showToast("Recovery가 적용되었습니다. Terminal에서 정상 상태를 Verification하세요.");
      return;
    }
    if (rack.ticket.stage !== "action") {
      if (!rack.ticket.prematureRecoveryPenalized) {
        rack.ticket.prematureRecoveryPenalized = true;
        changeScore(-30);
        elements.scoreTrend.textContent = "절차 위반 -30 PTS";
        addLog("WARNING", `${rack.ticket.ticketId} ${rackLabel(rack.id)} 미진단 복구 거부 / -30 PTS`);
        showToast("경고: 진단 없이 복구할 수 없습니다. -30점", "error");
      } else {
        showToast("이미 감점된 요청입니다. 먼저 Diagnosis를 완료하세요.", "error");
      }
      updateDashboard();
      return;
    }
    showToast("자동 복구는 비활성화되었습니다. 올바른 Action을 선택하세요.");
    updateDecisionPanel();
  }

  function beginFloorVerification(rack) {
    const ticket = rack.ticket;
    ticket.stage = "verification";
    ticket.verification = createVerificationState(ticket);
    rack.metrics = createNormalMetrics();
    recordTicketEvent(ticket, "RECOVERY_APPLIED", ticket.correctAction, ticket.verification.appliedAt);
    addLog("RECOVERY APPLIED", `${ticket.ticketId} / verification pending`);
    showToast("RECOVERY APPLIED · Terminal에서 서비스 정상 여부를 확인하세요.", "success");
    setScenePopup("terminal");
    refreshUI();
    renderTerminal({ scrollToBottom: true });
  }

  function resolveIncident(rack, { floorVerification = false, verificationCommand = "" } = {}) {
    const ticket = rack.ticket;
    const awardedScore = ticket.rewardScore ?? ticket.score;
    ticket.resolvedAt = Date.now();
    recordTicketEvent(ticket, "RECOVERY_COMPLETED", ticket.correctAction, ticket.resolvedAt);
    recordTicketEvent(ticket, "INCIDENT_RESOLVED", verificationCommand || ticket.correctAction, ticket.resolvedAt);
    if (ticket.countedInShift) {
      game.stats.resolvedIncidents += 1;
      game.stats.totalResolutionTime += (ticket.resolvedAt - ticket.createdAt) / 1000;
    }
    game.incidentHistory.push(createResolvedRecord(ticket, awardedScore));
    if (floorVerification) {
      rack.terminalHistory = ticket.terminalHistory.map((record) => ({ ...record }));
      rack.lastFloorResolution = {
        ticketId: ticket.ticketId,
        verificationCommand,
        resolvedAt: ticket.resolvedAt
      };
    }
    rack.status = ticket.previousStatus ?? "healthy";
    rack.metrics = ticket.previousMetrics ? { ...ticket.previousMetrics } : createNormalMetrics();
    rack.ticket = null;
    game.fullRackWarningActive = false;
    changeScore(awardedScore);
    game.availability = Math.min(100, game.availability + 0.85);
    recalculateTemperature();
    elements.scoreTrend.textContent = `복구 성공 +${awardedScore} PTS`;
    addLog("RECOVERY", `${rackLabel(rack.id)} restored / ${ticket.ticketId} +${awardedScore} PTS (${ticket.difficulty})`);
    showToast(`${floorVerification ? "VERIFICATION PASSED · INCIDENT RESOLVED" : "서비스가 정상 복구되었습니다."} +${awardedScore}점`, "success");
    refreshUI();
  }

  function applyDecisionOption(kind, optionId, source = "dashboard") {
    const rack = racks.find((item) => item.id === game.selectedId);
    const ticket = rack?.ticket;
    if (!ticket || rack.status !== "critical") return;

    const isDiagnosis = kind === "diagnosis";
    if (ticket.stage !== (isDiagnosis ? "diagnosis" : "action")) return;
    const options = isDiagnosis ? ticket.diagnosisOptions : ticket.actionOptions;
    const attempted = isDiagnosis ? ticket.wrongDiagnoses : ticket.wrongActions;
    const option = (options ?? []).find((item) => item.optionId === optionId);
    if (!option || attempted.includes(option.optionId)) return;

    if (!option.isCorrect) {
      attempted.push(option.optionId);
      recordTicketEvent(ticket, isDiagnosis ? "WRONG_DIAGNOSIS" : "WRONG_ACTION", option.label);
      const penalty = isDiagnosis ? 10 : 20;
      changeScore(-penalty);
      if (ticket.countedInShift) {
        if (isDiagnosis) game.stats.wrongDiagnoses += 1;
        else game.stats.wrongActions += 1;
      }
      elements.scoreTrend.textContent = `${isDiagnosis ? "오진" : "잘못된 조치"} -${penalty} PTS`;
      addLog(isDiagnosis ? "WRONG DIAG" : "WRONG ACTION", option.label);
      showToast(`${isDiagnosis ? "잘못된 Diagnosis" : "잘못된 Action"}입니다. -${penalty}점`, "error");
      updateDashboard();
      updateDecisionPanel();
      renderFloorWorkflowPopup();
      return;
    }

    if (isDiagnosis) {
      if (ticket.countedInShift) game.stats.correctDiagnoses += 1;
      ticket.stage = "action";
      ticket.actionOptions = createChoiceOptions(ticket, "correctAction");
      recordTicketEvent(ticket, "DIAGNOSIS_CONFIRMED", ticket.correctDiagnosis);
      addLog("DIAG OK", ticket.correctDiagnosis);
      showToast("정확한 진단입니다. Root Cause를 확인하고 Action을 선택하세요.", "success");
      if (source === "floor") setScenePopup("recovery");
      refreshUI();
      return;
    }

    if (ticket.countedInShift) game.stats.correctActions += 1;
    if (source === "floor") {
      beginFloorVerification(rack);
      return;
    }
    resolveIncident(rack);
  }

  function handleDecisionSelection(event) {
    const button = event.target.closest("[data-option-id]");
    if (!button || button.disabled) return;
    applyDecisionOption(button.dataset.kind, button.dataset.optionId, "dashboard");
  }

  function handleFloorWorkflowSelection(event) {
    const button = event.target.closest("[data-option-id]");
    if (!button || button.disabled) return;
    applyDecisionOption(button.dataset.floorKind, button.dataset.optionId, "floor");
  }

  // ---------------- SLA와 교대 타이머 ----------------
  function applySlaBreach(rack) {
    const ticket = rack.ticket;
    if (!ticket || ticket.slaPenaltyApplied) return;
    ticket.slaBreached = true;
    ticket.slaPenaltyApplied = true;
    recordTicketEvent(ticket, "SLA_BREACHED", `${ticket.appliedSlaSeconds}s applied SLA`);
    changeScore(-50);
    game.availability = Math.max(0, game.availability - 0.5);
    if (ticket.countedInShift) game.stats.slaBreaches += 1;
    elements.scoreTrend.textContent = "SLA 위반 -50 PTS";
    addLog("SLA BREACH", `${ticket.ticketId} ${rackLabel(rack.id)} / -50 PTS`);
    showToast(`${ticket.ticketId} SLA BREACH: -50점`, "error");
  }

  function updateSlaTimers() {
    let changed = false;
    racks.forEach((rack) => {
      const ticket = rack.ticket;
      if (!ticket || Number.isFinite(ticket.slaFrozenRemaining)) return;
      if (getSlaRemaining(ticket) === 0 && !ticket.slaPenaltyApplied) {
        applySlaBreach(rack);
        changed = true;
      }
    });
    if (changed) updateDashboard();
    updateTicketPanel();
    updateIncidentQueue();
    renderFloorBriefing();
    updateShiftPanel();
  }

  function clearShiftTimers() {
    clearTimeout(game.shift.autoIncidentTimerId);
    clearInterval(game.shift.heartbeatIntervalId);
    game.shift.autoIncidentTimerId = null;
    game.shift.heartbeatIntervalId = null;
  }

  function startShiftHeartbeat() {
    clearInterval(game.shift.heartbeatIntervalId);
    game.shift.heartbeatIntervalId = window.setInterval(heartbeat, 1000);
  }

  function scheduleNextIncident() {
    clearTimeout(game.shift.autoIncidentTimerId);
    game.shift.autoIncidentTimerId = null;
    if (game.shift.status !== "RUNNING") return;

    const difficulty = getDifficultyConfig(game.shift.difficulty);
    const minimum = Math.min(difficulty.autoIncidentMinMs, difficulty.autoIncidentMaxMs);
    const maximum = Math.max(difficulty.autoIncidentMinMs, difficulty.autoIncidentMaxMs);
    const delay = randomBetween(minimum, maximum);
    game.shift.autoIncidentTimerId = setTimeout(() => {
      game.shift.autoIncidentTimerId = null;
      if (game.shift.status !== "RUNNING") return;
      triggerIncident("auto");
      scheduleNextIncident();
    }, delay);
  }

  function updateShiftClock() {
    if (game.shift.status !== "RUNNING") return;
    game.shift.remainingSeconds = Math.max(0, Math.ceil((game.shift.endsAt - Date.now()) / 1000));
    updateShiftPanel();
    if (game.shift.remainingSeconds === 0) endShift();
  }

  function resetShift({ resetDifficulty = false } = {}) {
    clearShiftTimers();
    racks.forEach((rack, index) => {
      rack.status = initialRackState[index].status;
      rack.metrics = { ...initialRackState[index].metrics };
      rack.ticket = null;
      rack.terminalHistory.length = 0;
    });
    game.score = 0;
    game.availability = 100;
    game.temperature = 21.4;
    game.selectedId = null;
    game.ticketSequence = 0;
    game.lastIncidentId = null;
    game.fullRackWarningActive = false;
    game.incidentHistory = [];
    game.historyFilters = { category: "ALL", sla: "ALL" };
    game.selectedHistoryTicketId = null;
    game.archiveConfirmAction = null;
    game.stats = createEmptyStats();
    if (resetDifficulty) game.selectedDifficulty = "NORMAL";
    game.shift.status = "IDLE";
    game.shift.difficulty = null;
    game.shift.startedAt = null;
    game.shift.endedAt = null;
    game.shift.endsAt = null;
    game.shift.remainingSeconds = SHIFT_CONFIG.durationSeconds;
    game.shift.archived = false;
    elements.eventLog.innerHTML = "";
    elements.scoreTrend.textContent = Analytics.formatScoreMultiplier(getDifficultyConfig(game.selectedDifficulty).scoreMultiplier);
    managedModals.forEach((modal) => { modal.hidden = true; });
    syncModalState();
    refreshUI();
  }

  function startShift() {
    if (game.shift.status === "RUNNING") {
      showToast("이미 교대가 진행 중입니다.");
      return;
    }
    const selectedDifficulty = game.selectedDifficulty;
    resetShift({ resetDifficulty: false });
    const startedAt = Date.now();
    game.shift.status = "RUNNING";
    game.shift.difficulty = selectedDifficulty;
    game.shift.startedAt = startedAt;
    game.shift.endedAt = null;
    game.shift.endsAt = startedAt + SHIFT_CONFIG.durationSeconds * 1000;
    game.shift.remainingSeconds = SHIFT_CONFIG.durationSeconds;
    elements.scoreTrend.textContent = "교대 운영 중";
    addLog("SHIFT START", `Night Shift started / 22:00 → 06:00 / ${selectedDifficulty}`);
    startShiftHeartbeat();
    scheduleNextIncident();
    refreshUI();
  }

  function startNewShift() {
    resetShift({ resetDifficulty: true });
    addLog("SYSTEM", "New Shift ready - select Difficulty and press START SHIFT");
  }

  function calculateShiftReport() {
    const stats = game.stats;
    const difficulty = game.shift.difficulty ?? game.selectedDifficulty;
    const diagnosisAttempts = stats.correctDiagnoses + stats.wrongDiagnoses;
    const actionAttempts = stats.correctActions + stats.wrongActions;
    const percent = (correct, total) => total === 0 ? 100 : (correct / total) * 100;
    const slaCompliance = stats.generatedIncidents === 0
      ? 100
      : ((stats.generatedIncidents - stats.slaBreaches) / stats.generatedIncidents) * 100;
    const openTickets = racks.map((rack) => rack.ticket).filter((ticket) => ticket?.countedInShift);
    const resolvedTickets = game.incidentHistory.filter((ticket) => ticket.countedInShift);
    const investigation = Analytics.calculateInvestigationCoverage([...resolvedTickets, ...openTickets]);
    const categoryAnalytics = Analytics.calculateCategoryAnalytics(resolvedTickets, openTickets);
    const averageAppliedSla = resolvedTickets.length
      ? resolvedTickets.reduce((total, ticket) => total + ticket.appliedSlaSeconds, 0) / resolvedTickets.length
      : 0;
    return {
      difficulty,
      score: game.score,
      generated: stats.generatedIncidents,
      resolved: stats.resolvedIncidents,
      unresolved: stats.unresolvedIncidents,
      breaches: stats.slaBreaches,
      slaCompliance: Math.max(0, slaCompliance),
      diagnosisAccuracy: percent(stats.correctDiagnoses, diagnosisAttempts),
      actionAccuracy: percent(stats.correctActions, actionAttempts),
      averageMttr: stats.resolvedIncidents === 0 ? 0 : stats.totalResolutionTime / stats.resolvedIncidents,
      averageAppliedSla,
      commandsExecuted: stats.commandsExecuted,
      usefulCommands: stats.usefulCommands,
      invalidCommands: stats.invalidCommands,
      investigationRequiredIncidents: investigation.required,
      investigationCompletedIncidents: investigation.completed,
      investigationIncompleteIncidents: investigation.incomplete,
      investigationCoverage: investigation.coverage,
      categoryAnalytics
    };
  }

  function calculateGrade(report) {
    const scorePerformance = Math.max(0, Math.min(100, (report.score / GRADE_CONFIG.scoreTarget) * 100));
    const difficulty = getDifficultyConfig(report.difficulty);
    const investigationPenalty = report.difficulty === "HARD" && report.investigationCoverage !== null
      ? (100 - report.investigationCoverage) / 100 * difficulty.investigationGradePenaltyMax
      : 0;
    const performance =
      report.slaCompliance * GRADE_CONFIG.weights.sla +
      report.diagnosisAccuracy * GRADE_CONFIG.weights.diagnosis +
      report.actionAccuracy * GRADE_CONFIG.weights.action +
      scorePerformance * GRADE_CONFIG.weights.score -
      report.unresolved * GRADE_CONFIG.unresolvedPenalty -
      investigationPenalty;
    return GRADE_CONFIG.thresholds.find((rule) => performance >= rule.minimum)?.grade ?? "F";
  }

  function showShiftReport(report = calculateShiftReport(), grade = calculateGrade(report)) {
    hideModal(elements.historyModal);
    hideModal(elements.archiveConfirmModal);
    hideModal(elements.archiveModal);
    game.archiveConfirmAction = null;
    elements.reportGrade.textContent = grade;
    elements.reportScore.textContent = `${report.score} PTS`;
    elements.reportGenerated.textContent = report.generated;
    elements.reportResolved.textContent = report.resolved;
    elements.reportUnresolved.textContent = report.unresolved;
    elements.reportBreaches.textContent = report.breaches;
    elements.reportSlaCompliance.textContent = `${report.slaCompliance.toFixed(1)}%`;
    elements.reportDiagnosisAccuracy.textContent = `${report.diagnosisAccuracy.toFixed(1)}%`;
    elements.reportActionAccuracy.textContent = `${report.actionAccuracy.toFixed(1)}%`;
    elements.reportMttr.textContent = `${report.averageMttr.toFixed(1)}s`;
    elements.reportCommands.textContent = report.commandsExecuted;
    elements.reportUsefulCommands.textContent = report.usefulCommands;
    elements.reportInvalidCommands.textContent = report.invalidCommands;
    elements.reportDifficulty.textContent = report.difficulty;
    elements.reportDifficulty.className = `report-difficulty ${report.difficulty.toLowerCase()}`;
    elements.reportInvestigationCoverage.textContent = report.difficulty === "HARD"
      ? report.investigationCoverage === null
        ? "N/A"
        : `${report.investigationCoverage.toFixed(1)}%`
      : "OPTIONAL";
    elements.reportCategoryPerformance.innerHTML = report.categoryAnalytics.map((category) => `
      <article class="category-performance-card category-${category.category.toLowerCase()}">
        <h4>${category.category}</h4>
        <strong>${category.resolved} Resolved</strong>
        <span>${category.generated} Generated · ${category.slaBreached} Breached</span>
        <span>Avg MTTR ${Analytics.formatDuration(category.averageMttr)}</span>
        <span>SLA ${category.slaCompliance === null ? "N/A" : `${category.slaCompliance.toFixed(1)}%`}</span>
      </article>`).join("");
    const operator = Analytics.buildOperatorSummary(report);
    const summaryList = (items, emptyText) => items.length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p>${emptyText}</p>`;
    elements.reportOperatorSummary.innerHTML = `
      <div><strong>STRONG</strong>${summaryList(operator.strong, "No standout metric yet")}</div>
      <div><strong>NEEDS IMPROVEMENT</strong>${summaryList(operator.needsImprovement, "No metric below the current rule threshold")}</div>
      <small>${escapeHtml(operator.note)}</small>`;
    showModal(elements.reportModal, elements.newShiftBtn);
  }

  function archiveCompletedShift(report, grade, endReason) {
    if (game.shift.archived) return true;
    const operatorSummary = Analytics.buildOperatorSummary(report);
    const unresolvedTickets = racks.map((rack) => rack.ticket).filter((ticket) => ticket?.countedInShift);
    const snapshot = Analytics.createShiftSnapshot({
      shift: game.shift,
      report,
      grade,
      availability: game.availability,
      incidentHistory: game.incidentHistory.filter((ticket) => ticket.countedInShift),
      unresolvedTickets,
      endReason,
      operatorSummary
    });
    const result = Storage.addShiftRecord(snapshot);
    if (!result.ok) {
      setArchiveNotice(result.reason ?? "Shift Archive 저장에 실패했습니다.", "warning");
      showToast("Shift Report는 완료됐지만 Archive 저장에 실패했습니다.", "error");
      addLog("WARNING", `Shift archive failed / ${result.reason ?? "unknown error"}`);
      return false;
    }
    game.archive = result.archive;
    game.shift.archived = true;
    elements.archiveButtonCount.textContent = game.archive.shifts.length;
    addLog("ARCHIVE", `${result.record.shiftId} saved to LocalStorage`);
    return true;
  }

  function endShift(reason = "automatic") {
    if (game.shift.status !== "RUNNING") return;
    updateSlaTimers();
    game.shift.status = "ENDED";
    game.shift.endedAt = Date.now();
    game.shift.remainingSeconds = 0;
    clearShiftTimers();
    hideModal(elements.endShiftConfirmModal);
    game.stats.unresolvedIncidents = racks.filter((rack) => rack.ticket?.countedInShift).length;
    racks.forEach((rack) => {
      if (rack.ticket) rack.ticket.slaFrozenRemaining = getSlaRemaining(rack.ticket);
    });
    const endReason = reason === "manual" ? "Manual termination" : "Automatic time limit";
    addLog("SHIFT END", `${endReason} / ${game.stats.unresolvedIncidents} unresolved`);
    refreshUI();
    const report = calculateShiftReport();
    const grade = calculateGrade(report);
    archiveCompletedShift(report, grade, endReason);
    showShiftReport(report, grade);
  }

  function openEndShiftConfirmation() {
    if (game.shift.status !== "RUNNING") return;
    showModal(elements.endShiftConfirmModal, elements.cancelEndShiftBtn);
  }

  function closeEndShiftConfirmation() {
    hideModal(elements.endShiftConfirmModal, game.shift.status === "RUNNING" ? elements.endShiftBtn : null);
  }

  function confirmManualEndShift() {
    if (game.shift.status !== "RUNNING") {
      hideModal(elements.endShiftConfirmModal);
      return;
    }
    endShift("manual");
  }

  // ---------------- 로그, 알림, 이벤트 ----------------
  function currentTime() {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date());
  }

  function addLog(type, message) {
    const entry = document.createElement("li");
    const time = document.createElement("span");
    const logType = document.createElement("span");
    const logMessage = document.createElement("span");
    entry.className = "log-entry";
    time.className = "log-time";
    logType.className = `log-type ${type.toLowerCase().replaceAll(" ", "-")}`;
    logMessage.className = "log-message";
    time.textContent = currentTime();
    logType.textContent = type;
    logMessage.textContent = message;
    entry.append(time, logType, logMessage);
    elements.eventLog.prepend(entry);
  }

  function showToast(message, kind = "") {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.className = `toast show ${kind}`;
    toastTimer = setTimeout(() => { elements.toast.className = "toast"; }, 2800);
  }

  function handleRackSelection(event) {
    const button = event.target.closest("[data-rack-id]");
    if (!button) return;
    game.selectedId = Number(button.dataset.rackId);
    refreshUI(true);
  }

  function handleDifficultySelection(event) {
    const button = event.target.closest("[data-difficulty]");
    if (!button || game.shift.status !== "IDLE") return;

    const difficulty = button.dataset.difficulty;
    if (!Object.hasOwn(DIFFICULTY_CONFIG, difficulty)) return;

    game.selectedDifficulty = difficulty;
    refreshUI();
    addLog("SYSTEM", `Difficulty selected - ${difficulty}`);
  }

  function handleQueueSelection(event) {
    const button = event.target.closest("[data-queue-rack-id]");
    if (!button) return;
    game.selectedId = Number(button.dataset.queueRackId);
    refreshUI();
    elements.incidentQueue.querySelector(`[data-queue-rack-id="${game.selectedId}"]`)?.focus();
  }

  function handleLanguageSelection(event) {
    const button = event.target.closest("[data-language]");
    if (!button || !Object.hasOwn(Floor.TRANSLATIONS, button.dataset.language)) return;
    game.floor.language = button.dataset.language;
    applyFloorLanguage();
    refreshUI();
    focusFloorScene();
  }

  function setFloorMenuOpen(open) {
    elements.floorMenuPanel.hidden = !open;
    elements.floorMenuToggleBtn.setAttribute("aria-expanded", String(open));
  }

  function toggleFloorMenu() {
    setFloorMenuOpen(elements.floorMenuPanel.hidden);
  }

  function showLegacyDashboard() {
    setScenePopup("none");
    setFloorMenuOpen(false);
    document.body.classList.add("dashboard-expanded");
    elements.legacyOperations.open = true;
    document.querySelector(".topbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function returnToFloorMode() {
    setFloorMenuOpen(false);
    document.body.classList.remove("dashboard-expanded");
    elements.legacyOperations.open = false;
    elements.floorMode.scrollIntoView({ behavior: "smooth", block: "start" });
    focusFloorScene();
  }

  function interactWithFloorAsset(asset) {
    if (!asset) {
      showToast(floorText("nearbyNone"), "error");
      return;
    }
    if (asset.type === "facility") {
      showToast(floorText("facilityPlaceholder", { asset: asset.label }));
      return;
    }
    if (asset.rackId > racks.length) {
      showToast(floorText("plannedRack", { asset: asset.label }));
      return;
    }
    game.selectedId = asset.rackId;
    refreshUI();
    showToast(floorText("rackLinked", { asset: asset.label }));
    setScenePopup("terminal");
  }

  function interactWithNearbyFloorAsset() {
    const asset = Floor.FLOOR_ASSETS.find((item) => item.id === game.floor.nearbyAssetId);
    interactWithFloorAsset(asset);
  }

  function canPhaserCaptureInput() {
    const active = document.activeElement;
    const formControl = active instanceof HTMLElement
      && (active.matches("input, textarea, select, button") || active.isContentEditable);
    const modalOpen = managedModals.some((modal) => !modal.hidden);
    return activeScenePopup === "none"
      && !formControl
      && !modalOpen
      && !document.body.classList.contains("dashboard-expanded");
  }

  function initializePhaserFloor() {
    if (query.get("floorRenderer") === "dom") {
      elements.floorStage.dataset.phaserState = "test-fallback";
      elements.phaserFloorStatus.textContent = "Legacy DOM Floor test fallback active";
      return;
    }
    if (!window.DCOpsPhaserFloor || !elements.phaserFloorMount) {
      elements.floorStage.dataset.phaserState = "unavailable";
      elements.phaserFloorStatus.textContent = "Legacy DOM Floor active";
      return;
    }
    try {
      phaserFloorController = window.DCOpsPhaserFloor.create({
        parent: elements.phaserFloorMount,
        floorApi: Floor,
        debug: query.get("debugFloor") === "1",
        initialPlayer: { worldX: 720, worldY: 360, facing: game.floor.player.facing },
        canCaptureInput: canPhaserCaptureInput,
        onReady() {
          elements.floorStage.dataset.phaserState = "ready";
          elements.floorMode.dataset.renderer = "phaser";
          elements.phaserFloorStatus.textContent = "Phaser Floor ready";
          syncPhaserFloorState();
          renderFloor();
        },
        onPlayerPositionChange(position) {
          game.floor.phaserPlayer = position;
          game.floor.player = { ...position.grid, facing: position.facing };
        },
        onNearbyAssetChange(assetId) {
          game.floor.nearbyAssetId = assetId;
          updateFloorInteractionStatus(assetId);
        },
        onAssetInteract(assetId) {
          const asset = Floor.FLOOR_ASSETS.find((item) => item.id === assetId);
          interactWithFloorAsset(asset);
        },
        onError(error) {
          console.error("Phaser Floor initialization failed; using the legacy DOM Floor.", error);
          elements.floorStage.dataset.phaserState = "error";
          delete elements.floorMode.dataset.renderer;
          elements.phaserFloorStatus.textContent = "Legacy DOM Floor fallback active";
        }
      });
    } catch (error) {
      console.error("Phaser Floor unavailable; using the legacy DOM Floor.", error);
      elements.floorStage.dataset.phaserState = "error";
      delete elements.floorMode.dataset.renderer;
    }
  }

  function handleFloorAssetClick(event) {
    const button = event.target.closest("[data-floor-asset-id]");
    if (!button) return;
    focusFloorScene();
    const asset = Floor.FLOOR_ASSETS.find((item) => item.id === button.dataset.floorAssetId);
    if (!asset) return;
    showToast(asset.id === game.floor.nearbyAssetId
      ? floorText(asset.type === "rack" ? "nearbyRack" : "nearbyFacility", { asset: asset.label })
      : floorText("nearbyNone"));
  }

  function handleFloorKeydown(event) {
    if (event.key === "Escape" && closeScenePopup()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const target = event.target;
    const formControl = target instanceof HTMLElement
      && (target.matches("input, textarea, select, button") || target.isContentEditable);
    const modalOpen = managedModals.some((modal) => !modal.hidden);
    if (formControl || modalOpen) return;

    if (isPhaserFloorReady()) {
      if (Object.hasOwn(Floor.DIRECTIONS, event.key) || event.key.toLowerCase() === "e") {
        event.preventDefault();
        phaserFloorController.handleKeyDown(event.key, event.repeat);
      }
      return;
    }

    if (Object.hasOwn(Floor.DIRECTIONS, event.key)) {
      event.preventDefault();
      const previousPlayer = game.floor.player;
      game.floor.player = Floor.movePlayer(previousPlayer, event.key);
      const moved = previousPlayer.x !== game.floor.player.x || previousPlayer.y !== game.floor.player.y;
      clearTimeout(floorMotionTimerId);
      elements.floorPlayer.dataset.motion = moved ? "walk" : "idle";
      if (moved) {
        floorMotionTimerId = setTimeout(() => {
          elements.floorPlayer.dataset.motion = "idle";
        }, PLAYER_MOVE_TRANSITION_MS + 35);
      }
      renderFloor();
      return;
    }
    if (event.key.toLowerCase() === "e" && !event.repeat) {
      event.preventDefault();
      interactWithNearbyFloorAsset();
    }
  }

  function handleFloorKeyup(event) {
    if (isPhaserFloorReady()) {
      phaserFloorController.handleKeyUp(event.key);
      return;
    }
    if (!Object.hasOwn(Floor.DIRECTIONS, event.key)) return;
    clearTimeout(floorMotionTimerId);
    elements.floorPlayer.dataset.motion = "idle";
  }

  function heartbeat() {
    updateShiftClock();
    updateSlaTimers();
  }

  function handleModalKeydown(event) {
    if (event.key === "Escape" && activeScenePopup !== "none") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeScenePopup();
      return;
    }
    if (event.key === "Escape" && !elements.floorMenuPanel.hidden) {
      setFloorMenuOpen(false);
      elements.floorMenuToggleBtn.focus();
    }
    const activeModal = [
      elements.archiveConfirmModal,
      elements.endShiftConfirmModal,
      elements.reportModal,
      elements.historyModal,
      elements.archiveModal
    ].find((modal) => !modal.hidden);
    if (!activeModal) return;
    if (event.key === "Tab") {
      const focusable = [...activeModal.querySelectorAll("button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])")]
        .filter((item) => !item.hidden);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key !== "Escape") return;
    if (!elements.archiveConfirmModal.hidden) {
      closeArchiveConfirmation();
      return;
    }
    if (!elements.endShiftConfirmModal.hidden) {
      closeEndShiftConfirmation();
      return;
    }
    if (!elements.historyModal.hidden) {
      closeHistory();
      return;
    }
    if (!elements.archiveModal.hidden) closeArchive();
  }

  function handleGameAssetError(event) {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches(".scene-environment-asset, .floor-equipment-svg, .rack-warning, .operator-frame")) return;
    image.hidden = true;
    image.closest(".floor-asset__visual, .operator-sprite")?.classList.add("asset-missing");
  }

  function initializeGame() {
    elements.appVersion.textContent = APP_VERSION;
    elements.rackGrid.addEventListener("click", handleRackSelection);
    elements.incidentQueue.addEventListener("click", handleQueueSelection);
    elements.difficultySelector.addEventListener("click", handleDifficultySelection);
    elements.incidentBtn.addEventListener("click", () => triggerIncident("manual"));
    elements.diagnoseBtn.addEventListener("click", diagnoseSelected);
    elements.recoverBtn.addEventListener("click", recoverSelected);
    elements.decisionOptions.addEventListener("click", handleDecisionSelection);
    elements.startShiftBtn.addEventListener("click", startShift);
    elements.endShiftBtn.addEventListener("click", openEndShiftConfirmation);
    elements.cancelEndShiftBtn.addEventListener("click", closeEndShiftConfirmation);
    elements.confirmEndShiftBtn.addEventListener("click", confirmManualEndShift);
    elements.historyOpenBtn.addEventListener("click", openHistory);
    elements.historyCloseBtn.addEventListener("click", closeHistory);
    elements.historyCategoryFilters.addEventListener("click", handleHistoryFilter);
    elements.historySlaFilters.addEventListener("click", handleHistoryFilter);
    elements.historyList.addEventListener("click", handleHistorySelection);
    elements.historyModal.addEventListener("click", (event) => {
      if (event.target === elements.historyModal) closeHistory();
    });
    elements.archiveOpenBtn.addEventListener("click", openArchive);
    elements.archiveCloseBtn.addEventListener("click", closeArchive);
    elements.archiveClearBtn.addEventListener("click", () => openArchiveConfirmation("clear"));
    elements.archiveDifficultyFilters.addEventListener("click", handleArchiveFilter);
    elements.archiveGradeFilters.addEventListener("click", handleArchiveFilter);
    elements.archiveList.addEventListener("click", handleArchiveSelection);
    elements.archiveDetail.addEventListener("click", handleArchiveSelection);
    elements.archiveModal.addEventListener("click", (event) => {
      if (event.target === elements.archiveModal) closeArchive();
    });
    elements.archiveConfirmCancelBtn.addEventListener("click", closeArchiveConfirmation);
    elements.archiveConfirmActionBtn.addEventListener("click", confirmArchiveAction);
    document.addEventListener("keydown", handleModalKeydown);
    elements.newShiftBtn.addEventListener("click", startNewShift);
    elements.terminalForm.addEventListener("submit", handleTerminalSubmit);
    elements.terminalInput.addEventListener("keydown", handleTerminalHistoryKeydown);
    elements.terminalInput.addEventListener("input", resetTerminalHistoryNavigation);
    elements.terminalClearBtn.addEventListener("click", clearTerminalSession);
    elements.languageToggle.addEventListener("click", handleLanguageSelection);
    elements.floorAssets.addEventListener("click", handleFloorAssetClick);
    elements.floorMenuToggleBtn.addEventListener("click", toggleFloorMenu);
    elements.floorMenuPanel.addEventListener("click", (event) => {
      if (event.target.closest("button")) setFloorMenuOpen(false);
    });
    elements.floorStartShiftBtn.addEventListener("click", startShift);
    elements.floorTriggerIncidentBtn.addEventListener("click", () => triggerIncident("manual"));
    elements.floorHistoryBtn.addEventListener("click", openHistory);
    elements.floorArchiveBtn.addEventListener("click", openArchive);
    elements.floorDashboardBtn.addEventListener("click", showLegacyDashboard);
    elements.returnFloorViewBtn.addEventListener("click", returnToFloorMode);
    elements.floorIncidentOpenBtn.addEventListener("click", () => setScenePopup("incident"));
    elements.floorIncidentCloseBtn.addEventListener("click", () => setScenePopup("none"));
    elements.floorObjectivesOpenBtn.addEventListener("click", () => setScenePopup("objectives"));
    elements.floorObjectivesCloseBtn.addEventListener("click", () => setScenePopup("none"));
    elements.floorTerminalCloseBtn.addEventListener("click", () => setScenePopup("none"));
    elements.floorTerminalWorkflowBtn.addEventListener("click", openFloorWorkflowFromTerminal);
    elements.floorWorkflowCloseBtn.addEventListener("click", () => setScenePopup("none"));
    elements.floorWorkflowOptions.addEventListener("click", handleFloorWorkflowSelection);
    [elements.floorTerminalPopup, elements.floorObjectivesPopup, elements.floorIncidentPopup, elements.floorWorkflowPopup].forEach((popup) => {
      popup.addEventListener("click", (event) => {
        if (event.target.closest("[data-scene-popup-close]")) setScenePopup("none");
      });
    });
    document.addEventListener("keydown", handleFloorKeydown);
    document.addEventListener("keyup", handleFloorKeyup);
    document.addEventListener("error", handleGameAssetError, true);
    setScenePopup("none");
    initializePhaserFloor();
    applyFloorLanguage();
    refreshUI();
    addLog("SYSTEM", "Night Shift 콘솔 준비 완료 - START SHIFT 대기");
    startShiftHeartbeat();
  }

  initializeGame();
})();
