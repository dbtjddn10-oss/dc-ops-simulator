# DC OPS: NIGHT SHIFT — Project Status

최종 업데이트: 2026-08-08  
현재 버전: **v0.5 — Linux Terminal & Investigation System**

외부 라이브러리나 설치 과정 없이 `index.html`을 열어 실행하는 데이터센터 야간 운영 시뮬레이션 웹게임이다.

## 1. 현재 버전

**v0.5 — Linux Terminal & Investigation System**

v0.4의 Incident Queue, Night Shift, SLA, Diagnosis & Action 구조를 유지하면서 브라우저 안에서 안전하게 작동하는 Linux Terminal 조사 시스템을 추가했다.

## 2. 구현된 기능

### 기본 NOC와 Incident 대응

- Rack 01~06의 Healthy, Warning, Critical 상태와 CPU/RAM/Disk/Network metrics
- Score, Availability, Temperature, Open Incident 대시보드
- 5종 랜덤 Incident와 여러 Rack의 동시 Incident
- Ticket별 `reported → diagnosis → action` 진행 상태
- Diagnosis/Action 후보, 오답 감점 및 반복 감점 차단
- Incident 이전 Rack 상태와 metrics 복원
- Incident Queue와 SLA 우선순위 정렬
- SLA 위반 1회 감점과 Availability 감소
- 180초 Night Shift, 자동 Incident, 수동/자동 Shift 종료
- Shift Report와 NEW SHIFT 초기화

### v0.5 Safe Simulated Linux Terminal

- 선택된 Rack에 따라 `operator@rack03:~$`처럼 바뀌는 prompt
- 명령 입력, 결과 출력, 명령 기록, 내부 스크롤, Clear 기능
- 실제 shell이나 운영체제 명령을 전혀 실행하지 않는 허용 목록 방식
- `eval`, 파일 시스템, 외부 프로세스, PowerShell, cmd.exe를 사용하지 않음
- 여러 공백과 앞뒤 공백을 정규화하는 command parser
- 알 수 없는 명령은 `command not found: 명령`으로 표시
- Healthy/Warning Rack에서도 정상 상태의 simulated output 제공
- Incident Rack에서는 `incidents.js`의 장애별 조사 결과 제공
- Cooling Incident는 Linux 프로세스 정보만으로 시설 냉각 원인을 확정할 수 없도록 Sensor 경고를 함께 표시

### 지원 명령어

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

`help`는 SYSTEM, RESOURCES, NETWORK, SERVICE, TERMINAL 범주로 명령 목록만 보여주며 Incident 정답은 공개하지 않는다.

### Investigation 데이터 구조

각 Incident는 기존 필드에 다음 데이터를 추가로 가진다.

- `usefulCommands`: 해당 Incident 조사에 도움이 되는 canonical command 목록
- `diagnosticCommands`: 명령별 Incident 전용 simulated output
- `sensorAlert`: Linux 명령만으로 판단하기 어려운 시설 Sensor 정보(필요한 Incident만 사용)

`app.js`는 명령을 분류하고 공통 정상 출력을 제공한다. Incident별 결과는 `incidents.js` 데이터가 공통 출력을 덮어쓰므로, 새 Incident를 추가할 때 조사 데이터를 같은 객체에 추가할 수 있다.

### Terminal History와 Evidence

- 정상 Rack의 Terminal 기록은 `rack.terminalHistory`에 저장
- Incident 중 기록은 `ticket.terminalHistory`에 저장
- Rack을 이동했다 돌아와도 해당 Rack/Ticket 기록 유지
- 유용한 명령은 `ticket.investigationEvidence`에 입력 형태로 저장
- `ticket.countedUsefulCommands`의 canonical command로 같은 명령의 중복 집계 차단
- 해결된 Ticket과 조사 기록은 `game.incidentHistory`에 복사해 향후 History 화면에 사용할 수 있는 구조로 보존
- NEW SHIFT에서는 Rack session, Ticket, archived Incident history를 모두 초기화

### Shift Investigation 통계

- `commandsExecuted`: RUNNING 중 입력한 전체 명령 수
- `usefulCommands`: Ticket별로 처음 사용한 유용한 명령 수
- `invalidCommands`: 허용 목록에 없는 명령 수
- Shift Report에서 세 통계를 함께 표시
- Investigation 통계에는 별도의 큰 점수 감점이 없음

## 3. 프로젝트 파일 구조와 역할

```text
dc-ops-demo/
├── index.html        # Shift, Rack, Queue, Terminal, 대응 UI와 Shift Report 구조
├── styles.css        # NOC/Terminal 디자인, 상태 표현, 스크롤과 반응형 레이아웃
├── app.js            # 게임 상태, 안전한 parser, Terminal session, Shift/Incident/SLA 로직
├── incidents.js      # 5종 Incident와 usefulCommands/diagnosticCommands 데이터
└── PROJECT_STATUS.md # 현재 버전, 구조, Known Issues, 검증 결과와 다음 작업
```

## 4. Known Issues

v0.4에서 알려진 작은 문제와 밸런스 항목은 이번 버전에서 대규모로 변경하지 않고 유지했다.

- 새로고침하면 현재 교대와 기록이 초기화된다. 저장 기능은 아직 없다.
- Incident가 5종이라 반복 플레이 시 정답 패턴을 비교적 빨리 익힐 수 있다.
- 자동 Incident가 모든 Rack을 채운 뒤에도 다음 예약 시점마다 생성 가능 여부를 확인하므로 Event Log에 가용 Rack 없음 경고가 남을 수 있다.
- 점수의 최솟값 제한이 없어 실수와 SLA 위반이 많으면 음수가 될 수 있다.
- 브라우저 탭이 백그라운드에 있을 때 화면 갱신 주기는 늦어질 수 있지만, 교대와 SLA는 `Date.now()` 기준으로 보정된다.
- 교대 시간, 자동 생성 간격, 등급 밸런스는 프로토타입 수치이므로 플레이 테스트 후 조정이 필요하다.
- Terminal은 학습용 시뮬레이션으로 실제 Linux의 옵션, 권한, pipe, redirect, shell 문법을 구현하지 않는다.
- Terminal 기록은 메모리에만 존재하며 새로고침이나 NEW SHIFT 후에는 사라진다.
- Incident History 데이터는 내부에 보존되지만 별도 History 화면은 아직 없다.

## 5. 아직 구현하지 않은 기능

- LocalStorage 기반 이어하기와 최고 기록
- Incident 10~20종과 난이도별 Incident 풀
- Hard Mode의 필수 Investigation 단계
- 실제 Linux 실습 환경 또는 교육용 sandbox 연동
- Incident History 화면과 evidence 분석 리포트
- 명령 자동완성, 키보드 위/아래 History 탐색
- 사운드, 설정, 일시정지, 튜토리얼
- 자동화된 단위/통합 테스트 파일

## 6. 다음 추천 작업

### v0.5.1 — Terminal UX & Test Update

1. 위/아래 방향키 명령 History와 간단한 자동완성을 추가한다.
2. Incident별 evidence를 Shift Report에서 요약한다.
3. command parser와 usefulCommands 중복 집계를 자동 테스트로 분리한다.
4. 3분 플레이 테스트로 Terminal 사용 시간과 SLA 밸런스를 조정한다.

그 다음 v0.6에서는 난이도 설정과 Hard Mode Investigation Gate를 추가하는 것을 추천한다.

## 7. 가장 최근 작업에서 변경된 내용

- `index.html`: Linux Terminal 패널과 Investigation 통계 Report 항목 추가
- `styles.css`: 검은색 Terminal, Sensor Alert, command/output/history, 모바일 스타일 추가
- `incidents.js`: 5종 Incident에 usefulCommands, diagnosticCommands, sensorAlert 데이터 추가
- `app.js`:
  - 안전한 command parser와 공통 정상 Rack output 추가
  - Rack/Ticket별 Terminal session과 Clear 기능 추가
  - investigationEvidence 및 useful command 중복 방어 추가
  - commandsExecuted, usefulCommands, invalidCommands 통계 추가
  - 해결 Ticket을 `game.incidentHistory`에 보존
  - NEW SHIFT Terminal 전체 초기화 추가

## 8. 검증 결과

- JavaScript 문법, HTML ID, DOM 참조 검사 통과
- START/END SHIFT, 자동/수동 Incident, Queue, SLA, Diagnosis, Action 회귀 확인
- Rack 전환, Warning Rack 복원, Shift Report, NEW SHIFT, Timer 정리 확인
- Healthy Rack의 정상 Terminal output 확인
- Incident Rack의 Incident별 Terminal override 확인
- Rack 이동 후 Ticket Terminal history 유지 확인
- help, clear, hostname, 공백 정규화 명령 확인
- 잘못된 명령의 `command not found`와 invalidCommands 집계 확인
- 같은 useful command 반복 시 evidence/usefulCommands가 한 번만 증가함을 확인
- NEW SHIFT 후 Rack/Ticket Terminal history와 Investigation 통계 초기화 확인
- 모바일 Terminal 입력과 내부 스크롤, 가로 화면 넘침 없음 확인
- 브라우저 콘솔 오류 없음
