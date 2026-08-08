(function startDcOpsGame() {
  "use strict";

  // ---------------- v0.8 설정 ----------------
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
    selectedDifficulty: "NORMAL",
    stats: createEmptyStats(),
    shift: {
      status: "IDLE",
      difficulty: null,
      startedAt: null,
      endsAt: null,
      remainingSeconds: SHIFT_CONFIG.durationSeconds,
      autoIncidentTimerId: null,
      heartbeatIntervalId: null
    }
  };

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
    terminalRackLabel: document.querySelector("#terminalRackLabel"),
    terminalSensor: document.querySelector("#terminalSensor"),
    terminalOutput: document.querySelector("#terminalOutput"),
    terminalForm: document.querySelector("#terminalForm"),
    terminalPrompt: document.querySelector("#terminalPrompt"),
    terminalInput: document.querySelector("#terminalInput"),
    terminalRunBtn: document.querySelector("#terminalRunBtn"),
    terminalClearBtn: document.querySelector("#terminalClearBtn"),
    newShiftBtn: document.querySelector("#newShiftBtn")
  };

  let toastTimer;

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

  function getTerminalSession(rack) {
    if (!rack) return null;
    return rack.ticket?.terminalHistory ?? rack.terminalHistory;
  }

  function getTerminalOutput(rack, parsedCommand) {
    const ticketOutput = rack.ticket?.diagnosticCommands?.[parsedCommand.canonical];
    if (typeof ticketOutput === "string") return ticketOutput;
    const outputBuilder = DEFAULT_TERMINAL_OUTPUTS[parsedCommand.canonical];
    return outputBuilder ? outputBuilder(rack, parsedCommand.normalized) : "";
  }

  function renderTerminal() {
    const rack = racks.find((item) => item.id === game.selectedId);
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

    elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight;
  }

  function clearTerminalSession() {
    const rack = racks.find((item) => item.id === game.selectedId);
    const history = getTerminalSession(rack);
    if (!history) return;
    history.length = 0;
    renderTerminal();
    elements.terminalInput.focus();
  }

  function executeTerminalCommand(rawCommand) {
    const rack = racks.find((item) => item.id === game.selectedId);
    if (!rack) return;
    const parsed = parseTerminalCommand(rawCommand);
    if (!parsed.normalized) return;

    if (game.shift.status === "RUNNING") game.stats.commandsExecuted += 1;
    if (parsed.canonical === "clear") {
      clearTerminalSession();
      return;
    }

    const ticket = rack.ticket;
    let valid = Boolean(parsed.canonical);
    let useful = false;
    let output;

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
    updateTicketPanel();
    updateActionControls();
    renderTerminal();
  }

  function handleTerminalSubmit(event) {
    event.preventDefault();
    const command = elements.terminalInput.value;
    elements.terminalInput.value = "";
    executeTerminalCommand(command);
    elements.terminalInput.focus();
  }

  // ---------------- 화면 그리기 ----------------
  function renderRacks(focusSelected = false) {
    elements.rackGrid.innerHTML = racks.map((rack) => {
      const info = STATUS_INFO[rack.status];
      const ticket = getIncident(rack);
      const selected = game.selectedId === rack.id ? "selected" : "";
      const diagnosed = ticket?.stage === "action" ? "diagnosed" : "";
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
    const diagnosed = ticket.stage === "action";
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
    elements.diagnoseBtn.disabled = locked;
    elements.diagnoseBtn.textContent = locked ? "진단 잠김 · DIAGNOSE LOCKED" : "진단 · DIAGNOSE";
    elements.diagnosisGateMessage.hidden = !locked;
    if (locked) {
      const remaining = Math.max(0, ticket.requiredEvidenceCount - getEvidenceCount(ticket));
      elements.diagnosisGateMessage.textContent = `Investigation required: ${remaining} more evidence`;
    } else {
      elements.diagnosisGateMessage.textContent = "";
    }
  }

  function getStageLabel(stage) {
    return { reported: "미진단", diagnosis: "진단 중", action: "ACTION" }[stage] ?? "UNKNOWN";
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

  function renderHistoryDetail(ticket) {
    elements.historyDetailEmpty.hidden = Boolean(ticket);
    elements.historyDetailContent.hidden = !ticket;
    if (!ticket) {
      elements.historyDetailContent.innerHTML = "";
      return;
    }

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

    elements.historyDetailContent.innerHTML = `
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
    updateHistoryFilters();
    renderHistory();
    elements.historyModal.hidden = false;
    elements.historyCloseBtn.focus();
  }

  function closeHistory() {
    elements.historyModal.hidden = true;
    elements.historyOpenBtn.focus();
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
    elements.shiftRemaining.textContent = formatClock(shift.remainingSeconds);
    elements.startShiftBtn.disabled = shift.status !== "IDLE";
    elements.startShiftBtn.textContent = shift.status === "RUNNING"
      ? "교대 진행 중 · SHIFT RUNNING"
      : shift.status === "ENDED"
        ? "교대 종료 · SHIFT ENDED"
        : "교대 시작 · START SHIFT";
    elements.endShiftBtn.hidden = shift.status !== "RUNNING";
    elements.endShiftBtn.disabled = shift.status !== "RUNNING";
    elements.incidentBtn.disabled = shift.status === "ENDED";

    const difficultyKey = getCurrentDifficultyKey();
    const difficulty = getDifficultyConfig(difficultyKey);
    elements.currentDifficulty.textContent = difficulty.label;
    elements.currentDifficulty.className = difficultyKey.toLowerCase();
    elements.difficultySummary.textContent = `SLA ×${difficulty.slaMultiplier.toFixed(2)} · SCORE ×${difficulty.scoreMultiplier.toFixed(2)} · INVESTIGATION ${difficulty.investigationRequired ? "REQUIRED" : "OPTIONAL"}`;
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
    updateDashboard();
    updateTicketPanel();
    updateDecisionPanel();
    updateActionControls();
    updateIncidentQueue();
    updateShiftPanel();
    renderTerminal();
    elements.historyButtonCount.textContent = game.incidentHistory.length;
    if (!elements.historyModal.hidden) renderHistory();
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
    if (!candidates.length) {
      if (source === "manual") showToast("모든 Rack에 장애가 발생했습니다. 먼저 복구하세요.", "error");
      addLog("WARNING", "추가 Incident 생성 실패 - 가용 Rack 없음");
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
    if (rack.ticket.stage !== "action") {
      if (!rack.ticket.prematureRecoveryPenalized) {
        rack.ticket.prematureRecoveryPenalized = true;
        game.score -= 30;
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

  function resolveIncident(rack) {
    const ticket = rack.ticket;
    const awardedScore = ticket.rewardScore ?? ticket.score;
    ticket.resolvedAt = Date.now();
    recordTicketEvent(ticket, "RECOVERY_COMPLETED", ticket.correctAction, ticket.resolvedAt);
    if (ticket.countedInShift) {
      game.stats.resolvedIncidents += 1;
      game.stats.totalResolutionTime += (ticket.resolvedAt - ticket.createdAt) / 1000;
    }
    game.incidentHistory.push(createResolvedRecord(ticket, awardedScore));
    rack.status = ticket.previousStatus ?? "healthy";
    rack.metrics = ticket.previousMetrics ? { ...ticket.previousMetrics } : createNormalMetrics();
    rack.ticket = null;
    game.score += awardedScore;
    game.availability = Math.min(100, game.availability + 0.85);
    recalculateTemperature();
    elements.scoreTrend.textContent = `복구 성공 +${awardedScore} PTS`;
    addLog("RECOVERY", `${rackLabel(rack.id)} restored / ${ticket.ticketId} +${awardedScore} PTS (${ticket.difficulty})`);
    showToast(`서비스가 정상 복구되었습니다. +${awardedScore}점`, "success");
    refreshUI();
  }

  function handleDecisionSelection(event) {
    const button = event.target.closest("[data-option-id]");
    if (!button || button.disabled) return;
    const rack = racks.find((item) => item.id === game.selectedId);
    const ticket = rack?.ticket;
    if (!ticket || rack.status !== "critical") return;

    const isDiagnosis = button.dataset.kind === "diagnosis";
    if (ticket.stage !== (isDiagnosis ? "diagnosis" : "action")) return;
    const options = isDiagnosis ? ticket.diagnosisOptions : ticket.actionOptions;
    const attempted = isDiagnosis ? ticket.wrongDiagnoses : ticket.wrongActions;
    const option = (options ?? []).find((item) => item.optionId === button.dataset.optionId);
    if (!option || attempted.includes(option.optionId)) return;

    if (!option.isCorrect) {
      attempted.push(option.optionId);
      recordTicketEvent(ticket, isDiagnosis ? "WRONG_DIAGNOSIS" : "WRONG_ACTION", option.label);
      const penalty = isDiagnosis ? 10 : 20;
      game.score -= penalty;
      if (ticket.countedInShift) {
        if (isDiagnosis) game.stats.wrongDiagnoses += 1;
        else game.stats.wrongActions += 1;
      }
      elements.scoreTrend.textContent = `${isDiagnosis ? "오진" : "잘못된 조치"} -${penalty} PTS`;
      addLog(isDiagnosis ? "WRONG DIAG" : "WRONG ACTION", option.label);
      showToast(`${isDiagnosis ? "잘못된 Diagnosis" : "잘못된 Action"}입니다. -${penalty}점`, "error");
      updateDashboard();
      updateDecisionPanel();
      return;
    }

    if (isDiagnosis) {
      if (ticket.countedInShift) game.stats.correctDiagnoses += 1;
      ticket.stage = "action";
      ticket.actionOptions = createChoiceOptions(ticket, "correctAction");
      recordTicketEvent(ticket, "DIAGNOSIS_CONFIRMED", ticket.correctDiagnosis);
      addLog("DIAG OK", ticket.correctDiagnosis);
      showToast("정확한 진단입니다. Root Cause를 확인하고 Action을 선택하세요.", "success");
      refreshUI();
      return;
    }

    if (ticket.countedInShift) game.stats.correctActions += 1;
    resolveIncident(rack);
  }

  // ---------------- SLA와 교대 타이머 ----------------
  function applySlaBreach(rack) {
    const ticket = rack.ticket;
    if (!ticket || ticket.slaPenaltyApplied) return;
    ticket.slaBreached = true;
    ticket.slaPenaltyApplied = true;
    recordTicketEvent(ticket, "SLA_BREACHED", `${ticket.appliedSlaSeconds}s applied SLA`);
    game.score -= 50;
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
    game.incidentHistory = [];
    game.historyFilters = { category: "ALL", sla: "ALL" };
    game.selectedHistoryTicketId = null;
    game.stats = createEmptyStats();
    if (resetDifficulty) game.selectedDifficulty = "NORMAL";
    game.shift.status = "IDLE";
    game.shift.difficulty = null;
    game.shift.startedAt = null;
    game.shift.endsAt = null;
    game.shift.remainingSeconds = SHIFT_CONFIG.durationSeconds;
    elements.eventLog.innerHTML = "";
    elements.scoreTrend.textContent = "복구 시 +100 PTS";
    elements.endShiftConfirmModal.hidden = true;
    elements.historyModal.hidden = true;
    elements.reportModal.hidden = true;
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

  function showShiftReport() {
    const report = calculateShiftReport();
    elements.reportGrade.textContent = calculateGrade(report);
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
    elements.reportModal.hidden = false;
  }

  function endShift(reason = "automatic") {
    if (game.shift.status !== "RUNNING") return;
    updateSlaTimers();
    game.shift.status = "ENDED";
    game.shift.remainingSeconds = 0;
    clearShiftTimers();
    elements.endShiftConfirmModal.hidden = true;
    game.stats.unresolvedIncidents = racks.filter((rack) => rack.ticket?.countedInShift).length;
    racks.forEach((rack) => {
      if (rack.ticket) rack.ticket.slaFrozenRemaining = getSlaRemaining(rack.ticket);
    });
    const endReason = reason === "manual" ? "Manual termination" : "Automatic time limit";
    addLog("SHIFT END", `${endReason} / ${game.stats.unresolvedIncidents} unresolved`);
    refreshUI();
    showShiftReport();
  }

  function openEndShiftConfirmation() {
    if (game.shift.status !== "RUNNING") return;
    elements.endShiftConfirmModal.hidden = false;
    elements.cancelEndShiftBtn.focus();
  }

  function closeEndShiftConfirmation() {
    elements.endShiftConfirmModal.hidden = true;
    if (game.shift.status === "RUNNING") elements.endShiftBtn.focus();
  }

  function confirmManualEndShift() {
    if (game.shift.status !== "RUNNING") {
      elements.endShiftConfirmModal.hidden = true;
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

  function heartbeat() {
    updateShiftClock();
    updateSlaTimers();
  }

  function handleModalKeydown(event) {
    if (event.key !== "Escape") return;
    if (!elements.endShiftConfirmModal.hidden) {
      closeEndShiftConfirmation();
      return;
    }
    if (!elements.historyModal.hidden) closeHistory();
  }

  function initializeGame() {
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
    document.addEventListener("keydown", handleModalKeydown);
    elements.newShiftBtn.addEventListener("click", startNewShift);
    elements.terminalForm.addEventListener("submit", handleTerminalSubmit);
    elements.terminalClearBtn.addEventListener("click", clearTerminalSession);
    refreshUI();
    addLog("SYSTEM", "Night Shift 콘솔 준비 완료 - START SHIFT 대기");
    startShiftHeartbeat();
  }

  initializeGame();
})();
