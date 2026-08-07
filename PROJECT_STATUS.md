# DC OPS: NIGHT SHIFT — Project Status

최종 업데이트: 2026-08-07  
현재 버전: **v0.2 — Random Incident System**

외부 라이브러리나 설치 과정 없이 `index.html`을 브라우저에서 실행할 수 있는 데이터센터 야간 운영 시뮬레이션 프로토타입이다.

## 1. 현재 버전

**v0.2 — Random Incident System**

## 2. 지금까지 구현된 기능

### 기본 화면과 운영 지표

- 어두운 현대식 데이터센터 NOC 관제실 UI
- 서버 Rack 6개와 Healthy, Warning, Critical 상태
- Score, Availability, Temperature, Incidents 대시보드
- Rack별 CPU, RAM, Disk, Network 사용률
- PC, 태블릿, 모바일 대응 반응형 레이아웃
- 키보드 포커스와 `aria-live`를 포함한 기본 접근성 처리

### 장애 대응 게임 흐름

- 장애 발생, 진단, 복구 버튼
- 장애 발생 시 Critical이 아닌 Rack 중 하나를 무작위로 선택
- 발생 Rack 자동 선택 및 Critical 상태 변경
- 진단 전 복구 시 30점 감점
- 정상 진단 후 복구 시 Incident 점수 지급(현재 모두 100점)
- 복구 시 Rack 수치, 가용성, 온도, Incident 수 정상화
- 모든 주요 행동을 실제 시간과 함께 Event Log에 기록

### v0.2 랜덤 Incident 시스템

현재 등록된 Incident는 다음 5개다.

1. Nginx Service Down
2. Disk Usage Critical
3. High CPU Load
4. Network Port Blocked
5. Cooling System Failure

각 Incident는 `incidentId`, `title`, `affectedRack`, `severity`, `symptom`, `rootCause`, `correctDiagnosis`, `correctAction`, `cpu`, `ram`, `disk`, `network`, `temperature`, `score`, `slaSeconds` 데이터를 가진다.

장애 발생 시 다음 처리를 수행한다.

- 5개 Incident 중 하나와 사용 가능한 Rack 하나를 무작위로 선택
- `TKT-0001` 형식의 Incident Ticket 생성
- Incident별 CPU, RAM, Disk, Network, Temperature 적용
- SLA 카운트다운 시작
- SLA 만료 시 Ticket 경고 및 Event Log에 `SLA BREACH` 한 번 기록
- 진단 후 Diagnosis, Root Cause, Correct Action 공개
- 여러 Rack의 Incident 동시 처리 지원

## 3. 프로젝트 파일 구조와 각 파일의 역할

```text
dc-ops-demo/
├── index.html        # 화면의 HTML 구조
├── styles.css        # 디자인, 상태 색상, 애니메이션, 반응형 스타일
├── app.js            # 게임 상태, 화면 갱신, 장애·진단·복구·SLA 로직
├── incidents.js      # 5개 Incident 데이터 카탈로그
└── PROJECT_STATUS.md # 현재 프로젝트 진행 상태 문서
```

### `index.html`

대시보드, Rack 영역, Incident Control, Incident Ticket, Event Log의 화면 구조를 정의하고 CSS와 JavaScript 파일을 불러온다.

### `styles.css`

전체 NOC 디자인, 상태 표시, 수치 막대, Ticket, SLA Breach, Toast, Event Log와 980px·700px·430px 반응형 규칙을 담당한다.

### `app.js`

Rack과 게임 상태를 관리하고 랜덤 Incident 생성, 진단, 복구, 감점·보상, 대시보드 갱신, SLA 계산과 Event Log 생성을 담당한다.

### `incidents.js`

게임 로직과 분리된 Incident 데이터 카탈로그다. 새 장애를 추가할 때 이 파일에 Incident 객체를 추가한다.

## 4. 현재 발견된 문제나 버그

### 현재 규칙상 발생 가능한 문제

- 진단하지 않고 복구 버튼을 반복하면 누를 때마다 30점씩 계속 감점된다.
- 초기 Warning 상태인 Rack 05에 Incident가 발생한 뒤 복구하면 기존 Warning이 보존되지 않고 Healthy로 변경된다.
- 여러 Incident가 열려 있어도 Ticket 패널에는 현재 선택한 Rack의 Ticket 하나만 표시된다.
- Incident 제목이 처음부터 표시되므로 일부 장애는 진단 전에도 원인을 추측하기 쉽다.

### 기술적 제한

- 새로고침하면 점수, Ticket과 Event Log가 모두 초기화된다.
- SLA 만료 시 추가 점수 또는 가용성 페널티 없이 Event Log만 기록된다.
- 랜덤 선택이므로 같은 Incident 종류가 연속해서 발생할 수 있다.
- 백그라운드 탭에서는 화면 타이머 갱신이 늦어질 수 있지만 실제 마감 시각을 기준으로 남은 시간을 보정한다.
- `incidents.js`가 없거나 스크립트 로딩 순서가 바뀌면 `app.js`가 Incident 데이터를 읽지 못한다.

### 확인된 정상 동작

- JavaScript 문법 검사 통과
- 5개 Incident의 필수 필드와 고유 ID 검사 통과
- HTML에서 참조하는 화면 요소 ID 누락 없음
- 브라우저에서 장애 발생, Ticket 생성, 감점, 진단과 복구 확인
- Incident 2개 동시 발생과 서로 다른 Rack 배정 확인
- 브라우저 콘솔 오류 없음

## 5. 아직 구현하지 않은 기능

- 여러 후보 중 Diagnosis를 직접 선택하는 기능
- 복구 Action을 직접 선택하거나 명령어를 입력하는 기능
- 잘못된 진단과 잘못된 Action 판정
- 전체 Incident Queue와 Ticket 전환 화면
- SLA 만료에 따른 점수 또는 가용성 페널티
- Incident 자동 발생 모드와 난이도 설정
- 교대 시간, 최종 평가와 Game Over 조건
- 일시정지, 다시 시작과 초기화 버튼
- 점수와 진행 상태 저장 및 불러오기
- Incident 이력과 통계 화면
- 사운드, 경보음과 설정 메뉴
- 자동 테스트 코드

## 6. 다음 추천 작업

### v0.3 — Diagnosis & Action 선택 시스템

현재는 진단 버튼을 누르면 정답이 자동 공개되고 복구 버튼이 올바른 조치를 자동 실행한다. 다음 버전에서는 다음 흐름을 추천한다.

1. Incident 증상과 수치만 공개
2. 3개의 Diagnosis 후보 표시
3. 플레이어가 Diagnosis 선택
4. 정답일 때 Action 후보 표시
5. 올바른 Action을 선택하면 복구
6. 잘못된 선택에는 점수 또는 SLA 페널티 적용

이후에는 Incident Queue, SLA 페널티, 난이도와 자동 Incident 발생, 교대 종료 평가, 저장 기능, Incident 10~20개 확장, 자동 테스트 순서로 진행하는 것을 추천한다.

## 7. 가장 최근 작업에서 변경된 내용

최근 작업에서 프로젝트를 v0.2 Random Incident System으로 확장했다.

- Incident를 1개에서 5개로 확대
- 모든 Incident에 요청된 15개 데이터 필드 추가
- Rack 01~06 무작위 선택
- Ticket 번호와 Incident Ticket UI 추가
- Incident별 CPU, RAM, Disk, Network, Temperature 적용
- 실제 마감 시각 기반 SLA 카운트다운과 SLA Breach 기록 추가
- 진단 후 Diagnosis, Root Cause, Correct Action 공개
- Incident별 점수 지급 구조와 다중 Incident 지원
- 빈 Incident 데이터와 모든 Rack 사용 중 상태에 대한 방어 처리
- 브라우저에서 전체 장애 대응 흐름과 다중 Incident 동작 검증

기존 NOC 스타일, Rack 6개, 대시보드, 진단 전 복구 감점, 진단 후 복구 보상, Event Log와 반응형 UI는 그대로 유지했다.
