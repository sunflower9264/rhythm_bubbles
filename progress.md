Original prompt: 重写 Rhythm Bubbles，保持核心玩法不变，全面重做 UI/UX，所有图片素材由 Codex 生成；使用可在服务器纯代码开发的 H5 技术栈，风格可爱，原创生成音效，最终达到可直接上线的生产级质量。

## Decisions

- Stack: Phaser 3.90 + TypeScript 5.9 + Vite 7.
- Form factor: mobile-first portrait H5, centered and framed on desktop.
- Visual direction: cute bubble cloud garden; generated art only, no third-party image assets.
- Audio direction: deterministic procedural WAV generation committed with its source script.
- Gameplay invariant: classic / memory / sequence modes, +10 per correct bubble, wrong click or timeout ends the run, clearing all targets advances the level.

## Status

- [x] Inspected and traced the original Cocos Creator gameplay.
- [x] Selected the server-friendly web stack.
- [x] Generated original background and app-icon source art.
- [x] Rebuild core rules and tests.
- [x] Rebuild Phaser presentation and responsive DOM UI.
- [x] Generate audio assets.
- [x] Run browser interaction, screenshot, mobile and production-build validation.
- [x] Run the production flow on Chromium, Firefox, and WebKit with no console errors.
- [x] Visually inspect mobile menu, gameplay, sequence preview, results, and desktop layout screenshots.
- [x] Clear transient score particles and level toasts when a new mode starts, then rerun all browser checks.

## Notes

- The legacy Cocos project was removed from the working tree after the web build passed validation; it remains recoverable from Git history.
- Final checks: 5/5 core tests pass, TypeScript/Vite production build passes, `npm audit --omit=dev` reports 0 vulnerabilities, and `git diff --check` passes.
- The workspace Skill client cannot resolve the project's Playwright dependency from its own `.codex/skills/` path. The identical project-local client at `scripts/web-game-playwright-client.mjs` was used successfully; its final state and screenshot are in ignored `output/web-game-final/`.
- Git push and HTTPS/domain configuration remain intentionally undone; the current deployment uses the machine's public IP over HTTP.
- Deployed the current production build through the machine's Nginx on port `18088`, with files in `/var/www/rhythm-bubbles` and the versioned site config in `deploy/nginx/rhythm-bubbles.conf`. Public-IP Chromium E2E passed after deployment.
- Replaced the original 96 BPM background loop with `bubble-garden-groove-v2.wav`: a 120 BPM eight-bar loop using four-on-the-floor kick, backbeat percussion, eighth-note hats, pulsing bass, arpeggios, and a brighter melodic hook. The 16-second WAV has no clipped samples and a zero-delta loop boundary. Service Worker cache moved to `v3`, Nginx now serves WAV as `audio/wav`, and the public-IP Chromium E2E passed after redeployment.
- Rebuilt click feedback as a jelly-pop sequence: synchronous squash, delayed membrane release, pooled droplets, expanding rings, neighbour waves, three rotating correct-pop sounds, and a soft wrong wobble with a delayed results modal. Wrong feedback now cancels pending positive callbacks so rapid input cannot mix `+10` with failure feedback. Haptics were shortened, reduced-motion bypasses the long reveal, Service Worker cache moved to `v4`, all three browser engines passed, and the Nginx deployment was verified through the public IP.
- Removed desktop-oriented keyboard navigation, `F`/Escape shortcuts, keyboard focus rings, and the in-app fullscreen control. The game now presents touch as its formal mobile-H5 input while retaining pointer-click compatibility; Service Worker cache moved to `v5`. Core tests, build, audit, Chromium/Firefox/WebKit production flows, Nginx file parity, and the public-IP Chromium flow all passed after redeployment.
- Raised the default background-music volume from 20% to 40% to match the main sound effects, added a live 0–100% music-volume slider with local persistence, and moved the Service Worker cache to `v6`. Core tests, build, audit, and Chromium/Firefox/WebKit flows passed; the mobile settings layout was visually inspected at 390 × 844.
