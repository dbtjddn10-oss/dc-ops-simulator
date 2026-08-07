# DC OPS: NIGHT SHIFT — Project Status

최종 업데이트: 2026-08-08  
현재 버전: **v0.4 — Incident Queue & Night Shift System**

외부 라이브러리나 설치 과정 없이 `index.html`을 열어 실행하는 데이터센터 야간 운영 시뮬레이션 웹게임이다.

## 1. 현재 버전

**v0.4 — Incident Queue & Night Shift System**

v0.3.1의 Diagnosis & Action 시스템과 안정화 구조를 유지하면서, 3분 Night Shift 게임 루프·자동 Incident·Incident Queue·SLA 감점·교대 결과 리포트를 추가했다.

## 2. 지금까지 구현된 기능

### 기본 NOC 화면

- 어두운 데이터센터 NOC 관제실 UI
- Rack 01~06의 Healthy, Warning, Critical 상태
- Rack별 CPU, RAM, Disk, Network metrics
- Score, Availability, Temperature, Open Incidents 대시보드
- PC, 태블릿, 모바일 반응형 레이아웃
- Event Log와 Toast 알림

### Incident 및 대응 시스템

- 5종의 랜덤 Incident와 6개 Rack 랜덤 배정
- 같은 Rack에는 동시에 하나의 Incident만 생성
- Incident 생성 전 `previousStatus`, `previousMetrics` 저장 및 복구 후 원상 복원
- Ticket별 증상, Severity, SLA, metrics 표시
- `ticket.stage`를 진행 상태의 단일 기준으로 사용
- `reported → diagnosis → action` 단계 유지
- Diagnosis 후보 최대 3개, 정답 1개와 중복 없는 오답 생성
- 오답 Diagnosis -10점, 오답 Action -20점
- 같은 오답의 반복 클릭 및 중복 감점 차단
- 진단 전 복구 -30점을 Ticket당 한 번만 적용
- 정답 Action 선택 시 Incident 점수 지급 및 복구
- 여러 Incident 동시 처리와 Rack 전환 후 진행 상태 유지

### v0.4 Incident Queue

- 모든 Open Ticket을 한 화면에 표시
- Ticket ID, Rack, Severity(P1~P4), 진행 단계, SLA 잔여 시간 표시
- 정렬 순서: SLA BREACH → Severity 우선순위 → 짧은 SLA
- SLA 10초 이하 Ticket은 긴급 표시, 위반 Ticket은 빨간색 표시
- Queue 항목 클릭 시 해당 Rack과 Ticket 대응 화면으로 이동
- Severity 우선순위를 설정 객체로 분리해 P1~P4 확장 가능

### v0.4 Night Shift

- 교대 상태: `IDLE`, `RUNNING`, `ENDED`
- 기본 실제 플레이 시간 180초
- 시뮬레이션 시간 22:00 → 06:00 표시
- START SHIFT 중복 실행 방지
- RUNNING 상태에서만 사용할 수 있는 `END SHIFT` 버튼
- 수동 종료 전 미해결 Incident 반영 내용을 안내하는 확인 절차
- 수동 종료도 기존 `endShift()`를 재사용해 자동 종료와 같은 통계·등급·리포트 생성
- Event Log에서 `Manual termination`과 `Automatic time limit` 종료 원인 구분
- RUNNING 동안 15~30초 사이의 무작위 간격으로 자동 Incident 생성
- 수동 `TRIGGER INCIDENT` 버튼 유지
- 모든 Rack이 Critical이면 새 Incident를 만들지 않음
- 교대 종료 시 자동 Incident 타이머 정지
- 교대 종료 시 Open Ticket을 삭제하거나 자동 복구하지 않음

### SLA 및 교대 통계

- SLA BREACH마다 정확히 한 번 Score -50점
- SLA BREACH마다 Availability -0.50%, 최저 0%
- Ticket의 `slaPenaltyApplied`로 중복 감점 차단
- 생성/해결/미해결 Incident 수
- SLA 위반 수와 SLA 준수율
- 정답/오답 Diagnosis 및 Action 수
- `createdAt`, `resolvedAt` 기반 실제 해결 시간과 평균 MTTR
- 최종 Score, 정확도, SLA, 미해결 수를 반영한 S/A/B/C/D/F 등급
- 등급 가중치와 기준을 `GRADE_CONFIG`에 모아 쉽게 조정 가능

### 교대 종료 및 재시작

- 180초 종료 시 Night Shift Report 표시
- Score, 생성/해결/미해결, SLA 위반/준수율, Diagnosis/Action 정확도, 평균 MTTR, 등급 표시
- `NEW SHIFT`로 새로고침 없이 점수, 가용성, Ticket, 로그, 통계, 타이머 초기화
- Rack 05의 초기 Warning 상태와 최초 metrics까지 정확히 복원

## 3. 프로젝트 파일 구조와 역할

```text
dc-ops-demo/
├── index.html        # 교대 패널, 대시보드, Rack, Queue, 대응 UI, 결과 리포트의 HTML 구조
├── styles.css        # NOC 디자인, 상태/긴급도 표현, Queue/리포트, 반응형 레이아웃
├── app.js            # 게임 상태, 교대/통계/타이머, Incident·SLA·진단·복구, 화면 갱신
├── incidents.js      # 5종 Incident 데이터 카탈로그
└── PROJECT_STATUS.md # 현재 버전, 구현 상태, 검증 결과와 다음 작업 문서
```

## 4. 현재 발견된 문제나 제한

- 새로고침하면 현재 교대와 기록이 초기화된다. 저장 기능은 아직 없다.
- Incident가 5종이라 반복 플레이 시 정답 패턴을 비교적 빨리 익힐 수 있다.
- 자동 Incident가 모든 Rack을 채운 뒤에도 다음 예약 시점마다 생성 가능 여부를 확인하므로 Event Log에 가용 Rack 없음 경고가 남을 수 있다.
- 점수의 최솟값 제한이 없어 실수와 SLA 위반이 많으면 음수가 될 수 있다.
- 브라우저 탭이 백그라운드에 있을 때 화면 갱신 주기는 늦어질 수 있지만, 교대와 SLA는 `Date.now()` 기준으로 보정된다.
- 교대 시간, 자동 생성 간격, 등급 밸런스는 프로토타입 수치이므로 플레이 테스트 후 조정이 필요하다.

## 5. 아직 구현하지 않은 기능

- LocalStorage 기반 이어하기와 최고 기록
- Incident 10~20종 확장 및 난이도별 Incident 풀
- Incident별 전용 진단 도구와 다단계 Runbook
- 사운드, 설정, 일시정지
- 운영 히스토리와 통계 차트
- 튜토리얼과 온보딩
- 자동화된 단위/통합 테스트 파일

## 6. 다음 추천 작업

### v0.4.1 — Balance & Test Update

1. 3분 플레이를 여러 번 수행해 자동 Incident 간격과 SLA를 조정한다.
2. Grade 기준과 점수 목표를 실제 플레이 결과에 맞춰 보정한다.
3. Event Log 최대 보관 개수와 자동 생성 실패 로그 정책을 정한다.
4. 교대·SLA·Diagnosis·Action 핵심 로직의 자동 테스트를 추가한다.

그 다음 v0.5에서는 Incident 카탈로그 확장과 난이도 시스템을 추가하는 것을 추천한다.

## 7. 가장 최근 작업에서 변경된 내용

- `index.html`: Shift Control, Incident Queue, Night Shift Report UI 추가
- `styles.css`: Queue 긴급/BREACH 상태, 교대 패널, 결과 모달, 모바일 반응형 스타일 추가
- `app.js`:
  - `game.shift`, `game.stats` 상태 추가
  - `startShift()`, `endShift()`, `resetShift()` 추가
  - `scheduleNextIncident()`, `updateShiftClock()` 추가
  - `updateIncidentQueue()`와 Queue 정렬/선택 추가
  - SLA -50점 및 Availability -0.50% 1회 처리 추가
  - 교대 통계와 MTTR 집계 추가
  - `calculateShiftReport()`, `calculateGrade()` 추가
  - 새 교대 시 전체 운영 상태 초기화 추가
  - RUNNING 전용 Manual Shift End와 종료 확인 절차 추가
  - `endShift(reason)`으로 자동 종료와 수동 종료 경로 통합
  - 교대 `setInterval`과 자동 Incident `setTimeout` ID를 저장하고 종료·초기화 시 명시적으로 제거
- `incidents.js`: 기존 5종 데이터 유지

## 8. 검증 결과

- JavaScript 문법 검사 통과
- 초기 IDLE, START SHIFT, 자동 Incident, 중복 시작 방지 확인
- 다중 Incident 6건과 Queue 표시 확인
- Queue 클릭 후 Ticket 및 `ticket.stage` 복원 확인
- Diagnosis/Action 후보 3개와 정답 1개 확인
- 오답 Diagnosis -10, 오답 Action -20, 오답 중복 감점 차단 확인
- 진단 전 복구 -30점이 Ticket당 한 번만 적용됨을 확인
- 정답 Action 복구와 점수 지급 확인
- Rack 05가 Warning과 이전 metrics로 복원됨을 확인
- SLA 위반별 -50점/Availability -0.50%/로그가 한 번만 적용됨을 확인
- 교대 종료 시 미해결 Ticket 유지 및 리포트 표시 확인
- NEW SHIFT 후 상태와 타이머 초기화 확인
- START SHIFT → 자동 시간 종료 → Shift Report 경로 확인
- START SHIFT → END SHIFT 확인 → 수동 종료 → Shift Report 경로 확인
- 수동 종료 취소, IDLE/ENDED 버튼 차단, 중복 종료 방어 확인
- NEW SHIFT 후 이전 자동 Incident 예약과 교대 타이머가 남지 않음을 확인
- 390px 모바일 화면에서 가로 스크롤과 JavaScript 오류가 없음을 확인
