(function startDcOpsGame() {
  "use strict";

  // ---------------- v0.4 설정 ----------------
  // URL의 테스트 값은 브라우저 회귀 테스트용입니다. 일반 실행에서는 아래 기본값이 사용됩니다.
  const query = new URLSearchParams(window.location.search);
  const testNumber = (name, fallback) => {
    const value = Number(query.get(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };

  const SHIFT_CONFIG = Object.freeze({
    durationSeconds: testNumber("shiftSeconds", 180),
    simulatedStartMinutes: 22 * 60,
    simulatedDurationMinutes: 8 * 60,
    autoIncidentMinMs: testNumber("autoMinMs", 15000),
    autoIncidentMaxMs: testNumber("autoMaxMs", 30000)
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
      unresolvedIncidents: 0
    };
  }

  const racks = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    status: index === 4 ? "warning" : "healthy",
    ticket: null,
    metrics: createNormalMetrics(index === 4)
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
    stats: createEmptyStats(),
    shift: {
      status: "IDLE",
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
    ticketSeverity: document.querySelector("#ticketSeverity"),
    ticketTitle: document.querySelector("#ticketTitle"),
    ticketRack: document.querySelector("#ticketRack"),
    ticketSla: document.querySelector("#ticketSla"),
    ticketSymptom: document.querySelector("#ticketSymptom"),
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
    shiftStatus: document.querySelector("#shiftStatus"),
    shiftGameTime: document.querySelector("#shiftGameTime"),
    shiftRemaining: document.querySelector("#shiftRemaining"),
    shiftSlaBreaches: document.querySelector("#shiftSlaBreaches"),
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
    newShiftBtn: document.querySelector("#newShiftBtn")
  };

  let toastTimer;

  function rackLabel(id) {
    return `Rack ${String(id).padStart(2, "0")}`;
  }

  function getIncident(rack) {
    return rack.ticket;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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

    shuffle(INCIDENTS).forEach((incident) => {
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
      return;
    }

    const remaining = getSlaRemaining(ticket);
    const diagnosed = ticket.stage === "action";
    elements.ticketPanel.className = `ticket-panel${ticket.slaBreached ? " sla-breached" : ""}`;
    elements.ticketEmpty.hidden = true;
    elements.ticketContent.hidden = false;
    elements.ticketId.textContent = ticket.ticketId;
    elements.ticketSeverity.textContent = ticket.severity;
    elements.ticketTitle.textContent = diagnosed ? ticket.title : "UNIDENTIFIED INCIDENT";
    elements.ticketRack.textContent = ticket.affectedRack;
    elements.ticketSla.textContent = ticket.slaBreached ? "BREACH" : formatClock(remaining);
    elements.ticketSymptom.textContent = ticket.symptom;
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
        <span class="queue-ticket"><strong>${ticket.ticketId}</strong><small>${rackLabel(rack.id)}</small></span>
        <span class="queue-severity">${severityInfo(ticket.severity).label}</span>
        <span class="queue-stage">${getStageLabel(ticket.stage)}</span>
        <span class="queue-sla">${breached ? "BREACH" : formatClock(remaining)}</span>
      </button>`;
    }).join("");
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
    updateIncidentQueue();
    updateShiftPanel();
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

    const rack = candidates[Math.floor(Math.random() * candidates.length)];
    const incident = INCIDENTS[Math.floor(Math.random() * INCIDENTS.length)];
    const ticketId = `TKT-${String(++game.ticketSequence).padStart(4, "0")}`;
    const createdAt = Date.now();
    const countedInShift = game.shift.status === "RUNNING";

    rack.ticket = {
      ...incident,
      affectedRack: rackLabel(rack.id),
      ticketId,
      createdAt,
      resolvedAt: null,
      slaDeadline: createdAt + incident.slaSeconds * 1000,
      slaBreached: false,
      slaPenaltyApplied: false,
      slaFrozenRemaining: null,
      stage: "reported",
      diagnosisOptions: null,
      actionOptions: null,
      wrongDiagnoses: [],
      wrongActions: [],
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

    addLog("ALERT", `${ticketId} ${rackLabel(rack.id)} Critical / ${incident.symptom} (SLA ${incident.slaSeconds}s)`);
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
    ticket.resolvedAt = Date.now();
    if (ticket.countedInShift) {
      game.stats.resolvedIncidents += 1;
      game.stats.totalResolutionTime += (ticket.resolvedAt - ticket.createdAt) / 1000;
    }
    rack.status = ticket.previousStatus ?? "healthy";
    rack.metrics = ticket.previousMetrics ? { ...ticket.previousMetrics } : createNormalMetrics();
    rack.ticket = null;
    game.score += ticket.score;
    game.availability = Math.min(100, game.availability + 0.85);
    recalculateTemperature();
    elements.scoreTrend.textContent = `복구 성공 +${ticket.score} PTS`;
    addLog("RECOVERY", `${rackLabel(rack.id)} restored / ${ticket.ticketId} +${ticket.score} PTS`);
    showToast(`서비스가 정상 복구되었습니다. +${ticket.score}점`, "success");
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

    const minimum = Math.min(SHIFT_CONFIG.autoIncidentMinMs, SHIFT_CONFIG.autoIncidentMaxMs);
    const maximum = Math.max(SHIFT_CONFIG.autoIncidentMinMs, SHIFT_CONFIG.autoIncidentMaxMs);
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

  function resetShift() {
    clearShiftTimers();
    racks.forEach((rack, index) => {
      rack.status = initialRackState[index].status;
      rack.metrics = { ...initialRackState[index].metrics };
      rack.ticket = null;
    });
    game.score = 0;
    game.availability = 100;
    game.temperature = 21.4;
    game.selectedId = null;
    game.ticketSequence = 0;
    game.stats = createEmptyStats();
    game.shift.status = "IDLE";
    game.shift.startedAt = null;
    game.shift.endsAt = null;
    game.shift.remainingSeconds = SHIFT_CONFIG.durationSeconds;
    elements.eventLog.innerHTML = "";
    elements.scoreTrend.textContent = "복구 시 +100 PTS";
    elements.endShiftConfirmModal.hidden = true;
    elements.reportModal.hidden = true;
    refreshUI();
  }

  function startShift() {
    if (game.shift.status === "RUNNING") {
      showToast("이미 교대가 진행 중입니다.");
      return;
    }
    resetShift();
    const startedAt = Date.now();
    game.shift.status = "RUNNING";
    game.shift.startedAt = startedAt;
    game.shift.endsAt = startedAt + SHIFT_CONFIG.durationSeconds * 1000;
    game.shift.remainingSeconds = SHIFT_CONFIG.durationSeconds;
    elements.scoreTrend.textContent = "교대 운영 중";
    addLog("SHIFT START", "Night Shift started / 22:00 → 06:00");
    startShiftHeartbeat();
    scheduleNextIncident();
    refreshUI();
  }

  function calculateShiftReport() {
    const stats = game.stats;
    const diagnosisAttempts = stats.correctDiagnoses + stats.wrongDiagnoses;
    const actionAttempts = stats.correctActions + stats.wrongActions;
    const percent = (correct, total) => total === 0 ? 100 : (correct / total) * 100;
    const slaCompliance = stats.generatedIncidents === 0
      ? 100
      : ((stats.generatedIncidents - stats.slaBreaches) / stats.generatedIncidents) * 100;
    return {
      score: game.score,
      generated: stats.generatedIncidents,
      resolved: stats.resolvedIncidents,
      unresolved: stats.unresolvedIncidents,
      breaches: stats.slaBreaches,
      slaCompliance: Math.max(0, slaCompliance),
      diagnosisAccuracy: percent(stats.correctDiagnoses, diagnosisAttempts),
      actionAccuracy: percent(stats.correctActions, actionAttempts),
      averageMttr: stats.resolvedIncidents === 0 ? 0 : stats.totalResolutionTime / stats.resolvedIncidents
    };
  }

  function calculateGrade(report) {
    const scorePerformance = Math.max(0, Math.min(100, (report.score / GRADE_CONFIG.scoreTarget) * 100));
    const performance =
      report.slaCompliance * GRADE_CONFIG.weights.sla +
      report.diagnosisAccuracy * GRADE_CONFIG.weights.diagnosis +
      report.actionAccuracy * GRADE_CONFIG.weights.action +
      scorePerformance * GRADE_CONFIG.weights.score -
      report.unresolved * GRADE_CONFIG.unresolvedPenalty;
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

  function initializeGame() {
    elements.rackGrid.addEventListener("click", handleRackSelection);
    elements.incidentQueue.addEventListener("click", handleQueueSelection);
    elements.incidentBtn.addEventListener("click", () => triggerIncident("manual"));
    elements.diagnoseBtn.addEventListener("click", diagnoseSelected);
    elements.recoverBtn.addEventListener("click", recoverSelected);
    elements.decisionOptions.addEventListener("click", handleDecisionSelection);
    elements.startShiftBtn.addEventListener("click", startShift);
    elements.endShiftBtn.addEventListener("click", openEndShiftConfirmation);
    elements.cancelEndShiftBtn.addEventListener("click", closeEndShiftConfirmation);
    elements.confirmEndShiftBtn.addEventListener("click", confirmManualEndShift);
    elements.newShiftBtn.addEventListener("click", startShift);
    refreshUI();
    addLog("SYSTEM", "Night Shift 콘솔 준비 완료 - START SHIFT 대기");
    startShiftHeartbeat();
  }

  initializeGame();
})();
