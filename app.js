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
    ticketAction: document.querySelector("#ticketAction"),
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
    elements.ticketTitle.textContent = ticket.title;
    elements.ticketRack.textContent = ticket.affectedRack;
    elements.ticketSla.textContent = formatSla(slaRemaining);
    elements.ticketSymptom.textContent = ticket.symptom;
    elements.ticketDiagnosis.hidden = !rack.diagnosed;
    elements.ticketDiagnosisText.textContent = ticket.correctDiagnosis;
    elements.ticketRootCause.textContent = ticket.rootCause;
    elements.ticketAction.textContent = ticket.correctAction;
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
      slaBreached: false
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
      `${ticketId} - ${rackLabel(rack.id)} Critical / ${incident.title} (SLA ${incident.slaSeconds}s)`
    );
    showToast(`${ticketId}: ${rackLabel(rack.id)}에 ${incident.title} 발생`, "error");
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
    if (rack.diagnosed) {
      showToast("이미 진단을 완료했습니다. 이제 복구하세요.");
      return;
    }

    const incident = getIncident(rack);
    if (!incident) {
      showToast("장애 정보를 찾을 수 없습니다.", "error");
      addLog("WARNING", `${rackLabel(rack.id)} 진단 실패 - Incident 데이터 없음`);
      return;
    }

    rack.diagnosed = true;
    addLog("DIAG", `${incident.ticketId} - ${rackLabel(rack.id)} / ${incident.correctDiagnosis}`);
    showToast(`진단 완료: ${incident.correctDiagnosis}`);
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
    if (!rack.diagnosed) {
      game.score -= 30;
      elements.scoreTrend.textContent = "절차 위반 -30 PTS";
      addLog("WARNING", `${rack.ticket.ticketId} - ${rackLabel(rack.id)} 미진단 복구 거부 / 30점 감점`);
      showToast("경고: 진단 없이 복구할 수 없습니다. -30점", "error");
      updateDashboard();
      return;
    }

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
      `${resolvedTicket.ticketId} - ${rackLabel(rack.id)} / ${resolvedTicket.correctAction} +${resolvedTicket.score} PTS`
    );
    showToast(`서비스가 정상 복구되었습니다. +${resolvedTicket.score}점`, "success");
    refreshUI();
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
    logType.className = `log-type ${type.toLowerCase()}`;
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

    refreshUI();
    addLog("SYSTEM", "Night Shift 콘솔 준비 완료 - 전체 시스템 모니터링 시작");
    setInterval(updateSlaTimers, 1000);
  }

  initializeGame();
})();
