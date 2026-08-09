(function defineDcOpsFloor(global) {
  "use strict";

  const GRID_WIDTH = 12;
  const GRID_HEIGHT = 8;
  const DIRECTIONS = Object.freeze({
    ArrowUp: Object.freeze({ x: 0, y: -1, facing: "north" }),
    ArrowDown: Object.freeze({ x: 0, y: 1, facing: "south" }),
    ArrowLeft: Object.freeze({ x: -1, y: 0, facing: "west" }),
    ArrowRight: Object.freeze({ x: 1, y: 0, facing: "east" })
  });

  const FLOOR_ASSETS = Object.freeze([
    ...Array.from({ length: 5 }, (_, index) => Object.freeze({
      id: `rack-${index + 1}`,
      type: "rack",
      rackId: index + 1,
      label: `R${String(index + 1).padStart(2, "0")}`,
      x: 3 + index * 2,
      y: 3,
      blocksMovement: true
    })),
    ...Array.from({ length: 5 }, (_, index) => Object.freeze({
      id: `rack-${index + 6}`,
      type: "rack",
      rackId: index + 6,
      label: `R${String(index + 6).padStart(2, "0")}`,
      x: 3 + index * 2,
      y: 6,
      blocksMovement: true
    })),
    Object.freeze({ id: "ups-a", type: "facility", facilityType: "UPS", label: "UPS", x: 2, y: 2, blocksMovement: true }),
    Object.freeze({ id: "pdu-a", type: "facility", facilityType: "PDU", label: "PDU-A", x: 2, y: 4, blocksMovement: true }),
    Object.freeze({ id: "pdu-b", type: "facility", facilityType: "PDU", label: "PDU-B", x: 2, y: 6, blocksMovement: true }),
    Object.freeze({ id: "crac-a", type: "facility", facilityType: "CRAC", label: "CRAC", x: 10, y: 4, blocksMovement: true })
  ]);

  const OPERATORS = Object.freeze([
    Object.freeze({ id: "rookie", glyph: "R", nameKey: "operatorRookieName", roleKey: "operatorRookieRole", tone: "coral" }),
    Object.freeze({ id: "luna", glyph: "L", nameKey: "operatorLunaName", roleKey: "operatorLunaRole", tone: "violet" })
  ]);

  const TRANSLATIONS = Object.freeze({
    ko: Object.freeze({
      appSubtitle: "데이터센터 야간 운영 시뮬레이션",
      floorEyebrow: "V1.1 PREVIEW · 2D OPERATIONS SCAFFOLD",
      floorTitle: "2D 데이터센터 Floor",
      floorDescription: "방향키로 이동하고 인접한 설비에서 E를 눌러 상호작용하세요.",
      operatorTitle: "오퍼레이터 선택",
      operatorNotice: "CSS로 만든 original placeholder이며 외부 캐릭터 자산을 사용하지 않습니다.",
      operatorRookieName: "루키형 탐험가",
      operatorRookieRole: "활기찬 현장 대응",
      operatorLunaName: "루나형 엔지니어",
      operatorLunaRole: "침착한 시스템 분석",
      languageLabel: "언어",
      shiftControl: "교대 제어",
      nightShift: "야간 교대",
      shiftTimeLabel: "교대 시간",
      timeLeftLabel: "남은 시간",
      difficultyLabel: "난이도",
      scoreLabel: "점수",
      activeIncidentsLabel: "진행 중인 장애",
      slaViolationsLabel: "SLA 위반",
      incidentHistoryLabel: "Incident 기록",
      shiftArchiveLabel: "Shift Archive",
      startShiftLabel: "교대 시작 · START SHIFT",
      shiftRunningLabel: "교대 진행 중 · SHIFT RUNNING",
      shiftEndedLabel: "교대 종료 · SHIFT ENDED",
      endShiftLabel: "교대 종료 · END SHIFT",
      movementLabel: "이동",
      interactionLabel: "상호작용",
      controlsLabel: "조작 방법",
      investigatePrompt: "조사하기",
      activeIncidentLabel: "진행 중인 장애",
      noActiveIncident: "진행 중인 장애 없음",
      selectRackObjective: "Floor를 순찰하고 Rack 상태를 확인하세요.",
      rackLabel: "Rack",
      severityLabel: "심각도",
      statusLabel: "상태",
      investigationHintLabel: "조사 힌트",
      objectivesLabel: "목표",
      dataCenterMapLabel: "데이터센터 맵",
      legacyConsoleLabel: "기존 Operations Console 열기",
      legacyConsoleDescription: "Rack 상세, Incident Queue, Action, Event Log",
      safeEnvironmentLabel: "안전한 Simulation 환경",
      investigationTerminalLabel: "조사 터미널",
      objectiveSelectRack: "장애 Rack을 선택합니다.",
      objectiveCollectEvidence: "Terminal에서 Evidence를 수집합니다.",
      objectiveDiagnose: "Diagnosis를 확정합니다.",
      objectiveRecover: "SLA 전에 Recovery를 완료합니다.",
      stageReported: "조사 대기",
      stageAction: "Recovery 대기",
      menuLabel: "메뉴",
      operatorStatusLabel: "오퍼레이터",
      clearanceLabel: "보안 등급",
      systemHealthLabel: "시스템 상태",
      networkStatusLabel: "네트워크",
      triggerIncidentLabel: "Incident 생성",
      dashboardLabel: "v1.0 Dashboard",
      returnFloorLabel: "Floor Mode로 돌아가기",
      terminalHintLabel: "Rack을 선택하면 안전한 Simulated Terminal이 연결됩니다.",
      actionHintsLabel: "Action 안내",
      actionInspectRack: "Incident Rack에 접근해 상태를 확인합니다.",
      actionReviewEvidence: "Terminal에서 Evidence를 수집합니다.",
      actionResolveVerify: "Diagnosis 후 복구하고 시스템을 확인합니다.",
      nearbyNone: "인접한 상호작용 대상이 없습니다.",
      nearbyRack: "{asset} 인접 · E로 Rack console 연결",
      nearbyFacility: "{asset} 인접 · E로 설비 상태 확인",
      plannedRack: "{asset}은 v1.1 확장용 placeholder Rack입니다.",
      rackLinked: "{asset}을 기존 Terminal / Investigation 흐름에 연결했습니다.",
      facilityPlaceholder: "{asset} 상호작용은 다음 iteration에서 확장됩니다.",
      operatorSelected: "{operator} 오퍼레이터를 선택했습니다.",
      operational: "OPERATIONS LINKED",
      planned: "PLANNED"
    }),
    en: Object.freeze({
      appSubtitle: "Data center night operations simulator",
      floorEyebrow: "V1.1 PREVIEW · 2D OPERATIONS SCAFFOLD",
      floorTitle: "2D Data Center Floor",
      floorDescription: "Move with the arrow keys and press E beside an asset to interact.",
      operatorTitle: "Select Operator",
      operatorNotice: "Original CSS placeholders only; no third-party character assets are used.",
      operatorRookieName: "Rookie Explorer",
      operatorRookieRole: "Energetic field response",
      operatorLunaName: "Luna Engineer",
      operatorLunaRole: "Calm systems analysis",
      languageLabel: "Language",
      shiftControl: "SHIFT CONTROL",
      nightShift: "NIGHT SHIFT",
      shiftTimeLabel: "SHIFT TIME",
      timeLeftLabel: "TIME LEFT",
      difficultyLabel: "DIFFICULTY",
      scoreLabel: "SCORE",
      activeIncidentsLabel: "ACTIVE INCIDENTS",
      slaViolationsLabel: "SLA VIOLATIONS",
      incidentHistoryLabel: "INCIDENT HISTORY",
      shiftArchiveLabel: "SHIFT ARCHIVE",
      startShiftLabel: "START SHIFT",
      shiftRunningLabel: "SHIFT RUNNING",
      shiftEndedLabel: "SHIFT ENDED",
      endShiftLabel: "END SHIFT",
      movementLabel: "Move",
      interactionLabel: "Interact",
      controlsLabel: "CONTROLS",
      investigatePrompt: "INVESTIGATE",
      activeIncidentLabel: "ACTIVE INCIDENT",
      noActiveIncident: "NO ACTIVE INCIDENT",
      selectRackObjective: "Patrol the Floor and inspect Rack status.",
      rackLabel: "RACK",
      severityLabel: "SEVERITY",
      statusLabel: "STATUS",
      investigationHintLabel: "INVESTIGATION HINT",
      objectivesLabel: "OBJECTIVES",
      dataCenterMapLabel: "DATA CENTER MAP",
      legacyConsoleLabel: "OPEN LEGACY OPERATIONS CONSOLE",
      legacyConsoleDescription: "Rack detail, Incident Queue, Actions and Event Log",
      safeEnvironmentLabel: "SAFE SIMULATED ENVIRONMENT",
      investigationTerminalLabel: "INVESTIGATION TERMINAL",
      objectiveSelectRack: "Select the affected Rack.",
      objectiveCollectEvidence: "Collect Evidence in the Terminal.",
      objectiveDiagnose: "Confirm the Diagnosis.",
      objectiveRecover: "Complete Recovery before the SLA expires.",
      stageReported: "INVESTIGATION",
      stageAction: "RECOVERY READY",
      menuLabel: "MENU",
      operatorStatusLabel: "OPERATOR",
      clearanceLabel: "CLEARANCE",
      systemHealthLabel: "SYSTEM HEALTH",
      networkStatusLabel: "NETWORK",
      triggerIncidentLabel: "TRIGGER INCIDENT",
      dashboardLabel: "v1.0 DASHBOARD",
      returnFloorLabel: "RETURN TO FLOOR MODE",
      terminalHintLabel: "Select a Rack to connect the Safe Simulated Terminal.",
      actionHintsLabel: "ACTION HINTS",
      actionInspectRack: "Approach the Incident Rack and inspect its status.",
      actionReviewEvidence: "Collect Evidence through the Terminal.",
      actionResolveVerify: "Diagnose, recover and verify system health.",
      nearbyNone: "No interactive asset is nearby.",
      nearbyRack: "Near {asset} · press E to link the Rack console",
      nearbyFacility: "Near {asset} · press E to inspect the facility",
      plannedRack: "{asset} is a placeholder Rack for a later v1.1 iteration.",
      rackLinked: "{asset} is linked to the existing Terminal / Investigation flow.",
      facilityPlaceholder: "{asset} interaction will be expanded in a later iteration.",
      operatorSelected: "Selected operator: {operator}.",
      operational: "OPERATIONS LINKED",
      planned: "PLANNED"
    })
  });

  function isInsideGrid(position, width = GRID_WIDTH, height = GRID_HEIGHT) {
    return Number.isInteger(position?.x)
      && Number.isInteger(position?.y)
      && position.x >= 1
      && position.x <= width
      && position.y >= 1
      && position.y <= height;
  }

  function isBlocked(position, assets = FLOOR_ASSETS) {
    return assets.some((asset) => asset.blocksMovement && asset.x === position.x && asset.y === position.y);
  }

  function movePlayer(position, key, assets = FLOOR_ASSETS) {
    const direction = DIRECTIONS[key];
    const current = {
      x: Number(position?.x) || 1,
      y: Number(position?.y) || 1,
      facing: position?.facing || "south"
    };
    if (!direction) return current;

    const candidate = {
      x: current.x + direction.x,
      y: current.y + direction.y,
      facing: direction.facing
    };
    if (!isInsideGrid(candidate) || isBlocked(candidate, assets)) {
      return { ...current, facing: direction.facing };
    }
    return candidate;
  }

  function findNearbyAsset(position, assets = FLOOR_ASSETS) {
    if (!isInsideGrid(position)) return null;
    return assets
      .map((asset) => ({ asset, distance: Math.abs(asset.x - position.x) + Math.abs(asset.y - position.y) }))
      .filter((item) => item.distance === 1)
      .sort((a, b) => {
        const typePriority = Number(b.asset.type === "rack") - Number(a.asset.type === "rack");
        return typePriority || a.asset.id.localeCompare(b.asset.id);
      })[0]?.asset ?? null;
  }

  function translate(language, key, variables = {}) {
    const dictionary = TRANSLATIONS[Object.hasOwn(TRANSLATIONS, language) ? language : "ko"];
    const template = dictionary[key] ?? TRANSLATIONS.ko[key] ?? key;
    return Object.entries(variables).reduce(
      (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
      template
    );
  }

  const api = Object.freeze({
    GRID_WIDTH,
    GRID_HEIGHT,
    DIRECTIONS,
    FLOOR_ASSETS,
    OPERATORS,
    TRANSLATIONS,
    isInsideGrid,
    isBlocked,
    movePlayer,
    findNearbyAsset,
    translate
  });

  global.DCOpsFloor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
