# DC OPS: NIGHT SHIFT — Project Status

최종 업데이트: 2026-08-08  
현재 버전: **v0.8 — Incident History & RCA Analytics System**

외부 라이브러리나 설치 과정 없이 `index.html`을 열어 실행하는 데이터센터 야간 운영 시뮬레이션 웹게임이다.

## 1. 현재 버전

**v0.8 — Incident History & RCA Analytics System**

v0.7의 EASY/NORMAL/HARD, Night Shift, 15종 Incident와 5개 Category, Queue, SLA, Diagnosis/Action, Linux Terminal, Investigation Evidence, Hard Gate, Shift Report를 유지하면서 해결된 Incident를 조회하는 History와 규칙 기반 RCA, Category/Operator Analytics를 추가했다.

History는 **CURRENT SHIFT HISTORY** 범위다. NEW SHIFT 또는 새로고침 후 초기화되며 LocalStorage 영구 저장은 아직 사용하지 않는다.

## 2. Incident Catalog와 Difficulty Pool

Incident는 총 **15종**, Category는 **SERVER / STORAGE / NETWORK / POWER / COOLING**이며 각 Category에 3종씩 있다.

- EASY: 7종
- NORMAL: 12종
- HARD: 15종
- Severity: P1 2종 / P2 12종 / P3 1종
- Category-aware Diagnosis/Action distractor 유지
- 직전 Incident 즉시 반복 방지 유지

`incidents.js`의 Catalog validation이 필수 필드, 중복 ID, Category, minDifficulty, usefulCommands와 diagnosticCommands를 검사한다.

## 3. Incident History

기존 `game.incidentHistory`를 현재 Shift에서 해결된 Ticket 전용 목록으로 사용한다.

- Incident Queue: 현재 처리 중인 **OPEN** Ticket
- Incident History: 해결 완료된 **RESOLVED** Ticket
- 기본 정렬: `resolvedAt` 내림차순, 최근 해결 건 우선
- Category Filter: ALL / SERVER / STORAGE / NETWORK / POWER / COOLING
- SLA Filter: ALL / SLA MET / SLA BREACHED
- Empty State: `NO RESOLVED INCIDENTS`
- Modal UX: Open, Close, backdrop click, Escape
- Desktop 2열 목록/상세 구조와 모바일 1열 반응형 구조

History 목록에는 Ticket ID, Incident Title, Category, Severity, Rack, Difficulty, MTTR, SLA 결과와 해결 시각을 표시한다.

## 4. Resolved Ticket Snapshot

`resolveIncident()`는 Rack의 원본 Ticket을 History에 그대로 보관하지 않고 `createResolvedRecord()`로 독립 snapshot을 만든다.

복사 대상:

- 기본 Incident/Ticket 필드와 Original/Applied SLA
- `terminalHistory`
- `investigationEvidence`
- `countedUsefulCommands`
- `eventHistory`
- `diagnosisOptions` / `actionOptions`
- Wrong Diagnosis / Wrong Action 기록
- `diagnosticCommands`와 이전 Rack metrics
- `awardedScore`, `mttrSeconds`, SLA state

Rack의 `ticket`이 `null`이 된 뒤에도 History Detail과 RCA가 원래 대응 기록을 조회할 수 있다.

## 5. Ticket eventHistory와 Timeline

각 Ticket은 전역 Event Log와 별도로 대응 흐름 재구성에 필요한 최소 이벤트만 가진다.

- `INCIDENT_CREATED`
- `COMMAND_EXECUTED`
- `EVIDENCE_CAPTURED`
- `DIAGNOSIS_STARTED`
- `WRONG_DIAGNOSIS`
- `DIAGNOSIS_CONFIRMED`
- `WRONG_ACTION`
- `RECOVERY_COMPLETED`
- `SLA_BREACHED`

모든 event timestamp는 실제 동작 시점의 `Date.now()`를 사용한다. Timeline은 저장된 이벤트만 시간순으로 보여주며 존재하지 않는 시각을 추측하지 않는다.

## 6. Incident Detail과 RCA

History 항목을 선택하면 다음을 보여준다.

- Incident Summary: Ticket/Incident ID, Title, Category, Severity, Difficulty, Rack, Symptom, 생성/해결 시각, MTTR, Original/Applied SLA, SLA 결과
- Root Cause: correctDiagnosis와 rootCause
- Recovery: correctAction과 awardedScore
- Investigation: 실행 명령 요약, useful evidence, invalid command 수, Evidence 충족 상태
- Terminal Evidence Detail: `details/summary`로 simulated output을 필요할 때만 펼침
- Incident Timeline
- Root Cause Analysis

`analytics.js`의 `buildIncidentReport(ticket)`와 `buildLessonsLearned(ticket)`가 화면 렌더링과 분리된 Report 데이터를 만든다.

RCA 구성:

1. What Happened
2. Symptoms
3. Investigation
4. Root Cause
5. Recovery Action
6. SLA / MTTR Result
7. Lessons Learned

Lessons Learned는 외부 AI/API를 호출하지 않는다. Category, useful command 조합, Evidence 충족 여부와 Terminal 기록을 규칙으로 평가해 문장을 선택한다.

## 7. Time Format

`analytics.js`의 공통 formatter를 History, RCA와 Analytics에서 재사용한다.

- 60초 미만: `37.2s`
- 60초 이상: `1m 14.6s`
- Timestamp: `22:14:08`

## 8. Category Analytics

Shift Report의 **CATEGORY PERFORMANCE**가 현재 Shift 데이터를 Category별로 계산한다.

- Generated: 해결 History + 종료 시점 Open Ticket
- Resolved: 해결 History
- SLA Breached: 해결 및 Open Ticket 중 breach된 수
- Average MTTR: 해당 Category의 해결 Record 평균
- SLA Compliance: 해당 Category에서 해결된 Record 기준

통계는 외부 서버 없이 현재 메모리 데이터만 사용한다.

## 9. Operator Summary

Shift Report의 **OPERATOR SUMMARY**는 현재 게임 Shift의 지표만 규칙 기반으로 요약한다.

- SLA Compliance
- Diagnosis Accuracy
- Action Accuracy
- Average MTTR와 Average Applied SLA 비교

각 지표를 `STRONG` 또는 `NEEDS IMPROVEMENT`로 분류한다. 실제 사람의 능력이나 고용 평가를 의미하지 않는다는 안내 문구를 함께 표시한다.

## 10. Investigation Coverage 변경

v0.7은 해결된 Hard Ticket만 계산해 대부분 100%가 되는 한계가 있었다.

v0.8은 Shift 종료 시 다음 전체를 계산한다.

```text
현재 Shift의 모든 Hard Incident
= 해결된 Hard History + 해결되지 않은 Open Hard Ticket
```

- required Evidence 충족: completed
- required Evidence 미충족: incomplete
- Coverage: completed / 전체 Hard Incident × 100

기존 Hard Diagnosis Gate의 진행 로직은 그대로 유지한다.

## 11. 테스트 구조

외부 프레임워크나 설치 과정 없이 실행 가능한 `tests/run-tests.js`를 추가했다. 브라우저에서 사용하는 `analytics.js`를 Node에서도 그대로 불러 순수 로직을 검사한다.

자동 테스트 대상:

- Incident Catalog validation
- 15개 고유 ID와 Category별 3개 구성
- Difficulty Pool 7 / 12 / 15
- MTTR seconds/minutes formatting
- History 최신순 정렬
- Category + SLA Filter
- Category statistics
- 미해결 Ticket을 포함한 Investigation Coverage
- RCA report와 Lessons Learned
- Operator Summary 규칙

실행 예:

```powershell
node tests\run-tests.js
```

## 12. 프로젝트 파일 구조

```text
dc-ops-simulator/
├── index.html          # Shift, Queue, Terminal, History/Report Modal UI
├── styles.css          # NOC 디자인, History/RCA/Analytics와 반응형 레이아웃
├── incidents.js        # 15종 Incident 데이터와 Catalog validation
├── analytics.js        # History Filter, MTTR, RCA, Category/Operator 순수 로직
├── app.js              # 게임 엔진, Ticket eventHistory, Snapshot과 UI 연결
├── tests/
│   └── run-tests.js    # 설치 없는 Node 자동 테스트
└── PROJECT_STATUS.md   # 버전, 구조, Known Issues와 검증 결과
```

## 13. Known Issues

History/RCA 핵심과 직접 관련 없는 기존 작은 문제는 유지했다.

- Difficulty별 Score 배율과 Score 카드의 초기 `복구 시 +100 PTS` 문구가 일치하지 않는다.
- Terminal의 `clear` 명령도 RUNNING 중 `commandsExecuted`에 포함된다.
- ping/curl/nslookup은 target별 모든 세부 경우를 재현하지 않는 학습용 시뮬레이션이다.
- 새로고침하거나 NEW SHIFT를 시작하면 History를 포함한 현재 교대 기록이 초기화되며 영구 저장 기능이 없다.
- Incident/SLA/점수/자동 생성 간격은 추가 플레이 테스트 후 밸런스 조정이 필요하다.
- 자동 Incident가 모든 Rack을 채운 뒤에도 예약 시점마다 가용 Rack을 확인해 경고 Log가 남을 수 있다.
- 점수의 최솟값 제한이 없어 음수가 될 수 있다.
- 백그라운드 탭에서는 화면 갱신이 늦어질 수 있지만 시간 계산은 `Date.now()` 기준이다.
- Terminal은 실제 Linux shell의 권한, pipe, redirect, option 전체를 구현하지 않는다.
- History는 현재 Shift 메모리 범위이며 검색, pagination, export 기능은 없다.

## 14. 검증 결과

- JavaScript 문법 검사 통과: `incidents.js`, `analytics.js`, `app.js`, `tests/run-tests.js`
- HTML ID 중복 0, `app.js` DOM selector 누락 0
- `git diff --check` 오류 0
- 자동 테스트 **13개 통과, 실패 0개**
- Incident Catalog 15종, Category 각 3종, Pool EASY 7 / NORMAL 12 / HARD 15 확인
- EASY에서 Terminal Evidence → Wrong Diagnosis → Diagnosis Confirmed → Wrong Action → Recovery 흐름 확인
- 해결된 Incident가 History에 정확히 1건씩 추가되고 다중 History가 독립적으로 유지되는 것 확인
- History 최근 해결 순 정렬, Category/SLA Filter와 Empty State 확인
- Detail의 Summary, Root Cause, Recovery, Command/Evidence, MTTR, Applied SLA와 SLA 결과 확인
- Ticket Timeline의 Command, Evidence, Wrong Diagnosis/Action, SLA Breach, Recovery event 확인
- 규칙 기반 RCA와 Lessons Learned 확인
- History Modal Close, Escape, backdrop click 확인
- Shift Report의 Category Performance와 Operator Summary 확인
- 해결되지 않은 Hard Ticket을 포함한 Investigation Coverage `0.0%` 사례 확인
- NEW SHIFT History 초기화 확인
- 자동 Incident 생성과 Shift 종료 후 Timer cleanup 확인
- 375px 모바일 viewport에서 History Modal 수평 overflow 없음
- 브라우저 콘솔 JavaScript error 0개

## 15. 다음 추천 버전

### v0.9 — Persistent Operations Archive & RCA Export

1. LocalStorage schema version을 두고 Shift History를 영구 보존한다.
2. CURRENT SHIFT와 ARCHIVED SHIFT를 분리해 날짜/Category/SLA 검색을 추가한다.
3. `buildIncidentReport()` 결과를 JSON 또는 Markdown RCA로 export한다.
4. History pagination과 Shift 간 Category trend를 추가한다.
5. 저장 데이터 migration과 corrupt data 복구 테스트를 추가한다.
