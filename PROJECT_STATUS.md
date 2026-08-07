# DC OPS: NIGHT SHIFT — Project Status

최종 업데이트: 2026-08-07  
현재 버전: **v0.3 — Diagnosis & Action System**

외부 라이브러리나 설치 과정 없이 `index.html`을 브라우저에서 실행할 수 있는 데이터센터 야간 운영 시뮬레이션 프로토타입이다.

## 1. 현재 버전

**v0.3 — Diagnosis & Action System**

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

### v0.3 Diagnosis & Action 시스템

- Incident 발생 직후에는 실제 제목, Root Cause, 정답 Diagnosis와 정답 Action을 숨김
- 증상, Rack 상태, CPU, RAM, Disk, Network, Temperature, Severity와 SLA만 공개
- 진단 버튼을 누르면 서로 다른 Incident 데이터를 기반으로 만든 Diagnosis 후보 3개 표시
- 오답 Diagnosis 선택 시 10점 감점 및 `WRONG DIAG` 로그 기록
- 정답 Diagnosis 선택 시 실제 제목과 Root Cause 공개
- 진단 성공 후 Action 후보 3개 표시
- 오답 Action 선택 시 20점 감점 및 `WRONG ACTION` 로그 기록
- 정답 Action 선택 시 Incident 복구 및 기존 Incident 점수 지급
- 이미 선택한 오답은 비활성화하여 같은 오답의 반복 감점 방지
- 각 Ticket에 후보 순서, 진행 단계와 오답 기록을 저장하여 Rack 전환 후에도 상태 유지
- 진단 전 복구 감점은 Ticket당 한 번만 적용

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

대시보드, Rack 영역, Incident Control, Incident Ticket, Diagnosis/Action 선택 패널, Event Log의 화면 구조를 정의하고 CSS와 JavaScript 파일을 불러온다.

### `styles.css`

전체 NOC 디자인, 상태 표시, 수치 막대, Ticket, Diagnosis/Action 후보 버튼, 오답·비활성 상태, SLA Breach, Toast, Event Log와 반응형 규칙을 담당한다.

### `app.js`

Rack과 게임 상태를 관리하고 랜덤 Incident 생성, 후보 생성, Diagnosis/Action 판정, 감점·보상, 복구, 대시보드 갱신, SLA 계산과 Event Log 생성을 담당한다.

### `incidents.js`

게임 로직과 분리된 Incident 데이터 카탈로그다. 새 장애를 추가할 때 이 파일에 Incident 객체를 추가한다.

## 4. 현재 발견된 문제나 버그

### 현재 규칙상 발생 가능한 문제

- 초기 Warning 상태인 Rack 05에 Incident가 발생한 뒤 복구하면 기존 Warning이 보존되지 않고 Healthy로 변경된다.
- 여러 Incident가 열려 있어도 Ticket 패널에는 현재 선택한 Rack의 Ticket 하나만 표시된다.
- 현재 Incident가 5개뿐이므로 게임을 반복하면 Diagnosis와 Action 오답 패턴을 쉽게 암기할 수 있다.
- 오답을 종류별로 한 번씩 선택할 수 있으므로 한 Ticket에서 Diagnosis 최대 20점, Action 최대 40점까지 감점될 수 있다.
- 점수의 최솟값 제한이 없어 전체 점수가 음수가 될 수 있다.

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
- 실제 제목과 Root Cause가 정답 Diagnosis 전에는 화면에 노출되지 않음
- Diagnosis와 Action 후보가 각각 정답 1개와 다른 Incident 기반 오답 2개로 구성됨
- 선택한 오답 비활성화 및 Rack 전환 후 진행 상태 유지

## 5. 아직 구현하지 않은 기능

- 전체 Incident Queue와 Ticket 전환 화면
- SLA 만료에 따른 점수 또는 가용성 페널티
- Incident 자동 발생 모드와 난이도 설정
- 교대 시간, 최종 평가와 Game Over 조건
- 일시정지, 다시 시작과 초기화 버튼
- 점수와 진행 상태 저장 및 불러오기
- Incident 이력과 통계 화면
- 사운드, 경보음과 설정 메뉴
- 자동 테스트 코드
- 장애별 전용 오답 풀과 난이도별 후보 수
- 키보드 단축키를 이용한 빠른 Diagnosis/Action 선택

## 6. 다음 추천 작업

### v0.4 — Incident Queue & Shift System

현재는 Rack을 직접 선택해야 다른 Ticket을 확인할 수 있다. 다음 버전에서는 열린 Ticket 전체를 우선순위와 SLA 순서로 보여주는 Queue를 추가하는 것이 좋다.

1. 열린 Incident Ticket 목록 표시
2. SLA가 적게 남은 Ticket을 위쪽에 배치
3. Ticket을 선택하면 해당 Rack과 대응 패널을 함께 선택
4. 교대 제한 시간과 자동 Incident 발생 추가
5. 교대 종료 시 점수, SLA 준수율과 정확도 평가

이후에는 난이도, 저장 기능, Incident 10~20개 확장, 사운드와 자동 테스트 순서로 진행하는 것을 추천한다.

## 7. 가장 최근 작업에서 변경된 내용

최근 작업에서 프로젝트를 v0.3 Diagnosis & Action System으로 확장했다.

- Incident 발생 직후 정답 정보가 Ticket, Toast와 Alert 로그에 노출되던 구조 수정
- Diagnosis 후보 3개와 Action 후보 3개를 무작위 순서로 생성
- 다른 Incident 2개의 정답 데이터를 그럴듯한 오답으로 사용
- 오답 Diagnosis `-10점`, 오답 Action `-20점` 규칙 추가
- `DIAG`, `WRONG DIAG`, `DIAG OK`, `WRONG ACTION`, `RECOVERY` 로그 추가
- 선택한 오답을 비활성화하고 중복 감점을 차단
- Ticket별 `reported → diagnosis → action` 진행 단계 저장
- Rack 전환 시 후보 순서, 진단 단계와 선택한 오답 상태 유지
- 올바른 Action을 선택해야만 복구되도록 자동 복구 제거
- 기존 진단 전 복구 30점 감점을 Ticket당 한 번으로 제한
- NOC 디자인에 맞는 Decision Panel과 반응형 후보 버튼 추가

기존 랜덤 Incident, Rack 6개, 다중 Incident, SLA, 대시보드, 온도 계산, Event Log와 반응형 UI는 유지했다.
