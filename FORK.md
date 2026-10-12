# Fork 규칙 (superego18/archify `dev_chanju`)

이 저장소는 `tt-a1i/archify`의 fork다. 우리 기능은 `dev_chanju`에서 유지하고, `upstream/dev`를 주기적으로 merge한다.

## 충돌을 줄이는 분리 구현 (필수)

upstream을 merge할 때 충돌이 나지 않도록 fork 기능은 최대한 분리해서 구현한다.

- 새 코드는 fork 전용 파일에 둔다.
  - 렌더러 로직: `archify/renderers/fork/<기능>.mjs`
  - 문서: `archify/references/fork-extensions.md`
  - 테스트: `test/fork-<기능>.test.mjs`
- upstream 파일은 **연결 지점만** 고친다. import 한 줄, 함수 호출 한 줄, 스키마 속성 한 줄 정도로 끝낸다.
  - upstream 함수 본문을 고쳐 쓰거나 옮기지 않는다. 동작을 바꿔야 하면 fork 파일에서 감싼다.
  - 스키마 속성 설명은 `"Fork extension: …"`으로 시작한다.
- 기존 출력 바이트를 유지한다. 새 필드를 쓰지 않은 다이어그램은 이전과 같은 HTML을 낸다(golden·zip 테스트가 그대로 통과해야 한다).
- 생성 파일(`generated-validators.mjs`, viewer 산출물, `archify.zip`)은 손으로 고치지 않는다. 충돌이 나면 merge 뒤 다시 생성한다.
- 이미 upstream 위치에 둔 fork 파일: `archify/renderers/shared/graphic-quality.mjs`(전체가 fork 코드라 충돌하지 않음).

## 브랜치

- 기능은 `dev_chanju`에서 갈라진 worktree(`~/dev/personal/archify-wt/<이름>`)에서 만든다. ai-config의 서브모듈 체크아웃(실제 쓰는 스킬)에서 직접 개발하지 않는다.
- 끝나면 `dev_chanju`에 merge하고 `archify.zip`을 공식 Node 22로 다시 만든다(`scripts/build-zip.sh`).
- `upstream/dev` merge는 주 1회, 그리고 우리 기능을 합치기 직전에 한다. rebase하지 않는다.
