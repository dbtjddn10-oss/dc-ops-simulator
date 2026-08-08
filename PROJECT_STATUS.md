# DC OPS: NIGHT SHIFT — Project Status

최종 업데이트: 2026-08-08  
현재 버전: **v0.9 — Persistent Shift Archive & Operations Records**

외부 라이브러리나 설치 과정 없이 `index.html`을 열어 실행하는 데이터센터 야간 운영 시뮬레이션 웹게임이다.

## 1. 현재 버전

**v0.9 — Persistent Shift Archive & Operations Records**

v0.8의 15종 Incident, EASY/NORMAL/HARD, Queue, SLA, Diagnosis/Action, Linux Terminal, Hard Investigation Gate, Current Shift Incident History, Timeline, RCA, Category Analytics와 Operator Summary를 유지한다.

v0.9는 완료된 Shift를 독립 Snapshot으로 만들어 브라우저 LocalStorage에 저장하고 과거 교대 기록을 조회하는 Shift Archive를 추가했다.

```text
CURRENT SHIFT
현재 실행 중인 Rack, Queue, Timer, Terminal, Incident History

SHIFT ARCHIVE
종료가 확정된 과거 Shift Snapshot의 영구 기록
```

NEW SHIFT는 Current Shift만 초기화하며 Archive는 삭제하지 않는다.

## 2. LocalStorage Schema

저장 key:

```text
dcOpsShiftArchive
```

현재 저장 구조:

```js
{
  schemaVersion: 1,
  nextShiftSequence: 4,
  shifts: [/* latest Shift first */]
}
```

- `CURRENT_SCHEMA_VERSION`: 1
- `MAX_ARCHIVED_SHIFTS`: 50
- 50개를 초과하면 가장 오래된 Shift부터 제외
- `nextShiftSequence`로 `SHIFT-0001`, `SHIFT-0002` 형식의 ID 생성
- 미래의 지원하지 않는 schema를 발견하면 읽거나 덮어쓰지 않고 안전하게 보존

## 3. storage.js 역할

LocalStorage 직접 접근은 `storage.js`에 격리했다.

- `loadArchive()`
- `saveArchive()`
- `addShiftRecord()`
- `deleteShiftRecord()`
- `clearArchive()`
- `validateArchive()`
- `isValidShiftRecord()`

처리 원칙:

- JSON parse 실패: 빈 Archive fallback과 console warning
- 잘못된 root/schema: 게임 실행을 막지 않고 안전하게 무시
- 손상된 개별 Shift: 전체 Archive 대신 해당 Record만 제외
- 중복 Shift ID: 최신 Record 하나만 유지
- LocalStorage 접근/용량 오류: Shift Report는 유지하고 작은 안내와 warning 표시
- 지원하지 않는 미래 schema: v1 데이터로 자동 덮어쓰지 않음

## 4. Shift Snapshot

`endShift()`가 통계를 확정한 뒤 `Analytics.createShiftSnapshot()`으로 저장에 필요한 값만 복사한다. `game` 전체, Timer ID, DOM 상태는 저장하지 않는다.

저장 항목:

- Shift ID, schemaVersion, 시작/종료/지속 시간, 난이도, 종료 이유
- Grade, Final Score, Availability
- Generated, Resolved, Unresolved
- SLA Breach/Compliance, Average MTTR
- Diagnosis/Action Accuracy
- Investigation Coverage, Commands/Useful/Invalid
- Category Analytics Snapshot
- Operator Summary Snapshot
- Resolved Incident History
- Unresolved Ticket Summary

Manual END SHIFT와 Timer 종료 모두 `archiveCompletedShift()` 한 경로를 사용한다. `shift.archived` guard로 한 Shift가 중복 저장되지 않게 한다.

## 5. Archive Incident Data Size

Resolved Ticket의 v0.8 Snapshot에서 과거 RCA 복원에 필요한 필드만 다시 압축한다.

보존:

- Ticket/Incident ID, Title, Category, Severity, Rack, Difficulty
- Symptom, Root Cause, Recovery Action
- 생성/해결 시각, MTTR, SLA 상태와 Awarded Score
- Terminal command, valid/useful, timestamp, simulated output
- Evidence와 Ticket eventHistory

제외:

- diagnosis/action option 배열
- 이전 Rack metrics
- Incident 전체 `diagnosticCommands` 사전

개별 Terminal output은 최대 4,000자로 제한한다. 저장 실패가 발생해도 현재 게임과 Shift Report는 계속 동작한다.

## 6. Shift Archive UI

`SHIFT ARCHIVE` 버튼은 Current Shift의 `INCIDENT HISTORY`와 별도다.

- Archive 목록은 `endedAt` 기준 최신순
- 표시: Shift ID, 날짜, Difficulty, Grade, Score, Resolved/Generated, SLA Compliance, Average MTTR
- Difficulty Filter: ALL / EASY / NORMAL / HARD
- Grade Filter: ALL / S / A / B / C / D / F
- Empty State: `NO ARCHIVED SHIFTS`
- Close, Escape, backdrop click 지원
- Desktop 2열 목록/상세와 모바일 1열 구조

## 7. Shift Detail

선택한 Snapshot 자체의 저장 데이터를 사용하며 현재 게임 값으로 재계산하지 않는다.

- SHIFT SUMMARY: Started, Ended, Duration, Difficulty, End Reason, Grade, Score, Availability
- OPERATIONS: Generated, Resolved, Unresolved, SLA Breached/Compliance, MTTR
- ACCURACY: Diagnosis, Action
- INVESTIGATION: Commands, Useful, Invalid, Coverage
- CATEGORY PERFORMANCE
- OPERATOR SUMMARY
- PREVIOUS SHIFT COMPARISON
- RESOLVED INCIDENT RECORDS
- UNRESOLVED AT SHIFT END

## 8. Archive Incident History

과거 Shift의 Resolved Incident를 선택하면 v0.8의 `buildIncidentDetailMarkup()`을 재사용한다.

- Ticket, Category, Severity, Rack
- MTTR와 SLA result
- Command/Evidence Summary
- Terminal Evidence Detail
- Root Cause와 Recovery
- 실제 timestamp 기반 Timeline
- 규칙 기반 RCA와 Lessons Learned

Archive 목록 → Shift Detail → Incident Detail 순서로 단계적으로 이동하며 별도의 중첩 Modal을 만들지 않는다.

## 9. Unresolved Incident Snapshot

Shift 종료 시 Open Ticket은 간단한 Summary로 저장한다.

- Ticket/Incident ID와 Title
- Category, Severity, Difficulty, Rack
- 생성 시각과 종료 당시 stage
- SLA Breached 여부
- Evidence 수와 required Evidence

과거 Shift에서 해결되지 않은 상태로 교대가 끝났다는 사실을 확인할 수 있다.

## 10. Category와 Operator Snapshot

Category별로 다음 결과를 저장 시점 그대로 보존한다.

- Generated
- Resolved
- SLA Breached
- SLA Compliance
- Average MTTR

Operator Summary의 `STRONG`, `NEEDS IMPROVEMENT`, 현재 게임 Shift만 평가한다는 안내 문구도 Snapshot에 저장한다.

## 11. Previous Shift Comparison

선택 Shift와 바로 이전의 더 오래된 Shift를 비교한다.

- Score: 높을수록 개선
- SLA Compliance: 높을수록 개선
- Average MTTR: 낮을수록 개선
- Diagnosis Accuracy: 높을수록 개선

숫자 delta와 함께 `IMPROVED`, `DECLINED`, `UNCHANGED` 텍스트를 표시한다. MTTR에는 `lower is better`, 나머지에는 `higher is better` 안내를 함께 표시해 부호만으로 오해하지 않게 한다.

## 12. Personal Best

현재 브라우저 LocalStorage의 시뮬레이션 Archive에서 계산한다.

- Highest Score
- Best SLA Compliance
- Fastest Average MTTR

해결 Incident가 없는 Shift는 Fastest Average MTTR 후보에서 제외한다. 실제 고용이나 직무 능력 평가가 아니라 이 브라우저의 게임 기록임을 UI에 명시한다.

## 13. Archive Delete와 Clear

- `DELETE SHIFT`: 선택한 Shift 한 건만 confirmation 후 삭제
- `CLEAR ALL RECORDS`: Archive 전체를 confirmation 후 삭제
- Cancel 시 데이터 유지
- 삭제 후 목록, Detail, Filter와 Personal Best를 즉시 다시 렌더링
- NEW SHIFT와 Archive Clear는 완전히 다른 동작

## 14. 자동 테스트

외부 테스트 프레임워크 없이 `tests/run-tests.js`를 실행한다. MemoryStorage adapter로 Node에서도 LocalStorage 흐름을 검사한다.

검사 대상:

- v0.8 Catalog/Pool/History/RCA/Analytics 회귀
- Archive empty load와 Save/Load
- root/schema/개별 Shift validation
- corrupted JSON과 unsupported schema
- 미래 schema 비덮어쓰기
- Shift Snapshot과 저장 데이터 압축
- Terminal output 크기 제한
- 고유 Shift ID와 중복 ID 제외
- 최대 50개 제한
- Delete/Clear
- 최신순, Difficulty/Grade Filter 기반 순수 로직
- Previous Shift Comparison과 MTTR 방향
- Personal Best
- Current Shift reset이 Archive adapter를 지우지 않는 구조

## 15. 프로젝트 파일 구조

```text
dc-ops-simulator/
├── index.html          # Current Shift, History, Archive/Report Modal UI
├── styles.css          # NOC 디자인과 History/Archive 반응형 레이아웃
├── incidents.js        # 15종 Incident Catalog와 validation
├── storage.js          # LocalStorage schema, validation, CRUD와 50개 제한
├── analytics.js        # RCA, Shift Snapshot, Comparison, Personal Best 순수 로직
├── app.js              # 게임 엔진, 종료 저장 흐름과 Archive UI 연결
├── tests/
│   └── run-tests.js    # 설치 없는 Node 자동 테스트
└── PROJECT_STATUS.md
```

## 16. Known Issues

Persistence 핵심과 직접 관련 없는 기존 작은 문제는 유지했다.

- 진행 중인 RUNNING Shift는 새로고침 후 복구되지 않는다. 새로고침 시 Current Shift는 초기화되지만 완료된 Shift Archive는 유지된다.
- Archive는 브라우저 LocalStorage 범위다. 브라우저 데이터 삭제, private mode 종료, 다른 브라우저/기기에서는 공유되지 않는다.
- 지원 schema는 현재 v1뿐이며 실제 migration 변환은 아직 없다.
- Archive import/export와 cloud sync 기능은 없다.
- Difficulty별 Score 배율과 Score 카드의 초기 `복구 시 +100 PTS` 문구가 일치하지 않는다.
- Terminal의 `clear` 명령도 RUNNING 중 `commandsExecuted`에 포함된다.
- ping/curl/nslookup은 target별 모든 세부 경우를 재현하지 않는 학습용 시뮬레이션이다.
- Incident/SLA/점수/자동 생성 간격은 추가 플레이 테스트 후 밸런스 조정이 필요하다.
- 자동 Incident가 모든 Rack을 채운 뒤에도 예약 시점마다 가용 Rack을 확인해 경고 Log가 남을 수 있다.
- 점수의 최솟값 제한이 없어 음수가 될 수 있다.
- 백그라운드 탭에서는 화면 갱신이 늦어질 수 있지만 시간 계산은 `Date.now()` 기준이다.
- Terminal은 실제 Linux shell의 권한, pipe, redirect, option 전체를 구현하지 않는다.
- Archive 검색, pagination과 다중 Shift trend chart는 없다.

## 17. 검증 결과

- JavaScript 문법 검사 통과: `incidents.js`, `storage.js`, `analytics.js`, `app.js`, `tests/run-tests.js`
- HTML ID 중복 0, `app.js` DOM selector 누락 0
- `git diff --check` 오류 0
- 자동 테스트 **32개 통과, 실패 0개**
- Incident Catalog 15종, Category 각 3종, Pool EASY 7 / NORMAL 12 / HARD 15 확인
- Manual/Automatic END SHIFT가 동일 Archive 경로에서 Shift를 1회만 저장하는 것 확인
- SHIFT-0001 → SHIFT-0002 고유 ID 증가와 최신순 정렬 확인
- 새로고침과 NEW SHIFT 후 Archive 유지 확인
- Archive Difficulty/Grade Filter 확인
- Shift Summary, Operations, Accuracy, Investigation과 Category/Operator Snapshot 확인
- Unresolved Ticket 6건의 종료 Snapshot 확인
- Previous Shift Comparison과 Personal Best 확인
- Archive Incident의 RCA, Timeline, Terminal Evidence 재사용 확인
- 단일 Delete Cancel/Confirm과 Clear All confirmation 확인
- Current Incident History, RCA, Timeline 회귀 확인
- Hard Investigation Gate 유지 확인
- Timer cleanup과 중복 Archive 방지 확인
- 375px 모바일 viewport에서 Archive 수평 overflow 없음
- Archive Modal Escape/backdrop 닫기 확인
- 브라우저 콘솔 JavaScript error 0개

## 18. 다음 추천 버전

### v1.0 — Portable Archive & Storage Migration

1. Archive JSON/Markdown export와 검증된 JSON import를 추가한다.
2. schema v1 → v2 migration runner와 rollback-safe 테스트를 추가한다.
3. Shift pagination, 날짜 검색과 Category trend chart를 추가한다.
4. 선택적인 RUNNING Shift recovery를 별도 key와 짧은 checkpoint로 구현한다.
5. LocalStorage adapter 경계를 재사용해 DynamoDB/API adapter로 교체 가능한 비동기 repository interface를 설계한다.
