# FLASH7 mission relay

GitHub Pages의 PC 지상국과 별도 기기의 조회 화면을 연결하는 Cloudflare Worker + SQLite Durable Object입니다. 서비스 주소: `https://flash7-mission-relay.flash7-mission-relay.workers.dev`. 앱의 공통 설정에 연결되어 있으며 주소를 사용자에게 입력받지 않습니다.

## 로컬 실행

Node.js와 npm을 설치한 뒤 이 폴더에서 실행합니다.

```sh
npm ci
cp .dev.vars.example .dev.vars.local
# .dev.vars.local의 PUBLISH_KEY를 32자 이상의 무작위 키로 변경
npm run dev
```

프로젝트 루트에서는 `npm run build` 후 `python3 -m http.server 8099 --bind 127.0.0.1`을 실행합니다. `http://127.0.0.1:8099/flash7.html`에서 비행 또는 시뮬레이션에 진입하고 제어 센터의 온라인 미션 공유에 로컬 송신 키를 입력합니다. localhost에서 실행하면 로컬 중계 주소가 자동 적용됩니다. 반환된 링크나 코드로 조회합니다. 로컬 중계는 localhost 전용이므로 실제 휴대폰의 원격 접속 시험이 아닙니다.

`npm run test:integration`은 실행 중인 로컬 Worker를 대상으로 인증·Origin·조회자 10개·이력·재연결·종료를 검사합니다. 이 검사는 `.dev.vars.local`에 `PUBLISH_KEY=flash7-local-e2e-only-not-for-production-key`를 설정한 격리된 로컬 시험 환경에서만 사용합니다. 이 공개 시험 키를 실제 배포에 사용하지 마세요.

## 실제 배포

Cloudflare 계정과 Wrangler 인증을 사용자가 준비한 후 이 폴더에서 실행합니다.

```sh
npx wrangler login
npx wrangler secret put PUBLISH_KEY
npm run deploy
```

송신 키는 32자 이상 무작위 값으로 설정하고 Git·Pages·브라우저 저장소에 넣지 않습니다. 배포 출력의 HTTPS Worker 주소를 `scripts/ui/shared/mission-config.js`의 `relayOrigin`에 한 번 설정하고 앱을 다시 빌드·배포합니다. PC와 폰 모두 이 공통 설정을 자동으로 사용합니다. 송신 키는 미션 생성 시에만 입력하며 조회자에게 전달하지 않습니다. 조회 링크에는 접근 코드만 포함됩니다. 현재 기본 허용 Origin은 `https://flash7.kro.kr`와 `https://ybb-space.github.io`입니다. 다른 정식 앱 주소는 `wrangler.jsonc`의 ALLOWED_ORIGINS에 명시합니다. 모바일 센서에는 HTTPS가 필요합니다.

## 동작과 범위

- 미션별 무작위 8자리 코드, 별도 송신 토큰, 60초 WebSocket 접속 티켓을 사용합니다. 접근 코드 소지자는 위치를 포함한 텔레메트리를 읽을 수 있습니다.
- PC는 최대 10 Hz로 송신하며 조회자 최대 16명을 허용합니다. 기본 만료는 2시간입니다. `MISSION_TTL_SECONDS`로 최대 4시간까지 설정할 수 있습니다.
- WebSocket hibernation과 자동 ping 응답을 사용합니다. 최근 120개 샘플은 연결 중 메모리에 유지하고 최신 샘플은 최대 5초 간격으로 보존합니다. 실행 중단 후 전체 비행 기록은 복원하지 않습니다.
- 종료 또는 만료 시 접속을 닫고 미션 상태를 삭제합니다. 코드만 가진 조회자는 송신·종료·보드 명령을 수행할 수 없습니다.
- 클라이언트는 자동 재연결하며 수신이 오래되면 마지막 값임을 표시합니다. 무료 요금제 한도와 실제 배포 상태는 Cloudflare 대시보드에서 확인합니다.

추적·회수 추정은 클라이언트에서 계산합니다. 하강속도와 현재 수평 이동에 따른 단순 예측이며 지형·바람 모델이 아닙니다. 휴대폰 센서와 실제 비행에서의 오차 검증은 별도로 필요합니다. 보드 프로토콜과 펌웨어는 변경하지 않습니다.
