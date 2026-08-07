(function startDcOpsGame() {
  "use strict";

  // ---------------- 설정과 게임 데이터 ----------------
  const STATUS_INFO = Object.freeze({
    healthy: Object.freeze({ ko: "정상", en: "Healthy", color: "green" }),
    warning: Object.freeze({ ko: "경고", en: "Warning", color: "yellow" }),
    critical: Object.freeze({ ko: "장애", en: "Critical", color: "red" })
  });

  const INCIDENTS = window.DCOpsData.incidents;

  const racks = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    status: index === 4 ? "warning" : "healthy",
    diagnosed: false,
    ticket: null,
    metrics: createNormalMetrics(index === 4)
  }));

  const game = {
    score: 0,
    availability: 100,
    temperature: 21.4,
    selectedId: null,
    ticketSequence: 0
  };

  // 자주 사용하는 HTML 요소를 시작할 때 한 번만 찾습니다.
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
    recoverBtn: document.querySelector("#recoverBtn")
  };

  let toastTimer;

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
    const distractors = shuffle(
      INCIDENTS.filter((incident) => incident.incidentId !== ticket.incidentId)
    ).slice(0, 2);

    return shuffle([ticket, ...distractors]).map((incident) => ({
      optionId: `${valueKey}-${incident.incidentId}`,
      label: incident[valueKey],
      isCorrect: incident.incidentId === ticket.incidentId
    }));
  }

  // ---------------- 화면 그리기 ----------------
  function renderRacks(focusSelected = false) {
    elements.rackGrid.innerHTML = racks.map((rack) => {
      const info = STATUS_INFO[rack.status];
      const incident = getIncident(rack);
      const selected = game.selectedId === rack.id ? "selected" : "";
      const diagnosed = rack.diagnosed ? "diagnosed" : "";
      const metricHtml = Object.entries(rack.metrics).map(([name, value]) => {
        const isLowCritical = rack.status === "critical" && name === "Network" && value <= 10;
        const level = isLowCritical ? "high low" : value >= 85 ? "high" : value >= 70 ? "medium" : "";
        return `
          <div class="metric">
            <div class="metric-row"><span>${name}</span><span class="metric-value">${value}%</span></div>
            <div class="bar"><div class="bar-fill ${level}" style="width:${value}%"></div></div>
          </div>`;
      }).join("");

      return `
        <button class="rack ${rack.status} ${selected} ${diagnosed}" type="button"
                data-rack-id="${rack.id}" aria-pressed="${game.selectedId === rack.id}"
                aria-label="${rackLabel(rack.id)}, ${info.ko} ${info.en}">
          <div class="rack-top">
            <span class="rack-name">${rackLabel(rack.id)}</span>
            <span class="status ${rack.status}"><i class="status-dot"></i>${info.en}</span>
          </div>
          <div class="server-slots" aria-hidden="true">
            ${"<span class=\"slot\"></span>".repeat(7)}
          </div>
          <div class="metrics">${metricHtml}</div>
          <div class="diagnosis">원인 · ROOT CAUSE<br><strong>${incident ? escapeHtml(incident.correctDiagnosis) : ""}</strong></div>
        </button>`;
    }).join("");

    if (focusSelected && game.selectedId !== null) {
      elements.rackGrid.querySelector(`[data-rack-id="${game.selectedId}"]`)?.focus();
    }
  }

  function updateDashboard() {
    const openIncidents = racks.filter((rack) => rack.status === "critical").length;
    elements.score.innerHTML = `${game.score}<span class="stat-unit">PTS</span>`;
    elements.availability.innerHTML = `${game.availability.toFixed(2)}<span class="stat-unit">%</span>`;
    elements.temperature.innerHTML = `${game.temperature.toFixed(1)}<span class="stat-unit">°C</span>`;
    elements.incidentCount.innerHTML = `${openIncidents}<span class="stat-unit">OPEN</span>`;
    elements.incidentTrend.textContent = openIncidents ? "즉시 대응 필요" : "모든 서비스 정상";
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

  function getSlaRemaining(ticket) {
    return Math.max(0, Math.ceil((ticket.slaDeadline - Date.now()) / 1000));
  }

  function formatSla(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
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

    const slaRemaining = getSlaRemaining(ticket);
    elements.ticketPanel.className = `ticket-panel${slaRemaining === 0 ? " sla-breached" : ""}`;
    elements.ticketEmpty.hidden = true;
    elements.ticketContent.hidden = false;
    elements.ticketId.textContent = ticket.ticketId;
    elements.ticketSeverity.textContent = ticket.severity;
    elements.ticketTitle.textContent = rack.diagnosed ? ticket.title : "UNIDENTIFIED INCIDENT";
    elements.ticketRack.textContent = ticket.affectedRack;
    elements.ticketSla.textContent = formatSla(slaRemaining);
    elements.ticketSymptom.textContent = ticket.symptom;
    elements.ticketDiagnosis.hidden = !rack.diagnosed;
    elements.ticketDiagnosisText.textContent = rack.diagnosed ? ticket.correctDiagnosis : "—";
    elements.ticketRootCause.textContent = rack.diagnosed ? ticket.rootCause : "—";
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
    elements.decisionTitle.textContent = isDiagnosis
      ? "진단 후보를 선택하세요"
      : "복구 Action을 선택하세요";
    elements.decisionProgress.textContent = isDiagnosis ? "1 / 2" : "2 / 2";
    elements.decisionGuide.textContent = isDiagnosis
      ? "증상과 모니터링 수치를 근거로 판단하세요."
      : "공개된 Root Cause에 맞는 조치를 선택하세요.";
    elements.decisionOptions.setAttribute(
      "aria-label",
      isDiagnosis ? "Diagnosis 후보" : "Action 후보"
    );
    elements.decisionOptions.innerHTML = options.map((option, index) => {
      const wasWrong = attempted.includes(option.optionId);
      return `
        <button class="decision-option${wasWrong ? " wrong" : ""}" type="button"
                data-kind="${isDiagnosis ? "diagnosis" : "action"}"
                data-option-id="${option.optionId}" data-letter="${String.fromCharCode(65 + index)}"
                aria-label="${escapeHtml(option.label)}"
                ${wasWrong ? "disabled" : ""}>
          ${escapeHtml(option.label)}
        </button>`;
    }).join("");
  }

  function recalculateTemperature() {
    const activeTemperatures = racks
      .filter((rack) => rack.status === "critical" && rack.ticket)
      .map((rack) => rack.ticket.temperature);
    game.temperature = activeTemperatures.length
      ? Math.max(21.4, ...activeTemperatures)
      : 21.4;
  }

  function refreshUI(focusSelected = false) {
    renderRacks(focusSelected);
    updateDashboard();
    updateTicketPanel();
    updateDecisionPanel();
  }

  // ---------------- 게임 행동과 규칙 ----------------
  function triggerIncident() {
    if (!INCIDENTS.length) {
      showToast("등록된 Incident 데이터가 없습니다.", "error");
      addLog("WARNING", "Incident 생성 실패 - 데이터 없음");
      return;
    }

    const candidates = racks.filter((rack) => rack.status !== "critical");
    if (!candidates.length) {
      showToast("모든 Rack에 장애가 발생했습니다. 먼저 복구하세요.", "error");
      addLog("WARNING", "추가 Incident 생성 실패 - 가용 Rack 없음");
      return;
    }

    const rack = candidates[Math.floor(Math.random() * candidates.length)];
    const incident = INCIDENTS[Math.floor(Math.random() * INCIDENTS.length)];
    const ticketId = `TKT-${String(++game.ticketSequence).padStart(4, "0")}`;
    const createdAt = Date.now();

    rack.status = "critical";
    rack.diagnosed = false;
    rack.ticket = {
      ...incident,
      affectedRack: rackLabel(rack.id),
      ticketId,
      createdAt,
      slaDeadline: createdAt + incident.slaSeconds * 1000,
      slaBreached: false,
      stage: "reported",
      diagnosisOptions: null,
      actionOptions: null,
      wrongDiagnoses: [],
      wrongActions: [],
      prematureRecoveryPenalized: false
    };
    rack.metrics = {
      CPU: incident.cpu,
      RAM: incident.ram,
      Disk: incident.disk,
      Network: incident.network
    };

    game.selectedId = rack.id;
    game.availability = Math.max(90, game.availability - 0.85);
    recalculateTemperature();

    addLog(
      "ALERT",
      `${ticketId} - ${rackLabel(rack.id)} Critical / ${incident.symptom} (SLA ${incident.slaSeconds}s)`
    );
    showToast(`${ticketId}: ${rackLabel(rack.id)}에 Critical Incident 발생`, "error");
    refreshUI();
  }

  function diagnoseSelected() {
    const rack = racks.find((item) => item.id === game.selectedId);
    if (!rack) {
      showToast("먼저 Critical 상태의 Rack을 선택하세요.", "error");
      addLog("WARNING", "진단 실패 - 선택된 Rack 없음");
      return;
    }
    if (rack.status !== "critical") {
      showToast("선택한 Rack은 Critical 상태가 아닙니다.", "error");
      addLog("WARNING", `${rackLabel(rack.id)} 진단 불필요 - Critical 아님`);
      return;
    }
    const incident = getIncident(rack);
    if (!incident) {
      showToast("장애 정보를 찾을 수 없습니다.", "error");
      addLog("WARNING", `${rackLabel(rack.id)} 진단 실패 - Incident 데이터 없음`);
      return;
    }

    if (incident.stage === "action") {
      showToast("진단 완료 상태입니다. 올바른 Action을 선택하세요.");
      updateDecisionPanel();
      return;
    }
    if (incident.stage === "diagnosis") {
      showToast("진단이 진행 중입니다. 후보 중 하나를 선택하세요.");
      updateDecisionPanel();
      return;
    }

    incident.stage = "diagnosis";
    incident.diagnosisOptions = createChoiceOptions(incident, "correctDiagnosis");
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
    if (rack.status !== "critical") {
      showToast("선택한 Rack에는 복구할 Critical 장애가 없습니다.", "error");
      addLog("WARNING", `${rackLabel(rack.id)} 복구 불필요 - 정상 운영 중`);
      return;
    }
    if (!rack.ticket) {
      showToast("선택한 Rack의 Ticket 정보를 찾을 수 없습니다.", "error");
      addLog("WARNING", `${rackLabel(rack.id)} 복구 실패 - Ticket 데이터 없음`);
      return;
    }
    if (!rack.diagnosed) {
      if (!rack.ticket.prematureRecoveryPenalized) {
        rack.ticket.prematureRecoveryPenalized = true;
        game.score -= 30;
        elements.scoreTrend.textContent = "절차 위반 -30 PTS";
        addLog("WARNING", `${rack.ticket.ticketId} - ${rackLabel(rack.id)} 미진단 복구 거부 / 30점 감점`);
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
    const resolvedTicket = rack.ticket;
    rack.status = "healthy";
    rack.diagnosed = false;
    rack.ticket = null;
    rack.metrics = createNormalMetrics();
    game.score += resolvedTicket.score;
    game.availability = Math.min(100, game.availability + 0.85);
    recalculateTemperature();
    elements.scoreTrend.textContent = `복구 성공 +${resolvedTicket.score} PTS`;
    addLog(
      "RECOVERY",
      `${rackLabel(rack.id)} restored / ${resolvedTicket.ticketId} +${resolvedTicket.score} PTS`
    );
    showToast(`서비스가 정상 복구되었습니다. +${resolvedTicket.score}점`, "success");
    refreshUI();
  }

  function handleDecisionSelection(event) {
    const optionButton = event.target.closest("[data-option-id]");
    if (!optionButton || optionButton.disabled) return;

    const rack = racks.find((item) => item.id === game.selectedId);
    const ticket = rack?.ticket;
    if (!ticket || rack.status !== "critical") return;

    const isDiagnosis = optionButton.dataset.kind === "diagnosis";
    const expectedStage = isDiagnosis ? "diagnosis" : "action";
    if (ticket.stage !== expectedStage) return;

    const options = isDiagnosis ? ticket.diagnosisOptions : ticket.actionOptions;
    const attempted = isDiagnosis ? ticket.wrongDiagnoses : ticket.wrongActions;
    const option = options.find((item) => item.optionId === optionButton.dataset.optionId);
    if (!option || attempted.includes(option.optionId)) return;

    if (!option.isCorrect) {
      attempted.push(option.optionId);
      const penalty = isDiagnosis ? 10 : 20;
      game.score -= penalty;
      elements.scoreTrend.textContent = `${isDiagnosis ? "오진" : "잘못된 조치"} -${penalty} PTS`;
      addLog(isDiagnosis ? "WRONG DIAG" : "WRONG ACTION", option.label);
      showToast(`${isDiagnosis ? "잘못된 Diagnosis" : "잘못된 Action"}입니다. -${penalty}점`, "error");
      updateDashboard();
      updateDecisionPanel();
      return;
    }

    if (isDiagnosis) {
      rack.diagnosed = true;
      ticket.stage = "action";
      ticket.actionOptions = createChoiceOptions(ticket, "correctAction");
      addLog("DIAG OK", ticket.correctDiagnosis);
      showToast("정확한 진단입니다. Root Cause를 확인하고 Action을 선택하세요.", "success");
      refreshUI();
      return;
    }

    resolveIncident(rack);
  }

  // ---------------- 로그와 알림 ----------------
  function updateSlaTimers() {
    let hasActiveIncident = false;

    racks.forEach((rack) => {
      if (rack.status !== "critical" || !rack.ticket) return;
      hasActiveIncident = true;

      if (getSlaRemaining(rack.ticket) === 0 && !rack.ticket.slaBreached) {
        rack.ticket.slaBreached = true;
        addLog(
          "SLA",
          `${rack.ticket.ticketId} - ${rackLabel(rack.id)} SLA BREACH / 즉시 복구 필요`
        );
      }
    });

    if (hasActiveIncident) updateTicketPanel();
  }

  function currentTime() {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
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
    toastTimer = setTimeout(() => {
      elements.toast.className = "toast";
    }, 2800);
  }

  function handleRackSelection(event) {
    const rackButton = event.target.closest("[data-rack-id]");
    if (!rackButton) return;

    game.selectedId = Number(rackButton.dataset.rackId);
    refreshUI(true);
  }

  function initializeGame() {
    elements.rackGrid.addEventListener("click", handleRackSelection);
    elements.incidentBtn.addEventListener("click", triggerIncident);
    elements.diagnoseBtn.addEventListener("click", diagnoseSelected);
    elements.recoverBtn.addEventListener("click", recoverSelected);
    elements.decisionOptions.addEventListener("click", handleDecisionSelection);

    refreshUI();
    addLog("SYSTEM", "Night Shift 콘솔 준비 완료 - 전체 시스템 모니터링 시작");
    setInterval(updateSlaTimers, 1000);
  }

  initializeGame();
})();
