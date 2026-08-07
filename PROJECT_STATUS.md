# DC OPS: NIGHT SHIFT — Project Status

최종 업데이트: 2026-08-08  
현재 버전: **v0.6 — Difficulty & Investigation Gate System**

외부 라이브러리나 설치 과정 없이 `index.html`을 열어 실행하는 데이터센터 야간 운영 시뮬레이션 웹게임이다.

## 1. 현재 버전

**v0.6 — Difficulty & Investigation Gate System**

v0.5의 Night Shift, Incident Queue, SLA, Diagnosis/Action, Linux Terminal, Evidence, History, Report 기능을 유지하면서 EASY/NORMAL/HARD 난이도와 Hard Mode 필수 조사 게이트를 추가했다.

## 2. 구현된 기능

### 기존 NOC 운영과 Incident 대응

- Rack 01~06의 Healthy, Warning, Critical 상태와 CPU/RAM/Disk/Network metrics
- Score, Availability, Temperature, Open Incident 대시보드
- 5종 랜덤 Incident와 여러 Rack의 동시 Incident
- Ticket별 `reported → diagnosis → action` 진행 상태와 Rack 이동 후 상태 유지
- Diagnosis/Action 후보, 오답 감점 및 같은 오답 반복 감점 차단
- Incident 이전 Rack 상태와 metrics 복원
- SLA 우선순위 Incident Queue와 SLA 위반 1회 처리
- 180초 Night Shift, 난이도별 자동 Incident, 수동/자동 Shift 종료
- Final Grade, MTTR, 정확도, SLA Compliance를 포함한 Shift Report

### v0.5 Safe Simulated Linux Terminal

- 선택 Rack별 prompt, 명령 결과, History, Clear 기능
- 실제 shell을 실행하지 않는 허용 목록 기반 command parser
- Incident별 simulated output과 Sensor 경고
- Ticket별 `terminalHistory`, `investigationEvidence`, `countedUsefulCommands`
- canonical command 기준으로 유용한 명령의 중복 집계 차단
- 해결된 Ticket과 조사 기록을 `game.incidentHistory`에 보존

지원 명령어:

```text
help
clear
hostname
uptime
ping [host]
curl [url]
df -h
free -m
top
systemctl status nginx
journalctl -u nginx
ss -lntp
ip addr
traceroute [host]
```

### v0.6 Difficulty System

난이도 밸런스는 `app.js`의 `DIFFICULTY_CONFIG` 한 곳에서 관리한다.

| 난이도 | 자동 Incident 간격 | Ticket SLA | 복구 보상 | Investigation |
|---|---:|---:|---:|---|
| EASY | 20~35초 | 기본값 × 1.25 | 기본값 × 0.85 | 선택, 조사 영역 Hint 표시 |
| NORMAL | 15~30초 | 기본값 × 1.00 | 기본값 × 1.00 | 선택 |
| HARD | 10~22초 | 기본값 × 0.80 | 기본값 × 1.25 | 필수 |

- 기본 난이도는 NORMAL
- 난이도는 Shift가 IDLE일 때만 변경 가능
- START SHIFT 시 선택 난이도를 Shift와 새 Ticket에 고정 저장
- Ticket 생성 시 적용된 SLA와 복구 보상을 각각 `appliedSlaSeconds`, `rewardScore`에 저장
- 난이도 배율은 올바른 복구 보상에만 적용하며 오답, 절차 위반, SLA 감점은 기존 값 유지
- NEW SHIFT는 모든 Timer, Rack/Ticket/Terminal/History/통계를 초기화하고 NORMAL/IDLE 선택 화면으로 돌아감

### Hard Mode Investigation Gate

- Incident의 `usefulCommands`가 2개 이상이면 서로 다른 Evidence 2개, 1개이면 Evidence 1개 필요
- 허용된 canonical command 중 해당 Incident에 유용한 명령만 Evidence로 인정
- 같은 명령 반복, 잘못된 명령, 관계없는 정상 명령은 진행도를 올리지 않음
- Evidence가 부족하면 DIAGNOSE 버튼과 내부 진단 진입을 함께 차단
- Ticket마다 `requiredEvidenceCount`와 `countedUsefulCommands`를 독립 저장하므로 다중 Incident와 Rack 전환에서도 진행 상태 유지
- Shift Report에 Difficulty와 해결된 Hard Incident의 Investigation Coverage 표시
- Coverage가 낮을 경우 설정값 범위 안에서 Final Grade를 소폭 낮출 수 있는 계산 구조 포함

## 3. 프로젝트 파일 구조와 역할

```text
dc-ops-demo/
├── index.html        # 난이도 선택, Rack, Queue, Terminal, 대응 UI와 Shift Report 구조
├── styles.css        # NOC 디자인, 난이도/조사 Gate, Terminal과 반응형 레이아웃
├── app.js            # 게임 상태, 난이도 설정, Gate, Terminal, Shift/Incident/SLA 로직
├── incidents.js      # 5종 Incident, Easy Hint, usefulCommands와 조사 결과 데이터
└── PROJECT_STATUS.md # 현재 버전, 구조, Known Issues, 검증 결과와 다음 작업
```

## 4. Known Issues

기존에 알려진 작은 문제와 프로토타입 밸런스 항목은 유지한다.

- 새로고침하면 현재 교대와 기록이 초기화된다. 저장 기능은 아직 없다.
- Incident가 5종이라 반복 플레이 시 정답 패턴을 비교적 빨리 익힐 수 있다.
- 자동 Incident가 모든 Rack을 채운 뒤에도 다음 예약 시점마다 생성 가능 여부를 확인하므로 Event Log에 가용 Rack 없음 경고가 남을 수 있다.
- 점수의 최솟값 제한이 없어 실수와 SLA 위반이 많으면 음수가 될 수 있다.
- 브라우저 탭이 백그라운드에 있을 때 화면 갱신 주기는 늦어질 수 있지만, 교대와 SLA는 `Date.now()` 기준으로 보정된다.
- 교대 시간, 자동 생성 간격, 난이도 배율, 등급 밸런스는 프로토타입 수치이므로 플레이 테스트 후 조정이 필요하다.
- Terminal은 학습용 시뮬레이션으로 실제 Linux의 옵션, 권한, pipe, redirect, shell 문법을 구현하지 않는다.
- Terminal 기록은 메모리에만 존재하며 새로고침이나 NEW SHIFT 후에는 사라진다.
- Incident History 데이터는 내부에 보존되지만 별도 History 화면은 아직 없다.

## 5. 아직 구현하지 않은 기능

- LocalStorage 기반 이어하기와 최고 기록
- Incident 10~20종과 난이도별 Incident 풀
- 실제 Linux 실습 환경 또는 교육용 sandbox 연동
- Incident History 화면과 Evidence 분석 리포트
- 명령 자동완성, 키보드 위/아래 History 탐색
- 사운드, 설정, 일시정지, 튜토리얼
- 자동화된 단위/통합 테스트 파일

## 6. 다음 추천 작업

### v0.6.1 — Balance & Accessibility Update

1. 난이도별 실제 3분 플레이 결과로 Incident 간격, SLA, 보상 배율을 조정한다.
2. Hard Mode에서 어떤 명령이 왜 Evidence가 되었는지 Report에 요약한다.
3. 키보드 포커스, Modal Escape 처리, 색상 외 상태 표현을 보강한다.
4. Difficulty/Gate/Score 계산을 작은 순수 함수로 분리하고 자동 테스트를 추가한다.

## 7. 가장 최근 작업에서 변경된 내용

- `index.html`: Shift 난이도 선택기, 현재 난이도, Easy Hint, Hard Evidence 진행도, Gate 안내, Report 항목 추가
- `styles.css`: EASY/NORMAL/HARD 상태, Evidence progress bar, 잠긴 진단 버튼, Report와 모바일 스타일 추가
- `incidents.js`: 각 Incident에 `investigationHint` 추가
- `app.js`:
  - 중앙 집중식 `DIFFICULTY_CONFIG` 추가
  - Shift 시작 시 난이도 고정 및 난이도별 자동 Incident 간격 적용
  - Ticket별 SLA/보상 배율과 Hard Evidence 요구 수 저장
  - 중복되지 않은 canonical useful command 기반 Gate 구현
  - 복구 보상 배율, Report Difficulty/Coverage, Coverage 등급 보정 추가
  - NEW SHIFT를 NORMAL/IDLE 준비 상태로 초기화

## 8. 검증 결과

- JavaScript 문법, HTML ID, DOM 참조 검사
- EASY/NORMAL/HARD 선택과 RUNNING/ENDED 상태의 난이도 잠금
- 난이도별 SLA, 복구 보상, 자동 Incident 예약 범위
- Easy Hint와 Normal의 기존 선택형 Investigation
- Hard 1개/2개 Evidence Gate, 중복/무효/관계없는 명령 방어
- 다중 Incident별 독립 Evidence와 Rack 전환 후 진행도 유지
- START/END SHIFT, Queue, SLA, Diagnosis/Action, 오답 중복 방어 회귀
- Warning Rack 원상 복구, Shift Report, NEW SHIFT 초기화
- 브라우저에서 32개 게임 시나리오와 기본 실행값(`NORMAL`, `03:00`, Rack 6개) 확인
- 모바일 viewport 설정, 980/700/430px 반응형 규칙, 데스크톱 가로 넘침 없음 확인
