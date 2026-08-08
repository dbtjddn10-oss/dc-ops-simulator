# DC OPS: NIGHT SHIFT — Project Status

최종 업데이트: 2026-08-08  
현재 버전: **v0.10 — Production Readiness & Portfolio Polish**

외부 런타임 라이브러리나 빌드 과정 없이 브라우저에서 실행되는 데이터센터 Incident 대응 학습용 시뮬레이터다. 실제 Linux shell, 운영 인프라, backend, database 또는 AWS API와 연결되지 않는다.

## 1. v0.10 목표와 범위

v0.10은 대규모 기능 추가 대신 v0.9 기능을 안정화하고 공개 portfolio repository로서의 완성도를 높이는 버전이다.

- 기존 Known Issues 중 score, terminal 통계, full-rack 경고 문제 해결
- UI/접근성/modal/mobile 기본 품질 개선
- Portfolio용 한국어 중심 `README.md`와 실제 구조 기반 Mermaid diagram 정비
- `.gitattributes`, `.gitignore`, dependency-free `package.json` 추가
- GitHub Actions CI 추가
- 자동 테스트와 브라우저 회귀 범위 확장
- v1.0 AWS static deployment 준비

## 2. 해결된 Known Issues

### Score 안내와 실제 계산 일치

고정 문구 `복구 시 +100 PTS`를 제거했다. Idle 상태의 Score card는 선택한 Difficulty의 실제 multiplier를 표시한다.

```text
EASY   RECOVERY REWARD · DIFFICULTY ×0.85
NORMAL RECOVERY REWARD · DIFFICULTY ×1.00
HARD   RECOVERY REWARD · DIFFICULTY ×1.25
```

Incident마다 기본 score가 다르므로 하나의 예상 점수를 보여주지 않고 multiplier 자체를 정확히 안내한다.

### Negative Score 방지

모든 런타임 score 증감은 `Analytics.applyScoreDelta()`를 거치며 최저 0점을 적용한다. 미진단 복구, 오진, 잘못된 Action, SLA breach가 연속되어도 score가 음수가 되지 않는다.

### Terminal utility 통계 분리

`clear`와 `help`는 `UTILITY`, 허용된 조사 명령은 `INVESTIGATION`, 잘못된 명령은 `INVALID`로 분류한다. Utility 명령은 `commandsExecuted`에 포함하지 않는다. 잘못된 명령은 실행 시도와 invalid 통계에 포함한다.

### Full-Rack 자동 경고 dedupe

모든 Rack에 Incident가 있을 때 자동 scheduler는 해당 full 상태에서 경고를 한 번만 기록한다. 수동 생성 실패는 매번 사용자에게 안내한다. Rack 하나가 복구되어 capacity가 생기면 dedupe 상태를 reset하므로 다음 full 상태에서는 다시 한 번 경고한다.

### Target-bearing Terminal 출력

`ping`, `curl`, `nslookup`, `traceroute`에 explicit target이 있으면 기본 safe simulation output이 입력 target을 일관되게 표시한다. 실제 DNS/network stack을 구현한 것은 아니다.

### Modal 기본 관리

- Incident History와 Shift Archive를 동시에 열지 않음
- confirmation modal을 최우선 Escape 대상으로 처리
- 열린 modal 내부에서 Tab focus 순환
- modal이 열리면 body scroll 잠금
- 닫은 뒤 관련 trigger button으로 focus 복귀
- Shift Report가 열릴 때 다른 overlay 정리

## 3. UI와 접근성

- title과 meta description을 simulator 범위에 맞게 정리
- header에 `v0.10` build badge 표시; UI version은 `APP_VERSION`에서 설정
- 상태 범례는 색상과 한국어/영문 text를 함께 사용
- native `button`, 연결된 form label, dialog role, `aria-modal`, labelled/described dialog 유지
- 전체 interactive element에 명확한 `:focus-visible` outline 추가
- hover/disabled 상태와 modal/Archive card 간격 일관성 검토
- footer에 local simulation과 live-system 미접속 범위 표시
- 430px 이하 topbar/version/footer 보정과 기존 375px 단일-column layout 유지

## 4. Repository 문서와 정책

### README

`README.md`는 한국어 설명과 필요한 Technical Term을 함께 사용해 다음을 설명한다.

- Overview와 제작 동기
- Incident → Investigation → Evidence → Diagnosis → Recovery 흐름
- 15 Incident와 5 Category
- 실제 코드 구조 기반 Mermaid architecture
- Project structure, testing, local run
- safe simulated terminal 범위
- limitations, roadmap, version milestones

구현되지 않은 backend, AWS service, database 또는 live shell을 구현된 것처럼 표현하지 않는다.

### Line ending

`.gitattributes`는 JavaScript, HTML, CSS, Markdown, JSON, YAML을 repository에서 LF로 저장하도록 지정한다. 기존 전체 파일에 `git add --renormalize`를 수행하지 않아 line-ending-only 대규모 diff를 만들지 않는다.

### Ignore와 package metadata

`.gitignore`는 `node_modules/`, `.env`, `.env.*`, macOS/Windows metadata와 npm debug log를 제외한다. `package.json`에는 dependency 없이 `npm test`와 `npm run check` script만 있다.

## 5. GitHub Actions CI

`.github/workflows/ci.yml`은 다음 event에서 실행된다.

- `main` push
- pull request

Job은 Ubuntu와 Node.js 24 LTS를 사용하며 다음을 순서대로 실행한다. GitHub-hosted runner의 Node 20 action runtime deprecation warning을 피하기 위해 공식 문서의 현재 major인 `actions/checkout@v7`과 `actions/setup-node@v7`을 사용한다.

1. repository checkout
2. JavaScript syntax checks
3. dependency-free automated tests

배포 단계는 포함하지 않는다.

## 6. 자동 테스트

`tests/run-tests.js`는 Node built-in module만 사용하며 **36개 check**를 포함한다.

- Incident Catalog validation, unique ID, Category count
- Difficulty pool 7 / 12 / 15
- MTTR format, History sort/filter
- Category Analytics, Hard Investigation Coverage
- Score multiplier display consistency
- Score minimum 0
- Terminal utility/investigation/invalid 분류
- Full-Rack auto warning dedupe와 capacity reset
- RCA와 Operator Summary
- Archive empty/save/load/schema/corruption/future-schema 처리
- compact snapshot과 terminal output size limit
- Shift ID, duplicate 제거, 최대 50개 제한
- Delete/Clear, filter/sort
- Previous Shift Comparison과 MTTR 방향
- Personal Best
- Current Shift reset과 Archive 분리

검증 결과: **36 passed, 0 failed**

## 7. Browser Regression

확인 완료:

- v0.10 표시와 EASY/NORMAL/HARD multiplier
- START SHIFT, manual/automatic Incident
- full-rack auto warning 1회 및 Rack 복구 후 reset
- explicit terminal target, typed `clear`, score floor 0
- Diagnosis, Action, Recovery
- Hard Investigation Gate 0/2 → 2/2 unlock
- SLA breach와 Queue
- Incident History, Timeline, RCA
- automatic timer end와 manual confirmation end
- Report에서 `clear` 제외 command count
- NEW SHIFT 후 Archive 유지
- Archive Difficulty filter, Shift comparison, Personal Best
- Archive Incident RCA, 단일 Delete, Clear All, empty state
- modal Escape, focus 복귀, body scroll lock
- browser console error 0

현재 in-app browser는 1280px에서 실제 렌더링과 visual check를 완료했다. 정확한 375px iframe viewport 생성은 browser URL 보안 정책이 차단하여 이번 run에서는 재현하지 못했다. 기존 375px 회귀 결과와 CSS breakpoint를 유지했고 변경된 mobile rule은 정적 검토했다. v1.0 공개 배포 전 실제 375px device emulation을 한 번 더 수행하는 것을 권장한다.

## 8. 현재 파일 구조

```text
dc-ops-simulator/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── docs/
│   └── DEPLOYMENT.md
├── infra/
│   ├── cloudformation.yml
│   └── github-oidc.yml
├── tests/
│   └── run-tests.js
├── .gitattributes
├── .gitignore
├── analytics.js
├── app.js
├── incidents.js
├── index.html
├── package.json
├── PROJECT_STATUS.md
├── README.md
├── storage.js
└── styles.css
```

## 9. 유지되는 Known Issues / Limitations

- RUNNING Shift는 새로고침 후 복구되지 않는다.
- Archive는 현재 browser profile/origin의 LocalStorage 범위이며 기기 간 공유되지 않는다.
- schema v1 validation은 있지만 실제 migration runner는 없다.
- Archive import/export와 cloud sync가 없다.
- Terminal은 allowlist 기반 simulation이며 실제 shell, 권한, pipe, redirect, option 전체를 구현하지 않는다.
- DNS/network/process/hardware output은 교육용 simulation이다.
- background tab에서는 render timer가 일시 중지될 수 있다. elapsed time 계산은 `Date.now()` 기준이다.
- Archive pagination, 검색, 장기 trend chart가 없다.
- Incident 간격, SLA, penalty, grade는 더 넓은 playtest를 통한 tuning 여지가 있다.

## 10. Error Handling과 Data Safety

- LocalStorage unavailable, corrupted JSON, unsupported schema, corrupted record를 안전한 fallback으로 처리
- Archive 저장 실패가 Shift Report와 현재 게임을 중단하지 않음
- no available Rack, invalid terminal command, no selected Rack/Incident, empty History/Archive에 명시적 UI 제공
- API key, password, token, AWS/GitHub credential 없음
- repository 문서와 코드에 특정 사용자 PC의 절대 경로 없음
- `.env*`는 Git ignore 대상

## 11. Portfolio Readiness Review

| 항목 | 판단 | 이유 |
| --- | --- | --- |
| README clarity | READY | 목적, 범위, workflow, 실행법, 한계를 명시 |
| Code organization | NEEDS MINOR POLISH | 역할 분리는 명확하지만 `app.js`가 계속 큰 편 |
| Testability | READY | 핵심 규칙을 pure helper와 36개 regression check로 보호 |
| Git history continuity | READY | v0.7 → v0.8 → v0.9 → v0.10 milestone이 연속적 |
| Data-center relevance | READY | Incident, evidence, SLA, MTTR, RCA, category 흐름이 명확 |
| Simulation realism | NEEDS MINOR POLISH | 교육 목적에는 충분하지만 live shell/network는 아님 |
| UI completeness | READY | core workflow, report, history, archive, empty/error 상태 포함 |
| Deployment readiness | NEEDS MINOR POLISH | static build는 준비됐고 AWS 배포/공개 device 검증은 v1.0 범위 |

종합 판단: **NEEDS MINOR POLISH**. 기능과 repository는 portfolio 공개 직전 단계이며, v1.0에서 실제 hosted URL, 375px device emulation, 배포 문서와 release screenshots를 완료하면 된다.

## 12. 다음 추천 버전

### v1.0 — AWS Deployment & Portfolio Release

1. AWS static hosting 구조 선택과 최소 권한 배포
2. HTTPS, caching, error document, rollback 절차 문서화
3. 공개 URL에서 desktop/mobile smoke test
4. README screenshot과 짧은 operator walkthrough 추가
5. GitHub Actions에 배포를 추가할 경우 test 성공 이후에만 실행

v0.10 검증에서 즉시 별도 hotfix가 필요한 치명적 문제는 발견되지 않았다. 정확한 375px hosted/device 확인에서 layout regression이 발견될 경우에만 `v0.10.1`을 먼저 권장한다.

## 13. v1.0 Deployment Preparation

다음 준비 파일을 추가했다. 이 상태는 **배포 완료 또는 v1.0 release를 의미하지 않는다.**

- `infra/cloudformation.yml`: Private S3 REST origin, CloudFront, OAC, HTTPS redirect와 짧은 cache policy
- `infra/github-oidc.yml`: `dbtjddn10-oss/dc-ops-simulator`의 `production` environment로 제한한 GitHub OIDC trust와 최소 권한 deploy Role
- `.github/workflows/deploy.yml`: Node.js 24 syntax/test 성공 후에만 실행되는 수동 AWS deployment
- `docs/DEPLOYMENT.md`: bootstrap, GitHub Variables, smoke test, rollback, cleanup, 비용과 security 절차

Region, AWS identity, 기존 OIDC Provider와 CloudFormation `validate-template` 확인은 AWS CLI 설정 이후 진행한다. AWS CLI 설치와 인증, 사용할 Region과 Account 확인, Resource 생성 계획에 대한 사용자 승인이 다음 checkpoint다.

실제 AWS Resource 생성과 공개 URL 검증 전까지 UI `APP_VERSION`, `package.json`, 현재 버전 표시는 v0.10으로 유지한다. 배포 후 Desktop/Mobile smoke test와 정확한 375px Device Emulation을 통과한 뒤 README Live Demo, Version History와 v1.0 status를 갱신한다.
