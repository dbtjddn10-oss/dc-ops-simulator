(function exposeDcOpsAnalytics(global) {
  "use strict";

  const CATEGORIES = Object.freeze(["SERVER", "STORAGE", "NETWORK", "POWER", "COOLING"]);

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function formatDuration(seconds) {
    const value = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
    if (value < 60) return `${value.toFixed(1)}s`;
    const minutes = Math.floor(value / 60);
    return `${minutes}m ${(value - minutes * 60).toFixed(1)}s`;
  }

  function formatTimestamp(timestamp) {
    if (!Number.isFinite(Number(timestamp))) return "—";
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date(Number(timestamp)));
  }

  function getMttrSeconds(ticket) {
    if (Number.isFinite(ticket?.mttrSeconds)) return Math.max(0, ticket.mttrSeconds);
    if (!Number.isFinite(ticket?.createdAt) || !Number.isFinite(ticket?.resolvedAt)) return null;
    return Math.max(0, (ticket.resolvedAt - ticket.createdAt) / 1000);
  }

  function getSlaResult(ticket) {
    return ticket?.slaBreached ? "SLA BREACHED" : "SLA MET";
  }

  function sortHistory(records) {
    return [...safeArray(records)].sort((left, right) => (right.resolvedAt ?? 0) - (left.resolvedAt ?? 0));
  }

  function filterHistory(records, category = "ALL", sla = "ALL") {
    return sortHistory(records).filter((ticket) => {
      const categoryMatches = category === "ALL" || ticket.category === category;
      const slaMatches = sla === "ALL" || (sla === "MET" ? !ticket.slaBreached : ticket.slaBreached);
      return categoryMatches && slaMatches;
    });
  }

  function calculateCategoryAnalytics(resolvedRecords, openRecords = []) {
    const resolved = safeArray(resolvedRecords).filter((ticket) => ticket?.countedInShift !== false);
    const open = safeArray(openRecords).filter((ticket) => ticket?.countedInShift !== false);
    return CATEGORIES.map((category) => {
      const categoryResolved = resolved.filter((ticket) => ticket.category === category);
      const categoryOpen = open.filter((ticket) => ticket.category === category);
      const categoryGenerated = [...categoryResolved, ...categoryOpen];
      const resolutionTimes = categoryResolved.map(getMttrSeconds).filter(Number.isFinite);
      const breached = categoryGenerated.filter((ticket) => ticket.slaBreached).length;
      const resolvedBreached = categoryResolved.filter((ticket) => ticket.slaBreached).length;
      return {
        category,
        generated: categoryGenerated.length,
        resolved: categoryResolved.length,
        slaBreached: breached,
        averageMttr: resolutionTimes.length
          ? resolutionTimes.reduce((total, value) => total + value, 0) / resolutionTimes.length
          : 0,
        slaCompliance: categoryResolved.length
          ? (categoryResolved.length - resolvedBreached) / categoryResolved.length * 100
          : null
      };
    });
  }

  function calculateInvestigationCoverage(records) {
    const hardTickets = safeArray(records).filter((ticket) =>
      ticket?.countedInShift !== false && ticket.difficulty === "HARD" && ticket.investigationRequired
    );
    const completed = hardTickets.filter((ticket) => {
      const evidence = new Set(safeArray(ticket.countedUsefulCommands));
      return evidence.size >= Number(ticket.requiredEvidenceCount ?? 0);
    });
    return {
      required: hardTickets.length,
      completed: completed.length,
      incomplete: hardTickets.length - completed.length,
      coverage: hardTickets.length ? completed.length / hardTickets.length * 100 : null
    };
  }

  function buildLessonsLearned(ticket) {
    const evidence = new Set(safeArray(ticket?.countedUsefulCommands));
    const has = (...commands) => commands.every((command) => evidence.has(command));
    if (has("systemctl status nginx", "journalctl -u nginx")) {
      return "Service 상태와 로그를 함께 확인해 단순 네트워크 장애와 서비스 프로세스 장애를 구분할 수 있었다.";
    }
    if (ticket?.category === "STORAGE" && (evidence.has("dmesg") || evidence.has("iostat") || evidence.has("mount"))) {
      return "용량 수치만 보지 않고 I/O와 filesystem 근거를 확인해 Storage 장애 유형을 구분하는 것이 중요했다.";
    }
    if (ticket?.category === "NETWORK" && evidence.size) {
      return "연결 결과와 Network 설정 또는 interface 근거를 함께 비교해 장애 범위를 좁힐 수 있었다.";
    }
    if (["POWER", "COOLING"].includes(ticket?.category) && evidence.has("ipmitool sensor")) {
      return "서비스 지표와 별도로 hardware sensor를 확인해 시설 또는 장비 계층의 원인을 식별할 수 있었다.";
    }
    if (evidence.size >= Number(ticket?.requiredEvidenceCount ?? 0) && evidence.size > 0) {
      return "복구 전에 관련 명령으로 근거를 확보해 증상과 Root Cause를 연결하는 대응 흐름을 유지했다.";
    }
    if (safeArray(ticket?.terminalHistory).length) {
      return "실행한 명령을 Root Cause와 더 직접 연결하면 다음 대응에서 조사 시간을 줄일 수 있다.";
    }
    return "다음 대응에서는 복구 전에 관련 진단 명령으로 근거를 남기면 RCA의 신뢰도를 높일 수 있다.";
  }

  function buildIncidentReport(ticket) {
    const mttrSeconds = getMttrSeconds(ticket);
    const commands = safeArray(ticket?.terminalHistory).map((record) => record.command);
    const evidence = safeArray(ticket?.countedUsefulCommands);
    return {
      summary: {
        ticketId: ticket?.ticketId ?? "—",
        incidentId: ticket?.incidentId ?? "—",
        title: ticket?.title ?? "Unknown Incident",
        category: ticket?.category ?? "UNKNOWN",
        severity: ticket?.severity ?? "—",
        difficulty: ticket?.difficulty ?? "—",
        rack: ticket?.affectedRack ?? "—",
        symptom: ticket?.symptom ?? "—",
        createdAt: ticket?.createdAt ?? null,
        resolvedAt: ticket?.resolvedAt ?? null,
        mttrSeconds,
        originalSlaSeconds: ticket?.slaSeconds ?? null,
        appliedSlaSeconds: ticket?.appliedSlaSeconds ?? null,
        slaResult: getSlaResult(ticket)
      },
      rootCause: {
        diagnosis: ticket?.correctDiagnosis ?? "—",
        detail: ticket?.rootCause ?? "—"
      },
      recovery: {
        action: ticket?.correctAction ?? "—",
        awardedScore: ticket?.awardedScore ?? ticket?.rewardScore ?? ticket?.score ?? 0
      },
      investigation: {
        commands,
        evidence,
        invalidCommandCount: safeArray(ticket?.terminalHistory).filter((record) => !record.valid).length,
        investigationEvidence: safeArray(ticket?.investigationEvidence),
        requiredEvidenceCount: Number(ticket?.requiredEvidenceCount ?? 0),
        investigationRequired: Boolean(ticket?.investigationRequired)
      },
      timeline: safeArray(ticket?.eventHistory)
        .filter((event) => Number.isFinite(event?.timestamp))
        .sort((left, right) => left.timestamp - right.timestamp),
      rca: {
        whatHappened: `${ticket?.affectedRack ?? "Rack"}에서 ${ticket?.title ?? "Incident"}이 발생했다.`,
        symptoms: ticket?.symptom ?? "—",
        investigation: evidence.length
          ? `${evidence.join(", ")} 근거를 확보했다.`
          : commands.length ? `${commands.join(", ")} 명령을 실행했다.` : "기록된 Terminal 조사가 없다.",
        rootCause: ticket?.rootCause ?? "—",
        recoveryAction: ticket?.correctAction ?? "—",
        result: `${getSlaResult(ticket)} · MTTR ${formatDuration(mttrSeconds ?? 0)}`,
        lessonsLearned: buildLessonsLearned(ticket)
      }
    };
  }

  function buildOperatorSummary(report) {
    const metrics = [
      { label: "SLA Compliance", value: report.slaCompliance, strong: 90, weak: 75 },
      { label: "Diagnosis Accuracy", value: report.diagnosisAccuracy, strong: 85, weak: 70 },
      { label: "Action Accuracy", value: report.actionAccuracy, strong: 85, weak: 70 }
    ];
    const strong = metrics.filter((metric) => metric.value >= metric.strong).map((metric) => metric.label);
    const needsImprovement = metrics.filter((metric) => metric.value < metric.weak).map((metric) => metric.label);
    const averageSla = Number(report.averageAppliedSla ?? 0);
    if (report.resolved > 0 && averageSla > 0) {
      (report.averageMttr <= averageSla * 0.8 ? strong : needsImprovement).push("MTTR");
    }
    return {
      strong: [...new Set(strong)],
      needsImprovement: [...new Set(needsImprovement)],
      note: "현재 게임 Shift의 대응 기록만 요약한 결과입니다."
    };
  }

  const api = Object.freeze({
    CATEGORIES,
    formatDuration,
    formatTimestamp,
    getMttrSeconds,
    getSlaResult,
    sortHistory,
    filterHistory,
    calculateCategoryAnalytics,
    calculateInvestigationCoverage,
    buildLessonsLearned,
    buildIncidentReport,
    buildOperatorSummary
  });

  global.DCOpsAnalytics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
