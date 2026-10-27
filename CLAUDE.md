# claude-3d-frog-office — Claude Code 작업 지침

이 저장소는 **Claude Code 세션을 아이소메트릭 사무실 캐릭터로 보여 주는 로컬 웹 화면**이다.
사용자가 이 폴더에서 Claude 에게 설치·실행을 부탁하면 아래 절차를 그대로 따른다. 사용자의 언어(한국어/영어)로 답한다.

## 사용자가 이렇게 말하면

| 사용자 말 (예) | 할 일 |
|---|---|
| "3D 사무실 적용해줘", "설치해줘", "install", "set it up", "apply 3D office", "Set up the 3D office" | 아래 **설치 절차** |
| "3D 사무실 열어줘", "켜줘", "open the office", "start" | `node scripts/start.mjs --open` |
| "관리자 모드 열어줘", "직원 명부", "이름/직책 바꿔줘", "업무 보내줘", "open admin mode", "admin", "staff" | `node scripts/start.mjs --admin` — 브라우저의 관리자 모드(`/admin.html`)에서 직원 이름·직책·팀·캐릭터·자리·숨김·사무실 이름을 고친다. 직접 설정값을 받아 적어 달라고 하면 아래 **관리자 모드와 설정** 을 보고 `~/.claude-office/config.json` 을 고쳐도 된다 |
| "꺼줘", "서버 멈춰", "stop" | `node scripts/stop.mjs` |
| "상태 봐줘", "안 보여", "doctor", "status" | `node scripts/status.mjs` 결과를 읽고 아래 **문제 해결** 참고 |
| "데모 보여줘", "demo" | `node scripts/start.mjs --demo --open` (가짜 데이터, 실제 세션과 무관) |
| "지워줘", "제거", "uninstall" | `node scripts/uninstall.mjs` (상태 폴더까지 지우려면 `--purge`) |

## 설치 절차

1. `node --version` 으로 Node.js 18 이상인지 확인한다.
   - 없거나 낮으면 사용자에게 설치를 제안한다: macOS `brew install node`(Homebrew 가 있을 때) 또는 https://nodejs.org ,
     Windows `winget install OpenJS.NodeJS.LTS`, Linux 는 배포판 패키지 관리자. **사용자 동의 없이 시스템 프로그램을 설치하지 않는다.**
2. `node scripts/setup.mjs` 를 실행한다. 이 스크립트가 하는 일:
   - Claude 설정(`~/.claude/settings.json`, `CLAUDE_CONFIG_DIR` 이 있으면 그 폴더)을 **백업한 뒤** 이 저장소의 훅을 **추가**한다(기존 훅은 그대로 둔다).
   - `~/.claude-office/config.json` 이 없으면 기본 설정을 만든다.
   - 로컬 서버(127.0.0.1:4777)를 백그라운드로 띄우고 브라우저를 연다.
3. 결과를 사용자에게 짧게 알린다:
   - 주소: `http://127.0.0.1:4777` (북마크 권장)
   - **이미 열려 있던 Claude 세션**은 새 훅을 아직 모른다. 그 세션들은 대화 기록만으로 표시되고(승인 대기는 감지 안 됨),
     세션을 다시 시작하면(`/exit` 후 `claude --continue`) 정확하게 잡힌다.
   - 서버는 Claude 세션이 시작될 때 꺼져 있으면 자동으로 다시 뜬다(`autoStart`, 설정에서 끌 수 있음).

**`settings.json` 을 손으로 고치지 않는다** — 항상 `scripts/setup.mjs` / `scripts/uninstall.mjs` 를 쓴다. setup 이 settings.json 을 읽지 못하면(JSON 오류) 멈추고 그 이유를 사용자에게 보여 준다. 고칠지는 사용자가 정한다.

## 관리자 모드와 설정

사무실 화면 오른쪽 위 **⚙ 관리자** 버튼(또는 `http://127.0.0.1:4777/admin.html`)이 관리자 모드다. 터미널 없이 브라우저에서
사무실 이름·팀·직원 명부를 고치고 **저장**하면 `~/.claude-office/config.json` 에 쓰이고 사무실 화면에 3초 안에 반영된다.

설정 키(`docs/CONTRACT.md` 5절이 정본):

```json
{ "title": "RGA 오피스",
  "teams": { "개발": { "color": "#2E86DE" }, "기획": { "color": "#E74C3C" } },
  "staff": {
    "web-front": { "name": "개굴 대리", "title": "프론트엔드", "team": "개발", "kind": "frog" },
    "C:/Users/me/infra": { "name": "카피 과장", "title": "인프라", "team": "개발", "kind": "capy", "home": "server" },
    "scratch": { "hidden": true } } }
```

- `staff` 의 열쇠 = 프로젝트 **폴더 이름** 또는 전체 경로(윈도우는 대소문자 무시). 폴더 이름이 겹치면 경로로 적는다.
- `name` 표시 이름(명찰), `title` 직책(명찰 옆에 작게), `team` 팀(`teams` 에 있어야 함), `kind` `frog`|`capy`(없으면 자동),
  `home` `"server"` 면 서버실, `color` 개인 색(없으면 팀 색, 없으면 자동), `hidden` true 면 사무실에 안 띄운다.
- 옛 `homes`·`hide` 도 그대로 알아듣는다. 관리자 모드로 저장하면 전부 `staff` 로 옮겨 적는다.
- 사용자가 "OO 폴더를 개굴 대리, 직책 프론트엔드로" 처럼 말로 부탁하면 config.json 의 `staff` 에 그대로 적어 주면 된다(JSON 이 깨지지 않게).

## 문제 해결

- 화면에 아무도 없다 → `node scripts/status.mjs` 로 훅 설치 여부·서버 상태를 확인. 열린 Claude 세션이 없으면 정상이다.
- 포트가 겹친다 → `~/.claude-office/config.json` 의 `port` 를 바꾸고 `node scripts/stop.mjs && node scripts/start.mjs --open`. 훅도 새 포트를 읽는다.
- 특정 프로젝트를 숨기고 싶다 → 관리자 모드에서 **숨김** 체크(= config.json `staff.<폴더>.hidden`), 옛 방식 `hide` 도 된다.
- 한 프로젝트를 서버실에서 일하게 하고 싶다 → 관리자 모드에서 자리를 **서버실**로(= `staff.<폴더>.home: "server"`).
- 명찰이 폴더 이름 그대로다 → 관리자 모드의 "지금 사무실에 있는 프로젝트" 칩을 눌러 명부에 추가하고 표시 이름을 적는다.

## 개발 규칙 (이 저장소를 고칠 때)

- 외부 의존성 0 — Node.js 18+ 표준 라이브러리만. 화면도 CDN·웹폰트 없이 오프라인으로 돈다.
- 데이터 형식·구조는 `docs/CONTRACT.md` 가 정본. 스프라이트 교체는 `docs/SPRITES.md`.
- 시험: `npm test`. 시험은 진짜 `~/.claude` 를 건드리지 않게 `CLAUDE_CONFIG_DIR`·`CLAUDE_OFFICE_HOME` 을 임시 폴더로 둔다.
- 서버는 127.0.0.1 에만 붙고 Host 헤더를 검사한다. 이 보안 성질을 깨는 변경 금지.
