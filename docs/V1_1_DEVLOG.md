# DC OPS: NIGHT SHIFT — v1.1 Development Log

최종 업데이트: **2026-08-09**

개발 Branch:

```text
feature/v1.1-floor-mode
```

Production:

```text
v1.0 Stable
```

Development:

```text
v1.1 Floor Mode Preview
```

---

# 1. 이 문서의 목적

이 문서는 `DC OPS: NIGHT SHIFT`의 v1.1 Floor Mode를 개발하면서 발생한 문제, 기술적 판단, 구조 변경과 검증 과정을 기록합니다.

README가 프로젝트의 현재 기능과 사용 방법을 설명한다면, 이 문서는 다음 질문에 답하는 것을 목표로 합니다.

```text
왜 Dashboard를 Game Scene으로 바꿨는가?

왜 DOM Floor를 Phaser로 Migration했는가?

왜 처음 만든 Asset을 다시 교체했는가?

왜 Visual Sprite와 Collision Body를 분리했는가?

왜 Persistent UI를 Popup 구조로 바꿨는가?

왜 Recovery 이후 Verification 단계를 추가했는가?

어떤 Regression을 확인하면서 기존 기능을 유지했는가?
```

v1.1 개발의 핵심은 새로운 기능을 많이 추가하는 것보다, 기존 v1.0 Incident Response Logic을 유지하면서 사용자가 직접 Data Center Floor를 이동하고 장애를 조사하는 경험으로 전환하는 것이었습니다.

---

# 2. 시작점 — v1.0 Dashboard Simulator

v1.0은 Dashboard 기반 Incident Response Simulator였습니다.

사용자는:

```text
Incident 생성
→ Rack 선택
→ Terminal 조사
→ Evidence
→ Diagnosis
→ Recovery
→ Incident History
```

흐름을 Browser UI에서 수행할 수 있었습니다.

또한 다음 기능이 이미 구현되어 있었습니다.

- Incident Catalog
- Easy / Normal / Hard Difficulty
- SLA Timer
- Score
- Safe Simulated Terminal
- Evidence
- Diagnosis
- Recovery Action
- Incident History
- RCA
- MTTR
- Shift Archive
- LocalStorage
- Automated Regression Test
- GitHub Actions
- AWS Static Hosting

기능적으로는 Incident Response Workflow를 표현할 수 있었지만, 실제 사용 경험은 여전히 관리용 Dashboard에 가까웠습니다.

v1.1에서는 이 기존 Logic을 버리지 않고 **“운영자가 Data Center Floor를 직접 돌아다니며 장애를 조사한다”**는 경험을 추가하는 것을 목표로 했습니다.

---

# 3. v1.1 초기 목표

초기 목표는 단순했습니다.

```text
Player
→ Data Center Floor 이동
→ 장애 Rack 발견
→ Rack 접근
→ E Interaction
→ 기존 Terminal / Incident Logic 연결
```

중요한 원칙은:

```text
새 Game Scene 때문에
기존 Incident Engine을 다시 만들지 않는다.
```

였습니다.

따라서:

```text
app.js
```

는 계속 Shift, Incident, SLA, Score, Terminal, Diagnosis, Recovery 등 Application State의 Source of Truth 역할을 유지하도록 설계했습니다.

Game Engine은 Rendering과 Movement 중심으로 제한하고, 기존 Business Logic을 최대한 재사용하는 방향으로 개발했습니다.

---

# 4. 첫 번째 Floor — DOM / CSS Grid Prototype

초기 Floor Mode는 HTML과 CSS Grid를 이용해 구현했습니다.

Player는 Grid Cell을 이동했고 Rack과 Equipment도 DOM Element로 배치했습니다.

이 방식은 Prototype을 빠르게 만드는 데는 적합했습니다.

하지만 실제 플레이 과정에서 몇 가지 문제가 드러났습니다.

```text
방향키 입력
→ 한 Tile 이동
→ CSS Transition
→ 다음 입력
```

방식이어서 Player Movement가 게임처럼 자연스럽지 않았습니다.

특히:

- 이동 속도가 느림
- 연속 이동 느낌 부족
- Key Hold가 자연스럽지 않음
- Object 앞뒤 Depth 표현 어려움
- Equipment Collision 표현 제한
- Scene 전체가 Dashboard Widget처럼 보임

문제가 있었습니다.

기능은 동작했지만 원하는 결과는 **“게임화된 데이터센터 운영 Simulator”**였기 때문에 Rendering Layer를 다시 검토했습니다.

---

# 5. Phaser Migration 결정

DOM Floor를 계속 보정하는 대신 Floor Scene만 Phaser로 Migration하기로 결정했습니다.

사용한 Version:

```text
Phaser 3.90.0
```

Phaser는 CDN Runtime Dependency 대신 Repository에 Vendoring하여 사용했습니다.

Migration 범위는 의도적으로 제한했습니다.

```text
Phaser
├─ Floor Rendering
├─ Player Movement
├─ Animation
├─ Collision
├─ Depth
├─ Nearby Asset Detection
└─ E Interaction
```

기존:

```text
app.js
incidents.js
analytics.js
storage.js
DOM HUD
```

는 유지했습니다.

즉 전체 Application을 Game Engine으로 다시 만드는 대신:

```text
DOM Application
        ↕
Bridge
        ↕
Phaser Floor Scene
```

구조를 선택했습니다.

이 방식으로 기존 v1.0의 안정된 Incident Logic을 재사용하면서 Floor Gameplay만 개선할 수 있었습니다.

---

# 6. Continuous Movement

Phaser Migration 이후 Player Movement는 Tile Step이 아닌 Continuous Movement 방식으로 변경했습니다.

현재 기준:

```text
PLAYER_SPEED = 270
```

지원 방향:

```text
UP
DOWN
LEFT
RIGHT
```

Diagonal Movement는 의도적으로 사용하지 않았습니다.

Key를 누르고 있는 동안 계속 이동하며, Key Release 시 즉시 정지합니다.

이를 통해 초기 DOM Prototype의:

```text
이동
→ 멈춤
→ 이동
→ 멈춤
```

느낌을 크게 줄였습니다.

---

# 7. Collision 문제

초기 Game Asset 전체 크기를 그대로 Collision Body로 사용할 경우 문제가 발생했습니다.

예를 들어 Rack Sprite에는:

```text
Rack 본체
Shadow
Visual Margin
```

이 포함될 수 있습니다.

이 전체 영역을 Collision으로 사용하면 Player가 Rack에서 지나치게 멀리 떨어져 움직이게 됩니다.

따라서 Visual Size와 Collision Size를 분리했습니다.

```text
Visual Sprite
≠
Physics Footprint
```

Equipment는 실제 Floor에 닿는 부분만 Collision 기준으로 사용했습니다.

Player 역시 Character Sprite 전체가 아니라 발 위치 주변의 작은 Physics Body를 사용합니다.

---

# 8. Foot Anchor와 Depth

Data Center Floor에서 Player가 Rack 앞 또는 뒤를 이동할 때 자연스럽게 보이려면 Object의 중심점보다 **바닥에 닿는 위치**가 중요합니다.

이를 위해 각 Asset에 Foot 기준점을 적용했습니다.

대표 Origin:

```text
originX = 0.5
originY = 0.92
```

Depth 역시 Object의 Foot Y Position을 기준으로 계산합니다.

따라서 Player가 Object보다 아래쪽에 위치하면 앞쪽에 Rendering되고, 위쪽에 위치하면 뒤쪽에 Rendering되는 구조를 사용할 수 있습니다.

이 구조는 Visual Layer와 Gameplay Layer를 분리하는 중요한 기준이 되었습니다.

---

# 9. 첫 번째 Asset 문제

Phaser 적용 이후에도 Scene이 원하는 수준으로 보이지 않는 문제가 있었습니다.

초기 Equipment와 Rack Asset은 3/4 Perspective에 가까운 형태였습니다.

하지만 Floor Layout 자체는 정면 중심이었습니다.

그 결과:

```text
Room
→ 정면

Rack
→ 약간 회전

Equipment
→ 다른 Perspective

Player
→ 또 다른 방향
```

처럼 서로 다른 시점의 이미지가 한 Scene에 들어간 느낌이 발생했습니다.

기술적으로는 정상적으로 Rendering되었지만 시각적으로는 하나의 게임처럼 보이지 않았습니다.

---

# 10. Front-facing Asset 방향 결정

문제를 해결하기 위해 주요 Data Center Asset을 **Front-facing Style**로 통일하기로 했습니다.

새 Visual Pack:

```text
ops-front-v2
```

주요 목표:

- Rack 정면
- Equipment 정면
- 동일한 시각적 비율
- 동일한 Foot Baseline
- Player와 Equipment Perspective 통일
- Runtime Transform 최소화

---

# 11. ops-front-v2 구성

현재 Visual Pack은 다음과 같이 구성됩니다.

## Rack

```text
rack-normal.png
rack-warning.png
rack-critical.png
```

## Equipment

```text
ups.png
pdu-a.png
pdu-b.png
crac.png
```

## Operator Idle

```text
idle-down.png
idle-up.png
idle-left.png
idle-right.png
```

## Operator Walk

각 방향:

```text
walk-1
walk-2
walk-3
walk-4
```

총 4-direction Walk Animation을 사용합니다.

---

# 12. Runtime Mirroring 제거

초기 Character 처리에서는 좌우 방향을 CSS 또는 Runtime `scaleX()` 방식으로 처리할 수도 있었습니다.

하지만 Sprite 방향과 Foot Alignment를 보다 명확하게 관리하기 위해 LEFT와 RIGHT Asset을 별도 PNG로 유지했습니다.

LEFT Asset은 Asset 생성 단계에서 만들어지며 Runtime에서는 별도 Texture로 사용합니다.

이를 통해 Runtime Transform 때문에 발생할 수 있는:

- Character 방향 오류
- Anchor 불일치
- Collision 기준 혼란

을 줄였습니다.

---

# 13. Asset Generation Script

Source Sheet에서 Game Asset을 반복해서 수작업 Crop할 경우 수정 과정에서 크기와 위치가 달라질 수 있습니다.

이를 줄이기 위해 Asset Generation Script를 만들었습니다.

```text
scripts/build-ops-front-v2-assets.py
```

입력:

```text
assets/v1.1/source/
```

출력:

```text
assets/v1.1/ops-front-v2/
```

Script는 정해진 Crop 영역과 Normalization 기준을 사용해 Asset을 재생성합니다.

즉 Visual Asset도 가능한 범위에서 재현 가능한 Pipeline으로 관리하도록 했습니다.

---

# 14. Environment Clean Plate

Data Center Room Background는 Phaser Logical World에 맞춰 사용합니다.

Logical World:

```text
1440 × 640
```

Room Background는 Floor Tile, Wall, Lighting, Equipment Placement를 고려해 Scene 전체의 Base Layer 역할을 합니다.

Equipment와 Player는 이 Background 위에서 별도의 Phaser Object로 Rendering됩니다.

이를 통해 Background Decoration과 Gameplay Object를 분리했습니다.

---

# 15. UI가 다시 Dashboard처럼 보이는 문제

Floor Scene을 Phaser로 변경했지만 초기 v1.1 UI에는 많은 Panel이 동시에 표시되었습니다.

예:

- Controls
- Operator Selection
- Persistent Terminal
- Mini Map
- Objectives
- Active Incident Panel
- Bottom Status Panel

기능은 많았지만 실제 화면에서는:

```text
Game Scene
+
Dashboard
+
Dashboard
+
Dashboard
```

처럼 보였습니다.

게임 화면을 만들었는데 여전히 기존 Dashboard의 구조가 화면 대부분을 차지하는 문제가 발생했습니다.

---

# 16. Scene-first UI 결정

이 문제를 해결하기 위해 UI 방향을 다음과 같이 변경했습니다.

```text
게임 Scene은 항상 중심
필요한 정보는 필요할 때만 표시
```

제거 또는 축소:

- Persistent Controls Panel
- Operator Selector
- Persistent Terminal
- Mini Map
- Persistent Objectives
- Bottom Dashboard Row
- Permanent Active Incident Column

대신 Scene 내부에서 필요할 때 여는 Popup 구조로 변경했습니다.

---

# 17. Popup Architecture

현재 Scene Popup State:

```text
none
terminal
objectives
incident
diagnosis
recovery
```

Popup은 동시에 하나만 표시합니다.

예:

```text
Terminal Open
→ Incident Popup 자동으로 같이 뜨지 않음
```

`ESC` 입력 시 현재 Popup을 닫고 Phaser Floor에 Focus를 돌려줍니다.

이 구조는 UI 복잡도를 줄이는 것뿐 아니라 Keyboard Focus 관리에도 도움이 되었습니다.

---

# 18. Active Incident UI 변경

기존에는 Active Incident가 오른쪽에 큰 Permanent Column으로 존재했습니다.

1920×1080에서도 이 Column이 상당한 폭을 차지했고 Floor Scene은 화면 전체를 사용하지 못했습니다.

이를 작은 HUD Button으로 변경했습니다.

```text
진행 중인 장애 [1]
```

Incident가 있을 경우 상태를 강조하고, 클릭하면 Scene 내부 Incident Popup이 열립니다.

Popup에는:

- Rack
- Severity
- Status
- SLA
- Ticket
- Category
- Investigation Hint

등을 표시합니다.

---

# 19. Full-height Floor 문제

UI Panel을 제거한 뒤에도 Floor Scene 아래에 큰 빈 공간이 남는 문제가 있었습니다.

1920×1080 기준 초기 Scene Wrapper는 약:

```text
1482 × 660
```

수준이었고 Scene 아래 공간을 충분히 활용하지 못했습니다.

Layout 구조를 다시 정리하여 Floor Mode가 `100dvh`에 가깝게 Viewport를 사용하도록 변경했습니다.

수정 후 Desktop Scene Wrapper는 약:

```text
1890 × 977
```

수준까지 확대되었습니다.

Phaser Logical World:

```text
1440 × 640
```

은 변경하지 않았습니다.

이 덕분에 Collision / Position / Interaction Metadata를 다시 작성하지 않고 Display Area만 확대할 수 있었습니다.

---

# 20. Terminal Popup 전환

기존 Persistent Terminal을 제거하고 Rack 근처에서 `E`를 누르면 Terminal Popup이 열리는 방식으로 변경했습니다.

Flow:

```text
Player
→ Rack 접근
→ E
→ 해당 Rack 선택
→ Terminal Popup
```

기존 Terminal Command Engine을 그대로 사용하므로 Phaser가 실제 Terminal Logic을 처리하지는 않습니다.

---

# 21. Rack별 Terminal Session

Terminal History는 Rack별로 유지됩니다.

예:

```text
R01

help
ping 127.0.0.1
systemctl status nginx
journalctl -u nginx
```

R02:

```text
df -h
```

이후 R01으로 다시 돌아가면 R01에서 실행했던 명령과 Output이 복구됩니다.

이 구조는 여러 Rack을 조사하는 Operations Workflow를 표현하기 위해 유지했습니다.

---

# 22. Terminal Scroll Bug

Rack별 History가 정상적으로 저장되었지만 새로운 문제가 있었습니다.

재현:

```text
R01
→ 여러 Command 실행

R02
→ Command 실행

다시 R01
→ History는 복원되지만
→ Terminal이 가장 오래된 Output 위치에서 열림
```

사용자는 매번 Terminal 아래까지 직접 Scroll해야 했습니다.

---

# 23. Terminal Scroll Root Cause

처음에는 단순히:

```javascript
scrollTop = scrollHeight
```

를 사용했습니다.

그러나 Popup이 Hidden 상태에서 History를 다시 Render한 직후 실행되면 Layout Height가 아직 최종 계산되지 않은 경우가 있었습니다.

즉:

```text
History Render
→ 바로 scrollHeight 읽기
→ 실제 Popup Layout 아직 미완료
```

가 문제였습니다.

---

# 24. Terminal Scroll Fix

Terminal Open / Rack Switch / History Restore 시 Layout이 완료된 이후 Scroll하도록 변경했습니다.

핵심 방식:

```text
requestAnimationFrame
→ requestAnimationFrame
→ scroll to latest
```

또한 New Command Output 이후에도 최신 Output으로 Scroll합니다.

반대로 사용자가 직접 Terminal을 위로 Scroll하여 이전 기록을 보는 경우에는 일반 UI Update가 Scroll 위치를 강제로 아래로 이동시키지 않도록 했습니다.

---

# 25. Keyboard Focus 문제

Terminal Input에서 다음 키는 중요한 의미를 가집니다.

```text
Space
Arrow Up
Arrow Down
```

하지만 Floor Gameplay에서도 Arrow Key와 `E`를 사용합니다.

따라서 Terminal Input에 Focus가 있을 때 Game Input을 차단해야 했습니다.

현재:

```text
Terminal Focus
→ Arrow / E Player Input 차단
```

`ESC`:

```text
Terminal Close
→ Input Blur
→ Phaser Focus 복귀
```

로 처리합니다.

---

# 26. Incident Investigation을 Floor 안으로 이동

v1.1 초기에는 Floor에서 Rack까지 접근하고 Terminal 조사까지 가능했지만, 전체 Diagnosis / Recovery는 기존 v1.0 Dashboard에 의존하는 부분이 남아 있었습니다.

즉:

```text
Floor
→ Terminal 조사
→ Dashboard 이동
→ Diagnosis
→ Recovery
```

구조였습니다.

이 경우 Floor Mode가 독립된 Gameplay Mode라기보다 Dashboard로 들어가기 위한 Frontend처럼 느껴질 수 있었습니다.

따라서 Incident Response 전체를 Floor 안에서 끝내는 방향으로 변경했습니다.

---

# 27. 목표 Workflow

새 목표:

```text
Incident
→ Rack 접근
→ Terminal
→ Evidence
→ Diagnosis
→ Recovery
→ Verification
→ Resolve
```

기존 Incident Data와 Logic을 최대한 재사용했습니다.

새로운 Root Cause System이나 Recovery System을 다시 만들지 않았습니다.

---

# 28. Evidence → Diagnosis

Terminal에는 Investigation 상태를 보여주는 Compact Workflow Area를 추가했습니다.

예:

```text
EVIDENCE 0 / 2
```

Command 실행:

```text
ipmitool sensor
```

결과:

```text
EVIDENCE 1 / 2
```

추가 Command:

```text
uptime
```

결과:

```text
EVIDENCE 2 / 2
```

필요한 Evidence 조건을 만족하면:

```text
[ 진단하기 ]
```

버튼이 활성화됩니다.

Hard Incident에서는 필수 Evidence가 없으면 Diagnosis를 시작할 수 없습니다.

---

# 29. Diagnosis Popup

Diagnosis는 Scene Popup으로 표시합니다.

주요 정보:

```text
ROOT CAUSE DIAGNOSIS

Rack
Ticket
Symptom
Collected Evidence
Root Cause Options
```

Diagnosis Option은 기존 Incident의:

```text
diagnosisOptions
```

를 재사용합니다.

Wrong Diagnosis 역시 기존 Penalty / Feedback Logic을 유지합니다.

Correct Diagnosis 이후에는 Recovery 단계로 이동합니다.

---

# 30. Recovery Popup

Diagnosis 성공 이후 같은 Scene Workflow UI가 Recovery 단계로 전환됩니다.

Recovery Option:

```text
actionOptions
```

도 기존 v1.0 Incident Data를 재사용합니다.

Wrong Recovery:

```text
Penalty
→ Incident 유지
```

Correct Recovery:

v1.0 Dashboard에서는:

```text
Recovery
→ Resolve
```

하지만 v1.1 Floor Mode에서는:

```text
Recovery
→ Verification Pending
```

으로 변경했습니다.

---

# 31. Verification을 추가한 이유

단순히 Recovery Action 정답을 클릭했다고 장애가 해결되는 구조는 Quiz에 가까울 수 있습니다.

실제 운영 Workflow에서는 작업을 수행한 이후 시스템이 정상 상태로 돌아왔는지 확인하는 단계가 중요합니다.

따라서 Floor Mode에서는:

```text
Fix
≠
Resolved
```

로 설계했습니다.

대신:

```text
Recovery Action
→ Verification
→ Resolve
```

과정을 요구합니다.

---

# 32. Verification State

Recovery 성공 후:

```text
RECOVERY APPLIED
VERIFICATION PENDING
```

상태가 됩니다.

Incident는 아직 Active 상태입니다.

사용자는 다시 Terminal에서 정상 상태를 확인해야 합니다.

---

# 33. Verification Helper

Floor Verification Logic은 별도 Helper File로 분리했습니다.

```text
workflow.js
```

현재 역할:

- Verification State 생성
- Required Command 관리
- Completed Command 기록
- Verification Passed 판정

기존 `app.js`의 Incident Logic과 결합하지만 Verification Rule 자체는 작은 Helper로 분리했습니다.

---

# 34. 실제 End-to-End Browser Test

Floor Mode 전체 Workflow는 실제 Browser에서 한 Scenario를 통해 검증했습니다.

Viewport:

```text
1920 × 1080
```

Scenario:

```text
Rack:
R04

Category:
POWER

Incident:
Rack PDU Feed A Lost
```

---

# 35. Investigation

실행한 Command:

```text
ipmitool sensor
uptime
```

Evidence:

```text
2 / 2
```

Diagnosis가 활성화되는 것을 확인했습니다.

---

# 36. Diagnosis

선택한 Root Cause:

```text
Rack PDU Feed A Lost
```

정답 판정 후 Recovery 단계로 이동하는 것을 확인했습니다.

---

# 37. Recovery

선택한 Action:

```text
Redundant Feed Recovery Action
```

Recovery 이후 Incident가 즉시 Resolve되지 않고:

```text
RECOVERY APPLIED
VERIFICATION PENDING
```

상태를 유지하는 것을 확인했습니다.

---

# 38. Verification 실패 Case

먼저:

```text
uptime
```

을 실행했습니다.

이 Command는 해당 Incident의 필수 Verification 조건이 아니므로:

```text
VERIFICATION PENDING
```

상태가 유지되었습니다.

즉 아무 Command나 입력한다고 Incident가 종료되지 않는 것을 확인했습니다.

---

# 39. Verification 성공 Case

필수 Verification Command:

```text
ipmitool sensor
```

를 실행했습니다.

정상 상태 Output과 함께:

```text
VERIFICATION PASSED
INCIDENT RESOLVED
```

상태로 전환되었습니다.

---

# 40. Resolve 결과

Verification 완료 후 확인:

```text
Active Incident
1 → 0
```

Rack:

```text
Incident State
→ Healthy
```

Score:

```text
+156
```

또한:

- Incident History 생성
- Evidence 유지
- Terminal History 유지
- SLA 기록
- MTTR 기록
- Rack State 복구

를 확인했습니다.

---

# 41. SLA Breach 검증

해당 Scenario의 HARD SLA는 짧게 설정되어 있었고 수동 Browser Test 시간이 이를 초과했습니다.

따라서 최종 History에는:

```text
SLA BREACHED
```

로 기록되었습니다.

이는 Test를 위해 시간을 오래 사용했다고 해서 SLA 계산을 우회하지 않고 실제 경과 시간을 기준으로 기존 Logic이 계속 동작하고 있음을 보여줍니다.

---

# 42. Dashboard Compatibility

Floor Verification을 추가하면서 기존 v1.0 Dashboard의 동작을 깨뜨리지 않는 것도 중요했습니다.

기존 Dashboard:

```text
Evidence
→ Diagnosis
→ Recovery
→ Resolve
```

Floor Mode:

```text
Evidence
→ Diagnosis
→ Recovery
→ Verification
→ Resolve
```

Verification Gate는 Floor Mode Workflow에만 추가했습니다.

따라서 기존 v1.0 Dashboard의 즉시 Resolve 방식은 유지됩니다.

---

# 43. Regression Test 증가

v1.1 개발 과정에서 Automated Test 범위도 증가했습니다.

초기 Phaser Floor 단계에서는 약:

```text
50 checks
```

수준이었고, UI / Terminal / Floor Regression을 추가하면서:

```text
56 passed
```

까지 증가했습니다.

Floor Diagnosis / Recovery / Verification 구현 이후 현재:

```text
59 passed
```

상태입니다.

---

# 44. 현재 주요 Regression Coverage

현재 Test에서 확인하는 주요 영역:

- Incident Catalog
- Difficulty
- Score
- SLA
- Terminal Command Classification
- Evidence
- Diagnosis
- Recovery
- Verification
- Incident Resolve
- History
- RCA
- Storage Validation
- Shift Archive
- Floor Metadata
- Phaser Movement
- Collision
- Interaction
- Player Foot Anchor
- Terminal History
- Dashboard Compatibility
- DOM Fallback

---

# 45. Browser Regression

최근 확인한 주요 Browser 항목:

```text
Player Movement
Collision
E Interaction
Terminal Popup
Terminal History
Terminal Scroll
Space Input
Arrow / E Focus Isolation
Incident Popup
Objectives Popup
Diagnosis Popup
Recovery Popup
Verification
Score
SLA
History
```

결과:

```text
Browser Console Error: 0
Broken Image: 0
```

---

# 46. Responsive 확인

확인한 주요 Viewport:

```text
1920 × 1080
1440 × 1000
375 × 812
```

Phaser Logical World:

```text
1440 × 640
```

비율을 유지합니다.

따라서 Tall Viewport나 Mobile에서는 Letterboxing이 발생할 수 있습니다.

현재 Mobile은 Scene Fit까지만 지원하며 Touch Movement는 아직 구현하지 않았습니다.

---

# 47. DOM Fallback

Phaser가 정상적으로 사용되지 못하는 상황을 위한 Legacy DOM Floor를 유지했습니다.

Test Parameter를 이용해 DOM Renderer로 전환할 수 있으며, 기존 Floor Object와 Movement Logic이 Fallback으로 동작합니다.

이 구조는 Phaser Migration 중에도 기존 기능을 완전히 제거하지 않고 회귀 안전성을 유지하기 위한 선택이었습니다.

---

# 48. Git Development Strategy

v1.1 개발은 Production `main`에서 직접 진행하지 않았습니다.

Production:

```text
main
└─ v1.0 Stable
```

Development:

```text
feature/v1.1-floor-mode
```

방식으로 분리했습니다.

---

# 49. 첫 번째 v1.1 Checkpoint

Phaser Floor, Visual Asset과 UI 구조가 안정된 이후 첫 번째 Checkpoint를 만들었습니다.

Commit:

```text
e297674
```

Message:

```text
feat: checkpoint v1.1 phaser floor mode
```

이 Checkpoint에는:

- Phaser Floor
- ops-front-v2
- Player Animation
- Equipment Asset
- Scene-first UI
- Popup 구조
- Terminal 개선

등 당시 v1.1 상태가 포함되어 있습니다.

---

# 50. 두 번째 v1.1 Checkpoint

Floor Incident Response Workflow 구현 이후 두 번째 Checkpoint:

```text
7e6d703
```

Message:

```text
feat: add floor diagnosis recovery verification flow
```

변경 주요 File:

```text
app.js
index.html
styles.css
workflow.js
package.json
tests/run-tests.js
```

이 Commit에서:

```text
Evidence
→ Diagnosis
→ Recovery
→ Verification
→ Resolve
```

전체 Flow가 Floor Mode에 연결되었습니다.

---

# 51. Production을 바로 변경하지 않은 이유

v1.1은 아직 Preview입니다.

따라서:

```text
Feature Branch
→ 개발
→ Playtest
→ Regression
→ Documentation
→ Final Review
→ Pull Request
→ main
```

순서를 사용합니다.

v1.1이 완성되기 전에는 Production v1.0을 그대로 유지합니다.

---

# 52. 현재 가장 큰 기술적 결정

v1.1 개발에서 중요했던 결정은 다음과 같습니다.

## 기존 Logic 재사용

```text
Phaser에 Incident Engine을 다시 만들지 않는다.
```

## Visual / Physics 분리

```text
Sprite Size
≠
Collision Footprint
```

## Foot-based Depth

```text
Object Center가 아니라
Floor Contact Position 기준
```

## Scene-first UI

```text
항상 보이는 Panel 최소화
→ 필요한 UI만 Popup
```

## Recovery Verification

```text
Recovery Action 정답
≠
Incident Resolved
```

## Feature Branch

```text
Production v1.0
≠
개발 중 v1.1
```

---

# 53. 현재 Verification의 한계

현재 초기 Verification 구현은 Incident의 기존 Evidence / Useful Command 정보를 기반으로 Required Command를 생성합니다.

현재 방식은 최소 구현으로:

```text
첫 번째 유효 Evidence Command
→ Verification Required Command
```

형태입니다.

Gameplay 구조를 검증하기에는 충분하지만, 실제 운영 절차를 더 잘 표현하려면 Scenario별 Verification Rule이 필요합니다.

---

# 54. 다음 Verification 설계

향후 Incident Data에 다음과 같은 Metadata를 추가할 수 있습니다.

예:

```text
SERVER / Nginx

Verification:
systemctl status nginx
curl localhost
```

POWER:

```text
ipmitool sensor
```

STORAGE:

```text
df -h
```

DNS:

```text
nslookup
dig
```

이를 통해 장애 종류에 따라 실제 의미 있는 Post-Recovery Check를 요구하도록 확장할 예정입니다.

---

# 55. 남은 Gameplay 작업

현재 후속 범위:

- R07~R10 Incident Gameplay
- UPS Interaction
- PDU Interaction
- CRAC Interaction
- Facility-specific Incident
- Terminal Command Simulation 확대
- Incident별 Verification Command
- Post-Recovery Output 다양화

---

# 56. 남은 Visual 작업

현재 Visual 후속 범위:

- Environment Polish
- Lighting
- Shadow
- Camera / Letterboxing Composition
- Equipment 최종 Placement
- HUD 세부 Polish
- Popup Visual Polish

---

# 57. Mobile 후속 범위

현재 Mobile에서는 Phaser Scene을 Viewport에 Fit합니다.

아직 제공하지 않는 기능:

```text
Touch D-pad
Touch Interaction Button
Mobile-specific Camera
```

Desktop Portfolio 경험을 먼저 완성한 이후 별도 검토할 예정입니다.

---

# 58. 개발 과정에서 얻은 교훈

## 빠른 Prototype은 유용하지만 최종 구조는 아닐 수 있다

DOM Grid Floor는 아이디어를 빠르게 확인하는 데 도움이 됐지만, 원하는 Movement와 Game Feel을 만들기에는 한계가 있었습니다.

---

## 기능적으로 맞는 Asset이 시각적으로도 맞는 것은 아니다

3/4 Equipment Asset은 단독으로는 괜찮았지만 전체 Scene Perspective와 맞지 않았습니다.

Asset 자체의 품질뿐 아니라 모든 Object가 하나의 Scene에서 같은 Visual Language를 가져야 한다는 점이 중요했습니다.

---

## Game Rendering과 Business Logic을 분리하는 것이 중요하다

Phaser Migration 시 기존 Incident Logic까지 다시 작성했다면 Regression 위험이 크게 증가했을 것입니다.

Rendering / Interaction과 Incident State를 분리하면서 기존 기능을 유지할 수 있었습니다.

---

## UI가 많다고 정보 전달이 좋아지는 것은 아니다

Controls, Mini Map, Terminal, Objectives와 Incident Panel을 동시에 표시했을 때는 기능은 많았지만 Game Scene의 존재감이 줄었습니다.

필요한 정보만 Popup으로 제공하면서 Gameplay 중심 화면을 만들 수 있었습니다.

---

## Recovery 이후 Verification이 Gameplay 의미를 크게 높였다

Recovery Action 정답을 누르는 것으로 Incident가 끝나는 구조보다:

```text
Recovery
→ Terminal
→ Verification
→ Resolve
```

구조가 Incident Response Simulator의 목적과 훨씬 잘 맞았습니다.

---

# 59. Portfolio 관점에서 설명할 수 있는 부분

이 프로젝트는 단순한 2D 게임 제작이 아니라 다음 내용을 설명할 수 있는 Portfolio Project를 목표로 합니다.

```text
1. Incident Response Workflow를 어떻게 State로 모델링했는가

2. 기존 Dashboard Logic을 어떻게 Phaser Floor와 연결했는가

3. Collision과 Visual Sprite를 왜 분리했는가

4. Rack별 Terminal Session을 어떻게 유지하는가

5. Keyboard Focus Conflict를 어떻게 해결했는가

6. Recovery 이후 Verification을 왜 추가했는가

7. Regression Test로 기존 기능을 어떻게 보호했는가

8. Feature Branch로 Production v1.0과 v1.1을 어떻게 분리했는가

9. GitHub Actions와 AWS OIDC를 이용해 Production Hosting을 어떻게 구성했는가
```

---

# 60. 현재 Milestone

현재 v1.1에서 가장 중요한 Milestone은 다음 Flow가 실제로 연결된 것입니다.

```text
Data Center Floor 이동
        ↓
Incident Rack 탐색
        ↓
Rack 접근
        ↓
E
        ↓
Safe Simulated Terminal
        ↓
Evidence 수집
        ↓
Root Cause Diagnosis
        ↓
Recovery Action
        ↓
Verification Pending
        ↓
Terminal 정상 상태 확인
        ↓
Verification Passed
        ↓
Incident Resolved
```

이제 Floor Mode는 단순히 기존 Dashboard의 장식용 화면이 아니라, Incident Response 전체 Lifecycle을 수행할 수 있는 Gameplay Layer가 되었습니다.

---

# 61. Latest Status

```text
Project:
DC OPS: NIGHT SHIFT

Production:
v1.0 Stable

Development:
v1.1 Floor Mode Preview

Branch:
feature/v1.1-floor-mode

Latest Functional Checkpoint:
7e6d703

Automated Tests:
59 passed

Browser Console:
0 errors

Broken Images:
0

PLAYER_SPEED:
270

Phaser Logical World:
1440 × 640

APP_VERSION:
v1.0

UI:
V1.1 PREVIEW
```

---

# 62. Release 계획

현재 계획:

```text
v1.1 Gameplay Polish
        ↓
Scenario / Verification 개선
        ↓
Visual Polish
        ↓
Full Regression
        ↓
Documentation Review
        ↓
feature/v1.1-floor-mode
        ↓
Pull Request
        ↓
main
        ↓
v1.1 Production Release 검토
```

현재 v1.1은 아직 Production에 배포하지 않습니다.

---

# 63. 정리

v1.1 개발은 단순히 2D Floor 이미지를 추가하는 작업으로 시작했지만, 실제 개발 과정에서는:

```text
DOM Prototype
→ Phaser Migration
→ Continuous Movement
→ Physics Collision
→ Foot-based Depth
→ Asset Perspective Redesign
→ ops-front-v2 Pipeline
→ Scene-first UI
→ Popup Architecture
→ Terminal Session 개선
→ Terminal Scroll Fix
→ Evidence Workflow
→ Floor Diagnosis
→ Floor Recovery
→ Recovery Verification
```

과정을 거쳤습니다.

현재 구조는 기존 v1.0의 Incident Response Engine을 유지하면서 사용자가 직접 Data Center Floor를 이동하고 Linux-style Command를 이용해 장애를 조사하고, 진단하고, 복구하고, 검증하는 형태로 발전했습니다.

v1.1의 다음 목표는 이 핵심 구조를 유지하면서 Scenario 다양성, Verification 정확도와 Visual 완성도를 높이는 것입니다.