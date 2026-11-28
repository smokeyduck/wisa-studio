# Wisa

**Bản desktop dựa trên oh-my-pi (MIT), do WISA phát triển.**

GUI desktop tiếng Việt cho oh-my-pi (omp) — trình coding agent cài một lần là chạy, nhiều phiên làm việc song song trong một cửa sổ, có sẵn cổng WISA để một API key dùng được mọi mô hình. Electron, cho macOS, Windows và Linux.

<img src="docs/screenshots/vi/01-conversation.png" alt="Wisa với một phiên làm việc tiếng Việt và tab Tổng quan" width="100%">

## Tải về

| Nền tảng | Gói |
|---|---|
| macOS Apple Silicon | `wisa-studio-1.1.5-arm64.dmg` — [trang phát hành](https://github.com/smokeyduck/wisa-studio/releases/tag/v1.1.5) |
| macOS Intel | `wisa-studio-1.1.5-x64.dmg` — [trang phát hành](https://github.com/smokeyduck/wisa-studio/releases/tag/v1.1.5) |
| Windows x64 | [`wisa-studio-1.1.5-setup.exe`](https://github.com/smokeyduck/wisa-studio/releases/download/v1.1.5/wisa-studio-1.1.5-setup.exe) |
| Linux x64 | [`wisa-studio-1.1.5.AppImage`](https://github.com/smokeyduck/wisa-studio/releases/download/v1.1.5/wisa-studio-1.1.5.AppImage) |

[Tất cả bản phát hành](https://github.com/smokeyduck/wisa-studio/releases) · [Hướng dẫn cài đặt](docs/vi/cai-dat.md)

Bản macOS được ký ad-hoc (chưa notarize) và bản Windows chưa ký, nên lần chạy đầu có thể phải xác nhận: macOS → chuột phải → **Open**, hoặc System Settings → Privacy & Security → **Open Anyway**; Windows → **More info** → **Run anyway**.

**Yêu cầu Windows:** Windows 10 x64 phiên bản 1809 (build 17763) trở lên, bao gồm Windows 11, và CPU x86-64-v2 có SSE4.2. Mức tối thiểu này dựa trên yêu cầu của Electron, Bun và native addon; không có nghĩa bản phát hành đã được kiểm thử trên máy Windows 10 thực tế.

### Có gì mới trong 1.1.5

Browser Use mở cửa sổ Chromium riêng để bạn nhìn thấy và tương tác; kiểm tra cập nhật nền vẫn chạy headless. Trong phiên Studio tương tác, Computer dùng chính sách duyệt công cụ thông thường thay vì hỏi lại sau mỗi thao tác; Core có thể đưa cửa sổ đích lên trước khi cần. Hạn chế đặt riêng và phím Escape vẫn có hiệu lực. Xem [changelog](CHANGELOG.md#115---2026-11-27).

## Lấy API key

Wisa tạo sẵn nhà cung cấp `wisa` trỏ tới `https://api.askwisa.com/v1`. Một key dùng cho mọi mô hình mà cổng phục vụ, danh sách mô hình được lấy tự động sau khi lưu key.

**[Lấy API key tại askwisa.com →](https://askwisa.com/?utm_source=github&utm_medium=readme)**

Không bắt buộc: bạn vẫn có thể dùng Anthropic, OpenAI, DeepSeek, OpenRouter, Gemini… như upstream hỗ trợ. Xem [hướng dẫn cấu hình provider](docs/vi/nha-cung-cap-wisa.md) và [FAQ](docs/vi/faq.md).

<div align="center">

[![Release](https://img.shields.io/github/v/release/smokeyduck/wisa-studio?style=flat&colorA=222222&colorB=3FB950)](https://github.com/smokeyduck/wisa-studio/releases)
[![Downloads](https://img.shields.io/endpoint?url=https%3A%2F%2Fsmokeyduck.github.io%2Fwisa-studio%2Fdownloads.json&style=flat&cacheSeconds=3600)](https://github.com/smokeyduck/wisa-studio/releases)
[![Phạm vi giấy phép](https://img.shields.io/badge/gi%E1%BA%A5y%20ph%C3%A9p-ph%E1%BA%A1m%20vi-BE185D?style=flat)](./LICENSE-SCOPE.md)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-222222?style=flat)
![Electron](https://img.shields.io/badge/Electron-35-47848F?style=flat&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white)

[English](README.en.md) · [Tiếng Việt](README.md)

</div>

---

## WISA STUDIO khác omp ở đâu

Phần đọc file, chạy lệnh, sửa mã, gọi tool, MCP và Skills do agent oh-my-pi đảm nhiệm. WISA STUDIO đóng gói agent từ commit của fork WISA ghi trong [`sidecar-source.json`](sidecar-source.json); fork có các thay đổi dành cho ứng dụng. Bản desktop còn có:

- **Tên và nhận diện:** WISA STUDIO thay cho tên cũ trong tiêu đề cửa sổ, tray, hộp thoại cấp quyền của macOS, tên file cài đặt.
- **Tiếng Việt mặc định:** giao diện có 5 ngôn ngữ (Tiếng Việt, English, 中文, Русский, ไทย), bản này mở ra là tiếng Việt.
- **Cổng WISA:** provider `wisa` được tạo sẵn, xuất hiện đầu tiên trong onboarding.
- **Bản phát hành:** trỏ về repo này.

Dữ liệu của WISA STUDIO nằm riêng ở `~/.wisa-studio/agent` (không phải `~/.omp`), nên phiên và cấu hình không dùng chung với omp CLI.

## Giao diện có gì

- **Phiên song song:** mỗi tab là một tiến trình agent riêng, công việc nền chạy tiếp khi bạn chuyển tab; tab được khôi phục chỉ khởi động khi mở.
- **Lịch sử hội thoại (chưa phát hành):** dùng bản ghi hiển thị đầy đủ của Core trên nhánh đang mở. Cuộn lên để đọc tin nhắn trước compact/handoff ngay trong hội thoại, không cần tải một bản xem trước riêng. Nén ngữ cảnh cho mô hình không cắt phần lịch sử hiển thị của phiên.
- **Chia đôi và nhiều cửa sổ:** đặt hai phiên cạnh nhau hoặc trên/dưới, kéo vách ngăn, khôi phục bố cục sau khi khởi động lại.
- **Không gian làm việc:** cây thư mục, tab file, sửa và lưu bằng `⌘S`, xem Markdown ở dạng nguồn hoặc đã render, xem diff và log.
- **Tác vụ định kỳ:** cron hoặc interval, chạy nền, có lịch sử chạy, báo cáo và bước xác minh.
- **Tổng quan phiên:** ngữ cảnh theo nhóm, chi phí, cache, tốc độ, subagent và MCP server đang chạy.
- **MCP, Skills, plugin, hook:** quản lý trong Cài đặt, không cần sửa JSON bằng tay.
- **Jev / TypeSafe:** kết nối TypeSafe hoặc nhập API key ngay trong **Vai trò mô hình**, chọn Judge gốc từ danh mục rồi bấm **Bật định tuyến Jev**. Core định tuyến tác nhân con chưa ghim mô hình giữa các model chat đã được cho phép; không thay model chat/Default. Bật tùy chọn sẽ gửi một đoạn mô tả công việc đến TypeSafe, không gửi lịch sử hội thoại hay ngữ cảnh chung. Tắt định tuyến vẫn giữ key và vai trò Judge.
- **SSH host, theme tuỳ chỉnh, command palette, chế độ giọng nói, cộng tác qua relay.**
- **Chế độ Làm việc:** mặc định cho phép đọc, tìm kiếm, theo dõi tác vụ và điều khiển màn hình nền mà không bật shell hay trình chạy mã đa dụng. Cài đặt **Máy tính** dùng chung và yêu cầu phê duyệt thao tác vẫn áp dụng.

Giới hạn cần biết: các tab không phải ranh giới bảo mật của hệ điều hành; chia đôi là hai khung, không phải lưới vô hạn; phê duyệt và quét bảo mật không thay cho sandbox. Request mô hình vẫn đi tới nhà cung cấp bạn cấu hình.

### Hình nền và hướng dẫn lần đầu (chưa phát hành)

Nút **Hình nền** ở góc trái dưới khung soạn hiện tên khi rê chuột hoặc dùng bàn phím. Chọn ảnh hoặc video cục bộ để phủ liền vùng hội thoại, hai bên và phía sau khung soạn. Video tự lặp, tắt tiếng; có nút tạm dừng và khôi phục nền mặc định. Tệp được sao chép vào hồ sơ ứng dụng, không tải lên nhà cung cấp; video tạm dừng khi vùng hội thoại không hiển thị và mặc định không tự phát nếu hệ thống bật Giảm chuyển động.

Sau khi kiểm tra kết nối có nhà cung cấp dùng được và ít nhất một model, Wisa mở tour 24 bước trên giao diện thật: làm tối toàn cửa sổ, khoanh sáng từng tính năng và đặt lời giải thích cạnh nó. Mục lục chia nhóm workspace, hội thoại, kiến thức, tự động hóa và tùy chỉnh; có thể nhảy thẳng tới Skills, bộ nhớ, ngữ cảnh, Goal, Loop hoặc TypeSafe/Jev. Tour chỉ điều hướng giao diện, không gửi tin nhắn, đổi model hay bật tính năng; đóng sẽ khôi phục trang trước đó. Hoàn tất hoặc bỏ qua được ghi nhớ riêng với trạng thái kết nối; nhấn Escape chỉ đóng lần này. Mở lại bất kỳ lúc nào bằng `/tutorial` hoặc tìm hướng dẫn trong bảng lệnh `Cmd+K`.

Tên hiển thị mới là **Wisa** (`Wisa.app` trên macOS, `Wisa.exe` trên Windows). `appId`, thư mục hồ sơ, deep link, tên sidecar và tên tệp phát hành `wisa-studio-*` không đổi. Khi nâng cấp từ WISA STUDIO trên macOS, xóa bản ứng dụng cũ sau khi xác nhận Wisa mở đúng dữ liệu để tránh hai biểu tượng cùng tồn tại; không xóa thư mục hồ sơ.

### Tai thỏ và chạy nền (chưa phát hành)

**Cài đặt → Tai thỏ** có trang riêng bằng cả năm ngôn ngữ. macOS dùng giao diện native tùy biến từ [Notch Island](https://github.com/MANISH007700/notch-island), mã nguồn MIT tại commit `6217ed2360ad4c0887abc725f9cd9e6e2ea02427`; Windows/Linux dùng thanh nổi Electron riêng. Không tải hoặc chạy bản cập nhật Notch độc lập.

Trình thiết kế cho thêm/xóa/sắp xếp tiện ích **Phiên, Đồng hồ, Ghi chú, Hoạt động**, chỉnh tiêu đề/nội dung, màu nền/chữ/nhấn, chiều rộng, độ đục, bo góc, số thẻ hiển thị và hành vi rê chuột/phê duyệt/âm thanh/phím tắt. Chỉnh sửa là bản nháp cho tới khi bấm **Lưu cấu hình**; có thể bỏ thay đổi. Xem trước chỉ mô tả bố cục, không tạo dữ liệu phiên giả. Yêu cầu duyệt vẫn truy cập được khi bố cục không có tiện ích Phiên.

**Xuất mẫu / Nhập mẫu** dùng JSON `wisa-notch` phiên bản 1, tối đa 64 KiB. Mẫu chỉ chứa giao diện/hành vi và lựa chọn agent hiển thị; không chứa token, đường dẫn bridge, hook đã cài hoặc quyền. Nhập cần xác nhận thay cấu hình và không tự kết nối agent.

Gõ **`/customize-notch`** trong phiên Agent để bật công cụ `notch_app` cùng hướng dẫn SDK cho riêng phiên đó. Sau đó yêu cầu một mini-app HTML/CSS/JavaScript bất kỳ: trò chơi, đồng hồ, bảng phiên hoặc giao diện riêng, không giới hạn vào các tiện ích có sẵn. Agent lưu mã nguồn thành phiên bản, mở xem trước rồi đề nghị áp dụng; hộp thoại Wisa xác nhận đúng app/phiên bản trước khi thay Tai thỏ. `/customize-notch off`, đổi phiên hoặc khởi động lại sidecar thu hồi công cụ, không xóa app đã lưu. **Cài đặt → Tai thỏ → Mini-app** quản lý phiên bản, xem trước, áp dụng/khôi phục và dừng để trở về Tai thỏ mặc định. App được áp dụng tự khôi phục khi mở Wisa.

Mini-app chạy trong sandbox riêng, không có Node/Electron, tệp, mạng hay quyền hệ thống mặc định. SDK cung cấp kho trạng thái riêng và các yêu cầu qua cầu nối Wisa; đọc phiên, clipboard, thông báo, mở URL hoặc chạy chương trình hệ thống phải xác nhận từng thao tác cụ thể. Quyền không đi theo mã HTML hoặc phiên bản đã lưu. Dùng `notch_app` với `read` để lấy toàn bộ mã nguồn/SDK và `save` để nhập lại thành phiên bản mới; không đưa khóa hoặc dữ liệu bí mật vào HTML chia sẻ.

Wisa có sẵn cầu nối phiên và yêu cầu tương tác. Claude Code/Codex có hook phê duyệt `allow/deny`; Cursor, Gemini CLI, Copilot và OpenCode chỉ gửi hoạt động/thông báo, quyền vẫn ở agent gốc. Bấm **Kết nối** và xác nhận đúng agent/đường dẫn để cài hook hoặc plugin; **Ngắt kết nối** chỉ gỡ phần Wisa, giữ cấu hình khác và sao lưu trước khi sửa. Không tự bật trust hoặc policy hooks. Hook dùng thư mục mặc định trong home; hồ sơ agent có đường dẫn tùy chỉnh cần adapter riêng. Với **Tác nhân tùy chỉnh**, kết nối tạo metadata giao thức tại đường dẫn hiển thị; adapter dùng lệnh được cung cấp hoặc HTTP loopback xác thực. Không chia sẻ `bridge.json` hay token. Timeout, mất kết nối hoặc phản hồi không hợp lệ không cấp quyền: agent phải dùng prompt gốc. Không thực thi lệnh terminal hoặc tự cấp quyền từ nội dung hook.

Phản hồi thuộc đúng request/phiên; trả lời ở nơi khác hủy bản sao còn lại. Đăng nhập, trình sửa và biểu mẫu không hỗ trợ vẫn ở Wisa. Nút mở phiên ngoài chỉ đưa Wisa ra trước, không chạy lệnh hoặc tự nhảy vào terminal bên ngoài. Tai thỏ không có nút dừng/gửi prompt mới cho mọi agent. Phím tắt duyệt native: `⌘Y`/`⌘N`; thanh nổi: `Ctrl+Alt+Y`/`Ctrl+Alt+N` (chỉ khi bật và có yêu cầu hợp lệ).

Đóng cửa sổ giữ tab, draft và sidecar chạy nền. Mở lại bằng Dock, tray/menu bar hoặc phím tắt hiện/ẩn. **Thoát Wisa** mới kết thúc ứng dụng và vẫn xác nhận nếu có công việc hoặc file chưa lưu. Nếu không có tray/Dock để mở lại, ứng dụng giữ cửa sổ thay vì làm nó biến mất. Không tự thêm vào khởi động cùng hệ điều hành.

Trên macOS, `bun run dev` dựng helper nếu thiếu hoặc nguồn đã đổi; cần Xcode Command Line Tools. `bun run build:notch-island` dựng helper universal Apple Silicon/Intel. Mã nguồn và giấy phép ở `native/notch-island/`; binary ở `resources/notch-island/` không commit.

### Chia khung cho hai phiên Agent (chưa phát hành)

Mở hai tab Agent trong cùng workspace, bấm chuột phải lên một tab rồi chọn chia sang phải hoặc chia xuống dưới. Với cửa sổ hẹp, Studio xếp hai khung theo chiều dọc mà không đổi bố cục đã lưu. Bạn có thể yêu cầu một phiên xem trạng thái hoặc gửi lời nhắn bàn giao qua `workspace_peer`. Lời nhắn nằm trong bộ nhớ và chỉ được đọc khi phiên nhận gọi `receive`; nó không bắt đầu hay ngắt lượt đang chạy. Bỏ chia khung, chuyển phiên hoặc đóng tab sẽ xóa lời nhắn chưa đọc.

Thanh bên phải phủ lên khung đang chọn. **Shift+Tab** đổi chế độ Kế hoạch tại ô soạn mà không mở thanh bên. Nút **Terminal** trên thanh bên mở terminal của hệ điều hành tại workspace của tab đang chọn. Lệnh tương tác do agent chạy vẫn dùng bảng terminal của Studio.

### Công cụ trong Work và Coding (chưa phát hành)

Coding dùng cấu hình công cụ và `edit.mode` / `edit.modelVariants` của Core. Studio không còn đọc tùy chọn Hồ sơ công cụ cũ của GUI. Work dùng bộ công cụ gọn hơn và bật `computer` mặc định; `computer.enabled: false`, yêu cầu phê duyệt và `--no-tools` vẫn có hiệu lực.

`task.judgeRouting` tắt mặc định. Khi bật, Judge native đã cấu hình có thể nhận một đoạn trích giới hạn của từng nhiệm vụ subagent chưa ghim, không nhận bản ghi hội thoại cha. Judge chỉ được chọn tuyến đã cấp quyền. Lựa chọn ghim và cách phân giải mặc định của Core vẫn có hiệu lực.

### Kiến thức dự án trong Obsidian (chưa phát hành)

Trong Memory → Kiến thức dự án, bật `vault.enabled` rồi chọn một Obsidian Vault có sẵn. Ghi chú và bài học đã duyệt của dự án được lưu thành Markdown trong vault, không ghi thêm một bản vào Memory cục bộ. Nếu vault bị tắt hoặc không truy cập được, Studio báo lỗi thay vì tự đổi nguồn. Memory tự động vẫn hoạt động riêng; chọn vault không sao chép hay xóa dữ liệu cũ.

### Nhập chính tả và đọc to tiếng Việt (chưa phát hành)

Studio mặc định dùng Whisper Small cục bộ với tiếng Việt nếu bạn chưa chọn mô hình hoặc ngôn ngữ. Chỉ dùng dịch vụ nhập chính tả đám mây khi bạn chọn rõ mô hình đám mây; lỗi cục bộ không làm bản ghi bị gửi lên dịch vụ.

Vào Cài đặt → Nhà cung cấp → Dịch vụ, chọn **Giọng đọc tiếng Việt** rồi bấm **Nghe thử**. VAIS-1000 là giọng Bắc, có thể cần tải mô hình một lần; văn bản được tổng hợp tại máy. Tùy chọn giọng hệ thống dùng giọng tiếng Việt đã cài hoặc báo thiếu. Đọc to phát tin nhắn mới theo thứ tự, có thể dừng cho lượt đang chạy, và không đọc lại lịch sử đã tải.

### Duyệt web bằng Browser Use

Nhập yêu cầu trong tab Agent, ví dụ: “Dùng `browser_use` mở https://example.com và cho tôi biết tiêu đề trang.” Agent gọi công cụ `browser_use` của OMP; không còn nút quả địa cầu hay cửa sổ Trình duyệt WISA tích hợp.

Studio đi kèm gói Python chính thức [Browser Use](https://github.com/browser-use/browser-use) và Chromium cục bộ. Khi agent bắt đầu duyệt, Chromium mở một cửa sổ riêng; bạn có thể bấm, gõ và chuyển tab trực tiếp. Mỗi phiên duyệt dùng một hồ sơ tạm riêng, không dùng trình duyệt đám mây hay hồ sơ Chrome cá nhân. Studio không nhập hay xóa dữ liệu của Trình duyệt WISA cũ.

Studio kiểm tra bản ổn định mới nhất trên GitHub khi mở app và mỗi ngày app còn chạy. Nếu cài đặt và kiểm thử Chromium thành công, phiên Agent mở sau đó dùng bản mới; phiên đang duyệt tiếp tục dùng bản cũ. Không cần cài Python hay tải Chromium ở lần chạy đầu. Nếu mất mạng hoặc bản mới lỗi, Studio giữ nguyên bản đang hoạt động.

Để chạy ngoại tuyến hoặc kiểm thử với phiên bản cố định, mở Studio với `WISA_BROWSER_USE_AUTO_UPDATE=0`. Thiết lập này chỉ tắt cập nhật Browser Use, không tắt công cụ duyệt web.

## Cài đặt

Tải gói ở trên, mở lên, dán API key (hoặc chọn provider khác) là dùng được. Không cần cài Node, Bun hay omp CLI — agent đã nằm trong gói.

Chi tiết theo từng nền tảng, cách đặt lại dữ liệu và xử lý lỗi khi mở app: [docs/vi/cai-dat.md](docs/vi/cai-dat.md).

### Nhập dữ liệu Claude và ChatGPT (chưa phát hành)

Mở chức năng nhập dữ liệu, chọn bản xuất chính thức và mở tệp ZIP hoặc JSON đã tải về. Xem trước hội thoại, lọc, chọn từng cuộc hoặc toàn bộ rồi nhập; hội thoại đã nhập có thể tiếp tục trong WISA. Claude Code và Codex là các nguồn phiên cục bộ riêng, không phải lịch sử từ ứng dụng Claude hay ChatGPT.

- Claude: vào **Settings → Privacy → Export data**; xem [hướng dẫn chính thức](https://support.claude.com/en/articles/9450526-export-your-claude-data).
- ChatGPT: vào **Settings → Data controls → Export data**; xem [hướng dẫn chính thức](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data).
- Nhập chạy cục bộ, không cần cookie hay đăng nhập tài khoản nguồn. WISA giữ nguyên tệp nguồn, lưu bản sao riêng trong profile agent và cung cấp thư mục tham chiếu cho project, tài liệu, tệp cùng metadata có trong gói. Cấu hình, bộ nhớ và hướng dẫn từ nguồn không tự trở thành cấu hình hay quyền của WISA.
- Đây không phải chuyển nguyên tài khoản: Anthropic không đưa tệp gốc đã tải lên vào bản xuất Claude. JSON riêng lẻ cũng không chứa các tệp nằm bên cạnh nó. Dữ liệu không chuyển thành chat được giữ để tham chiếu và báo rõ; WISA không khôi phục tệp vắng mặt. Khi tiếp tục hội thoại, nội dung gửi mô hình vẫn đi tới nhà cung cấp bạn đã cấu hình.

## Vị trí dữ liệu và cùng tồn tại

WISA STUDIO giữ dữ liệu riêng và không đọc hay ghi `~/.omp`. Không có di chuyển dữ liệu tự động từ bản cũ.

| Dữ liệu | macOS | Windows | Linux |
|---|---|---|---|
| Cài đặt app, tab, lịch tác vụ, chỉ mục hội thoại, `logs/gui-runtime.jsonl` | `~/Library/Application Support/wisa-studio` | `%APPDATA%\wisa-studio` | `~/.config/wisa-studio` |
| Cấu hình agent: `models.yml`, MCP, skills, phiên | `~/.wisa-studio/agent` | `%USERPROFILE%\.wisa-studio\agent` | `~/.wisa-studio/agent` |
| Nhật ký agent | `~/.wisa-studio/logs` | `%USERPROFILE%\.wisa-studio\logs` | `~/.wisa-studio/logs` |
| Cấu hình dự án (trong thư mục làm việc) | `.wisa-studio/` | `.wisa-studio\` | `.wisa-studio/` |

Chạy phát triển (`bun run dev`) dùng `wisa-studio-dev` và `~/.wisa-studio-dev/agent`. Thư mục tạm của agent là `~/.wisa-studio-dev/tmp`.

Kiểm thử và tự động hóa có thể đặt `WISA_PROFILE_ROOT` (đường dẫn tuyệt đối) để chuyển toàn bộ dữ liệu trên sang `<root>/appData/wisa-studio` và `<root>/.wisa-studio/agent`. Đây là biến dành cho kiểm thử, không phải cách chọn thư mục dữ liệu tùy ý.

Các bản cũ lưu dữ liệu ở `…/omp` (userData) và `~/.omp` (agent). WISA STUDIO không sao chép, di chuyển hay xoá dữ liệu đó. API key đã lưu phải dán lại trong bản mới.

Cùng tồn tại:

- Với bản upstream `omp` (`productName: omp`, `appId: sh.omp.gui`) bản mới cài riêng: khác thư mục cài và định danh.
- Bản WISA STUDIO cũ (`appId: sh.omp.gui`) dùng `WISA STUDIO.app`; bản mới dùng tên hiển thị Wisa và `Wisa.app`. Thư mục dữ liệu cũ không bị đụng tới; hai tệp ứng dụng có thể cùng tồn tại nhưng không dùng chung định danh hoặc hồ sơ.
- Bản WISA cũ đọc cùng feed phát hành, nên trình tự cập nhật có thể cài bản mới tại chỗ. Cập nhật đó không mang theo dữ liệu: ứng dụng mở trên thư mục dữ liệu mới, còn key và quyền macOS gắn với định danh cũ không đi theo.
- Bản upstream `nornzach/oh-my-pi-gui` đọc feed riêng, không nhận bản WISA.
- WISA STUDIO không phải sandbox. Agent chạy với môi trường shell đăng nhập, PATH, cấu hình Git và SSH, và các thư mục làm việc bạn mở. Những thứ này được dùng chung có chủ ý.

## Phát triển

Repo này là GUI repo. Agent trong monorepo OMP Core được biên dịch thành sidecar. Chạy các lệnh sau từ `packages/gui` trong monorepo; với checkout GUI độc lập, đặt `WISA_CORE_ROOT` thành đường dẫn tuyệt đối tới checkout Core khi dựng sidecar hoặc chạy `scripts/sync-upstream.sh`:

```bash
bun install
bun run build:omp          # → resources/omp (arm64)
bun run build:omp:x64      # → resources/omp.x64 (Intel)
bun run build:omp:win      # → resources/omp.exe
bun run build              # → out/
bun run dev                # HMR; dùng resources/omp[.exe], OMP_BUNDLED_OMP hoặc build từ mã nguồn
bun run dev --stop         # từ terminal khác: dừng GUI dev, Vite và sidecar của phiên đó
```

Kiểm tra trước khi gửi PR:

```bash
bunx vitest run
bun run check:types
bunx biome check .
bun run check:locale       # ru + vi phủ đủ mọi setting mà sidecar cung cấp
bun run build
```

`bun run dev` chạy tách biệt với bản đã cài: userData `wisa-studio-dev`, profile agent `~/.wisa-studio-dev/agent`, không đăng ký URL scheme với hệ điều hành, không chiếm phím tắt toàn cục.

Main và preload cũng được theo dõi thay đổi; khi chúng được dựng lại, Electron khởi động lại hoặc tải lại cửa sổ để giữ IPC đồng bộ với renderer. Nếu một phiên dev cũ báo cần khởi động lại, thoát và chạy lại `bun run dev` một lần; chỉ tải lại cửa sổ không cập nhật main process.

`bun run dev --stop` chỉ dừng tiến trình do `bun run dev` của checkout và profile hiện tại khởi động, không tắt bản đã cài. Nếu lúc khởi động có đặt `WISA_PROFILE_ROOT`, dùng cùng giá trị khi dừng. Lệnh này ngắt cả tác vụ dev đang chạy.

Giao diện dùng vật liệu Liquid Glass từ [OpenGlass UI](https://github.com/moekoelueker/open-glass-ui) (MIT, ghim phiên bản trong `package.json`). `src/renderer/lib/liquid-glass.ts` tạo token một lần lúc khởi động; `src/renderer/styles/liquid-glass.css` ánh xạ chúng vào design system chung. Thêm màn hình bằng các primitive/class hiện có, không thêm blur theo từng hàng. Màu theo theme hiện tại; chế độ giảm độ trong suốt và tương phản cao dùng vật liệu đặc, không blur.

Ghi đè chỉ dành cho phát triển, chỉ với bản chưa đóng gói: `OMP_BUNDLED_OMP=<path>` chạy binary đó thay cho `resources/omp`, và `OMP_SIDECAR=source` chạy mã nguồn coding-agent của monorepo qua bun. Bản đóng gói bỏ qua cả hai. App không kiểm tra rằng bản ghi đè hiểu `PI_CONFIG_SOURCES` / `PI_PROJECT_CONFIG_DIR` hay profile cách ly; dùng chúng là trách nhiệm của bạn.

## Đóng gói và phát hành

Chạy `bun run build:browser-use` trên đúng hệ điều hành và kiến trúc đích trước khi đóng gói hoặc thử công cụ duyệt web ở chế độ phát triển. Lệnh này chuẩn bị gói Python chính thức và bản Chromium mã nguồn mở đã ghim trong `resources/browser-use`.

```bash
bun run package:mac:arm64 -- --publish never   # dist/wisa-studio-<ver>-arm64.dmg
bun run package:mac:x64   -- --publish never   # dist/wisa-studio-<ver>-x64.dmg
bun run package:win       -- --publish never   # NSIS + portable
bun run package:linux     -- --publish never   # AppImage + deb
```

Quy trình phát hành đầy đủ, gồm thứ tự build sidecar và kiểm tra gói, nằm trong [AGENTS.md](AGENTS.md) — đọc trước khi cắt bản. Định danh đóng gói và các bước cutover nằm trong [docs/vi/appid-va-cap-nhat.md](docs/vi/appid-va-cap-nhat.md).

Actions tái sử dụng cache tải dependency và gói Browser Use đúng hệ điều hành/kiến trúc, khóa theo recipe và kiểm chứng lại trước khi đóng gói. Native addon vẫn bị khóa theo Core commit; khi cần build lại, Cargo kiểm tra các intermediate đã cache. macOS kiểm chứng DMG/ZIP ngay trên host build trước khi chuyển artifact; Windows dùng mức nén 7z 5 để giảm CPU. Tất cả kiểm tra runtime và updater vẫn bắt buộc, không dùng lại installer từ cache.

## Giấy phép và ghi công

Từ v0.9.55, phần đóng góp của WinSell trong đúng hai tệp SEO Audit được cấp theo PolyForm Strict 1.0.0; xem [phạm vi giấy phép](LICENSE-SCOPE.md). [Giấy phép MIT](LICENSE), thông báo bản quyền gốc và các quyền đã được cấp theo MIT vẫn được giữ.

- oh-my-pi (upstream): https://github.com/can1357/oh-my-pi
- Lớp GUI gốc mà bản này dựa trên (MIT), cùng bản quyền gốc: xem [NOTICE](NOTICE).
- Những người đóng góp cho WISA STUDIO: [lịch sử ghi công trên GitHub](https://github.com/smokeyduck/wisa-studio/graphs/contributors). Bạn có thể [báo lỗi hoặc đề xuất cải tiến](https://github.com/smokeyduck/wisa-studio/issues) và [gửi pull request](https://github.com/smokeyduck/wisa-studio/pulls).

WISA STUDIO không liên kết, không được bảo trợ bởi Anthropic, OpenAI, Google hay bất kỳ nhà cung cấp mô hình nào. Xem [NOTICE](NOTICE).
