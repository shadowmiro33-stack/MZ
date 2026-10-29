# 3D 사무실 (claude-3d-frog-office) — 구조와 약속

Claude Code 세션 하나하나를 사무실 캐릭터(개구리·카피바라)로 보여 주는 **보기 전용** 로컬 웹 화면.
어떤 IDE·터미널(VS Code, Cursor, JetBrains, iTerm, Windows Terminal …)에서 Claude 를 쓰든 동작해야 한다.
맥·윈도우(·리눅스) 공통. **외부 의존성 0** — Node.js 18+ 표준 라이브러리만 쓴다(npm install 불필요).

## 1. 폴더

| 경로 | 영역 | 내용 |
|---|---|---|
| `hooks/office-hook.mjs` | 백엔드 | Claude Code 훅 수신기 — 세션 카드 1파일 쓰기/지우기 |
| `server/*.mjs` | 백엔드 | 로컬 HTTP 서버, 스냅샷 조립, 대화 기록 꼬리 읽기, 생존 판정, 데모 데이터, 명부 입히기(staff.mjs), 설정 읽기·쓰기(config.mjs) |
| `scripts/*.mjs` | 백엔드 | setup(적용)·start·stop·status(doctor)·uninstall |
| `test/*.test.mjs` | 백엔드 | `node --test` 단위 시험 |
| `package.json` | 백엔드 | 의존성 없음. scripts: setup, start, stop, status, uninstall, demo, test |
| `web/*` | 화면 | 정적 화면(index.html·style.css·i18n.js·office-*.js·office/*.webp) + 관리자 모드(admin.html·admin.js·admin.css). 사무실 지도는 그림이 아니라 `office-world.js` 가 팀 목록으로 생성하고 `office-draw.js` 가 그린다(팀마다 방 하나 + 공용 방 + 회의실·서버실·탕비실·라운지) |
| `README*.md`, `CLAUDE.md`, `docs/*` | 문서 | 사용 설명·구조·스프라이트 교체 |


## 2. 데이터 흐름

```
Claude Code ──(훅: stdin JSON)──▶ hooks/office-hook.mjs ──▶ ~/.claude-office/sessions/<session_id>.json  (세션 카드)
                                                         ┌─▶ 세션 카드 + 생존 판정(pid)
브라우저 ◀──(3초 폴링 GET /api/office)── server/server.mjs ┼─▶ ~/.claude/projects/**/<session_id>.jsonl 꼬리 (지금 하는 일·로그)
                                                         └─▶ <session_id>/subagents/agent-*.jsonl (서브에이전트)
```

- 상태 폴더: 환경변수 `CLAUDE_OFFICE_HOME` 이 있으면 그것, 없으면 `~/.claude-office`.
- Claude 설정 폴더: 환경변수 `CLAUDE_CONFIG_DIR` 이 있으면 그것, 없으면 `~/.claude`.
- **훅이 없어도 동작해야 한다(대화 기록 대체 모드)**: 훅 카드가 없는 세션도 최근 N분 안에 바뀐 대화 파일
  (`<config>/projects/*/*.jsonl`, 한 단계 아래만 — subagents 폴더 제외)로 찾아 보여 준다. 이 경우 승인 대기는 감지 못 한다.

## 3. 세션 카드 (`sessions/<sid>.json`) — 훅이 쓴다

```json
{ "sessionId": "…", "kind": "working|decision|rest", "message": "승인 문구(decision 일 때)",
  "event": "UserPromptSubmit", "cwd": "/abs/path", "transcriptPath": "/abs/…jsonl",
  "pid": 12345, "pidStart": "Wed Oct 22 10:11:24 2026 (맥·리눅스만, 없으면 생략)",
  "compactTrigger": "manual|auto (PreCompact 때만)", "updatedAt": "2026-10-22T01:02:03.456Z" }
```

| 훅 이벤트 | kind | 비고 |
|---|---|---|
| SessionStart | rest | source=compact 이고 직전 카드의 compactTrigger≠manual 이면 아무것도 안 함(자동 압축 뒤엔 하던 일 계속) |
| UserPromptSubmit | working | |
| PreCompact | working | compactTrigger 기록 |
| Notification | decision 또는 rest | notification_type ∈ {permission_prompt, worker_permission_prompt, agent_needs_input, elicitation_dialog} → decision. 종류가 없으면 문구에 "needs your permission"/"needs your input" → decision. 그 밖(idle_prompt 등) → 카드 그대로 두거나 rest |
| PermissionRequest | decision | message = 도구 이름 등 짧게 |
| Stop | rest | |
| SessionEnd | ended | 카드를 지우지 않고 ended 로 덮어쓴다 — 서버가 숨기고, 대체 모드가 그 세션을 유령으로 다시 띄우지 않게. 1일 뒤 서버가 치운다. 제한시간 1.5초라 pid 찾기 등 느린 일 금지 |

훅 규칙: **어떤 입력·오류에도 exit 0, stdout 출력 없음**, 세션 id 는 `^[A-Za-z0-9._-]+$` 만, 원자적 쓰기(tmp→rename).

설치하는 이벤트는 오래된 것만(SessionStart·UserPromptSubmit·Notification·PermissionRequest·Stop·PreCompact·SessionEnd).
StopFailure·PostCompact 같은 새 이벤트 키는 옛 버전 Claude 의 설정 검증을 깨뜨릴 수 있어 넣지 않는다.
PermissionRequest 는 승인 창이 뜨는 즉시, Notification(permission_prompt)은 약 6초 뒤에 울린다(공식 문서).

## 4. `GET /api/office` 응답

```json
{
  "version": 1,
  "now": "2026-10-22T01:02:03.456Z",
  "hooks": true,
  "demo": false,
  "people": [ Person, … ]
}
```

`hooks` = 훅 카드를 하나라도 읽었는가(또는 settings.json 에 우리 훅이 깔려 있는가). false 면 화면이 "대화 기록만으로 표시 중" 안내를 띄운다.

```jsonc
// Person — 프로젝트(폴더) 하나 = 캐릭터 하나. 같은 폴더의 세션 여러 개는 한 명으로 합친다.
{
  "id": "/Users/me/my-app",        // 안정 키 = 프로젝트 루트(git 최상위, 없으면 cwd) 정규화 경로
  "name": "my-app",                // 표시 이름 = 명부(staff.name)가 있으면 그것, 없으면 루트 폴더 이름(같은 이름이 둘이면 "my-app (parent)")
  "folder": "my-app",              // 루트 폴더 이름(명부 열쇠) — 색·종류의 기본값은 이 이름으로 정해져 표시 이름을 바꿔도 안 변한다
  "title": "프론트엔드",            // 명부의 직책, 없으면 ""
  "team": "개발",                  // 명부의 팀(설정 teams 에 있는 것만), 없으면 ""
  "kind": "frog",                  // "frog" | "capy" | null(이름으로 자동)
  "color": "#2E86DE",              // 개인 색 > 팀 색 > null(이름으로 자동). #RRGGBB
  "path": "/Users/me/my-app",
  "status": "working",             // "working" | "decision" | "rest"  (세션들 중 decision > working > rest)
  "pending": 0,                    // 승인 대기 중인 세션 수
  "ask": "Claude needs your permission to use Bash",   // decision 일 때 문구(≤80자), 아니면 ""
  "sessions": 1,                   // 합쳐진 세션 수
  "source": "hook",                // "hook" | "transcript"(대체 모드로만 잡힌 경우)
  "commits": 123,                  // git rev-list --count HEAD (10분 캐시), 못 세면 null
  "kid": false,                    // commits != null && commits < 50 → 70% 꼬마
  "home": null,                    // "server" 면 서버실에서 일한다(설정 homes 로 지정). 그 밖엔 null
  "subs": [ { "id": "a1b2", "type": "Explore", "desc": "find auth code", "doing": Act|null } ],  // 최대 12
  "subCount": 1,                   // 실제로 일하는 서브에이전트 수(12 초과 가능)
  "doing": Act|null,               // 지금 하는 일(가장 최근 활동)
  "log": [ { "at": "ISO", "k": "read", "a": "server.mjs" } ]  // 최근 8개, 오래된 것 → 최신
}
```

**Act** = 활동 한 줄을 언어와 무관하게 표현한 것. 화면(i18n.js)이 언어에 맞게 문장으로 만든다.

```jsonc
{ "k": "read",  "a": "server.mjs" }        // k 목록 ↓, a = 이미 잘라 둔 인자(문자열, 없으면 "")
```

| k | 원천(대화 기록 assistant 블록) | a |
|---|---|---|
| text | type=text | 마크다운 기호 뺀 글 60자 |
| read | Read | 파일 이름(basename) |
| edit | Edit·MultiEdit·NotebookEdit | 파일 이름 |
| write | Write | 파일 이름 |
| bash | Bash | description 44자, 없으면 command 앞 40자 |
| grep | Grep | pattern 24자 |
| glob | Glob | pattern 28자 |
| fetch | WebFetch | URL 호스트 이름 |
| search | WebSearch | query 24자 |
| agent | Agent·Task | description 30자 |
| todo | TodoWrite | "" |
| skill | Skill | skill 이름 24자 |
| mcp | `mcp__서버__도구` | 마지막 토막(도구 이름) |
| tool | 그 밖의 도구 | 도구 이름 24자 |

thinking·빈 글은 건너뛴다. 대화 기록 형식은 Claude Code 내부 형식이라 바뀔 수 있다 — 모르는 모양은 조용히 넘긴다.

## 5. 설정 (`~/.claude-office/config.json`, 없어도 됨)

```json
{ "port": 4777, "autoStart": true, "title": "RGA 오피스",
  "teams": { "개발": { "color": "#2E86DE" }, "기획": { "color": "#E74C3C" } },
  "staff": { "web-front": { "name": "개굴 대리", "title": "프론트엔드", "team": "개발", "kind": "frog" },
             "C:/Users/me/infra": { "name": "카피 과장", "title": "인프라", "team": "개발", "kind": "capy", "home": "server", "color": "#123456" },
             "scratch": { "hidden": true } },
  "homes": { "my-main-project": "server" }, "hide": ["scratch"],
  "fallbackMinutes": 20, "staleHours": 6, "kidCommits": 50, "lang": "auto" }
```

- `port` — 서버 포트(환경변수 `CLAUDE_OFFICE_PORT` 가 우선). 서버는 **127.0.0.1 에만** 붙는다.
- `autoStart` — SessionStart 훅이 서버가 꺼져 있으면 백그라운드로 띄운다(재부팅 뒤에도 Claude 만 켜면 화면이 산다).
- `title` — 사무실 이름(≤40자). 있으면 위 막대 제목·탭 제목이 두 언어 모두 이것.
- `teams` — 팀 이름(≤24자, 최대 32개) → `{ color, kind }`(색 #RRGGBB, kind = 팀 대표 캐릭터, 둘 다 없어도 됨). 팀 색은 그 팀 직원의 기본 색, 팀마다 사무실에 방이 하나 생긴다.
- 캐릭터 종류(`kind`) 우선순위: 직원(`staff.*.kind`) > 팀(`teams.*.kind`) > 자동(몽실이·별이 중 이름으로). 종류 목록은 server/config.mjs `KINDS` = web/office-world.js `OFFICE_SPECIES`: pomesable(몽실이)·pomebw(별이)·pome·shiba·corgi·maltese·poodle·frog·capy.
- `staff` — 프로젝트 **폴더 이름 또는 경로**(윈도우는 대소문자 무시, 경로가 이름보다 우선) → 명부 항목(최대 200개).
  `name`·`title`·`team` 각 ≤24자, `kind` `frog`|`capy`(그 밖은 자동), `home` `"server"` 만, `color` #RRGGBB, `hidden` true.
  없는 팀을 적으면 팀 칸은 버려진다. 빈 칸은 저장할 때 뺀다.
- `homes` — (옛 방식) 프로젝트 이름(또는 경로) → "server" 면 서버실. `staff.*.home` 과 같은 효과.
- `hide` — (옛 방식) 사무실에 안 띄울 프로젝트 이름·경로. `staff.*.hidden` 과 같은 효과.
- `lang` — "auto" | "ko" | "en". 화면에 그대로 전달(`GET /api/config`).

`normalizeConfig`(server/config.mjs)가 읽기·쓰기 양쪽의 단일 검증 규칙이다. 모르는 키·이상한 값은 버린다.

## 5-1. 관리자 모드 (`web/admin.html`)

- `GET /api/config` → `{ lang, title, teams, version }` — 사무실 화면이 제목·팀 색을 받는다.
- `GET /api/admin/config` → `{ config, seen: [{ folder, path, name }], demo, version }` — 지금 설정(정규화됨)과 지금 사무실에 있는 프로젝트.
- `POST /api/admin/config` (본문 = 설정 JSON, ≤256KB) → `{ ok: true, config }` — 검증해 `config.json` 에 **원자적으로**(tmp→rename) 쓴다.
  **서버의 유일한 쓰기 경로.** 받는 조건: Host 검사 통과 + 헤더 `X-Office-Admin: 1` + `Content-Type: application/json` +
  `Origin` 이 없거나 이 서버 자신(`http://127.0.0.1:포트` 등). 하나라도 어긋나면 403, JSON 이 깨지면 400.
  (`X-Office-Admin` 은 다른 사이트의 폼·단순 fetch 가 붙일 수 없는 사용자 정의 헤더라 CSRF 를 막고, CORS 헤더가 없어 사전 요청도 실패한다.)
- `GET /api/admin/tasks` → `{ tasks: [{ id, who, cwd, task, mode, pid, startedAt, endedAt, exitCode, status, log }] }` — 최근 30개, log = 출력 꼬리 4KB.
- `POST /api/admin/task` `{ key | cwd, who, task, mode }` → 그 폴더에서 `claude -p <고정 프롬프트> <권한 플래그>` 를 띄우고 업무 글은 stdin 으로 넘긴다(server/tasks.mjs).
  mode: acceptEdits(기본: `--permission-mode acceptEdits --permission-prompts none`) · auto · plan · bypass(`--dangerously-skip-permissions`).
  기록은 `~/.claude-office/tasks/<id>.json`, 출력은 `<id>.log`. 데모 서버는 400. claude 실행 파일은 `CLAUDE_BIN` > `~/.local/bin/claude` > PATH 의 `claude`.
- `POST /api/admin/task/stop` `{ id }` → SIGTERM.
- 업무 절차(server/procedures.mjs): `GET /api/admin/procedures?cwd=` 목록, `GET /api/admin/procedure?cwd=&slug=` 하나, `GET /api/admin/procedure/image?cwd=&slug=&file=NN.png` 그림,
  `POST /api/admin/procedure` `{ cwd, slug?, name, memo, steps: [{ text, image: dataURL|기존파일명|'' }] }` → `<cwd>/.claude/procedures/<slug>.json`·`.md`·`<slug>/NN.png`,
  `POST /api/admin/procedure/delete` `{ cwd, slug }`. 업무에 `procedure: slug` 를 붙이면 업무 글 앞에 "절차서를 읽고 그대로" 머리말이 붙는다.
- 반복 업무(server/schedules.mjs, `~/.claude-office/schedules.json`): `GET /api/admin/schedules`, `POST /api/admin/schedule`(만들기·고치기, `{ id?, cwd, who, task, procedure, mode, every: daily|hourly|minutes|once, time, minutes, at, continueSession, enabled }`),
  `POST /api/admin/schedule/delete`, `POST /api/admin/schedule/run`(지금 실행). 실제 서버가 30초마다 `tick()` 으로 때가 된 것을 startTask 한다. 데모 서버는 안 돈다.
- `continueSession` 이면 `claude --continue -p …` — 같은 폴더의 지난 대화에 이어서. `replyTo: <업무 id>` 면 그 업무의 질문에 답한 것(원 업무 `answeredBy`, 일지의 question 완료).
- 업무 프롬프트는 "## 보고 / ## 질문" 형식을 요구한다. `listTasks` 가 출력 꼬리에서 `report`·`question` 을 뽑는다(server/tasks.mjs parseReport).
- 직원 프로필·일지(server/staff.mjs `staffContext`): `--append-system-prompt` 에 "너는 <이름 · 직책 · 팀> + role + 최근 일지(toContext)" 가 붙는다.
- 업무 일지(server/journal.mjs, `<cwd>/.claude/journal/YYYY-MM-DD.json`): kind activity|question|todo|note|briefing, 300자 요약, 비밀값 마스킹.
  업무가 끝나면 activity(+question) 자동 기록. `GET /api/admin/journal?cwd=&date=`, `POST /api/admin/journal` `{ cwd, kind, text }` 또는 `{ cwd, id, done }`.
- 브리핑(server/briefer.mjs): 경로 있는 직원마다 하루 한 번 아침(09:00)·퇴근 전(17:30) 규칙 기반 브리핑을 일지에 적고 알림 큐에 넣는다. `GET /api/admin/notices`(가져가면 비움), `POST /api/admin/briefing` `{ cwd, type, who }` 즉시.
- 스냅샷: 답 안 한 질문이 있는 폴더는 세션이 없어도 Person 으로 나오고 status=decision, `askTask`=업무 id, ask="질문: …".
- 스냅샷: 업무가 도는 폴더(`claude -p` 실행 중)는 세션이 없어도 Person 으로 나오고 status=working, `taskId`=업무 id, `taskSince`=시작 시각, `doing`={k:"text", a: 로그 마지막 줄}. 훅 세션이 있으면 세션 상태가 우선.
- 그 밖의 경로에 POST 는 여전히 405.
- 데모 서버(`--demo`)도 명부를 입힌다 — 관리자 모드를 가짜 데이터로 시험해 볼 수 있다. 데모의 저장도 진짜 `config.json` 에 쓴다.

## 6. 생존 판정 (세션이 아직 켜져 있나)

1. SessionEnd 를 받으면 카드가 ended 가 된다(숨김).
2. 카드에 pid 가 있으면 그 프로세스가 살아 있어야 한다(`process.kill(pid, 0)`; EPERM 도 살아 있음).
   맥·리눅스는 pidStart(ps lstart, LC_ALL=C)까지 맞춰 pid 재사용에 속지 않는다.
3. pid 가 없으면 `max(카드 updatedAt, 대화 파일 mtime)` 이 `staleHours` 안이어야 한다.
4. 7일 넘은 카드 파일은 서버가 치운다.

상태 보정:
- decision 카드인데 대화 파일이 카드보다 1.5초 넘게 나중에 바뀌었다 → 사용자가 답했다 → working.
- working 카드인데 대화 마지막 줄이 assistant + stop_reason "end_turn" 이고 5초 넘게 조용하거나,
  마지막 user 줄에 "[Request interrupted by user" 가 있다 → rest (Esc 로 끊으면 Stop 훅이 안 울린다).
- working 카드인데 마지막 줄이 API 오류(assistant + `isApiErrorMessage: true` 또는 글이 "API Error" 로 시작) → rest (StopFailure 대신).

## 7. 훅 설치 (`scripts/setup.mjs`)

- `<config>/settings.json` 을 읽어(엄격 JSON, 못 읽으면 **중단**·덮어쓰지 않음) 백업(`settings.json.bak-office-YYYYMMDD-HHMMSS`) 후
  위 이벤트마다 `{ "hooks": [ { "type": "command", "command": CMD, "timeout": 10 } ] }` 를 **추가**(이미 있으면 건너뜀).
- 우리 훅 식별 = command 에 `office-hook.mjs` 가 들어 있음. uninstall 은 그것만 지운다(남의 훅 보존).
- CMD 는 bash·cmd·PowerShell 어디서 돌아도 되게: node 실행 파일 경로에 공백이 없으면 그 절대경로(따옴표 없이),
  있으면 `node`. 스크립트 경로는 **슬래시(/)로 바꾸고 큰따옴표로** 감싼다.
  예) `/opt/homebrew/bin/node "/Users/me/claude-3d-frog-office/hooks/office-hook.mjs"`
      `node "C:/Users/me/claude-3d-frog-office/hooks/office-hook.mjs"`
- 이미 열려 있던 Claude 세션은 훅을 새로 안 읽는다 → 그동안은 대체 모드로 보이고, 다시 켜면(또는 /hooks 확인) 정밀 모드.
