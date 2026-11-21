# WISA STUDIO

**Fork of oh-my-pi (MIT). UI rebrand by WISA.**

GUI desktop tiếng Việt cho oh-my-pi (omp) — trình coding agent cài một lần là chạy, nhiều phiên làm việc song song trong một cửa sổ, có sẵn cổng WISA để một API key dùng được mọi mô hình. Electron, cho macOS, Windows và Linux.

<img src="docs/screenshots/vi/01-conversation.png" alt="WISA STUDIO với một phiên làm việc tiếng Việt và tab Tổng quan" width="100%">

## Tải về

| Nền tảng | Gói |
|---|---|
| macOS Apple Silicon | `wisa-studio-0.9.51-arm64.dmg` — [trang phát hành](https://github.com/smokeyduck/wisa-studio/releases/tag/v0.9.51) |
| macOS Intel | `wisa-studio-0.9.51-x64.dmg` — [trang phát hành](https://github.com/smokeyduck/wisa-studio/releases/tag/v0.9.51) |
| Windows x64 | [`wisa-studio-0.9.51-setup.exe`](https://github.com/smokeyduck/wisa-studio/releases/download/v0.9.51/wisa-studio-0.9.51-setup.exe) |
| Linux x64 | [`wisa-studio-0.9.51.AppImage`](https://github.com/smokeyduck/wisa-studio/releases/download/v0.9.51/wisa-studio-0.9.51.AppImage) |

[Tất cả bản phát hành](https://github.com/smokeyduck/wisa-studio/releases) · [Hướng dẫn cài đặt](docs/vi/cai-dat.md)

Bản macOS được ký ad-hoc (chưa notarize) và bản Windows chưa ký, nên lần chạy đầu có thể phải xác nhận: macOS → chuột phải → **Open**, hoặc System Settings → Privacy & Security → **Open Anyway**; Windows → **More info** → **Run anyway**.

## Lấy API key

WISA STUDIO tạo sẵn nhà cung cấp `wisa` trỏ tới `https://api.askwisa.com/v1`. Một key dùng cho mọi mô hình mà cổng phục vụ, danh sách mô hình được lấy tự động sau khi lưu key.

**[Lấy API key tại askwisa.com →](https://askwisa.com/?utm_source=github&utm_medium=readme)**

Không bắt buộc: bạn vẫn có thể dùng Anthropic, OpenAI, DeepSeek, OpenRouter, Gemini… như upstream hỗ trợ. Xem [hướng dẫn cấu hình provider](docs/vi/nha-cung-cap-wisa.md) và [FAQ](docs/vi/faq.md).

<div align="center">

[![Release](https://img.shields.io/github/v/release/smokeyduck/wisa-studio?style=flat&colorA=222222&colorB=3FB950)](https://github.com/smokeyduck/wisa-studio/releases)
[![Downloads](https://img.shields.io/endpoint?url=https%3A%2F%2Fsmokeyduck.github.io%2Fwisa-studio%2Fdownloads.json&style=flat&cacheSeconds=3600)](https://github.com/smokeyduck/wisa-studio/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-BE185D?style=flat)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-222222?style=flat)
![Electron](https://img.shields.io/badge/Electron-35-47848F?style=flat&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white)

[English](README.en.md) · [Tiếng Việt](README.md)

</div>

---

## WISA STUDIO khác omp ở đâu

Agent không đổi. Toàn bộ phần "làm việc" — đọc file, chạy lệnh, sửa mã, gọi tool, MCP, Skills — là binary của oh-my-pi, biên dịch nguyên bản từ commit ghi trong [`sidecar-source.json`](sidecar-source.json) và đóng gói kèm ứng dụng. WISA chỉ thay lớp hiển thị và cách đóng gói:

- **Tên và nhận diện:** WISA STUDIO thay cho tên cũ trong tiêu đề cửa sổ, tray, hộp thoại cấp quyền của macOS, tên file cài đặt.
- **Tiếng Việt mặc định:** giao diện có 5 ngôn ngữ (Tiếng Việt, English, 中文, Русский, ไทย), bản này mở ra là tiếng Việt.
- **Cổng WISA:** provider `wisa` được tạo sẵn, xuất hiện đầu tiên trong onboarding.
- **Bản phát hành:** trỏ về repo này.

Vì dùng chung `~/.omp`, phiên và cấu hình của bạn tương thích với omp CLI: mở cùng một phiên từ terminal hay từ GUI đều được.

## Giao diện có gì

- **Phiên song song:** mỗi tab là một tiến trình agent riêng, công việc nền chạy tiếp khi bạn chuyển tab; tab được khôi phục chỉ khởi động khi mở.
- **Chia đôi và nhiều cửa sổ:** đặt hai phiên cạnh nhau hoặc trên/dưới, kéo vách ngăn, khôi phục bố cục sau khi khởi động lại.
- **Không gian làm việc:** cây thư mục, tab file, sửa và lưu bằng `⌘S`, xem Markdown ở dạng nguồn hoặc đã render, xem diff và log.
- **Tác vụ định kỳ:** cron hoặc interval, chạy nền, có lịch sử chạy, báo cáo và bước xác minh.
- **Tổng quan phiên:** ngữ cảnh theo nhóm, chi phí, cache, tốc độ, subagent và MCP server đang chạy.
- **MCP, Skills, plugin, hook:** quản lý trong Cài đặt, không cần sửa JSON bằng tay.
- **SSH host, theme tuỳ chỉnh, command palette, chế độ giọng nói, cộng tác qua relay.**

Giới hạn cần biết: các tab không phải ranh giới bảo mật của hệ điều hành; chia đôi là hai khung, không phải lưới vô hạn; phê duyệt và quét bảo mật không thay cho sandbox. Request mô hình vẫn đi tới nhà cung cấp bạn cấu hình.

## Cài đặt

Tải gói ở trên, mở lên, dán API key (hoặc chọn provider khác) là dùng được. Không cần cài Node, Bun hay omp CLI — agent đã nằm trong gói.

Chi tiết theo từng nền tảng, cách đặt lại dữ liệu và xử lý lỗi khi mở app: [docs/vi/cai-dat.md](docs/vi/cai-dat.md).

## Phát triển

Repo này là GUI repo. Agent nằm ở monorepo upstream và được biên dịch thành sidecar; muốn dựng sidecar từ mã nguồn, clone monorepo vào thư mục anh em rồi:

```bash
bun install
bun run build:omp          # → resources/omp (arm64)
bun run build:omp:x64      # → resources/omp.x64 (Intel)
bun run build:omp:win      # → resources/omp.exe
bun run build              # → out/
bun run dev                # HMR; tự dò sidecar nếu chưa build
```

Kiểm tra trước khi gửi PR:

```bash
bunx vitest run
bun run check:types
bunx biome check .
bun run check:locale       # ru + vi phủ đủ mọi setting mà sidecar cung cấp
bun run build
```

`bun run dev` chạy tách biệt với bản đã cài: userData `wisa-studio-dev`, profile agent `~/.omp-dev`, không đăng ký `omp://`, không chiếm phím tắt toàn cục.

## Đóng gói và phát hành

```bash
bun run package:mac:arm64 -- --publish never   # dist/wisa-studio-<ver>-arm64.dmg
bun run package:mac:x64   -- --publish never   # dist/wisa-studio-<ver>-x64.dmg
bun run package:win       -- --publish never   # NSIS + portable
bun run package:linux     -- --publish never   # AppImage + deb
```

Quy trình phát hành đầy đủ, gồm thứ tự build sidecar và kiểm tra gói, nằm trong [AGENTS.md](AGENTS.md) — đọc trước khi cắt bản. `appId` hiện vẫn là `sh.omp.gui` để không cắt người dùng khỏi auto-update; đổi `appId` là một bước riêng có di trú, xem [docs/vi/appid-va-cap-nhat.md](docs/vi/appid-va-cap-nhat.md).

## Giấy phép và ghi công

MIT — xem [LICENSE](LICENSE). Bản quyền gốc của oh-my-pi được giữ nguyên văn.

- oh-my-pi (upstream): https://github.com/can1357/oh-my-pi
- Lớp GUI gốc mà bản này dựa trên (MIT), cùng bản quyền gốc: xem [NOTICE](NOTICE).

WISA STUDIO không liên kết, không được bảo trợ bởi Anthropic, OpenAI, Google hay bất kỳ nhà cung cấp mô hình nào. Xem [NOTICE](NOTICE).
