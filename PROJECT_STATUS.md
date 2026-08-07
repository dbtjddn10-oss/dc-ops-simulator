# DC OPS: NIGHT SHIFT — Project Status

최종 업데이트: 2026-08-08  
현재 버전: **v0.7 — Expanded Incident Catalog & Category System**

외부 라이브러리나 설치 과정 없이 `index.html`을 열어 실행하는 데이터센터 야간 운영 시뮬레이션 웹게임이다.

## 1. 현재 버전

**v0.7 — Expanded Incident Catalog & Category System**

v0.6의 Night Shift, EASY/NORMAL/HARD, Queue, SLA, Diagnosis/Action, Linux Terminal, Investigation Evidence, Hard Gate, Shift Report와 Incident History를 유지하면서 Incident를 5종에서 15종으로 확장했다.

## 2. Incident Catalog

Incident는 총 **15개**이며 5개 Category에 각각 3개씩 등록되어 있다.

### SERVER

- `INC-001` Nginx Service Down
- `INC-003` High CPU Load
- `INC-006` Memory Pressure / OOM

### STORAGE

- `INC-002` Disk Usage Critical
- `INC-007` Disk I/O Latency
- `INC-008` Filesystem Read-Only

### NETWORK

- `INC-004` Network Port Blocked
- `INC-009` DNS Resolution Failure
- `INC-010` Network Interface Packet Errors

### POWER

- `INC-011` PSU Redundancy Lost
- `INC-012` Rack PDU Feed A Lost
- `INC-013` Input Voltage Instability

### COOLING

- `INC-005` Cooling System Failure
- `INC-014` Rack Fan Failure
- `INC-015` Hot Aisle Temperature Spike

각 Incident는 `incidentId`, `title`, `category`, `minDifficulty`, `severity`, 증상·원인·정답 조치, metrics, 점수·SLA, Easy Hint, usefulCommands와 diagnosticCommands를 가진다.

## 3. 난이도별 Incident Pool

`app.js`의 `DIFFICULTY_CONFIG.rank`와 `getAvailableIncidents(difficulty)`가 `minDifficulty`를 비교한다.

### EASY — 7종

`INC-001`, `INC-002`, `INC-003`, `INC-004`, `INC-005`, `INC-006`, `INC-009`

### NORMAL — 12종

EASY 7종 + `INC-007`, `INC-010`, `INC-011`, `INC-014`, `INC-015`

### HARD — 15종

NORMAL 12종 + `INC-008`, `INC-012`, `INC-013`

- Ticket 생성 시 현재 Shift 난이도에 맞는 Pool에서만 선택한다.
- Pool에 여러 Incident가 있으면 `game.lastIncidentId`를 제외해 즉시 같은 장애가 반복되지 않게 한다.
- NEW SHIFT에서 `lastIncidentId`도 초기화한다.

## 4. Category와 Severity

- `category`는 SERVER/STORAGE/NETWORK/POWER/COOLING처럼 장애의 운영 분야를 나타낸다.
- `severity`는 대응 우선순위를 나타내며 Queue 정렬에 사용한다.
- Open Incident가 있는 Rack은 기존 규칙대로 Critical로 표시되므로 Rack Health와 Ticket Priority는 별도 개념이다.

Severity 구성:

- **P1:** Cooling System Failure, Rack PDU Feed A Lost
- **P3:** PSU Redundancy Lost
- **P2:** 나머지 12개 Incident

Ticket과 Incident Queue에는 Category badge가 표시된다.

## 5. Category-aware Diagnosis / Action

`createChoiceOptions()`는 정답 외 오답 2개를 만들 때 다음 순서로 후보를 찾는다.

1. 현재 Ticket과 같은 Category의 다른 Incident를 무작위로 섞는다.
2. 같은 Category 후보를 먼저 사용한다.
3. 후보가 부족할 때만 다른 Category에서 보충한다.
4. 정규화한 label Set으로 같은 문구의 중복을 차단한다.

현재는 Category마다 3개 Incident가 있으므로 Diagnosis와 Action 모두 정답 1개 + 같은 Category 오답 2개 구성이 가능하다.

## 6. Linux Terminal 확장

추가된 simulated command:

```text
dmesg
iostat
mount
nslookup [host]
cat /etc/resolv.conf
ethtool eth0
ipmitool sensor
```

기존 구조를 유지한다.

```text
정상 Rack → app.js의 DEFAULT_TERMINAL_OUTPUTS
Incident Rack → incidents.js의 diagnosticCommands가 같은 command 출력을 override
```

- 정상 Rack의 dmesg, Storage, DNS, NIC, PSU/FAN/TEMP 출력은 정상 상태를 보여준다.
- Memory OOM은 free/top/dmesg가 같은 메모리 고갈 상황을 보여준다.
- Disk I/O는 용량 부족이 아닌 높은 iowait/await/%util을 보여준다.
- Filesystem 장애는 mount의 `ro`와 dmesg의 EXT4 remount 기록이 일치한다.
- DNS 장애는 IP ping은 성공하지만 nslookup과 resolver 설정이 실패 원인을 보여준다.
- NIC 장애는 ethtool의 RX/TX/CRC error와 Packet loss를 보여준다.
- Power/Cooling 장애는 `ipmitool sensor`와 별도 Sensor Alert를 함께 사용한다.

## 7. Hard Investigation Gate

- Hard에 등장하는 15개 Incident 모두 최소 1개의 `usefulCommands`를 가진다.
- unique usefulCommands가 1개면 Evidence 1개, 2개 이상이면 2개가 필요하다.
- 같은 canonical command 반복, 잘못된 명령, 관계없는 명령은 Evidence로 다시 집계하지 않는다.
- Ticket별 Terminal History, Evidence와 단계 상태가 Rack 이동 후에도 유지된다.

## 8. Data Validation

`incidents.js`의 `validateIncidentCatalog()`가 로드 시 다음을 검사한다.

- 필수 19개 필드 누락
- 중복 incidentId
- 유효하지 않은 Category/minDifficulty
- 비어 있거나 중복만 있는 usefulCommands
- diagnosticCommands 객체 형식
- 난이도별 Pool 개수와 Category별 개수 요약

현재 결과:

- Total: 15
- Duplicate ID: 0
- Category: 각 3개
- Pool: EASY 7 / NORMAL 12 / HARD 15
- Hard 진행 불가 Incident: 0

## 9. 프로젝트 파일 구조

```text
dc-ops-demo/
├── index.html        # Shift, Ticket Category, Queue, Terminal와 Report UI
├── styles.css        # NOC 디자인, Category badge와 반응형 레이아웃
├── app.js            # 난이도 Pool, 선택지, Terminal, Shift/Incident/SLA 게임 엔진
├── incidents.js      # 15종 Incident 데이터, Terminal override와 validation
└── PROJECT_STATUS.md # 버전, 구조, Known Issues와 검증 결과
```

## 10. Known Issues

이번 Content Expansion에서 핵심을 방해하지 않는 기존 자잘한 문제는 유지했다.

- Difficulty별 Score 배율과 Score 카드의 초기 `복구 시 +100 PTS` 문구가 일치하지 않는다.
- Hard Investigation Coverage는 Gate 구조상 해결된 Ticket에서 대부분 100%가 되어 통계적 의미가 작다.
- Terminal의 `clear` 명령도 RUNNING 중 `commandsExecuted`에 포함된다.
- ping/curl/nslookup은 target별 모든 세부 경우를 재현하지 않는 학습용 시뮬레이션이다.
- 새로고침하면 현재 교대와 기록이 초기화되며 저장 기능이 없다.
- Incident/SLA/점수/자동 생성 간격은 추가 플레이 테스트 후 밸런스 조정이 필요하다.
- 자동 Incident가 모든 Rack을 채운 뒤에도 예약 시점마다 가용 Rack을 확인해 경고 Log가 남을 수 있다.
- 점수의 최솟값 제한이 없어 음수가 될 수 있다.
- 백그라운드 탭에서는 화면 갱신이 늦어질 수 있지만 시간 계산은 `Date.now()` 기준이다.
- Terminal은 실제 Linux shell의 권한, pipe, redirect, option 전체를 구현하지 않는다.
- Incident History는 내부 데이터로 보존되지만 별도 History 화면은 없다.

## 11. 검증 결과

- JavaScript 문법, HTML ID 중복과 DOM 참조 검사 통과
- Incident validation: 15종, ID 중복 0, Category 3개씩, Pool 7/12/15 확인
- 브라우저 **469개 검사 항목 통과, 실패 0개**
- Easy 7종과 Normal 12종을 실제 랜덤 Pool에서 모두 생성·복구
- Hard 15종을 Evidence 수집 → Diagnosis → Action으로 모두 해결
- 직전 Incident 즉시 반복 방지 확인
- Diagnosis/Action의 같은 Category 우선 선택지 확인
- 새 명령 7개의 정상 Rack 출력 확인
- 새 Incident 10종의 diagnosticCommands override 확인
- Power/Cooling Sensor Alert 확인
- P1/P2/P3 Queue 표시와 Category badge 확인
- 다중 Incident Queue, SLA timer, 오답 감점, 중복 감점 차단 확인
- Easy/Hard score multiplier와 Hard SLA multiplier 확인
- Terminal History와 Evidence의 Rack 전환 보존 확인
- Warning Rack의 이전 상태와 metrics 복원 확인
- 수동/자동 END SHIFT, Report, NEW SHIFT, Timer 정리 확인
- 기본 실행값 NORMAL / 03:00 / Rack 6개와 반응형 breakpoint 확인

## 12. 다음 추천 버전

### v0.7.1 — Content Balance & Automated Tests

1. 15종별 평균 해결 시간과 오답률을 기록해 SLA와 score를 조정한다.
2. Incident validation, Pool, distractor, parser를 별도 자동 테스트 파일로 분리한다.
3. Shift Report에 Category별 발생/해결 통계와 Evidence 요약을 추가한다.
4. Keyboard command history와 자동완성을 추가해 Terminal UX를 개선한다.
