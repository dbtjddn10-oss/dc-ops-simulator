/**
 * 장애(Incident) 정의 모음
 *
 * 앞으로 장애 종류가 늘어나면 이 배열에 객체를 추가하면 됩니다.
 * 화면 제어와 점수 계산 코드는 app.js에 남겨 두고,
 * 장애 데이터만 이 파일에서 관리합니다.
 */
(function exposeIncidentData(global) {
  "use strict";

  const incidents = Object.freeze([
    {
      incidentId: "INC-001",
      title: "Nginx Service Down",
      affectedRack: null,
      severity: "Critical",
      symptom: "웹 서비스 연결 거부 및 HTTP 502 응답",
      rootCause: "Nginx 프로세스가 비정상 종료되었습니다.",
      correctDiagnosis: "Nginx Service Down",
      correctAction: "Nginx 서비스를 재시작하고 상태를 확인합니다.",
      cpu: 82,
      ram: 78,
      disk: 55,
      network: 5,
      temperature: 23.8,
      score: 100,
      slaSeconds: 55
    },
    {
      incidentId: "INC-002",
      title: "Disk Usage Critical",
      affectedRack: null,
      severity: "Critical",
      symptom: "Disk 쓰기 실패 및 저장 공간 부족 경고",
      rootCause: "로그 파일 증가로 Disk 사용률이 임계치를 초과했습니다.",
      correctDiagnosis: "Disk Usage Critical",
      correctAction: "불필요한 로그를 정리하고 Disk 공간을 확보합니다.",
      cpu: 66,
      ram: 74,
      disk: 98,
      network: 48,
      temperature: 24.1,
      score: 100,
      slaSeconds: 60
    },
    {
      incidentId: "INC-003",
      title: "High CPU Load",
      affectedRack: null,
      severity: "Critical",
      symptom: "응답 시간 증가 및 처리 요청 적체",
      rootCause: "비정상 프로세스가 CPU 자원을 과도하게 사용하고 있습니다.",
      correctDiagnosis: "High CPU Load",
      correctAction: "원인 프로세스를 확인하고 안전하게 재시작합니다.",
      cpu: 99,
      ram: 91,
      disk: 62,
      network: 84,
      temperature: 27.2,
      score: 100,
      slaSeconds: 45
    },
    {
      incidentId: "INC-004",
      title: "Network Port Blocked",
      affectedRack: null,
      severity: "Critical",
      symptom: "서비스 포트 연결 시간 초과 및 Packet 손실",
      rootCause: "방화벽 정책 변경으로 서비스 Port가 차단되었습니다.",
      correctDiagnosis: "Network Port Blocked",
      correctAction: "방화벽 정책을 확인하고 서비스 Port를 허용합니다.",
      cpu: 45,
      ram: 61,
      disk: 52,
      network: 0,
      temperature: 22.6,
      score: 100,
      slaSeconds: 50
    },
    {
      incidentId: "INC-005",
      title: "Cooling System Failure",
      affectedRack: null,
      severity: "Critical",
      symptom: "서버 흡기 온도 급상승 및 냉각 경보",
      rootCause: "해당 구역의 CRAC 냉각 장치가 정지했습니다.",
      correctDiagnosis: "Cooling System Failure",
      correctAction: "비상 냉각을 가동하고 CRAC 장치를 복구합니다.",
      cpu: 75,
      ram: 79,
      disk: 68,
      network: 57,
      temperature: 38.5,
      score: 100,
      slaSeconds: 40
    }
  ].map((incident) => Object.freeze(incident)));

  global.DCOpsData = Object.freeze({ incidents });
})(window);
