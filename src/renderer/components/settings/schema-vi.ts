// Vietnamese schema prose; wire paths and values are unchanged.
export const VI_GROUP_TITLES: Record<string, string> = {
	Prompt: "Câu lệnh",
	"Startup & Updates": "Khởi động & cập nhật",
	Git: "Git",
	Theme: "Chủ đề",
	Composer: "Khung soạn",
	"Status Line": "Dòng trạng thái",
	Images: "Hình ảnh",
	Display: "Hiển thị",
	Input: "Nhập",
	"Magic Keywords": "Từ khóa Magic",
	Notifications: "Thông báo",
	Power: "Nguồn",
	Prewalk: "Prewalk",
	Services: "Dịch vụ",
	Vision: "Thị giác",
	Thinking: "Thinking",
	Sampling: "Lấy mẫu",
	"Retry & Fallback": "Thử lại & dự phòng",
	Fireworks: "Fireworks",
	"Tiny Model": "Mô hình nhỏ",
	Agent: "Agent",
	Protocol: "Giao thức",
	Timeouts: "Thời gian chờ",
	Privacy: "Quyền riêng tư",
	Advisor: "Cố vấn",
	General: "Chung",
	Chat: "Chat",
	Compaction: "Nén ngữ cảnh",
	Experimental: "Thử nghiệm",
	Sharpshooter: "Sharpshooter",
	"Auto-Learn": "Auto-Learn",
	Mnemopi: "Mnemopi",
	Hindsight: "Hindsight",
	"Rules (TTSR)": "Quy tắc (TTSR)",
	Editing: "Chỉnh sửa",
	"Output Limits": "Giới hạn đầu ra",
	Reading: "Đọc",
	"Read Summaries": "Tóm tắt khi đọc",
	Approvals: "Phê duyệt",
	"Available Tools": "Công cụ khả dụng",
	Todos: "Việc cần làm",
	"Grep & Browser": "Grep & Browser",
	Computer: "Máy tính",
	Execution: "Thực thi",
	GitHub: "GitHub",
	"Discovery & MCP": "Khám phá & MCP",
	Developer: "Nhà phát triển",
	LSP: "LSP",
	Bash: "Bash",
	"Eval & Runtimes": "Eval & môi trường chạy",
	Isolation: "Cô lập",
	Subagents: "Tác nhân con",
	Modes: "Chế độ",
	Skills: "Skills",
	"Commands & Skills": "Lệnh & Skills",
	Extensions: "Tiện ích mở rộng",
	"IDA Pro": "IDA Pro",
	Speech: "Giọng nói",
	Collab: "Cộng tác",
	Stream: "Truyền phát",
	"Power (macOS)": "Nguồn (macOS)",
	Disassembler: "Disassembler",
	Find: "Find",
	Ghidra: "Ghidra",
};
export const VI_SETTINGS: Record<string, { label?: string; description?: string }> = {
	"auth.broker.url": {
		label: "auth.broker.url",
	},
	"auth.broker.token": {
		label: "auth.broker.token",
	},
	"auth.accountPolicies": {
		label: "auth.accountPolicies",
	},
	enabledModels: {
		label: "enabledModels",
	},
	enabledProviders: {
		label: "enabledProviders",
	},
	disabledProviders: {
		label: "disabledProviders",
	},
	modelRoleStorage: {
		label: "Lưu trữ vai trò mô hình",
		description: "Nơi lưu các chỉ định vai trò trong bộ chọn mô hình",
	},
	modelRoles: {
		label: "modelRoles",
	},
	modelPresets: {
		label: "modelPresets",
	},
	modelTags: {
		label: "modelTags",
	},
	modelProviderOrder: {
		label: "modelProviderOrder",
	},
	cycleOrder: {
		label: "cycleOrder",
	},
	setupVersion: {
		label: "setupVersion",
	},
	autoResume: {
		label: "Tự động tiếp tục",
		description: "Tự động tiếp tục phiên gần nhất trong thư mục hiện tại",
	},
	"git.enabled": {
		label: "Bật tích hợp Git",
		description:
			"Hiển thị branch Git, trạng thái và thông tin PR trong TUI, đồng thời theo dõi siêu dữ liệu kho lưu trữ.",
	},
	"theme.dark": {
		label: "Chủ đề tối",
		description: "Chủ đề cho terminal có nền tối",
	},
	"theme.light": {
		label: "Chủ đề sáng",
		description: "Chủ đề cho terminal có nền sáng",
	},
	symbolPreset: {
		label: "Bộ ký hiệu",
		description: "Bộ glyph cho biểu tượng và ký hiệu (Unicode, Nerd Font hoặc ASCII)",
	},
	colorBlindMode: {
		label: "Chế độ mù màu",
		description: "Dùng màu xanh dương thay vì xanh lá cho phần thêm vào trong diff",
	},
	"composer.shape": {
		label: "Hình dạng ô soạn thảo",
		description: "Diện mạo của ô nhập và thanh trạng thái",
	},
	"composer.tokenRate": {
		label: "Tốc độ tạo token",
		description:
			"Hiển thị tốc độ tạo token hiện tại (token/giây): trong dòng thực thi cạnh tên phiên hoặc trong thanh gốc của trình soạn thảo ngay sau mức Reasoning; giá trị cuối cùng được giữ giữa các lượt. Ước lượng dựa trên các thay đổi được truyền và được hiệu chỉnh theo số token đầu ra mà nhà cung cấp tính phí sau khi mỗi tin nhắn hoàn tất.",
	},
	"statusLine.preset": {
		label: "Bộ mẫu thanh trạng thái",
		description: "Cấu hình dựng sẵn cho thanh trạng thái",
	},
	"statusLine.separator": {
		label: "Dấu phân cách thanh trạng thái",
		description: "Kiểu dấu phân cách giữa các phân đoạn",
	},
	"statusLine.contextLine": {
		label: "Dòng hiển thị ngữ cảnh",
		description:
			"Cách đường kẻ giữa phân đoạn trái và phải hiển thị mức dùng ngữ cảnh (chỉ cho trình soạn thảo có khung)",
	},
	"statusLine.sessionAccent": {
		label: "Màu nhấn của phiên",
		description: "Dùng màu tên phiên cho khung trình soạn thảo và khoảng trống của thanh trạng thái",
	},
	"statusLine.transparent": {
		label: "Thanh trạng thái trong suốt",
		description:
			"Dùng nền mặc định của terminal cho thanh trạng thái thay vì `statusLineBg` của chủ đề. Các phần tử Powerline ở cuối bị ẩn vì chúng cần nền tương phản để chuyển tiếp sang nền terminal.",
	},
	"statusLine.compactThinkingLevel": {
		label: "Mức Reasoning gọn",
		description:
			"Hiển thị mức Reasoning bằng một biểu tượng cạnh tên mô hình thay vì hậu tố riêng ` - <level>`; trong trình soạn thảo Tern - bằng biểu tượng trên nhãn mô hình thay vì nhãn riêng (nhấn biểu tượng để chuyển mức).",
	},
	"statusLine.showHookStatus": {
		label: "Hiển thị trạng thái Hook",
		description: "Hiển thị thông báo trạng thái Hook bên dưới thanh trạng thái",
	},
	"statusLine.leftSegments": {
		label: "statusLine.leftSegments",
	},
	"statusLine.rightSegments": {
		label: "statusLine.rightSegments",
	},
	"statusLine.segmentOptions": {
		label: "statusLine.segmentOptions",
	},
	"terminal.showImages": {
		label: "Hiển thị ảnh nội tuyến",
		description: "Hiển thị ảnh ngay trong terminal",
	},
	"images.autoResize": {
		label: "Tự động đổi kích thước ảnh",
		description: "Thu nhỏ ảnh lớn xuống tối đa 2000x2000 để tương thích tốt hơn với các mô hình",
	},
	"images.blockImages": {
		label: "Chặn ảnh",
		description: "Không gửi ảnh tới các nhà cung cấp LLM",
	},
	"tui.maxInlineImageColumns": {
		label: "tui.maxInlineImageColumns",
	},
	"tui.maxInlineImageRows": {
		label: "tui.maxInlineImageRows",
	},
	"tui.maxInlineImages": {
		label: "tui.maxInlineImages",
	},
	"tui.resizeScrollback": {
		label: "Làm mới bộ đệm cuộn",
		description: "Cách các dòng lịch sử lưu trong bộ đệm cuộn được làm mới sau khi đổi kích thước terminal",
	},
	"terminal.showProgress": {
		label: "Chỉ báo tiến trình của terminal",
		description:
			"Gửi chỉ báo tiến trình không xác định OSC 9;4 khi tác nhân đang làm việc hoặc đang bảo trì ngữ cảnh (luôn bật trong Tern)",
	},
	"terminal.programStatus": {
		label: "Trạng thái chương trình (OSC 7501)",
		description:
			"Gửi trạng thái tác nhân qua OSC 7501: đang làm việc, đang chờ bạn, đã hoàn thành hoặc kết thúc với lỗi; dùng cho chỉ báo trên thẻ terminal và tin nhắn đến cho tác nhân",
	},
	"tui.textSizing": {
		label: "Tiêu đề lớn (Kitty)",
		description:
			"Hiển thị tiêu đề Markdown H1 ở tỉ lệ 2x bằng giao thức đổi kích thước văn bản OSC 66 trong Kitty. Chỉ hoạt động trong terminal Kitty; ở nơi khác sẽ bị bỏ qua. Mặc định tắt.",
	},
	"tui.renderMermaid": {
		label: "Hiển thị biểu đồ Mermaid",
		description: "Chuyển các khối mã Mermaid thành biểu đồ ASCII",
	},
	"tui.renderSvg": {
		label: "Hiển thị ảnh SVG",
		description:
			"Gợi ý tác nhân tạo biểu đồ và đồ thị dạng SVG rồi hiển thị chúng dưới dạng ảnh trong các terminal hỗ trợ đồ họa",
	},
	"tui.autoGraph": {
		label: "Tự động vẽ đồ thị từ bảng",
		description:
			"Vẽ đồ thị theo màu chủ đề của bạn bên dưới các bảng số trong câu trả lời của tác nhân (trong terminal hỗ trợ đồ họa)",
	},
	"tui.reactions": {
		label: "Biểu cảm của tác nhân",
		description: "Cho phép tác nhân phản ứng với tin nhắn của bạn bằng biểu tượng emoji trong bong bóng của nó",
	},
	"tui.codexResetFireworks": {
		label: "Pháo hoa khi đặt lại Codex",
		description:
			"Đánh dấu các lần đặt lại mức dùng Codex hàng tuần ngoài kế hoạch và các lần đặt lại tích lũy mới bằng pháo hoa ở một phần ba trên màn hình; pháo hoa hiển thị cho đến khi nhấn ⎋",
	},
	"tui.titleState": {
		label: "Trạng thái làm việc trên tiêu đề terminal",
		description:
			"Hiển thị trạng thái tác nhân trong dấu phân cách tiêu đề terminal: chỉ báo động khi đang làm việc (':' tĩnh trên WSL), '>' khi đến lượt bạn, '!' khi tác nhân đang chờ bạn",
	},
	"tui.titleSpinner": {
		label: "Biểu tượng quay trên tiêu đề terminal",
		description:
			"Bộ ký tự cho chỉ báo làm việc trên tiêu đề terminal: hoạt ảnh chữ nổi Braille, mặt trăng đang đầy, vòng chấm đơn hoặc đường kẻ bằng ký tự ASCII",
	},
	"tui.hyperlinks": {
		label: "Siêu liên kết trong terminal",
		description:
			"Định dạng đường dẫn và URL thành siêu liên kết OSC 8 để mở bằng cách nhấn trong terminal (auto: tự phát hiện hỗ trợ; off: không bao giờ; always: luôn luôn)",
	},
	"tui.mouse": {
		label: "Lấy nét bằng nhấp chuột",
		description:
			"Bắt sự kiện nhấp chuột trong phiên chính để thẻ của các tác nhân con đang hoạt động và các dòng HUD nhận nét khi nhấp, đồng thời mục tiêu được làm nổi bật khi rê chuột. Khi bật, chọn văn bản bằng ⇧+kéo, cuộn bằng con lăn qua ⇧+con lăn",
	},
	"tui.tight": {
		label: "Bố cục gọn",
		description: "Bỏ khoảng đệm ngang một ký tự ở bên trái và phải của đầu ra terminal",
	},
	"display.shimmer": {
		label: "Hiệu ứng lấp lánh",
		description: "Kiểu hoạt ảnh cho thông báo làm việc và đang tải",
	},
	"display.pinnedAgents": {
		label: "Tác nhân được ghim",
		description:
			"Danh sách chuyển nhanh tới các tác nhân đang hoạt động được ghim phía trên trình soạn thảo (off: ẩn; collapsed: hiện vài dòng kèm nút mở rộng; full: hiện tất cả)",
	},
	"display.subagentLivePreview": {
		label: "Xem trước tác nhân con",
		description:
			"Hiển thị lần gọi công cụ hiện tại (hoặc gần nhất) của mỗi tác nhân con được ghim bên dưới dòng của nó",
	},
	"display.smoothStreaming": {
		label: "Truyền phát mượt",
		description: "Hiển thị mượt văn bản của trợ lý và luồng nhập của công cụ ngay khi các mảnh dữ liệu đến",
	},
	"display.hideToolActivity": {
		label: "Ẩn hoạt động của công cụ",
		description: "Ẩn khỏi lịch sử các lệnh gọi công cụ do mô hình khởi tạo và kết quả của chúng",
	},
	"display.showTokenUsage": {
		label: "Hiển thị mức dùng token",
		description: "Hiển thị mức dùng token mỗi lượt trong tin nhắn của trợ lý",
	},
	"display.showTurnTime": {
		label: "Hiển thị thời lượng lượt",
		description:
			"Hiển thị tổng thời gian từ câu lệnh đến khi bàn giao (bao gồm các lệnh gọi công cụ) trong dòng mức dùng của tin nhắn trợ lý",
	},
	"display.cacheMissMarker": {
		label: "Dấu trượt bộ nhớ đệm",
		description: "Hiển thị dấu phân cách sau một lượt của trợ lý khi yêu cầu không trúng bộ nhớ đệm câu lệnh",
	},
	"display.collapseCompacted": {
		label: "Thu gọn lịch sử đã nén ngữ cảnh",
		description:
			"Thu gọn lịch sử trước khi nén phía sau dấu phân cách tóm tắt trong bản ghi hiện tại; tắt để hiển thị đầy đủ với dấu phân cách tại mỗi lần nén ngữ cảnh",
	},
	showHardwareCursor: {
		label: "Hiển thị con trỏ phần cứng",
		description: "Hiển thị con trỏ của terminal để hỗ trợ IME",
	},
	"tui.imeSafeCursor": {
		label: "Bố cục câu lệnh an toàn với IME",
		description:
			"Đưa đường viền dưới của câu lệnh xuống một dòng riêng để văn bản IME macOS đang soạn không đẩy nó đi",
	},
	steeringMode: {
		label: "Chế độ điều khiển hàng đợi",
		description: "Cách xử lý tin nhắn trong hàng đợi khi tác nhân đang làm việc",
	},
	followUpMode: {
		label: "Chế độ tin nhắn tiếp theo",
		description: "Cách xử lý tin nhắn tiếp theo sau khi một lượt kết thúc",
	},
	interruptMode: {
		label: "Chế độ ngắt",
		description: "Khi nào tin nhắn điều khiển ngắt việc thực thi công cụ",
	},
	"tui.vimMode": {
		label: "Chế độ soạn thảo Vim",
		description:
			"Soạn thảo câu lệnh theo chế độ. ⎋ thoát chế độ Insert; ở chế độ Normal có hjkl, 0, $, ^, w, b, e, gg, G, các số đếm, x/D/C, dd/yy, p và u; các toán tử nhận lệnh di chuyển hoặc đối tượng văn bản (diw, ca(, dap); v/V bắt đầu chọn Visual, y sao chép, d xóa",
	},
	"tui.vimModeDisplay": {
		label: "Chỉ báo chế độ Vim",
		description: "Cách chế độ Vim hiện tại hiển thị trên thanh trạng thái",
	},
	"loop.mode": {
		label: "Chế độ vòng lặp",
		description: "Điều gì xảy ra giữa các lần lặp /loop trước khi gửi lại câu lệnh",
	},
	"loop.conditionTimeoutMs": {
		label: "Thời gian chờ điều kiện vòng lặp (ms)",
		description:
			"Thời gian tối đa chờ lệnh điều kiện `/loop --while` / `--until`, sau đó coi là lỗi và dừng vòng lặp. Đặt 0 để chờ vô hạn",
	},
	"composer.recallClearedDrafts": {
		label: "Khôi phục bản nháp đã xóa",
		description:
			"Giữ các bản nháp bị xóa bằng Ctrl+C trong lịch sử ↑/↓ cục bộ cho đến khi thoát; tắt sẽ ảnh hưởng đến các lần xóa sau",
	},
	doubleEscapeAction: {
		label: "Hành động khi nhấn Escape hai lần",
		description:
			"Việc cần làm khi nhấn ⎋ hai lần trong trình soạn thảo trống: mở bộ chọn tua lịch sử, cây phiên hoặc không làm gì",
	},
	"input.bareExitOnEmptySession": {
		label: "Lệnh thoát trong phiên trống",
		description:
			"Nếu trước tin nhắn đầu tiên chỉ gửi `exit`, `quit` hoặc `q` (không phân biệt hoa thường), thoát mà không gọi mô hình",
	},
	"input.bareSlashCommands": {
		label: "Lệnh không có dấu gạch chéo",
		description:
			"Gửi một tên lệnh không có `/` ở đầu (ví dụ `model`, `compact`) sẽ chạy lệnh tương ứng; nếu phiên đã có tin nhắn, nhấn Enter hai lần để xác nhận",
	},
	treeFilterMode: {
		label: "Bộ lọc cây phiên",
		description: "Chế độ lọc mặc định khi mở cây phiên",
	},
	autocompleteMaxVisible: {
		label: "Số mục tự động hoàn thành",
		description: "Số mục hiển thị tối đa trong danh sách tự động hoàn thành (3–20)",
	},
	"spelling.typoDetection": {
		label: "Phát hiện lỗi chính tả (macOS)",
		description: "Đánh dấu các từ gõ sai trong câu lệnh bằng từ điển macOS đang bật",
	},
	"spelling.autocomplete": {
		label: "Tự động hoàn thành từ",
		description:
			"Hiển thị gợi ý hoàn thành từ ngay trong dòng: ⇥ chèn bản gợi ý kèm dấu cách, → chèn không kèm dấu cách",
	},
	"composer.predictions": {
		label: "Dự đoán của trình soạn thảo",
		description:
			"Sau khi một lượt kết thúc, yêu cầu mô hình đang hoạt động dự đoán tin nhắn tiếp theo của bạn và hiển thị dưới dạng văn bản mờ trong trình soạn thảo trống; ⇥ hoặc → chèn vào mà không gửi. Tốn thêm: sau mỗi lượt hoàn tất sẽ gửi thêm một yêu cầu tính phí trên toàn bộ cuộc trò chuyện (được tính trong /stats)",
	},
	"spelling.autocorrect": {
		label: "Tự động sửa (macOS)",
		description: "Áp dụng các sửa lỗi chính tả đáng tin cậy của macOS sau khi gõ xong một từ",
	},
	emojiAutocomplete: {
		label: "Tự động hoàn thành emoji",
		description: "Gợi ý emoji theo mã ngắn `:name:` và chuyển các biểu cảm dạng văn bản như `:D` hoặc `:-)`",
	},
	"paste.largeMenuThreshold": {
		label: "Menu cho nội dung dán lớn",
		description:
			"Khi nội dung dán đạt số dòng này, hiển thị menu: định dạng thành khối mã, bọc trong thẻ XML hoặc lưu ra tệp. 0 tắt menu (nội dung dán lớn vẫn được thu gọn thành dấu [Paste]).",
	},
	"startup.quiet": {
		label: "Khởi động im lặng",
		description: "Bỏ qua màn hình chào và các thông báo khởi động",
	},
	"startup.showSplash": {
		label: "Hiển thị màn hình chờ khi khởi động",
		description:
			"Hiển thị màn hình chờ động đầy đủ khi khởi động tương tác thông thường mà không chạy lại phần thiết lập. Khi khởi động im lặng, màn hình chờ bị ẩn.",
	},
	"startup.setupWizard": {
		label: "Trình hướng dẫn thiết lập",
		description: "Hiển thị các bước thiết lập ban đầu mới một lần cho mỗi phiên bản thiết lập",
	},
	"startup.checkUpdate": {
		label: "Kiểm tra cập nhật",
		description: "Kiểm tra cập nhật omp khi khởi động",
	},
	"update.channel": {
		label: "Kênh cập nhật",
		description: "Kênh cập nhật được dùng bởi lệnh omp update và kiểm tra cập nhật khi khởi động",
	},
	"marketplace.autoUpdate": {
		label: "Tự động cập nhật Marketplace",
		description: "Kiểm tra cập nhật Plugins khi khởi động",
	},
	"startup.changelogMode": {
		label: "Danh sách thay đổi khi khởi động",
		description: "Chọn hiển thị thông tin cập nhật ngắn gọn hay đầy đủ khi khởi động, hoặc ẩn đi",
	},
	"magicKeywords.enabled": {
		label: "Từ khóa Magic",
		description: "Bật thông báo ẩn cho các từ khóa riêng ultrathink, orchestrate, workflowz và jevify",
	},
	"magicKeywords.ultrathink": {
		label: "Từ khóa Ultrathink",
		description: "Cho phép từ khóa riêng ultrathink yêu cầu mức Thinking tự động tối đa và thêm thông báo ẩn",
	},
	"magicKeywords.orchestrate": {
		label: "Từ khóa Orchestrate",
		description: "Cho phép từ khóa riêng orchestrate thêm thông báo ẩn về điều phối nhiều tác nhân",
	},
	"magicKeywords.workflow": {
		label: "Từ khóa Workflow",
		description: "Cho phép từ khóa riêng workflowz thêm thông báo ẩn về quy trình eval",
	},
	"magicKeywords.jevify": {
		label: "Từ khóa Jevify",
		description: "Cho phép từ khóa riêng jevify thêm thông báo ẩn về phân loại hàng loạt bằng trình đánh giá",
	},
	"completion.notify": {
		label: "Thông báo hoàn thành",
		description: "Thông báo khi tác nhân kết thúc lượt",
	},
	"error.notify": {
		label: "Thông báo lỗi",
		description: "Thông báo khi tác nhân dừng do lỗi",
	},
	"ask.timeout": {
		label: "Thời gian chờ yêu cầu phê duyệt",
		description:
			"Tự động chọn tùy chọn được đề xuất sau số giây chỉ định (0 là tắt). Cũng giới hạn thời gian chờ của các yêu cầu phê duyệt cfg://; nếu không trả lời, mục nhập sẽ bị từ chối thay vì tự động chọn",
	},
	"ask.notify": {
		label: "Thông báo yêu cầu",
		description: "Thông báo khi công cụ ask đang chờ nhập liệu",
	},
	"recap.enabled": {
		label: "Tóm tắt sau thời gian nhàn rỗi",
		description: "Tạo tóm tắt ngắn bằng LLM về trạng thái hiện tại sau khi terminal nhàn rỗi",
	},
	"recap.idleSeconds": {
		label: "Độ trễ trước khi tóm tắt",
		description: "Số giây chờ ở trạng thái nhàn rỗi trước khi hiển thị tóm tắt",
	},
	"power.sleepPrevention": {
		label: "Ngăn chặn chế độ ngủ",
		description:
			"Không cho hệ thống chuyển sang chế độ ngủ trong các phiên đang hoạt động. Các mức được cộng dồn: mỗi mức bổ sung các tùy chọn của tất cả mức trước đó.",
	},
	"prewalk.enabled": {
		label: "Bật Prewalk",
		description:
			"Bắt đầu làm việc trên mô hình đang hoạt động, rồi ở lần sửa hoặc ghi đầu tiên sau khi danh sách tác vụ xuất hiện từ plan nudge sẽ chuyển sang mô hình nhanh và rẻ (mặc định là vai trò 'smol'). Mô hình mạnh lập kế hoạch, chốt các tác vụ và bắt đầu triển khai trước khi bàn giao. Có thể ghi đè cho từng phiên bằng các cờ --prewalk / --no-prewalk.",
	},
	"prewalk.auto": {
		label: "Prewalk tự động",
		description:
			"Dùng trình phán xét tích hợp do vai trò 'judge' chọn để kiểm tra xem tác vụ chính mới của người dùng có cần Reasoning phức tạp ngay từ đầu hay không. Cần trình phán xét tích hợp; nếu không có thì không phân loại. Không phụ thuộc vào tùy chọn «Bật Prewalk».",
	},
	"prewalk.autoTarget": {
		label: "Mô hình đích của Auto Prewalk",
		description:
			"Mô hình hoặc vai trò (mặc định là '@smol') mà Auto Prewalk sẽ bàn giao công việc ở lần sửa hoặc ghi đầu tiên.",
	},
	"providers.maxInFlightRequests": {
		label: "Số yêu cầu đồng thời tối đa",
		description:
			'Số yêu cầu LLM đồng thời tối đa cho mỗi id nhà cung cấp (ví dụ "openai" hoặc "anthropic"), dùng chung giữa các tiến trình OMP cục bộ có cùng gốc cấu hình này. Nhà cung cấp không khai báo thì không giới hạn.',
	},
	"images.describeForTextModels": {
		label: "Mô tả hình ảnh cho mô hình văn bản",
		description:
			"Nếu hình ảnh được đính kèm vào mô hình không hỗ trợ thị giác, lưu hình ảnh tại local:// và thêm mô tả từ mô hình có hỗ trợ thị giác thay vì bỏ qua hình ảnh",
	},
	defaultThinkingLevel: {
		label: "Mức Thinking",
		description: "Độ sâu suy luận cho các mô hình hỗ trợ Thinking",
	},
	hideThinkingBlock: {
		label: "Ẩn các khối Thinking",
		description: "Ẩn các khối Thinking trong câu trả lời của trợ lý",
	},
	expandThinkingBlocks: {
		label: "Mở rộng các khối Thinking",
		description: "Giữ các khối Thinking đã hoàn tất ở trạng thái mở rộng, không thu gọn chúng khi kết thúc lượt",
	},
	proseOnlyThinking: {
		label: "Chỉ văn bản trong Thinking",
		description: "Loại bỏ các khối mã khỏi tóm tắt Thinking và thay bằng dấu ba chấm",
	},
	omitThinking: {
		label: "Không bao gồm tóm tắt Thinking",
		description:
			"Yêu cầu các nhà cung cấp thượng nguồn loại bỏ hoàn toàn tóm tắt Thinking khỏi câu trả lời (nếu được hỗ trợ)",
	},
	externalThinking: {
		label: "Thinking bên ngoài",
		description:
			"Bản nháp riêng tư, không hiển thị cho người dùng. Tắt Reasoning của GPT, Claude và Gemini ở những nơi được hỗ trợ",
	},
	"model.loopGuard.enabled": {
		label: "Bảo vệ chống lặp",
		description: "Tự động phát hiện vòng lặp trong luồng suy luận và văn bản của mô hình",
	},
	"model.loopGuard.checkAssistantContent": {
		label: "Kiểm tra văn bản có bị lặp",
		description: "Dùng bảo vệ chống lặp để kiểm tra cả tin nhắn văn bản của trợ lý, ngoài nhật ký Thinking",
	},
	"model.loopGuard.toolCallReminder": {
		label: "Nhắc gọi công cụ khi bị lặp",
		description:
			"Nếu luồng suy luận của Gemini tạo ra nhiều tiêu đề lập kế hoạch liên tiếp mà không gọi công cụ, ngắt luồng và thêm nhắc nhở gọi công cụ (cần bảo vệ chống lặp)",
	},
	"model.toolCallLoopGuard.enabled": {
		label: "Bảo vệ chống lặp lệnh gọi công cụ",
		description:
			"Phát hiện các lệnh gọi công cụ giống nhau liên tiếp ở các lượt khác nhau và thêm chỉ dẫn điều chỉnh",
	},
	"model.toolCallLoopGuard.threshold": {
		label: "Ngưỡng vòng lặp gọi công cụ",
		description: "Số lần gọi cùng một công cụ liên tiếp cần thiết để thêm chỉ dẫn điều chỉnh",
	},
	"model.toolCallLoopGuard.exemptTools": {
		label: "Miễn trừ bảo vệ vòng lặp gọi công cụ",
		description: "Tên các công cụ được phép lặp lại liên tiếp mà không kích hoạt bảo vệ vòng lặp giữa các lượt",
	},
	inlineToolDescriptors: {
		label: "Nhúng mô tả công cụ",
		description:
			"Thêm mô tả công cụ đầy đủ vào câu lệnh hệ thống và xóa mô tả cấp cao nhất cùng các mô tả lồng nhau khỏi schema công cụ của nhà cung cấp để mô tả chỉ được gửi một lần. Ở chế độ Auto, tùy chọn này bật cho mô hình Gemini và tắt cho các mô hình còn lại",
	},
	includeModelInPrompt: {
		label: "Thêm mô hình vào câu lệnh",
		description: "Thêm ID của mô hình đang hoạt động vào câu lệnh hệ thống để tác nhân biết mô hình nào đang chạy",
	},
	includeWorkspaceTree: {
		label: "Thêm cây không gian làm việc",
		description:
			"Thêm cây thư mục của không gian làm việc vào câu lệnh hệ thống. LƯU Ý: khi tệp thay đổi, điều này có thể phá vỡ bộ nhớ đệm câu lệnh giữa các phiên.",
	},
	skillful: {
		label: "Liệt kê Skills trong câu lệnh",
		description:
			"Liệt kê các Skills khả dụng trong câu lệnh hệ thống. Tắt để tiết kiệm ngữ cảnh; có thể thay đổi theo từng phiên bằng lệnh /skillful",
	},
	personality: {
		label: "Phong cách giao tiếp",
		description: "Phong cách giao tiếp được thêm vào khối tính cách của câu lệnh hệ thống",
	},
	temperature: {
		label: "Nhiệt độ",
		description: "Nhiệt độ lấy mẫu (0 = xác định, 1 = sáng tạo, -1 = giá trị mặc định của nhà cung cấp)",
	},
	topP: {
		label: "Top P",
		description: "Ngưỡng lấy mẫu theo hạt nhân (0–1, -1 = giá trị mặc định của nhà cung cấp)",
	},
	topK: {
		label: "Top K",
		description: "Chọn trong K token có xác suất cao nhất (-1 = giá trị mặc định của nhà cung cấp)",
	},
	minP: {
		label: "Min P",
		description: "Ngưỡng xác suất tối thiểu (0–1, -1 = giá trị mặc định của nhà cung cấp)",
	},
	presencePenalty: {
		label: "Điểm phạt hiện diện",
		description: "Điểm phạt cho việc thêm lại các token đã có mặt (-1 = giá trị mặc định của nhà cung cấp)",
	},
	repetitionPenalty: {
		label: "Điểm phạt lặp lại",
		description: "Điểm phạt cho các token lặp lại (-1 = giá trị mặc định của nhà cung cấp)",
	},
	textVerbosity: {
		label: "Độ chi tiết văn bản",
		description: "Độ chi tiết của câu trả lời OpenAI Responses và Codex (low, medium hoặc high)",
	},
	"tier.openai": {
		label: "Mức dịch vụ: OpenAI",
		description:
			"Mức xử lý cho các yêu cầu của OpenAI / OpenAI-Codex và các mô hình thuộc họ OpenAI được định tuyến qua OpenRouter (none = không gửi). Được gửi dưới dạng `service_tier`.",
	},
	"tier.anthropic": {
		label: "Mức dịch vụ: Anthropic",
		description:
			'Bậc xử lý cho các yêu cầu Claude. `priority` hiện thực hóa chế độ nhanh (`speed: "fast"`) trên các mô hình Anthropic trực tiếp được hỗ trợ; bị bỏ qua với Claude trên Bedrock/Vertex và qua OpenRouter.',
	},
	"tier.google": {
		label: "Mức dịch vụ: Google",
		description:
			"Mức xử lý cho các yêu cầu Gemini (Google AI Studio + Vertex) và các mô hình thuộc họ Google được định tuyến qua OpenRouter (none = không gửi). Được gửi trong trường cấp cao nhất `serviceTier`.",
	},
	"tier.subagent": {
		label: "Mức dịch vụ: tác nhân con",
		description:
			"Mức dịch vụ cho các tác nhân con của tác vụ và eval. Inherit = dùng mức hiện tại của tác nhân chính cho từng họ mô hình (theo /fast); giá trị được chọn sẽ áp dụng cho họ mô hình của tác nhân con.",
	},
	"tier.advisor": {
		label: "Mức dịch vụ: cố vấn",
		description:
			"Mức dịch vụ của mô hình cố vấn. None = xử lý tiêu chuẩn; Inherit = mức hiện tại của tác nhân chính cho từng họ mô hình; giá trị được chọn sẽ áp dụng cho họ mô hình cố vấn.",
	},
	"retry.enabled": {
		label: "retry.enabled",
	},
	"retry.maxRetries": {
		label: "Số lần thử lại",
		description: "Số lần thử lại tối đa khi gặp lỗi API",
	},
	"retry.baseDelayMs": {
		label: "retry.baseDelayMs",
	},
	"retry.maxDelayMs": {
		label: "Độ trễ thử lại tối đa",
		description:
			"Thời gian chờ tối đa giữa các lần thử lại, tính bằng ms. Nếu nhà cung cấp yêu cầu chờ lâu hơn và việc chuyển thông tin xác thực hay mô hình không thành công, yêu cầu sẽ thất bại ngay (ví dụ: giới hạn tần suất 3 giờ của Anthropic). Giá trị 0 sẽ bỏ giới hạn và cho phép phiên tự động tiếp tục sau khi nhà cung cấp đặt lại hạn mức.",
	},
	"retry.waitForUsageReset": {
		label: "Chờ đặt lại hạn mức sử dụng",
		description:
			"Nếu nhà cung cấp báo đã hết hạn mức sử dụng kèm thời điểm đặt lại (ví dụ: hạn mức 5 giờ hoặc hàng tuần), hãy chờ đến khi đặt lại thay vì thất bại nhanh khi hết retry.maxDelayMs. Có thể ngắt bằng (⎋), nhưng việc chờ cũng làm chậm các tác nhân con; nên tắt cho các lần chạy không giám sát.",
	},
	"retry.modelFallback": {
		label: "Chuyển mô hình khi thử lại",
		description:
			"Cho phép chuyển sang các mô hình trong retry.fallbackChains khi phục hồi sau lỗi nhà cung cấp. Không phụ thuộc vào Auto-Promote Context",
	},
	"retry.fallbackOn": {
		label: "Điều kiện chuyển sang mô hình dự phòng",
		description: "Những yêu cầu thất bại nào sẽ cho phép chuyển sang mô hình dự phòng đã cấu hình",
	},
	"retry.usageAwareFallback": {
		label: "Chuyển dựa trên mức dùng",
		description:
			"Trước khi chạm hạn mức cứng, dựa vào dữ liệu hạn mức đáng tin cậy của gói đăng ký lập trình: ưu tiên chọn tài khoản cùng nhà cung cấp, sau đó đến các mô hình dự phòng đã cấu hình. API Key thông thường do người dùng đặt không được tính.",
	},
	"retry.usageReservePct": {
		label: "Dự trữ hạn mức",
		description:
			"Coi mô hình thuộc gói đăng ký lập trình là gần chạm hạn mức nếu phần còn lại thấp hơn tỷ lệ này. Khi dữ liệu chưa rõ hoặc không khớp, tiếp tục dùng mô hình chính.",
	},
	"retry.usageReservePolicy": {
		label: "Chính sách dự trữ",
		description:
			"Làm gì khi phần hạn mức còn lại trên mọi tài khoản cùng nhà cung cấp đều thấp hơn mức dự trữ đã đặt.",
	},
	"retry.fallbackChains": {
		label: "Chuỗi mô hình dự phòng khi thử lại",
		description:
			'Đối tượng JSON ánh xạ vai trò mô hình, bộ chọn mô hình ("provider/model-id") hoặc ký tự đại diện nhà cung cấp ("provider/*") tới các bộ chọn dự phòng có thứ tự, ví dụ {"default":["openai/gpt-4o-mini"],"google-antigravity/*":["google/*","google-vertex/*"]}. Khóa theo mô hình áp dụng bất cứ khi nào mô hình/nhà cung cấp đó đang hoạt động, không phụ thuộc vai trò; một mục "provider/*" giữ id của mô hình đang lỗi và đổi nhà cung cấp. Ký tự đại diện có tiền tố id ("openrouter/google/*") gắn lại tiền tố cho id trần của mô hình đang lỗi (google-antigravity/gemini-x -> openrouter/google/gemini-x) và, khi dùng làm khóa, chỉ khớp id của nhà cung cấp đó dưới tiền tố. Một mục dự phòng có thể mang hậu tố suy luận rõ ràng ("provider/model:low", ":high", ":max", ":off"); mục trần kế thừa mức nỗ lực của lượt đang lỗi, còn mục "provider/*" luôn kế thừa.',
	},
	"retry.fallbackRevertPolicy": {
		label: "Quy tắc quay lại từ mô hình dự phòng",
		description: "Khi nào quay lại mô hình chính sau khi đã chuyển sang mô hình dự phòng",
	},
	"providers.anthropic.serverSideFallback": {
		label: "Chuyển dự phòng phía máy chủ Anthropic (Fable 5)",
		description:
			"Nếu bộ phân loại an toàn của Anthropic chặn yêu cầu Claude Fable 5 / Mythos 5, hãy thử lại trên máy chủ với Claude Opus 5 (bản beta Anthropic `server-side-fallback-2026-06-01`). Đây là tùy chọn tự nguyện; nếu để tắt, hành vi của mọi yêu cầu vẫn như cũ.",
	},
	"providers.anthropic.slowMode": {
		label: "providers.anthropic.slowMode",
	},
	"providers.ollama-cloud.maxConcurrency": {
		label: "Số tác vụ đồng thời tối đa của Ollama Cloud",
		description:
			"Số lần chạy đồng thời tối đa của tác nhân con Ollama Cloud trên mỗi tiến trình; 0 sẽ bỏ giới hạn cho nhà cung cấp này",
	},
	"providers.webSearchTimeoutSeconds": {
		label: "Thời gian chờ tìm kiếm web",
		description:
			"Thời gian chờ cứng cho lớp truyền tải tìm kiếm của từng nhà cung cấp trước khi web_search chuyển sang mô hình dự phòng tiếp theo, tính bằng giây (tối đa 300)",
	},
	"providers.antigravityEndpoint": {
		label: "Chế độ điểm cuối Antigravity",
		description:
			"Chiến lược định tuyến yêu cầu đến các điểm cuối của nhà cung cấp google-antigravity (chat, tìm kiếm, hình ảnh, khám phá)",
	},
	"providers.fireworksTier": {
		label: "Bậc Fireworks",
		description:
			'Đường phục vụ cho các yêu cầu Fireworks. Priority gửi `service_tier: "priority"` để có độ tin cậy cao hơn trong giờ cao điểm với giá cao hơn; Standard bỏ qua trường này. Các mô hình Fast (`-fast`) bỏ qua mục này - Fast có đường phục vụ riêng.',
	},
	"providers.tinyModelDevice": {
		label: "Thiết bị cho mô hình nhỏ gọn",
		description:
			"Mô-đun suy luận cho các mô hình nhỏ gọn cục bộ (tiêu đề và bộ nhớ): nhà cung cấp thực thi ONNX hoặc `mlx` để tải trọng số MLX và chạy chúng qua mlx-lm trên Apple silicon. Mặc định chỉ dùng ONNX trên CPU. Biến môi trường PI_TINY_DEVICE ghi đè cài đặt.",
	},
	"providers.tinyModelDtype": {
		label: "Độ chính xác của mô hình nhỏ gọn",
		description:
			"Lượng tử hóa và độ chính xác ONNX cho các mô hình nhỏ gọn cục bộ. Mặc định dùng kiểu dữ liệu tích hợp trong mô hình (q4); độ chính xác thấp hơn tăng tốc độ, cao hơn tăng độ chính xác. Mô-đun MLX bỏ qua tham số này (các kho lưu trữ của nó đã được lượng tử hóa xuống 4 bit). Biến môi trường PI_TINY_DTYPE ghi đè cài đặt.",
	},
	"providers.autoThinkingMaxEffort": {
		label: "Mức Auto Thinking tối đa",
		description:
			"Mức tối đa mà bộ phân loại `auto` có thể chọn. Với `xhigh`, bộ phân loại giữ ở một mức dưới mức tối đa và chỉ `ultrathink` rõ ràng mới đạt `max`; giá trị `max` cho phép chọn mức tối đa cho các mô hình hỗ trợ, nếu bộ phân loại coi lượt này là đặc biệt.",
	},
	"features.unexpectedStopDetection": {
		label: "Kết thúc bất ngờ",
		description:
			"Tự động khôi phục nếu trợ lý kết thúc mà không có tin nhắn hiển thị. Chế độ Smart cũng phân loại các lần kết thúc chỉ có văn bản bằng mô hình nhỏ gọn.",
	},
	"providers.kimiApiFormat": {
		label: "Định dạng Kimi API",
		description: "Định dạng API cho nhà cung cấp Kimi Code (auto tuân theo siêu dữ liệu mô hình hiện tại)",
	},
	"providers.openaiWebsockets": {
		label: "WebSockets OpenAI",
		description:
			"Chính sách WebSocket cho các mô hình OpenAI Codex (auto dùng cài đặt của mô hình, on bật bắt buộc, off tắt)",
	},
	"providers.openaiLiveSteering": {
		label: "Điều khiển phản hồi OpenAI trong thời gian thực",
		description:
			"Truyền các tin nhắn được nhập trong khi GPT-6 đang tạo phản hồi theo luồng vào phản hồi hiện tại qua Codex WebSocket thay vì chờ lần gọi công cụ tiếp theo",
	},
	"providers.muse-code.storeResponses": {
		label: "Phản hồi đã lưu của Muse Code",
		description:
			"Lưu kết quả Muse Code trên máy chủ Meta để sau khi mất kết nối có thể khôi phục lượt chạy thay vì chạy lại từ đầu. Câu lệnh và kết quả chạy được lưu phía Meta.",
	},
	"providers.cacheRetention": {
		label: "Thời hạn lưu bộ nhớ đệm câu lệnh",
		description:
			"Thời hạn lưu bộ nhớ đệm câu lệnh được truyền cho các nhà cung cấp hỗ trợ (Anthropic, Bedrock, OpenRouter, OpenAI)",
	},
	"providers.cacheWarming": {
		label: "Làm nóng bộ nhớ đệm",
		description:
			"Gia hạn mục bộ nhớ đệm câu lệnh của yêu cầu cuối ngay trước khi hết hạn (Anthropic làm nóng với max_tokens 0, các nhà cung cấp khác phát lại với một token)",
	},
	"providers.streamFirstEventTimeoutSeconds": {
		label: "Thời gian chờ sự kiện đầu tiên của luồng",
		description:
			"Số giây chờ sự kiện đầu tiên của luồng mô hình; -1 dùng giá trị mặc định của nhà cung cấp hoặc môi trường, 0 tắt kiểm soát thời gian chờ",
	},
	"providers.streamIdleTimeoutSeconds": {
		label: "Thời gian chờ luồng không hoạt động",
		description:
			"Số giây luồng mô hình có thể im lặng giữa các sự kiện; -1 dùng giá trị mặc định của nhà cung cấp hoặc môi trường, 0 tắt kiểm soát thời gian chờ",
	},
	"providers.openrouterVariant": {
		label: "Định tuyến OpenRouter",
		description:
			"Hậu tố biến thể định tuyến mặc định được thêm vào ID mô hình OpenRouter (không dùng nếu bộ chọn đã chỉ định biến thể)",
	},
	"live.voice": {
		label: "Giọng Live",
		description: "Giọng cho các phiên liên lạc thoại thời gian thực trên nền Codex",
	},
	"tts.localVoice": {
		label: "Giọng TTS cục bộ",
		description: "Giọng Kokoro cho bộ xử lý TTS cục bộ (Mỹ/Anh, nữ/nam)",
	},
	"tts.localSpeed": {
		label: "Tốc độ TTS cục bộ",
		description:
			"Tốc độ nói của bộ xử lý TTS cục bộ (công cụ tts, omp say). 1 = bình thường; giới hạn trong khoảng 0.5–2.5",
	},
	"speech.enabled": {
		label: "Đọc to phản hồi",
		description: "Đọc to phản hồi của trợ lý qua loa ngay khi phản hồi đến",
	},
	"speech.mode": {
		label: "Chế độ đọc to",
		description:
			"Nội dung đọc to: all = tin nhắn của trợ lý và Reasoning; assistant = chỉ tin nhắn; yield = chỉ tin nhắn cuối cùng ở cuối lượt",
	},
	"speech.enhanced": {
		label: "Cải thiện văn bản để đọc to",
		description:
			"Chuyển phản hồi của trợ lý thành lời nói tự nhiên, khẩu ngữ bằng mô hình tiny/smol trước khi tổng hợp giọng nói (mô tả mã, xóa liên kết và Markdown). Khi thất bại, dùng bước làm sạch cơ học.",
	},
	"speech.voice": {
		label: "Giọng đọc to",
		description: "Giọng Kokoro để đọc to phản hồi của trợ lý",
	},
	"speech.speed": {
		label: "Tốc độ đọc to",
		description: "Tốc độ đọc to phản hồi của trợ lý. 1 = bình thường; giới hạn trong khoảng 0.5–2.5",
	},
	"providers.fetch": {
		label: "Nhà cung cấp Fetch",
		description: "Thứ tự ưu tiên trình xử lý đọc cho công cụ tìm nạp và đọc URL",
	},
	"codexResets.autoRedeem": {
		label: "Tự động dùng các lượt đặt lại Codex đã lưu",
		description:
			"Tự động tiêu dùng các lượt đặt lại hạn mức Codex đã lưu: khôi phục tài khoản bị khóa do đã dùng hết cửa sổ 5 giờ hoặc cửa sổ tuần, nếu lượt chạy bị dừng và tài khoản khác không thể tiếp tục, đồng thời dùng các lượt sắp hết hạn. unset sẽ hỏi phê duyệt trước lần tiêu dùng đầu tiên (khi không có giao diện hỏi, chỉ lượt đặt lại hết hạn trong vòng 5 phút mới được tiêu dùng), yes tiêu dùng mà không hỏi, no tắt cả hai kiểm tra.",
	},
	"codexResets.minBlockedMinutes": {
		label: "Thời gian khóa tối thiểu để tự đặt lại Codex",
		description:
			"Chỉ tự động dùng một lượt đặt lại nếu còn ít nhất số phút đã chỉ định trước khi tự mở khóa tự nhiên - lượt đặt lại muộn nhất trong số các cửa sổ 5 giờ và cửa sổ tuần đã dùng hết. Đừng tiêu một lượt đặt lại khan hiếm cho một thời gian chờ ngắn. Tăng giá trị (ví dụ lên 360) để bỏ qua các khóa chỉ kéo dài 5 giờ.",
	},
	"codexResets.keepCredits": {
		label: "Giữ lại lượt tự đặt lại Codex",
		description:
			"Không tự động dùng nếu số lượt đặt lại đã lưu còn lại ít hơn số đã chỉ định (0 = có thể tự động dùng lượt cuối cùng). Các lượt sắp hết hạn không được tính: giữ lại lượt đó cũng không có ích.",
	},
	"codexResets.salvageHorizonHours": {
		label: "Khoảng thời gian cứu lượt đặt lại Codex",
		description:
			"Nếu tính năng tự đặt lại được bật, dùng một lượt đặt lại Codex đã lưu trước khi hết hạn số giờ đã chỉ định, khi có mức dùng đáng kể trong bất kỳ cửa sổ chat nào. 0 tắt việc dùng sớm; các lượt đặt lại hết hạn trong vòng 5 phút vẫn được dùng bất kể mức dùng.",
	},
	"claudeResets.autoRedeem": {
		label: "Tự động dùng các lượt đặt lại Claude",
		description:
			"Tự động dùng các lượt đặt lại Claude Cedar hoặc Juniper hiện có. Cedar chỉ được dùng cho các hạn mức được bao phủ; Juniper chỉ có thể gỡ một khóa 5 giờ duy nhất. unset sẽ hỏi phê duyệt trước lần tiêu dùng đầu tiên (khi không có giao diện hỏi, chỉ lượt đặt lại hết hạn trong vòng 5 phút mới được tiêu dùng), yes tiêu dùng mà không hỏi, no tắt việc khôi phục sau khóa và dùng trước khi hết hạn.",
	},
	"claudeResets.minBlockedMinutes": {
		label: "Thời gian khóa tối thiểu để tự đặt lại Claude",
		description:
			"Chỉ tự động dùng lượt đặt lại nếu còn ít nhất số phút đã chỉ định trước khi mở khóa tự nhiên - tức lượt đặt lại muộn nhất trong các cửa sổ được bao phủ đã cạn. Lượt đặt lại chỉ 5 giờ không được dùng khi bị khóa theo tuần hoặc khóa theo mô hình.",
	},
	"claudeResets.keepCredits": {
		label: "Dự trữ lượt tự đặt lại Claude",
		description:
			"Giữ ít nhất số lượt đặt lại Claude được chỉ định (0 cho phép tự động dùng lượt đặt lại khả dụng cuối cùng). Dự trữ áp dụng khi dùng trước hạn, nhưng không áp dụng cho các lượt đặt lại khả dụng sắp hết hạn trong vòng 5 phút.",
	},
	"claudeResets.salvageHorizonHours": {
		label: "Thời hạn tận dụng lượt đặt lại Claude",
		description:
			"Nếu tự đặt lại được bật, hãy dùng lượt đặt lại Cedar do máy chủ chọn trong số giờ được chỉ định trước khi hết hạn, khi các cửa sổ được bao phủ có mức sử dụng đáng kể. 0 tắt việc dùng trước hạn; các lượt đặt lại Cedar hoặc Juniper khả dụng sắp hết hạn trong vòng 5 phút vẫn được dùng bất kể mức dùng và dự trữ. Các yêu cầu về giới hạn của nhà cung cấp vẫn được áp dụng.",
	},
	"provider.appendOnlyContext": {
		label: "Ngữ cảnh chỉ ghi thêm",
		description:
			"Lưu vào bộ nhớ đệm câu lệnh hệ thống và đặc tả công cụ, còn tin nhắn lưu trong nhật ký chỉ ghi thêm để bộ nhớ đệm tiền tố của các nhà cung cấp (DeepSeek, Xiaomi/SGLang, Anthropic) kích hoạt thường xuyên nhất có thể. Chế độ Auto được bật cho các nhà cung cấp đã biết có bộ nhớ đệm tiền tố.",
	},
	"thinkingBudgets.minimal": {
		label: "thinkingBudgets.minimal",
	},
	"thinkingBudgets.low": {
		label: "thinkingBudgets.low",
	},
	"thinkingBudgets.medium": {
		label: "thinkingBudgets.medium",
	},
	"thinkingBudgets.high": {
		label: "thinkingBudgets.high",
	},
	"thinkingBudgets.xhigh": {
		label: "thinkingBudgets.xhigh",
	},
	"thinkingBudgets.max": {
		label: "thinkingBudgets.max",
	},
	"telemetry.otlpExportEnabled": {
		label: "Xuất dữ liệu đo từ xa OTLP",
		description:
			"Cho phép OMP xuất dấu vết, nhật ký và số liệu qua các điểm cuối OTEL_*. Thay đổi sẽ có hiệu lực ở lần khởi động tiếp theo.",
	},
	"advisor.enabled": {
		label: "Bật Advisor",
		description: "Kết nối một mô hình thứ hai với vai trò «advisor» để thụ động kiểm tra từng lượt và thêm ghi chú.",
	},
	"advisor.syncBacklog": {
		label: "Ngưỡng chờ Advisor",
		description:
			"Tạm dừng tác nhân chính cho đến khi hàng đợi Advisor nhỏ hơn ngưỡng. Giá trị số giới hạn thời gian chờ ở 30 giây; strict chờ tất cả các lần kiểm tra đã lên lịch mà không giới hạn thời gian. Off tắt việc trì hoãn khi bắt kịp. Việc ngắt, lỗi và xóa sẽ giải phóng thời gian chờ.",
	},
	"advisor.immuneTurns": {
		label: "Số lượt được bảo vệ của Advisor",
		description:
			"Sau khi bị ngắt do ghi chú hoặc vấn đề chặn từ Advisor, hãy gửi các ghi chú tiếp theo dưới dạng phần bổ sung không ngắt trong số lượt chính được chỉ định. Các vấn đề chặn không thuộc thời gian chờ.",
	},
	"advisor.reviewMode": {
		label: "Chế độ kiểm tra Advisor",
		description:
			"Tần suất kiểm tra Advisor mặc định khi không có danh sách WATCHDOG.yml. turn kiểm tra từng lượt chính; agent-end - chỉ khi có kết quả cuối cùng.",
	},
	"advisor.reviewInterval": {
		label: "Chu kỳ kiểm tra Advisor",
		description:
			"Tần suất kiểm tra Advisor mặc định khi không có danh sách WATCHDOG.yml: kiểm tra mỗi N cập nhật phù hợp của tác nhân chính. 1 = mỗi cập nhật. Các cập nhật bị bỏ qua sẽ được gửi ở lần kiểm tra theo lịch tiếp theo.",
	},
	"advisor.maxNotesPerUpdate": {
		label: "Số ghi chú Advisor tối đa mỗi lần cập nhật",
		description:
			"Số khuyến nghị được chấp nhận tối đa, không liên quan đến vấn đề chặn, cho mỗi lần cập nhật câu lệnh Advisor (1–32; giao diện có các tùy chọn nhanh 1–5). Các vấn đề chặn không được tính.",
	},
	"advisor.evictStaleResults": {
		label: "Xóa kết quả Advisor cũ",
		description:
			"Trước mỗi lần kiểm tra, thay thế kết quả read/grep/glob từ các lần kiểm tra trước bằng một phần giữ chỗ ngắn. Kết quả cuối cùng được giữ lại.",
	},
	"workspace.additionalDirectories": {
		label: "Thư mục bổ sung của không gian làm việc",
		description:
			"Các thư mục gốc bổ sung của không gian làm việc, được thêm vào mỗi phiên (không gian làm việc nhiều gốc). Có thể quản lý mà không cần khởi động lại bằng lệnh /add-dir và /remove-dir. Đường dẫn tương đối được tính từ cwd; nên dùng đường dẫn tuyệt đối. Tác nhân được thông báo về sự hiện diện của các gốc này và có thể đọc, tìm kiếm chúng bằng grep/glob.",
	},
	"contextFiles.extra": {
		label: "Tệp ngữ cảnh bổ sung",
		description:
			'Tên tệp hướng dẫn bổ sung được nạp bên cạnh AGENTS.md. Dùng danh sách JSON gồm tên, không phải đường dẫn, ví dụ ["AGENTS.local.md"]; [] sẽ tắt phần bổ sung. Hãy bắt đầu phiên mới để nạp chúng.',
	},
	"contextPromotion.enabled": {
		label: "Tự động nâng ngữ cảnh",
		description:
			"Khi ngữ cảnh tràn, nâng nó lên contextPromotionTarget của mô hình thay vì nén ngữ cảnh. Việc chuyển sang mô hình dự phòng khi thử lại được cấu hình bằng tham số Retry Model Fallback",
	},
	extendedContext: {
		label: "Ngữ cảnh mở rộng",
		description:
			"Dùng cửa sổ ngữ cảnh lớn hơn nếu được hỗ trợ; chi phí có thể cao hơn. Khi tắt, sẽ dùng cửa sổ tiêu chuẩn hoặc cửa sổ có chi phí tiêu chuẩn.",
	},
	"chat.systemPrompt": {
		label: "Câu lệnh hệ thống của Chat",
		description:
			"Câu lệnh hệ thống mặc định cho các cuộc Chat (omp --chat, thẻ Chat trong GUI) chưa có câu lệnh riêng; thay thế câu lệnh hệ thống tích hợp của Chat. Để trống để dùng câu lệnh tích hợp",
	},
	"chat.history": {
		label: "Lịch sử Chat",
		description:
			"Những gì mô hình nhận được với mỗi tin nhắn trong các cuộc Chat không có cài đặt riêng. Toàn bộ các lượt vẫn hiển thị trong cuộc trò chuyện",
	},
	"chat.historyTurns": {
		label: "Độ sâu lịch sử Chat",
		description: "Số lượt trước đó mà một Chat liên tục không có cài đặt riêng sẽ gửi với mỗi tin nhắn",
	},
	"compaction.enabled": {
		label: "Tự động nén ngữ cảnh",
		description: "Tự động nén ngữ cảnh khi ngữ cảnh trở nên quá lớn",
	},
	"compaction.experimentalContextManagement": {
		label: "Cửa sổ ngữ cảnh có ghi chú (thử nghiệm)",
		description: "Giữ các ghi chú cố định và lịch sử tin nhắn có thể tìm kiếm ở dạng gốc giữa các cửa sổ ngữ cảnh.",
	},
	"compaction.midTurnEnabled": {
		label: "Nén ngữ cảnh giữa lượt",
		description:
			"Kiểm tra các ngưỡng tại điểm an toàn giữa các chu kỳ công cụ trong lượt, trước yêu cầu tiếp theo gửi đến nhà cung cấp; tác nhân con luôn kiểm tra vì toàn bộ tác vụ của chúng diễn ra trong một lượt.",
	},
	"compaction.methodOrder": {
		label: "Thứ tự các phương pháp nén ngữ cảnh",
		description:
			"Thứ tự ưu tiên của các phương pháp dự phòng để tự động bảo trì ngữ cảnh; nếu một phương pháp không khả dụng hoặc kết thúc bằng lỗi, phương pháp tiếp theo sẽ được dùng.",
	},
	"compaction.thresholdPercent": {
		label: "Ngưỡng nén ngữ cảnh",
		description: "Ngưỡng bảo trì ngữ cảnh theo phần trăm; chọn Default để dùng hành vi trước đây có dự phòng",
	},
	"compaction.thresholdTokens": {
		label: "Giới hạn token để nén ngữ cảnh",
		description: "Giới hạn token cố định để bảo trì ngữ cảnh; nếu được đặt, thay thế ngưỡng phần trăm",
	},
	"compaction.modelThresholds": {
		label: "compaction.modelThresholds",
	},
	"compaction.modelThresholdsEnabled": {
		label: "compaction.modelThresholdsEnabled",
	},
	"compaction.handoffSaveToDisk": {
		label: "Lưu tài liệu Handoff",
		description: "Lưu các tài liệu Handoff đã tạo thành tệp Markdown cho luồng Handoff tự động",
	},
	"compaction.remoteStreamingV2Enabled": {
		label: "Nén ngữ cảnh từ xa V2",
		description: "Dùng nén ngữ cảnh phát trực tuyến Responses cho các mô hình nén ngữ cảnh từ xa tương thích",
	},
	"compaction.asyncEnabled": {
		label: "Nén ngữ cảnh không đồng bộ",
		description:
			"Tóm tắt trước ngữ cảnh ở chế độ chạy nền khi gần đạt ngưỡng nén ngữ cảnh, rồi chèn kết quả đã sẵn sàng khi đạt ngưỡng",
	},
	"compaction.reserveTokens": {
		label: "compaction.reserveTokens",
	},
	"compaction.keepRecentTokens": {
		label: "compaction.keepRecentTokens",
	},
	"compaction.autoContinue": {
		label: "compaction.autoContinue",
	},
	"compaction.remoteEndpoint": {
		label: "compaction.remoteEndpoint",
	},
	"compaction.v2RetainedMessageBudget": {
		label: "compaction.v2RetainedMessageBudget",
	},
	"compaction.idleEnabled": {
		label: "Nén ngữ cảnh khi không hoạt động",
		description: "Nén ngữ cảnh khi không hoạt động nếu số token vượt ngưỡng",
	},
	"compaction.idleThresholdTokens": {
		label: "Ngưỡng nén ngữ cảnh khi không hoạt động",
		description: "Số token mà trên mức đó sẽ kích hoạt nén ngữ cảnh khi không hoạt động",
	},
	"compaction.idleTimeoutSeconds": {
		label: "Thời gian chờ nén ngữ cảnh khi không hoạt động",
		description: "Số giây chờ không hoạt động trước khi nén ngữ cảnh",
	},
	"compaction.supersedeReads": {
		label: "Thay thế kết quả đọc cũ",
		description: "Xóa kết quả đọc cũ khi cùng một tệp được đọc lại (có tính đến bộ nhớ đệm, chạy mỗi lượt).",
	},
	"compaction.dropUseless": {
		label: "Xóa kết quả không mang thông tin",
		description:
			"Sau khi dùng, xóa kết quả công cụ được đánh dấu là không hữu ích cho ngữ cảnh (không có kết quả trùng khớp, thời gian chờ hết); có tính đến bộ nhớ đệm.",
	},
	"snapcompact.systemPrompt": {
		label: "Câu lệnh hệ thống Snapcompact",
		description:
			"Thử nghiệm: hiển thị văn bản câu lệnh hệ thống được chọn dưới dạng hình ảnh PNG dày đặc và đính kèm chúng vào tin nhắn đầu tiên của người dùng (chỉ dành cho mô hình hỗ trợ thị giác). Tiết kiệm token nhưng tắt bộ nhớ đệm câu lệnh cho văn bản trên hình ảnh.",
	},
	"snapcompact.toolResults": {
		label: "Kết quả công cụ Snapcompact",
		description:
			"Thử nghiệm: hiển thị kết quả công cụ lớn, bao gồm cả kết quả mới nhất, dưới dạng hình ảnh PNG dày đặc thay vì văn bản (chỉ dành cho mô hình hỗ trợ thị giác). Tiết kiệm token khi tích lũy kết quả tìm kiếm và lệnh; kết quả đọc vẫn là văn bản, trừ khi biết rằng mô hình chỉnh sửa nội dung chính xác dựa trên hình ảnh.",
	},
	"tools.format": {
		label: "Chế độ gọi công cụ",
		description:
			"Xác định cách công cụ được cung cấp cho mô hình. Auto dùng lệnh gọi công cụ tích hợp của nhà cung cấp nếu mô hình đã chọn hỗ trợ; nếu không, chuyển sang phương ngữ GLM riêng. Native buộc dùng công cụ tích hợp của nhà cung cấp; các giá trị khác buộc dùng phương ngữ riêng được chỉ định.",
	},
	"snapcompact.shape": {
		label: "Định dạng Snapcompact",
		description:
			"Hình dạng khung mà Snapcompact dùng để in văn bản (tệp lưu trữ nén và hình ảnh nhúng). Auto chọn định dạng được định cấu hình cho mô hình hiện tại.",
	},
	"branchSummary.enabled": {
		label: "Tóm tắt branch",
		description: "Đề xuất tạo bản tóm tắt khi thoát khỏi branch",
	},
	"branchSummary.reserveTokens": {
		label: "branchSummary.reserveTokens",
	},
	"memory.backend": {
		label: "Phân hệ bộ nhớ",
		description: "Tắt, quy trình tóm tắt cục bộ, Mnemopi SQLite, bộ nhớ Hindsight từ xa hoặc Sharpshooter",
	},
	"memories.enabled": {
		label: "memories.enabled",
	},
	"memories.maxRolloutsPerStartup": {
		label: "memories.maxRolloutsPerStartup",
	},
	"memories.maxRolloutAgeDays": {
		label: "memories.maxRolloutAgeDays",
	},
	"memories.minRolloutIdleHours": {
		label: "memories.minRolloutIdleHours",
	},
	"memories.threadScanLimit": {
		label: "memories.threadScanLimit",
	},
	"memories.maxRawMemoriesForGlobal": {
		label: "memories.maxRawMemoriesForGlobal",
	},
	"memories.stage1Concurrency": {
		label: "memories.stage1Concurrency",
	},
	"memories.stage1LeaseSeconds": {
		label: "memories.stage1LeaseSeconds",
	},
	"memories.stage1RetryDelaySeconds": {
		label: "memories.stage1RetryDelaySeconds",
	},
	"memories.phase2LeaseSeconds": {
		label: "memories.phase2LeaseSeconds",
	},
	"memories.phase2RetryDelaySeconds": {
		label: "memories.phase2RetryDelaySeconds",
	},
	"memories.phase2HeartbeatSeconds": {
		label: "memories.phase2HeartbeatSeconds",
	},
	"memories.rolloutPayloadPercent": {
		label: "memories.rolloutPayloadPercent",
	},
	"memories.phase1InputTokenLimit": {
		label: "memories.phase1InputTokenLimit",
	},
	"memories.fallbackTokenLimit": {
		label: "memories.fallbackTokenLimit",
	},
	"memories.summaryInjectionTokenLimit": {
		label: "memories.summaryInjectionTokenLimit",
	},
	"sharpshooter.model": {
		label: "Mô hình Sharpshooter",
		description: "Chọn mô hình để trích xuất và hợp nhất dữ liệu; giá trị trống - vai trò smol",
	},
	"sharpshooter.intervalMinutes": {
		label: "sharpshooter.intervalMinutes",
	},
	"sharpshooter.injectionTokenLimit": {
		label: "sharpshooter.injectionTokenLimit",
	},
	"autolearn.enabled": {
		label: "Auto-Learn (tính năng thử nghiệm)",
		description:
			"Sau khi tác nhân dừng, đề xuất lưu các kết luận vào bộ nhớ và tạo hoặc cải thiện các Skills được quản lý cách ly",
	},
	"autolearn.autoContinue": {
		label: "Tự động chạy thu thập khi dừng",
		description:
			"Nếu bật, khi dừng sẽ chạy một vòng thu thập riêng tư (tiêu tốn thêm token). Nếu tắt, các hướng dẫn Auto-Learn thường trực vẫn được giữ lại.",
	},
	"autolearn.minToolCalls": {
		label: "autolearn.minToolCalls",
	},
	"mnemopi.dbPath": {
		label: "Đường dẫn cơ sở dữ liệu Mnemopi",
		description: "Đường dẫn tùy chọn đến cơ sở dữ liệu SQLite. Mặc định dùng thư mục bộ nhớ của tác nhân.",
	},
	"mnemopi.bank": {
		label: "Ngân hàng Mnemopi",
		description:
			"Tên ngân hàng cơ sở dùng chung tùy chọn. Với mỗi dự án, một ngân hàng cục bộ được tạo dựa trên tên này.",
	},
	"mnemopi.scoping": {
		label: "Phạm vi Mnemopi",
		description:
			"global = một ngân hàng dùng chung; per-project = ngân hàng riêng cho từng cwd; per-project-tagged = ghi vào ngân hàng cục bộ của dự án và tìm kiếm bộ nhớ dùng chung",
	},
	"mnemopi.embeddingVariant": {
		label: "Biến thể embedding",
		description:
			"Họ mô hình embedding cục bộ. en = mô hình mạnh hơn cho tiếng Anh; multilingual = mô hình đa ngôn ngữ. Khi thay đổi, các embedding hiện có sẽ được xây dựng lại ở lần chạy tiếp theo.",
	},
	"mnemopi.autoRecall": {
		label: "Tự động truy hồi bộ nhớ Mnemopi",
		description: "Thêm ký ức cục bộ vào vòng đầu tiên của mỗi phiên",
	},
	"mnemopi.autoRetain": {
		label: "Tự động lưu bộ nhớ Mnemopi",
		description: "Lưu các vòng hội thoại đã hoàn tất vào bộ nhớ Mnemopi cục bộ",
	},
	"mnemopi.polyphonicRecall": {
		label: "Truy hồi bộ nhớ Mnemopi đa kênh",
		description:
			"Kết hợp tìm kiếm theo đồ thị, sự kiện, vector và liên kết thời gian để tìm các ký ức liên quan mà không cần khớp từ khóa",
	},
	"mnemopi.enhancedRecall": {
		label: "Truy hồi bộ nhớ Mnemopi nâng cao",
		description:
			"Lưu kết quả tìm kiếm vào bộ nhớ đệm cho các truy vấn lặp lại và tương tự với cùng tham số; mọi thao tác ghi vào bộ nhớ sẽ xóa bộ nhớ đệm",
	},
	"mnemopi.proactiveLinking": {
		label: "Liên kết chủ động ký ức Mnemopi",
		description: "Khi lưu, thêm ký ức vào đồ thị tình huống và liên kết chúng với các thực thể và bản ghi tương ứng",
	},
	"mnemopi.noEmbeddings": {
		label: "Tắt embedding Mnemopi",
		description: "Chỉ dùng tìm kiếm FTS tất định thay vì embedding vector",
	},
	"mnemopi.embeddingModel": {
		label: "Mô hình embedding Mnemopi",
		description:
			"Tùy chọn: ID mô hình embedding được chỉ định rõ, ghi đè biến thể. Để trống để dùng mnemopi.embeddingVariant.",
	},
	"mnemopi.embeddingApiUrl": {
		label: "URL API embedding Mnemopi",
		description: "Điểm cuối embedding tùy chọn, tương thích OpenAI; được truyền vào Mnemopi",
	},
	"mnemopi.embeddingApiKey": {
		label: "Khóa API embedding Mnemopi",
		description: "Khóa API embedding tùy chọn; được truyền vào Mnemopi",
	},
	"mnemopi.llmMode": {
		label: "Chế độ LLM Mnemopi",
		description:
			"Không dùng LLM, dùng mô hình tiny trực tuyến (vai trò TINY từ /models, nếu không thì @smol) hoặc điểm cuối OpenAI từ xa",
	},
	"mnemopi.llmBaseUrl": {
		label: "URL cơ sở LLM Mnemopi",
		description: "Điểm cuối LLM tùy chọn cho chế độ Mnemopi từ xa, tương thích OpenAI",
	},
	"mnemopi.llmApiKey": {
		label: "Khóa API LLM Mnemopi",
		description: "Khóa API LLM tùy chọn cho chế độ Mnemopi từ xa",
	},
	"mnemopi.llmModel": {
		label: "Mô hình LLM Mnemopi",
		description: "Tên mô hình LLM tùy chọn cho chế độ Mnemopi từ xa",
	},
	"mnemopi.retainEveryNTurns": {
		label: "mnemopi.retainEveryNTurns",
	},
	"mnemopi.recallLimit": {
		label: "mnemopi.recallLimit",
	},
	"mnemopi.recallContextTurns": {
		label: "mnemopi.recallContextTurns",
	},
	"mnemopi.recallMaxQueryChars": {
		label: "mnemopi.recallMaxQueryChars",
	},
	"mnemopi.injectionTokenLimit": {
		label: "mnemopi.injectionTokenLimit",
	},
	"mnemopi.debug": {
		label: "mnemopi.debug",
	},
	"hindsight.apiUrl": {
		label: "URL API Hindsight",
		description: "URL máy chủ Hindsight (Cloud hoặc tự lưu trữ)",
	},
	"hindsight.apiToken": {
		label: "Token API Hindsight",
		description: "Token Bearer cho các máy chủ Hindsight có xác thực",
	},
	"hindsight.bankId": {
		label: "ID ngân hàng Hindsight",
		description: "ID ngân hàng ký ức (mặc định: tên dự án)",
	},
	"hindsight.bankIdPrefix": {
		label: "hindsight.bankIdPrefix",
	},
	"hindsight.scoping": {
		label: "Phạm vi Hindsight",
		description:
			"global = một ngân hàng chung; per-project = ngân hàng riêng cho từng cwd; per-project-tagged = ngân hàng chung có nhãn dự án để khi tìm kiếm, ký ức chung và bản ghi của dự án được gộp lại",
	},
	"hindsight.bankMission": {
		label: "hindsight.bankMission",
	},
	"hindsight.retainMission": {
		label: "hindsight.retainMission",
	},
	"hindsight.autoRecall": {
		label: "Tự động tìm ký ức Hindsight",
		description: "Tìm ký ức trong chu kỳ đầu tiên của mỗi phiên",
	},
	"hindsight.autoRetain": {
		label: "Tự động lưu ký ức Hindsight",
		description: "Lưu bản ghi mỗi N chu kỳ và ở ranh giới phiên",
	},
	"hindsight.retainMode": {
		label: "Chế độ lưu Hindsight",
		description: "full-session = cập nhật một tài liệu cho mỗi phiên; last-turn = lưu theo từng phần",
	},
	"hindsight.retainEveryNTurns": {
		label: "hindsight.retainEveryNTurns",
	},
	"hindsight.retainOverlapTurns": {
		label: "hindsight.retainOverlapTurns",
	},
	"hindsight.retainContext": {
		label: "hindsight.retainContext",
	},
	"hindsight.recallBudget": {
		label: "hindsight.recallBudget",
	},
	"hindsight.recallMaxTokens": {
		label: "hindsight.recallMaxTokens",
	},
	"hindsight.recallContextTurns": {
		label: "hindsight.recallContextTurns",
	},
	"hindsight.recallMaxQueryChars": {
		label: "hindsight.recallMaxQueryChars",
	},
	"hindsight.recallTypes": {
		label: "hindsight.recallTypes",
	},
	"hindsight.debug": {
		label: "hindsight.debug",
	},
	"hindsight.requestTimeoutMs": {
		label: "hindsight.requestTimeoutMs",
	},
	"hindsight.reflectTimeoutMs": {
		label: "hindsight.reflectTimeoutMs",
	},
	"hindsight.recallTimeoutMs": {
		label: "hindsight.recallTimeoutMs",
	},
	"hindsight.retainTimeoutMs": {
		label: "hindsight.retainTimeoutMs",
	},
	"hindsight.mentalModelsEnabled": {
		label: "Mô hình tinh thần Hindsight",
		description:
			"Khi khởi động, thêm các bản tóm tắt reflect được chọn (mô hình tinh thần) vào hướng dẫn cho nhà phát triển. Tải các mô hình hiện có của ngân hàng, không ghi dữ liệu. Dùng với hindsight.mentalModelAutoSeed để đồng thời tạo bộ mô hình khởi tạo tích hợp.",
	},
	"hindsight.mentalModelAutoSeed": {
		label: "Tự động tạo mô hình tinh thần Hindsight",
		description:
			"Khi bắt đầu phiên, tạo các mô hình tinh thần tích hợp còn thiếu (project-conventions, project-decisions, user-preferences) trong ngân hàng.",
	},
	"hindsight.mentalModelMaxRenderChars": {
		label: "hindsight.mentalModelMaxRenderChars",
	},
	"ttsr.enabled": {
		label: "TTSR",
		description:
			"Ngắt tác nhân trong lúc phát trực tuyến nếu đầu ra khớp với mẫu quy tắc (Time-Traveling Stream Rules)",
	},
	"ttsr.judge": {
		label: "Quy tắc có kiểm tra",
		description:
			"Với mỗi quy tắc `question`, yêu cầu vai trò mô hình judge kiểm tra các câu trả lời đã hoàn tất, phần Reasoning và lệnh gọi công cụ; nếu trả lời “có”, thêm quy tắc dưới dạng cảnh báo",
	},
	"ttsr.contextMode": {
		label: "Chế độ ngữ cảnh TTSR",
		description: "Cách xử lý đầu ra một phần khi TTSR kích hoạt",
	},
	"ttsr.interruptMode": {
		label: "Chế độ ngắt TTSR",
		description: "Khi nào ngắt luồng phát và khi nào thêm cảnh báo sau khi hoàn tất",
	},
	"ttsr.repeatMode": {
		label: "Chế độ lặp TTSR",
		description: "Cách quy tắc có thể lặp lại: một lần mỗi phiên hoặc sau khoảng dừng giữa các tin nhắn",
	},
	"ttsr.repeatGap": {
		label: "Khoảng cách lặp TTSR",
		description: "Số tin nhắn trước khi quy tắc kích hoạt lại",
	},
	"ttsr.builtinRules": {
		label: "Quy tắc tích hợp",
		description: "Tải các quy tắc mặc định đi kèm tác nhân (ghi đè riêng bằng ttsr.disabledRules)",
	},
	"ttsr.disabledRules": {
		label: "Quy tắc bị tắt",
		description: "Tên các quy tắc cần bỏ qua hoàn toàn (tích hợp và tùy chỉnh)",
	},
	"edit.mode": {
		label: "Chế độ chỉnh sửa",
		description: "Chọn biến thể công cụ chỉnh sửa (replace, patch, hashline hoặc apply_patch)",
	},
	"edit.modelVariants": {
		label: "edit.modelVariants",
	},
	"edit.fuzzyMatch": {
		label: "Khớp mờ",
		description: "Chấp nhận các kết quả khớp có độ tin cậy cao khi có khác biệt về khoảng trắng",
	},
	"edit.fuzzyThreshold": {
		label: "Ngưỡng khớp mờ",
		description: "Ngưỡng tương đồng (0–1) để chấp nhận khớp mờ",
	},
	"edit.streamingAbort": {
		label: "Ngắt khi lỗi xem trước",
		description: "Ngắt các lệnh gọi chỉnh sửa phát trực tuyến nếu bản xem trước bản vá gặp lỗi",
	},
	"edit.recoverInlineEdits": {
		label: "Khôi phục dữ liệu chỉnh sửa nội tuyến",
		description:
			"Thực thi dữ liệu chỉnh sửa mà mô hình xuất ra dưới dạng văn bản thường, chuyển chúng thành lệnh gọi công cụ chỉnh sửa",
	},
	"edit.blockAutoGenerated": {
		label: "Chặn tệp tự động tạo",
		description: "Cấm chỉnh sửa các tệp trông như được tạo tự động (protoc, sqlc, swagger, v.v.)",
	},
	"edit.enforceSeenLines": {
		label: "Bắt buộc dòng đã xem",
		description: "Từ chối các thay đổi gắn với những dòng mà lần read hoặc tìm kiếm trước đó chưa hiển thị đầy đủ",
	},
	"edit.blackbox.enabled": {
		label: "Ghi lỗi phân tích cú pháp",
		description: "Thêm toàn bộ văn bản nguồn trước và sau thay đổi nếu thay đổi đó gây lỗi phân tích AST",
	},
	"edit.autoRepair.enabled": {
		label: "Tự động sửa lỗi phân tích cú pháp",
		description:
			"Nếu tệp sau khi chỉnh sửa không vượt qua phân tích AST, yêu cầu mô hình smol sửa đoạn bị lỗi (kiểm tra bằng cách phân tích lại; nếu không được thì hiển thị cảnh báo)",
	},
	"tools.artifactSpillThreshold": {
		label: "Ngưỡng chuyển đầu ra công cụ sang artifact (KB)",
		description: "Đầu ra công cụ lớn hơn mức này được lưu dưới dạng artifact; phần cuối vẫn nằm trong dòng.",
	},
	"tools.artifactTailBytes": {
		label: "Kích thước phần cuối artifact (KB)",
		description: "Lượng nội dung ở phần cuối được giữ lại trong dòng khi chuyển đầu ra sang artifact",
	},
	"tools.artifactHeadBytes": {
		label: "Kích thước phần đầu artifact (KB)",
		description:
			"Lượng nội dung ở phần đầu được giữ lại trong dòng cùng với phần cuối khi chuyển đầu ra sang artifact (bỏ qua phần giữa). 0 chỉ giữ phần cuối.",
	},
	"tools.outputMaxColumns": {
		label: "Giới hạn độ rộng đầu ra",
		description:
			"Giới hạn byte trên mỗi dòng cho đầu ra phát trực tuyến của công cụ (bash, python, js eval) và `read`. Dòng dài bị cắt bằng dấu ba chấm; các byte còn lại đến dòng mới tiếp theo bị bỏ. 0 tắt giới hạn.",
	},
	"tools.artifactTailLines": {
		label: "Số dòng ở cuối artifact",
		description: "Số dòng tối đa của phần cuối được giữ lại trong dòng khi chuyển đầu ra sang artifact",
	},
	"tools.artifactMaxBytes": {
		label: "Giới hạn kích thước artifact (MB)",
		description:
			"Kích thước tối đa của artifact cho đầu ra phát trực tuyến của công cụ (bash, python, js eval). Với đầu ra dài, phần đầu (tối đa 3 MB) và phần còn lại từ cuối được giữ; ở giữa có thêm thông báo về việc cắt bớt. 0 = không giới hạn.",
	},
	readLineNumbers: {
		label: "Số dòng",
		description: "Mặc định thêm số dòng vào kết quả read",
	},
	"read.defaultLimit": {
		label: "Giới hạn đọc mặc định",
		description: "Số dòng trả về mặc định khi tác nhân gọi read mà không đặt giới hạn",
	},
	"read.renderMarkdown": {
		label: "Xem trước Markdown",
		description: "Hiển thị kết quả read dưới dạng Markdown được định dạng trong terminal thay vì văn bản thô",
	},
	"read.summarize.enabled": {
		label: "Tóm tắt khi đọc",
		description: "Trả về tóm tắt mã có cấu trúc khi read được gọi mà không có bộ chọn rõ ràng",
	},
	"read.summarize.prose": {
		label: "Tóm tắt văn bản",
		description: "Trả về tóm tắt có cấu trúc cho Markdown và văn bản thuần",
	},
	"read.summarize.minBodyLines": {
		label: "Số dòng thân tối thiểu để tóm tắt",
		description: "Độ dài tối thiểu của thân hoặc literal nhiều dòng mà tại đó tóm tắt read sẽ thu gọn nó",
	},
	"read.summarize.minCommentLines": {
		label: "Số dòng chú thích tối thiểu để tóm tắt",
		description: "Độ dài tối thiểu của chú thích khối để tóm tắt read thu gọn nó",
	},
	"read.summarize.minTotalLines": {
		label: "Độ dài tệp tối thiểu để tóm tắt read",
		description: "Tệp có ít dòng hơn sẽ được đọc toàn bộ thay vì dưới dạng tóm tắt có cấu trúc",
	},
	"read.summarize.unfoldUntil": {
		label: "Kích thước mục tiêu của tóm tắt read khi mở rộng",
		description:
			"Mở rộng các đoạn bị bỏ qua theo duyệt chiều rộng cho đến khi tóm tắt có ít nhất số dòng hiển thị này. 0 chỉ giữ lại các phần bị bỏ qua ở lớp ngoài.",
	},
	"read.summarize.unfoldLimit": {
		label: "Giới hạn trên của tóm tắt read khi mở rộng",
		description:
			"Giới hạn cứng về kích thước tóm tắt khi duyệt theo chiều rộng. Việc mở rộng bị bỏ qua nếu số dòng được mở vượt quá giới hạn; đoạn đó vẫn bị thu gọn và quá trình xử lý tiếp tục với các đoạn còn lại.",
	},
	"read.toolResultPreview": {
		label: "Xem trước read nội tuyến",
		description: "Hiển thị kết quả read trong bản ghi thay vì dòng tóm tắt",
	},
	"tools.approval": {
		label: "Quy tắc phê duyệt công cụ",
		description:
			"Quy tắc phê duyệt cho từng công cụ. Đặt allow để tự động phê duyệt, prompt để yêu cầu phê duyệt hoặc deny để chặn. Các ghi đè áp dụng trong mọi chế độ phê duyệt.",
	},
	"tools.approvalMode": {
		label: "Phê duyệt lệnh gọi công cụ",
		description:
			"Hành vi mặc định khi phê duyệt lệnh gọi công cụ. «Always ask» chỉ tự động phê duyệt các công cụ đọc. «Ask and remember» cũng hỏi trước khi đọc và có thể ghi nhớ quyền theo tệp hoặc thư mục. «Write» tự động phê duyệt việc đọc và ghi trong không gian làm việc. «Yolo» tự động phê duyệt mọi cấp; chính sách của người dùng vẫn có thể yêu cầu phê duyệt hoặc chặn lệnh gọi.",
	},
	"todo.enabled": {
		label: "Danh sách tác vụ",
		description: "Bật công cụ todo để theo dõi tác vụ",
	},
	"todo.reminders": {
		label: "Nhắc nhở tác vụ",
		description: "Nhắc tác nhân hoàn thành tác vụ trước khi dừng",
	},
	"todo.remindersMax": {
		label: "Giới hạn nhắc nhở tác vụ",
		description: "Số nhắc nhở tác vụ tối đa",
	},
	"todo.eager": {
		label: "Tự động tạo danh sách tác vụ",
		description: "Mức độ tích cực gợi ý tự động tạo danh sách tác vụ sau tin nhắn đầu tiên",
	},
	"tasks.todoClearDelay": {
		label: "Độ trễ tự động dọn dẹp tác vụ",
		description: "Độ trễ trước khi xóa các tác vụ đã hoàn thành hoặc bị bỏ dở khỏi widget todo",
	},
	"glob.enabled": {
		label: "Glob",
		description: "Bật công cụ glob để tìm tệp theo mẫu glob",
	},
	"grep.enabled": {
		label: "Grep",
		description: "Bật công cụ grep để tìm nội dung theo biểu thức chính quy",
	},
	"grep.contextBefore": {
		label: "Ngữ cảnh Grep trước kết quả khớp",
		description: "Số dòng ngữ cảnh trước mỗi kết quả khớp grep",
	},
	"grep.contextAfter": {
		label: "Ngữ cảnh Grep sau kết quả khớp",
		description: "Số dòng ngữ cảnh sau mỗi kết quả khớp grep",
	},
	"astGrep.enabled": {
		label: "Tìm kiếm theo AST",
		description: "Bật công cụ ast_grep để tìm kiếm cấu trúc theo AST",
	},
	"astEdit.enabled": {
		label: "Chỉnh sửa AST",
		description: "Bật công cụ ast_edit để chuyển đổi cấu trúc AST",
	},
	"find.enabled": {
		label: "Tìm kiếm (grep ngữ nghĩa)",
		description:
			"Bật công cụ find: tìm kiếm tệp và phạm vi dòng bằng ngôn ngữ tự nhiên, do mô hình đóng vai judge đánh giá. Chế độ Auto chỉ bật công cụ này khi mô hình gốc TypeSafe jev được chọn cho vai judge",
	},
	"debug.enabled": {
		label: "Gỡ lỗi",
		description: "Bật công cụ debug để gỡ lỗi dựa trên DAP",
	},
	"launch.enabled": {
		label: "Dịch vụ",
		description: "Bật các dịch vụ bash có tên và giám sát proc:// cho các tiến trình chạy dài dùng chung của dự án",
	},
	"speechgen.enabled": {
		label: "Tổng hợp giọng nói",
		description: "Bật công cụ tts để tổng hợp tệp âm thanh trên thiết bị (Kokoro) hoặc bằng xAI Grok Voice",
	},
	"generate_image.enabled": {
		label: "Tạo hình ảnh",
		description:
			"Bật công cụ generate_image để tạo và chỉnh sửa hình ảnh từ mô tả văn bản. Công cụ này được gắn dưới dạng lệnh công cụ khi bật tools.commands.",
	},
	"computer.enabled": {
		label: "Máy tính",
		description:
			"Bật eval prelude để điều khiển màn hình nền của máy host từ script (chụp màn hình, nhập liệu, trợ năng)",
	},
	"ratchet.enabled": {
		label: "Ratchet",
		description: "Bật prelude eval ratchet/hillclimb; lệnh /ratchet bật nó cho phiên hiện tại",
	},
	"archive.enabled": {
		label: "Lưu trữ",
		description:
			"Bật prelude eval của kho lưu trữ chỉ đọc: lịch sử câu lệnh, dự án gần đây, các phiên trước và bản tóm tắt",
	},
	"computer.display": {
		label: "Màn hình máy tính",
		description:
			"Màn hình của cửa sổ đang hoạt động (active), tất cả màn hình (all) hoặc mã định danh màn hình hệ thống",
	},
	"computer.maxWidth": {
		label: "Chiều rộng ảnh chụp màn hình máy tính",
		description: "Chiều rộng tối đa của ảnh chụp màn hình tính bằng pixel",
	},
	"computer.maxHeight": {
		label: "Chiều cao ảnh chụp màn hình máy tính",
		description: "Chiều cao tối đa của ảnh chụp màn hình tính bằng pixel",
	},
	"images.questionTimeoutMs": {
		label: "Thời gian chờ câu hỏi về hình ảnh",
		description:
			"Thời gian chờ cho mỗi yêu cầu tới mô hình thị giác máy tính cho câu hỏi về hình ảnh read với tham số ?q=, tính bằng mili giây. Nếu nhà cung cấp bị treo, yêu cầu sẽ nhanh chóng kết thúc với lỗi hết thời gian chờ thay vì chờ dừng thủ công. Giá trị 0 tắt thời gian chờ.",
	},
	"checkpoint.enabled": {
		label: "Điểm kiểm tra/hoàn tác",
		description: "Bật các công cụ tạo điểm kiểm tra và hoàn tác ngữ cảnh",
	},
	"fetch.enabled": {
		label: "Đọc URL",
		description: "Cho phép công cụ read tải xuống và xử lý URL",
	},
	"vault.enabled": {
		label: "Kho Obsidian",
		description:
			"Bật URL nội bộ vault:// để đọc và chỉnh sửa nội dung kho Obsidian qua Obsidian CLI. Khi tắt, các truy cập vault:// bị từ chối và việc ghi vault:// bị loại khỏi câu lệnh hệ thống.",
	},
	"github.enabled": {
		label: "GitHub CLI",
		description:
			"Bật công cụ github (gọi các thao tác cho kho lưu trữ, issue, pull request, diff, tìm kiếm, checkout, push và theo dõi quy trình Actions)",
	},
	"github.cache.enabled": {
		label: "Bộ nhớ đệm chế độ xem GitHub",
		description:
			"Lưu vào bộ nhớ đệm hiển thị issue/PR trong ~/.omp/cache/github-cache.db để lần đọc lại không cần truy vấn",
	},
	"github.cache.softTtlSec": {
		label: "TTL mềm của bộ nhớ đệm GitHub",
		description:
			"Trong khoảng thời gian này, các dòng hiển thị issue/PR được trả về trực tiếp từ bộ nhớ đệm (giây; mặc định 5 phút)",
	},
	"github.cache.hardTtlSec": {
		label: "TTL cứng của bộ nhớ đệm GitHub",
		description:
			"Sau TTL mềm, dòng được trả về từ bộ nhớ đệm và làm mới ở chế độ nền; sau TTL cứng, dòng đó bị xóa (giây; mặc định 7 ngày)",
	},
	"web_search.enabled": {
		label: "Tìm kiếm web",
		description: "Bật công cụ web_search để lấy kết quả mới nhất từ internet",
	},
	"security.enabled": {
		label: "Bảo mật",
		description:
			"Bật lập kế hoạch và thực thi kiểm tra bảo mật bằng OMP, cùng không gian tài nguyên security:// chỉ đọc",
	},
	"ask.enabled": {
		label: "Hỏi",
		description: "Bật công cụ ask để đặt câu hỏi tương tác cho người dùng",
	},
	"tools.intentTracing": {
		label: "Mô tả ý định",
		description: "Yêu cầu tác nhân mô tả mục đích của mỗi lần gọi công cụ trước khi thực hiện",
	},
	"tools.abortOnFabricatedResult": {
		label: "Dừng khi kết quả công cụ bị bịa đặt",
		description:
			"Với các lần gọi công cụ tích hợp, dừng mô hình ngay lập tức nếu nó bắt đầu bịa kết quả công cụ giữa câu trả lời. Nếu tắt, mô hình sẽ hoàn tất việc tạo và phần tiếp nối bịa đặt sẽ bị loại bỏ.",
	},
	"tools.speculativeExecution.enabled": {
		label: "Thực thi suy đoán thử nghiệm",
		description:
			"Bật giai đoạn đầu an toàn có thể hủy: các lần đọc cục bộ đã kiểm chứng qua gọi read trực tiếp và eval lồng nhau. Yêu cầu mạng, phản hồi nhà cung cấp và ghi tệp theo thời gian thực không nằm trong chế độ này.",
	},
	"tools.speculativeExecution.maxInFlight": {
		label: "Độ song song thực thi suy đoán",
		description:
			"Số lượng tối đa các thao tác đọc cục bộ đã kiểm chứng có thể chạy trước khi gửi lệnh gọi thông thường.",
	},
	"tools.maxTimeout": {
		label: "Thời gian chờ tối đa của công cụ",
		description:
			"Thời gian chờ tối đa tính bằng giây mà tác nhân có thể đặt cho bất kỳ công cụ nào (0 = không giới hạn)",
	},
	"async.enabled": {
		label: "Thực thi bất đồng bộ",
		description: "Bật các lệnh bash bất đồng bộ và thực thi tác vụ chạy nền",
	},
	"async.widgets": {
		label: "Widget tác vụ trực tiếp",
		description:
			"Vẽ widget trực tiếp cho mỗi tác vụ chạy nền (biểu đồ, thanh, lưới trạng thái từ đầu ra của nó) trong thẻ chờ, chỉ báo tác vụ và bảng tác vụ. Vai trò mô hình `widget` (mặc định `smol`) viết một đặc tả cho mỗi tác vụ; các cập nhật sau không cần gọi mô hình",
	},
	"async.maxJobs": {
		label: "async.maxJobs",
	},
	"tools.commands": {
		label: "Lệnh công cụ",
		description:
			"Gắn các công cụ ít dùng (phát hiện được) thành lệnh bash kèm `--help` sinh từ schema, thay vì gửi schema của chúng trong mỗi yêu cầu. Cần công cụ bash: phiên không có bash vẫn giữ mọi công cụ được bật ở cấp cao nhất. Tắt để hiển thị mọi công cụ được bật ở cấp cao nhất.",
	},
	"tools.commandDocs": {
		label: "Tài liệu câu lệnh công cụ",
		description:
			"Chọn những lệnh đã gắn nào có phần `--help` được nhúng vào câu lệnh hệ thống. Ở chế độ Chỉ bản tích hợp sẵn, các công cụ chính vẫn được nhúng, còn MCP và tiện ích mở rộng được tải theo yêu cầu.",
	},
	"tools.commandInline": {
		label: "Trợ giúp nhúng của lệnh công cụ",
		description:
			"Khi Tài liệu câu lệnh công cụ là Chỉ bản tích hợp sẵn, nhúng thêm các lệnh động có tên khớp với các mẫu glob này (ví dụ mcp__context_mode_*). Chế độ Chỉ danh mục bỏ qua cài đặt này.",
	},
	"dev.autoqa": {
		label: "QA tự động",
		description:
			"Tự động gửi báo cáo sự cố công cụ (lệnh report_issue). Mặc định bật; lần gửi đầu tiên sẽ hỏi ý kiến. Từ chối sẽ tắt việc gửi cho đến khi được bật lại rõ ràng.",
	},
	"dev.autoqaPush.endpoint": {
		label: "Địa chỉ gửi Auto QA",
		description: "URL đầy đủ để nhận báo cáo Auto QA ở định dạng JSON (mặc định https://qa.omp.sh/v1/grievances)",
	},
	"dev.autoqaPush.token": {
		label: "dev.autoqaPush.token",
	},
	"dev.autoqaConsent": {
		label: "dev.autoqaConsent",
	},
	"lsp.enabled": {
		label: "LSP",
		description: "Bật công cụ lsp để phân tích mã (định nghĩa, tham chiếu, chẩn đoán, đổi tên)",
	},
	"lsp.lazy": {
		label: "Khởi động LSP muộn",
		description:
			"Khởi động máy chủ ngôn ngữ ở lần sử dụng đầu tiên (công cụ lsp hoặc chỉnh sửa tệp thuộc loại phù hợp), thay vì khi bắt đầu phiên",
	},
	"lsp.shared": {
		label: "Máy chủ ngôn ngữ dùng chung",
		description:
			"Khởi chạy máy chủ ngôn ngữ qua broker daemon của dự án. Mỗi kết nối khởi chạy một máy chủ riêng. Khi một phiên bản omp khác đang chạy trong dự án, máy chủ đã được giải phóng vẫn hoạt động và kết nối tiếp theo dùng lại nó thay vì khởi động nguội (nếu broker không khả dụng thì dùng máy chủ riêng)",
	},
	"lsp.formatOnWrite": {
		label: "Định dạng khi ghi",
		description: "Tự động định dạng tệp mã bằng LSP sau khi ghi",
	},
	"lsp.diagnosticsOnWrite": {
		label: "Chẩn đoán khi ghi",
		description: "Hiển thị chẩn đoán LSP sau khi ghi tệp mã",
	},
	"lsp.diagnosticsOnEdit": {
		label: "Chẩn đoán khi sửa",
		description: "Hiển thị chẩn đoán LSP sau khi sửa tệp mã",
	},
	"lsp.diagnosticsDeduplicate": {
		label: "Loại bỏ chẩn đoán trùng lặp",
		description:
			"Không hiển thị lại chẩn đoán LSP đã xuất ra sau khi sửa tệp; chỉ hiển thị chẩn đoán mới hoặc đã thay đổi",
	},
	"lsp.requestTimeout": {
		label: "Thời gian chờ yêu cầu",
		description:
			"Số giây chờ chẩn đoán, gợi ý khi rê chuột và các phản hồi khác của máy chủ ngôn ngữ khi tác nhân không đặt thời gian chờ. Với chẩn đoán đến muộn sau khi sửa, thời gian chờ không ít hơn giá trị này. Tăng giá trị cho máy chủ khởi động nguội chậm. Tham số timeout của công cụ lsp cho phép thay đổi theo từng lần gọi.",
	},
	shellPath: {
		label: "shellPath",
	},
	"bash.enabled": {
		label: "Bash",
		description: "Bật công cụ bash để thực thi lệnh shell",
	},
	"bash.allowCompoundCommands": {
		label: "Cho phép lệnh ghép",
		description:
			"Thực thi nguyên chuỗi && cho từng lệnh; các lệnh còn lại dùng chính sách thông thường và chế độ phê duyệt bash",
	},
	"bash.autoBackground.enabled": {
		label: "Tự động chạy Bash nền",
		description: "Tự động chuyển các lệnh bash chạy lâu sang chế độ chạy nền và gửi kết quả sau",
	},
	"bash.gitGuard": {
		label: "Bảo vệ Git",
		description:
			"Từ chối các lệnh git trong công cụ bash làm mất hoặc di chuyển công việc chung: stash, reset --hard hoặc về commit khác, cũng như checkout/switch/restore ngoài xung đột merge hoặc rebase",
	},
	"bash.patterns": {
		label: "Mẫu phê duyệt Bash",
		description:
			"Các quy tắc phê duyệt lệnh bash có thứ tự. Mỗi mục có trường match và approval; chỉ hỗ trợ ký tự đại diện '*'.",
	},
	"bashInterceptor.enabled": {
		label: "Trình chặn Bash",
		description: "Chặn các lệnh shell đã có công cụ riêng",
	},
	"bashInterceptor.patterns": {
		label: "bashInterceptor.patterns",
	},
	"bash.direnv": {
		label: "Tự động tải direnv",
		description:
			"Tự động tải `.envrc` của repo direnv/devenv vào phiên bash để công cụ devenv và biến môi trường sẵn sàng mà không cần chạy thủ công `direnv exec`. Danh sách cho phép của direnv được tôn trọng: tệp `.envrc` chưa được `direnv allow` sẽ không bao giờ chạy",
	},
	"bash.direnvLoadTimeoutMs": {
		label: "Thời gian chờ tải direnv (ms)",
		description:
			"Thời gian chờ tối đa cho `direnv export` đầu tiên (khởi động nguội devenv có thể mất thời gian); khi hết thời gian chờ, phiên tiếp tục mà không có môi trường direnv",
	},
	"shellMinimizer.enabled": {
		label: "Rút gọn đầu ra shell",
		description: "Rút gọn đầu ra shell dài dòng (git, npm, cargo, v.v.) trước khi gửi cho tác nhân",
	},
	"shellMinimizer.settingsPath": {
		label: "shellMinimizer.settingsPath",
	},
	"shellMinimizer.only": {
		label: "shellMinimizer.only",
	},
	"shellMinimizer.except": {
		label: "shellMinimizer.except",
	},
	"shellMinimizer.maxCaptureBytes": {
		label: "shellMinimizer.maxCaptureBytes",
	},
	"shellMinimizer.sourceOutlineLevel": {
		label: "Mức dàn ý mã nguồn của Shell Minimizer",
		description: "Chế độ dàn ý mã nguồn cho cat/read: default hoặc aggressive",
	},
	"shellMinimizer.legacyFilters": {
		label: "shellMinimizer.legacyFilters",
	},
	"bash.autoBackground.thresholdMs": {
		label: "bash.autoBackground.thresholdMs",
	},
	"eval.py": {
		label: "Môi trường chạy Python cho eval",
		description: "Cho phép công cụ eval chuyển các ô Python tới nhân IPython",
	},
	"eval.js": {
		label: "Môi trường chạy JavaScript cho eval",
		description: "Cho phép công cụ eval chuyển các ô JavaScript tới môi trường chạy tích hợp",
	},
	"eval.autoProvision": {
		label: "Chuẩn bị môi trường eval",
		description: "Tự động tạo môi trường gói JavaScript được quản lý cho eval trong lần cài đặt đầu tiên",
	},
	"eval.tools.enabled": {
		label: "Công cụ định nghĩa trong eval",
		description:
			"Cho phép các ô eval định nghĩa công cụ (@tool trong Python, tool(fn) trong JS) mà tác nhân con task, agent() và workpool() có thể gọi",
	},
	"eval.workpool.freshAgents": {
		label: "Tác nhân Workpool mới",
		description:
			"Tạo tác nhân con mới cho mỗi mục trong workpool thay vì dùng lại worker hoặc gộp các mục trong hàng đợi",
	},
	"eval.autoBackground.enabled": {
		label: "Tự động chạy eval nền",
		description: "Tự động chuyển các ô eval chạy lâu sang chế độ chạy nền và gửi kết quả sau",
	},
	"eval.autoBackground.thresholdMs": {
		label: "eval.autoBackground.thresholdMs",
	},
	"python.kernelMode": {
		label: "Chế độ nhân Python",
		description: "Giữ nhân IPython giữa các lần gọi eval hoặc khởi động mới ở mỗi lần gọi",
	},
	"python.interpreter": {
		label: "Trình thông dịch Python",
		description:
			"Đường dẫn tùy chọn tới tệp thực thi Python cụ thể. Nếu được đặt, việc tự động dò môi trường chạy Python sẽ bị bỏ qua.",
	},
	"task.isolation.enabled": {
		label: "Cho phép tác nhân con cách ly",
		description:
			"Cho phép cách ly từng tác vụ bằng `isolated: true`; các tác vụ khác chạy trong bản sao làm việc chung",
	},
	"isolation.backend": {
		label: "Cơ chế cách ly",
		description: "Cơ chế cách ly tác nhân con và nhân bản worktree",
	},
	"worktree.clone": {
		label: "Nhân bản bản sao làm việc vào worktree",
		description:
			"Các worktree mới do lệnh `github pr_checkout` và `git worktree add` trong bash tạo ra sẽ bắt đầu như một bản sao copy-on-write của bản sao làm việc hiện tại, nhờ đó các tạo tác bị bỏ qua (node_modules, target) được giữ lại. Nếu hệ thống tệp không hỗ trợ nhân bản, sẽ dùng bản sao làm việc thông thường.",
	},
	"worktree.cleanSource": {
		label: "Dọn bản sao làm việc nguồn khi /wt",
		description:
			"Khi tạo worktree bằng lệnh `/wt`, di chuyển các thay đổi, sau đó đặt lại các thay đổi được theo dõi và xóa các tệp không được theo dõi khỏi bản sao làm việc nguồn",
	},
	"worktree.onStart": {
		label: "Worktree khi khởi động",
		description: "Có khởi chạy phiên tương tác mới trong worktree liên kết mới hay không",
	},
	"worktree.onExit": {
		label: "Worktree khi thoát",
		description:
			"Việc cần làm khi thoát với các worktree được tạo sau khi omp khởi động (lúc khởi động hoặc bằng lệnh `/wt`)",
	},
	"task.isolation.apply": {
		label: "Áp dụng thay đổi cách ly",
		description:
			"Tự động áp dụng các thay đổi thành công của tác vụ cách ly vào bản sao làm việc cha; tắt để giữ lại các tạo tác patch hoặc branch.",
	},
	"task.isolation.merge": {
		label: "Chiến lược merge cách ly",
		description: "Cách tích hợp thay đổi của tác vụ cách ly (áp dụng patch hoặc merge branch)",
	},
	"task.isolation.commits": {
		label: "Kiểu commit cách ly",
		description: "Kiểu thông điệp commit cho thay đổi trong các kho lưu trữ con (chung hoặc do AI tạo)",
	},
	"worktree.base": {
		label: "Thư mục gốc Worktree",
		description:
			"Thư mục gốc cho các Worktree do tác nhân quản lý - bản sao cách ly tác vụ, các checkout PR `github` và dọn dẹp `omp worktree` đều nằm ở đây. Nếu không đặt, dùng ~/.omp/wt. Phải là đường dẫn tuyệt đối hoặc tương đối với ~; đường dẫn tương đối bị bỏ qua. Biến môi trường OMP_WORKTREE_DIR sẽ ghi đè giá trị này.",
	},
	"task.eager": {
		label: "Ưu tiên ủy thác tác vụ",
		description: "Mức độ tích cực chuyển việc cho tác nhân con",
	},
	"task.batch": {
		label: "Gọi tác vụ theo lô",
		description:
			"Chuyển công cụ task sang dạng theo lô: một lệnh gọi mang { context, tasks[] } - mỗi mục một tác nhân con, với tác nhân tùy chọn cho từng mục (mặc định là tác nhân theo chính sách khởi tạo của phiên), cách ly theo từng mục và ngữ cảnh chia sẻ bắt buộc được thêm vào đầu mỗi nhiệm vụ. Với async.enabled=true, mỗi lần khởi tạo chạy như một tác nhân chạy nền độc lập với vòng đời nhàn rỗi/tạm dừng thông thường; nếu không, lệnh gọi sẽ chặn để chờ kết quả đã hợp nhất. Tắt để khôi phục lược đồ một lần khởi tạo phẳng.",
	},
	"task.structured": {
		label: "Kết quả tác vụ có cấu trúc",
		description:
			"Thêm các tham số outputSchema/schemaMode vào công cụ task và trả kết quả của tác nhân con qua công cụ yield với kiểm tra theo lược đồ đầu ra của tác nhân gọi hoặc tác nhân con. Ở chế độ Off, tác nhân con của task không có công cụ yield và trả thông điệp cuối cùng dưới dạng văn bản thường, trừ các tác nhân có tham số structured: true. Các lần chạy eval agent()/workpool luôn trả kết quả có cấu trúc.",
	},
	"task.speculativeLaunch": {
		label: "Khởi chạy tác vụ suy đoán",
		description:
			"Khởi chạy từng tác nhân con theo lô ngay khi truyền xong mục tasks[] của nó, không chờ toàn bộ lệnh gọi task. Các tác nhân đã khởi chạy sẽ dừng nếu lệnh gọi hoàn tất không vượt qua kiểm tra, bị chặn hoặc đối số của nó thay đổi. Yêu cầu phê duyệt tự động cho task và không có trình xử lý vòng đời công cụ của tiện ích mở rộng.",
	},
	"task.enableEffort": {
		label: "Mức nỗ lực theo từng tác vụ",
		description:
			"Thêm tham số tùy chọn effort khi khởi chạy task để tác nhân gọi có thể ghi đè mức reasoning của từng tác nhân con",
	},
	"task.maxConcurrency": {
		label: "Số tác vụ đồng thời tối đa",
		description: "Số tác nhân con chạy đồng thời tối đa",
	},
	"task.enableLsp": {
		label: "LSP cho tác nhân con",
		description:
			"Cho phép các tác nhân con do công cụ task khởi chạy dùng công cụ lsp. Mặc định tắt để giảm chi phí tác nhân con; bật nếu việc ủy thác có hỗ trợ LSP xứng đáng với số token tăng thêm.",
	},
	"task.maxRecursionDepth": {
		label: "Độ sâu đệ quy tác vụ tối đa",
		description: "Tác nhân con có thể khởi chạy tác nhân con riêng đến độ sâu nào",
	},
	"task.maxRuntimeMs": {
		label: "Thời gian chạy tối đa của tác nhân con",
		description:
			"Giới hạn cứng thời gian chạy thực tế của mỗi tác nhân con (ms). Giá trị 0 tắt giới hạn. Lớp bảo vệ bổ sung chống treo luồng phía nhà cung cấp mà watchdog cấp đầu ra không phát hiện; dẫn đến việc dừng tác nhân con thông thường với lý do 'timed out'.",
	},
	"task.completionProbe": {
		label: "Thăm dò hoàn tất của tác nhân con",
		description:
			"Yêu cầu tác nhân con đang chạy ước lượng mức sẵn sàng qua một yêu cầu phụ có thể lưu bộ nhớ đệm, ví dụ /btw: sau 2, 5, 10 và 30 phút, rồi mỗi giờ. Ước lượng hiển thị cạnh tác nhân con trong chế độ xem wait và task. Chỉ các tác nhân con do tác nhân chính của phiên tương tác khởi chạy mới nhận được yêu cầu; khi chạy print, RPC, ACP và SDK, không thực hiện kiểm tra.",
	},
	"task.agentIdleTtlMs": {
		label: "TTL nhàn rỗi của tác nhân",
		description:
			"Thời gian tác nhân con nhàn rỗi lưu trong bộ nhớ trước khi tạm dừng xuống đĩa (ms). Khi nhận tin nhắn hoặc được tiếp tục, các tác nhân đã tạm dừng sẽ tự động được khôi phục. Giá trị 0 giữ tác nhân nhàn rỗi trong bộ nhớ cho đến khi thoát.",
	},
	"task.softRequestBudget": {
		label: "Giới hạn mềm yêu cầu của tác nhân con",
		description:
			"Giới hạn mềm số yêu cầu cho mỗi tác nhân con (số yêu cầu của trợ lý trong mỗi lần chạy). Khi vượt, hệ thống thêm chỉ dẫn yêu cầu hoàn tất (xem task.softRequestBudgetNotice); khi đạt 1,5 lần giới hạn, lần chạy bị buộc dừng và tác nhân phải bàn giao kết quả một phần. Giá trị 0 tắt giới hạn. Với các tác nhân tích hợp scout/sonic, giới hạn riêng thấp hơn được áp dụng, nên giá trị thấp hơn giới hạn đó cũng áp dụng cho chúng. Mục task.agentSoftRequestBudget thay thế giới hạn này cho tác nhân được chỉ định.",
	},
	"task.agentSoftRequestBudget": {
		label: "Giới hạn mềm yêu cầu theo tác nhân",
		description: "Ghi đè task.softRequestBudget theo tên tác nhân; giá trị 0 tắt lớp bảo vệ cho tác nhân đó.",
	},
	"task.softRequestBudgetNotice": {
		label: "Thông báo giới hạn mềm yêu cầu",
		description:
			"Thêm một chỉ dẫn khi tác nhân con vượt giới hạn mềm số yêu cầu và yêu cầu nó hoàn tất trước khi bị buộc dừng khi đạt 1,5 lần giới hạn.",
	},
	"task.maxEffort": {
		label: "Mức nỗ lực tối đa khi khởi chạy",
		description:
			"Mức reasoning tối đa được phép cho tham số effort khi khởi chạy qua task. Giá trị thấp hơn sẽ ngăn tác nhân gọi vượt quá giới hạn này cho tác nhân con; giá trị mặc định giữ nguyên toàn bộ dải của mô hình.",
	},
	"task.disabledAgents": {
		label: "task.disabledAgents",
	},
	"task.agentModelOverrides": {
		label: "task.agentModelOverrides",
	},
	"task.agentServiceTierOverrides": {
		label: "task.agentServiceTierOverrides",
	},
	"task.agentCompactionThresholdOverrides": {
		label: "task.agentCompactionThresholdOverrides",
	},
	"task.agentAccountPools": {
		label: "task.agentAccountPools",
	},
	"task.agentPrewalk": {
		label: "task.agentPrewalk",
	},
	"task.agentAdvisor": {
		label: "task.agentAdvisor",
	},
	"task.prewalk": {
		label: "Prewalk cho task thường",
		description:
			"Bật Prewalk cho tác nhân con thường tích hợp `task`: nó khởi chạy trên mô hình đã chọn, lập kế hoạch và bắt đầu triển khai, rồi chuyển việc cho vai trò 'smol' ở lần chỉnh sửa hoặc ghi đầu tiên. Các ghi đè theo từng tác nhân (task.agentPrewalk, đặt qua trung tâm /agents) và frontmatter `prewalk` của tác nhân tùy chỉnh hoạt động độc lập với công tắc này.",
	},
	"task.showResolvedModelBadge": {
		label: "Hiển thị mô hình đã chọn",
		description: "Hiển thị ID mô hình thực tế của từng tác nhân con trong dòng trạng thái của widget task",
	},
	"plan.enabled": {
		label: "Chế độ lập kế hoạch",
		description: "Bật chế độ lập kế hoạch để khám phá và lập kế hoạch chỉ đọc trước khi thực thi",
	},
	"plan.defaultOnStartup": {
		label: "Bắt đầu ở chế độ lập kế hoạch",
		description: "Tự động chuyển sang chế độ lập kế hoạch khi mỗi phiên mới khởi chạy",
	},
	"plan.autosave": {
		label: "Tự động lưu kế hoạch",
		description: "Tự động lưu các kế hoạch đã xác nhận xuống đĩa sau khi thoát chế độ lập kế hoạch",
	},
	"plan.autosaveDir": {
		label: "Thư mục tự động lưu",
		description:
			"Thư mục cho các kế hoạch được tự động lưu. Hỗ trợ đường dẫn có ~, đường dẫn tuyệt đối và đường dẫn tương đối với cwd. Nếu để trống, dùng <project>/.omp/plans/.",
	},
	"goal.enabled": {
		label: "Chế độ mục tiêu",
		description: "Bật chế độ mục tiêu cho từng phiên và công cụ goal ẩn",
	},
	"goal.statusInFooter": {
		label: "Trạng thái mục tiêu ở chân trang",
		description: "Hiển thị giới hạn token cạnh chỉ báo mục tiêu trong dòng trạng thái",
	},
	"goal.continuationModes": {
		label: "Chế độ tiếp tục mục tiêu",
		description: 'Các chế độ chạy mà mục tiêu đang hoạt động có thể tự tiếp tục giữa các lượt ("interactive", "rpc")',
	},
	"title.icons": {
		label: "Biểu tượng tiêu đề",
		description: "Biểu tượng và mã ngắn ở đầu tiêu đề phiên mới được tạo tự động hoặc tiêu đề đặt qua /rename",
	},
	"title.generator": {
		label: "Trình tạo tiêu đề",
		description: "Cách tạo tiêu đề cho phiên chưa có tên dựa trên tin nhắn của người dùng",
	},
	"title.refreshOnReplan": {
		label: "Cập nhật tiêu đề khi lập lại kế hoạch",
		description:
			"Tự động làm mới tiêu đề phiên được tạo tự động sau khi lập lại kế hoạch todo init, nếu tiêu đề chưa do người dùng đặt",
	},
	extensions: {
		label: "Tiện ích mở rộng",
	},
	disabledExtensions: {
		label: "disabledExtensions",
	},
	"skills.registryUrl": {
		label: "Kho đăng ký Skills",
		description:
			"Kho đăng ký Skillshare mà lệnh `omp skill` dùng để cài đặt, tìm kiếm và xuất bản Skills (https://host[:port])",
	},
	"skills.enabled": {
		label: "skills.enabled",
	},
	"skills.enableSkillCommands": {
		label: "Lệnh Skill",
		description: "Đăng ký Skills làm lệnh /skill:name",
	},
	"skills.enableCodexUser": {
		label: "skills.enableCodexUser",
	},
	"skills.enableClaudeUser": {
		label: "skills.enableClaudeUser",
	},
	"skills.enableClaudeProject": {
		label: "skills.enableClaudeProject",
	},
	"skills.enablePiUser": {
		label: "skills.enablePiUser",
	},
	"skills.enablePiProject": {
		label: "skills.enablePiProject",
	},
	"skills.enableAgentsUser": {
		label: "skills.enableAgentsUser",
	},
	"skills.enableAgentsProject": {
		label: "skills.enableAgentsProject",
	},
	"skills.customDirectories": {
		label: "skills.customDirectories",
	},
	"skills.ignoredSkills": {
		label: "skills.ignoredSkills",
	},
	"skills.includeSkills": {
		label: "skills.includeSkills",
	},
	"commands.enableClaudeUser": {
		label: "Lệnh người dùng Claude",
		description: "Tải lệnh từ ~/.claude/commands/",
	},
	"commands.enableClaudeProject": {
		label: "Lệnh dự án Claude",
		description: "Tải lệnh từ .claude/commands/",
	},
	"commands.enableOpencodeUser": {
		label: "Lệnh người dùng OpenCode",
		description: "Tải lệnh từ ~/.config/opencode/commands/",
	},
	"commands.enableOpencodeProject": {
		label: "Lệnh dự án OpenCode",
		description: "Tải lệnh từ .opencode/commands/",
	},
	"extensionHandlers.toolCallTimeoutMs": {
		label: "Thời gian chờ của trình xử lý lệnh gọi công cụ (ms)",
		description:
			"Thời gian chờ hữu hạn dương cho thời gian hoạt động của các trình xử lý tool_call của tiện ích mở rộng; giá trị không hợp lệ sẽ dùng 30000 ms, và thời gian chờ của hộp thoại OMP không được tính",
	},
	"exa.enabled": {
		label: "Exa",
		description: "Bật nhà cung cấp tìm kiếm web Exa",
	},
	"exa.searchDelayMs": {
		label: "Độ trễ tìm kiếm Exa",
		description: "Độ trễ tối thiểu giữa các yêu cầu tìm kiếm web Exa tính bằng mili giây; đặt 0 để tắt độ trễ",
	},
	"searxng.endpoint": {
		label: "Điểm cuối SearXNG",
		description: "URL cơ sở của phiên bản SearXNG tự vận hành dùng cho tìm kiếm web",
	},
	"searxng.token": {
		label: "searxng.token",
	},
	"searxng.basicUsername": {
		label: "searxng.basicUsername",
	},
	"searxng.basicPassword": {
		label: "searxng.basicPassword",
	},
	"searxng.categories": {
		label: "searxng.categories",
	},
	"searxng.engines": {
		label: "searxng.engines",
	},
	"searxng.language": {
		label: "searxng.language",
	},
	"searxng.safesearch": {
		label: "searxng.safesearch",
	},
	"browser.enabled": {
		label: "Trình duyệt",
		description: "Bật mô-đun prelude browser eval để tự động hóa Chromium bằng script (Puppeteer)",
	},
	"browser.cdpUrl": {
		label: "URL CDP của trình duyệt",
		description:
			"Điểm cuối khám phá HTTP CDP mặc định (ví dụ http://127.0.0.1:9222) để kết nối thay vì khởi chạy trình duyệt. Các tham số app.cdp_url hoặc app.path được đặt rõ ràng khi gọi công cụ sẽ được ưu tiên.",
	},
	"browser.relay": {
		label: "Relay trình duyệt",
		description:
			"Điều khiển các thẻ Chrome của bạn qua relay trình duyệt omp. Cài tiện ích mở rộng một lần (`omp browser-relay install`); máy chủ relay tự động khởi động khi browser prelude cần đến. Ưu tiên hơn URL CDP của trình duyệt; đặt PI_BROWSER_RELAY=0 hoặc PI_BROWSER_RELAY=1 để ghi đè cài đặt.",
	},
	"browser.relayUrl": {
		label: "URL relay trình duyệt",
		description: "Điểm cuối relay trình duyệt omp (mặc định http://127.0.0.1:9224).",
	},
	"browser.headless": {
		label: "Trình duyệt chạy nền",
		description: "Khởi chạy trình duyệt ở chế độ nền (tắt để hiển thị giao diện trình duyệt)",
	},
	"browser.cmux": {
		label: "Trình duyệt cmux",
		description:
			"Dùng các bề mặt cmux WKWebView để tự động hóa trình duyệt khi có socket cmux. Đặt PI_BROWSER_CMUX=0 hoặc PI_BROWSER_CMUX=1 để ghi đè cài đặt.",
	},
	"browser.tern": {
		label: "Trình duyệt Tern",
		description:
			"Trong vùng Tern, mở các thẻ trình duyệt dưới dạng cửa sổ hình trong hình (picture-in-picture) đè lên vùng omp (webview nhúng) thay vì Chromium chạy nền; nếu cửa sổ Tern không khả dụng, dùng Chromium. Các tham số app được đặt rõ ràng, relay và URL CDP của trình duyệt sẽ được ưu tiên; app.tern:false tắt chế độ này cho một lần mở. Đặt PI_BROWSER_TERN=0 hoặc PI_BROWSER_TERN=1 để ghi đè cài đặt.",
	},
	"browser.freezeOnTurnEnd": {
		label: "Tạm dừng thẻ trình duyệt khi kết thúc lượt trả lời",
		description:
			"Tạm dừng các thẻ trình duyệt chạy nền do OMP quản lý sau khi kết thúc lượt trả lời để hoạt ảnh trên trang không tiêu tốn CPU/GPU khi rảnh. Các thẻ sẽ tự động tiếp tục ở lần dùng tiếp theo; chỉ định persist:true khi mở để loại thẻ khỏi chế độ này.",
	},
	"browser.idleCloseSec": {
		label: "Thời gian chờ đóng trình duyệt khi rảnh",
		description:
			"Đóng các thẻ trình duyệt nền của OMP và cửa sổ trình duyệt hình trong hình của Tern nếu chúng rảnh lâu hơn số giây đã đặt (0 = không bao giờ; chúng vẫn bị đóng khi phiên kết thúc). Không ảnh hưởng đến trình duyệt của relay, CDP và trình duyệt chạy riêng, cũng như thẻ của các phiên khác.",
	},
	"browser.screenshotDir": {
		label: "Thư mục ảnh chụp màn hình",
		description:
			"Thư mục lưu ảnh chụp màn hình. Nếu không đặt, ảnh được lưu vào tệp tạm. Hỗ trợ ~. Ví dụ: ~/Downloads, ~/Desktop, /sdcard/Download (Android)",
	},
	"ida.enabled": {
		label: "IDA Pro",
		description:
			"Mở các tệp thực thi đã đọc bằng lệnh `read` trong IDA Pro (idalib) và bật công cụ `ida`; cài đặt không có tác dụng nếu IDA chưa được cài",
	},
	"ida.python": {
		label: "Python cho IDA",
		description: "Trình thông dịch Python có thể import ida_domain và idapro; để trống sẽ bật tự động phát hiện",
	},
	"ida.installDir": {
		label: "Thư mục cài đặt IDA",
		description:
			"Thư mục chứa libidalib, được xuất thành IDADIR; để trống sẽ bật tự động phát hiện ($IDADIR, ida-config.json, các đường dẫn cài đặt chuẩn)",
	},
	"ida.maxOpen": {
		label: "Số cơ sở dữ liệu IDA mở tối đa",
		description:
			"Số cơ sở dữ liệu IDA mở đồng thời tối đa cho mỗi dự án (các daemon omp.ida.* trong omp ps); khi mở cơ sở dữ liệu tiếp theo, cơ sở dữ liệu rảnh lâu nhất không được truy cập sẽ được lưu và đóng lại",
	},
	"ida.idleCloseSec": {
		label: "Thời gian chờ đóng cơ sở dữ liệu IDA khi rảnh",
		description:
			"Lưu và đóng các cơ sở dữ liệu IDA rảnh lâu hơn số giây đã đặt (0 = không bao giờ); khi mở lại, không gian tên exec sẽ được đặt lại",
	},
	"mcp.enableProjectConfig": {
		label: "Cấu hình dự án MCP",
		description: "Tải .mcp.json/mcp.json từ thư mục gốc của dự án",
	},
	"mcp.startupTimeoutMs": {
		label: "Khoảng thời gian khởi động MCP",
		description:
			"Chờ số mili giây đã đặt khi phát hiện công cụ MCP lần đầu; với giá trị 0, sẽ chờ cho đến khi các kết nối ổn định",
	},
	"mcp.renderMarkdownResults": {
		label: "Kết quả MCP dạng Markdown",
		description: "Hiển thị kết quả văn bản MCP không phải JSON dưới dạng Markdown trong bản ghi hội thoại",
	},
	"mcp.notifications": {
		label: "Chèn cập nhật MCP",
		description: "Chèn cập nhật tài nguyên MCP vào cuộc hội thoại với tác nhân",
	},
	"mcp.notificationDebounceMs": {
		label: "Khoảng thời gian gộp thông báo MCP",
		description:
			"Khoảng thời gian tính bằng mili giây để gộp các cập nhật tài nguyên MCP trước khi chèn vào cuộc trò chuyện",
	},
	"images.urls.enabled": {
		label: "Gửi hình ảnh dưới dạng URL",
		description:
			"Công bố hình ảnh gửi đi qua chuỗi máy chủ đã cấu hình và gửi cho các nhà cung cấp tải hình ảnh qua URL những liên kết ngắn thay vì dữ liệu base64 nhúng. Nếu tất cả máy chủ hoặc việc tải lên của nhà cung cấp đều thất bại, tự động gửi hình ảnh theo cách nhúng",
	},
	"images.urls.backends": {
		label: "Máy chủ URL hình ảnh",
		description: "Danh sách đích có thứ tự để công bố hình ảnh mà nhà cung cấp có thể truy cập",
	},
	"images.urls.options": {
		label: "images.urls.options",
	},
	"images.urls.credentials": {
		label: "images.urls.credentials",
	},
	"images.urls.command": {
		label: "Lệnh tải hình ảnh lên",
		description:
			"Mẫu đối số lệnh cho máy chủ tải lên; {file} là đường dẫn đến hình ảnh, {mime}/{ext} là các tham số tùy chọn. URL cuối cùng được in ra stdout sẽ được dùng (ví dụ: pasta -b -f {file})",
	},
	"images.urls.publicBaseUrl": {
		label: "URL công khai cơ sở của hình ảnh",
		description: "URL cơ sở bên ngoài trỏ đến máy chủ blob (bắt buộc với ssh, tùy chọn với direct)",
	},
	"images.urls.ttlHours": {
		label: "Thời hạn URL hình ảnh (giờ)",
		description:
			"Thời hạn khả dụng của URL hình ảnh trên máy chủ cục bộ được tính từ lần gửi cuối cùng trong cuộc trò chuyện; khi tiếp tục cuộc trò chuyện, thời hạn cho cùng liên kết sẽ bắt đầu lại. Với giá trị 0, các liên kết vẫn khả dụng chừng nào broker còn chạy",
	},
	"images.urls.bindHost": {
		label: "Địa chỉ liên kết của URL hình ảnh",
		description:
			"Địa chỉ mà máy chủ blob liên kết tới; với đường hầm là loopback, với phân phối trực tiếp là 0.0.0.0",
	},
	"images.urls.sshTarget": {
		label: "Đích SSH cho URL hình ảnh",
		description: "Đích user@host cho chuyển tiếp ngược ssh",
	},
	"images.urls.sshRemotePort": {
		label: "Cổng SSH từ xa cho URL hình ảnh",
		description: "Cổng từ xa mà chuyển tiếp ngược ssh lắng nghe và được máy chủ web chuyển tiếp tới",
	},
	"secrets.enabled": {
		label: "Ẩn bí mật",
		description:
			"Che các bí mật đã cấu hình và xóa các token giống thông tin xác thực trước khi gửi đến nhà cung cấp AI",
	},
	"stt.enabled": {
		label: "Chuyển giọng nói thành văn bản",
		description: "Bật nhập giọng nói từ micrô và chuyển thành văn bản",
	},
	"stt.language": {
		label: "Ngôn ngữ nhận dạng giọng nói",
		description: "Để trống để model tự nhận diện ngôn ngữ bạn nói. Model chỉ hỗ trợ tiếng Anh sẽ bỏ qua mục này.",
	},
	"stt.submitTrigger": {
		label: "Điều kiện gửi giọng nói đã nhận dạng",
		description:
			"Chọn thời điểm tự động gửi văn bản đã đọc: Never, Release (2+ words), Release with complete sentence hoặc When I Say Submit.",
	},
	"collab.relayUrl": {
		label: "URL relay",
		description: "Relay cho /collab (wss://host[:port])",
	},
	"collab.webUrl": {
		label: "URL giao diện web",
		description:
			"Giao diện trình duyệt cho các liên kết /collab; nếu để trống, dùng collab.relayUrl; http:// chỉ định rõ chỉ hoạt động trên localhost",
	},
	"collab.displayName": {
		label: "Tên hiển thị",
		description: "Tên mà những người cộng tác khác nhìn thấy (mặc định: tên người dùng trong hệ điều hành)",
	},
	"collab.autoStart": {
		label: "Tự động khởi động",
		description:
			"Khi khởi chạy từng phiên tương tác, tổ chức phiên đó qua collab.relayUrl và công bố trong sổ đăng ký cục bộ (omp collab list); khi chuyển phiên, các phòng sẽ thay đổi",
	},
	"share.serverUrl": {
		label: "Máy chủ công bố",
		description:
			"Địa chỉ cơ sở để xem và tải lên qua /share (tải blob đã mã hóa lên và xem; liên kết có dạng <base>/<id>#<key>)",
	},
	"share.store": {
		label: "Kho lưu trữ bản công bố",
		description: "Nơi /share tải blob phiên đã mã hóa lên",
	},
	"share.redactSecrets": {
		label: "Xóa bí mật khi công bố",
		description: "Trước khi tải lên, xử lý ảnh chụp /share bằng công cụ che bí mật (dùng cấu hình secrets.*)",
	},
	"stream.serverUrl": {
		label: "Máy chủ phát trực tuyến",
		description:
			"Máy chủ phát cho `omp stream` (https://host[:port]); người xem truy cập tại <base>/<tên người dùng Stencil của bạn>",
	},
	"stream.redactPatterns": {
		label: "Mẫu xóa bổ sung",
		description:
			"Biểu thức chính quy bổ sung để xóa khỏi từng dòng của luồng, ngoài các giá trị env/secrets.yml và mẫu thông tin xác thực tích hợp",
	},
	"commit.mapReduceEnabled": {
		label: "commit.mapReduceEnabled",
	},
	"commit.mapReduceThreshold": {
		label: "commit.mapReduceThreshold",
	},
	"commit.mapBatchTokenBudget": {
		label: "commit.mapBatchTokenBudget",
	},
	"commit.cacheEnabled": {
		label: "commit.cacheEnabled",
	},
	"commit.cacheTtlDays": {
		label: "commit.cacheTtlDays",
	},
	"commit.changelogMaxDiffChars": {
		label: "commit.changelogMaxDiffChars",
	},
	"gc.blobs": {
		label: "gc.blobs",
	},
	"gc.archive": {
		label: "gc.archive",
	},
	"gc.wal": {
		label: "gc.wal",
	},
	"gc.coldArchiveAfterDays": {
		label: "gc.coldArchiveAfterDays",
	},
	"gc.retainNewestGlobal": {
		label: "gc.retainNewestGlobal",
	},
	"gc.retainNewestPerCwd": {
		label: "gc.retainNewestPerCwd",
	},
	"gc.stale": {
		label: "gc.stale",
	},
	"gc.staleRetainNewest": {
		label: "gc.staleRetainNewest",
	},
	"gc.staleRetainDays": {
		label: "gc.staleRetainDays",
	},
	"gc.compress": {
		label: "Nén các phiên nguội",
		description:
			"Ghi đè tại chỗ các tệp phiên nguội bằng tính năng nén trong suốt của hệ thống tệp (APFS, NTFS); phải bật rõ ràng.",
	},
	"gc.compressAfterDays": {
		label: "Nén các phiên cũ hơn N ngày",
		description: "Nén các tệp phiên không được chạm tới lâu hơn số ngày này (mặc định 7).",
	},
	"advisor.continueSeverity": {
		label: "Ngưỡng đánh thức cố vấn",
		description:
			"Mức độ nghiêm trọng tối thiểu của ghi chú cố vấn để tác nhân thức dậy sau câu trả lời cuối. Các ghi chú dưới ngưỡng vẫn là thẻ ở cuối lịch sử và đến với tác nhân trong tin nhắn tiếp theo.",
	},
	"computer.backgroundFallback": {
		label: "Chế độ dự phòng nhập nền",
		description:
			"Việc cần làm khi đường nhập nền vào cửa sổ không khả dụng: thử lại qua cơ chế chặn bắt và trả tiêu điểm về ứng dụng của bạn (macOS; trên nền tảng khác là chặn bắt thông thường), hoặc từ chối - khi đó tác nhân cũng không thể tự đưa cửa sổ lên trước hay mở menu macOS",
	},
	"sharpshooter.minPromptLength": {
		label: "Độ dài tối thiểu của tin nhắn Sharpshooter",
		description: "Tin nhắn người dùng ngắn hơn số ký tự này sẽ bỏ qua việc trích xuất Sharpshooter (mặc định 16).",
	},
	"btw.inject": {
		label: "Chèn câu lệnh từ /btw",
		description:
			"Khi bạn yêu cầu /btw một câu lệnh điều khiển, nó định dạng câu lệnh đó trong thẻ <inject> và làm nổi bật trong câu trả lời; Alt+I (app.btw.inject) gửi câu lệnh đó vào phiên chính.",
	},
	"hindsight.globalScope": {
		label: "Phạm vi toàn cục của Hindsight",
		description:
			"Cho phép retain và learn dùng scope: global - bộ nhớ được lưu không gắn thẻ dự án và được gợi nhớ trong mọi dự án. Yêu cầu phạm vi global hoặc per-project-tagged.",
	},
	"judgment.attemptTimeoutMs": {
		label: "Thời gian chờ mỗi lần thử của mô hình giám khảo (ms)",
		description:
			"Nếu đã đặt phương án dự phòng, mô hình giám khảo không trả lời trong thời gian này (mặc định 3000 ms) sẽ được thay bằng phương án dự phòng, còn tuyến chậm sẽ tạm thời bị bỏ qua.",
	},
	"prewalk.from": {
		label: "Mô hình lập kế hoạch Prewalk",
		description: "Mô hình hoặc vai trò (mặc định '@default') mà /prewalk restart quay về để lập kế hoạch.",
	},
	"prewalk.into": {
		label: "Mục tiêu Prewalk",
		description:
			"Mô hình hoặc vai trò (mặc định '@smol') mà Prewalk giao việc khi có chỉnh sửa hoặc ghi lần đầu: /prewalk, /prewalk restart, «Bật Prewalk» và --prewalk. Prewalk tự động dùng mục tiêu riêng của nó.",
	},
	"providers.openai-codex.daybreak": {
		label: "Codex Daybreak Blue",
		description:
			"Tự động yêu cầu chương trình truy cập Daybreak Blue trên các tài khoản ChatGPT phù hợp. OpenAI có thể sử dụng nội dung các phiên Daybreak Blue để cải thiện mô hình. Không áp dụng cho các mô hình Daybreak Blue riêng lẻ (gpt-daybreak-blue-*), vốn vẫn có thể hoạt động như các phiên Daybreak.",
	},
	"task.perCallModel": {
		label: "Mô hình cho từng lần gọi",
		description:
			"Liệu lệnh gọi tác nhân con có thể chọn mô hình bằng một bộ chọn chính xác provider/model-id[@upstream][:level] hay không. Việc ghim @upstream là một phần danh tính của mô hình và chỉ được các bộ tổng hợp hỗ trợ. Chỉ chấp nhận những mô hình mà cấu hình đã trỏ tới. Cài đặt dự án có thể tắt tính năng này nhưng không thể bật, và không bao giờ phê duyệt mô hình.",
	},
	"task.perCallModelAllow": {
		label: "Mô hình được phép cho mỗi lần gọi",
		description:
			"Các bộ chọn chính xác: `provider/model-id`, với `@upstream` chỉ dành cho tuyến OpenRouter/Vercel đã ghim (ví dụ: `openrouter/x@y`). Nếu danh sách được đặt, mô hình của lần gọi phải nằm trong đó. Danh sách rỗng - mọi mô hình được cấu hình cho phép. Danh sách của dự án chỉ có thể thu hẹp danh sách này.",
	},
	"title.refreshAfterPrompts": {
		label: "Làm mới tiêu đề mỗi N câu lệnh",
		description:
			"Được tính theo số câu lệnh của bạn, không phải theo thời gian; 0 - tắt. Cứ sau mỗi chừng ấy câu lệnh, mô hình giám khảo kiểm tra xem tiêu đề phiên được tạo có phù hợp với cuộc trò chuyện không, và tạo tiêu đề mới nếu không. Các tiêu đề do bạn đặt sẽ không bị thay thế.",
	},
	"magicKeywords.chillax": {
		label: "Từ khóa chillax",
		description:
			"Từ chillax được nhập riêng lẻ sẽ giảm Reasoning xuống mức nỗ lực tối thiểu của mô hình (với các mô hình có mức nỗ lực theo từng tin nhắn - ngay cả giữa lượt) và thêm một thông báo ẩn.",
	},
	"codexResets.autoRedeem5h": {
		label: "Tự động dùng các lượt đặt lại Codex đã lưu (5 giờ)",
		description:
			"Dùng các lượt đặt lại Codex đã lưu cho các lần chặn chỉ ở cửa sổ 5 giờ và cho các khoản tín dụng sắp hết hạn có cửa sổ Chat đầy đủ nhất là 5 giờ. Chưa đặt (hỏi và không bao giờ dùng khi chưa hỏi; «Có») dùng mà không hỏi; «Không» - không bao giờ dùng.",
	},
	"codexResets.autoRedeemWeekly": {
		label: "Tự động dùng các lượt đặt lại Codex đã lưu (tuần)",
		description:
			"Dùng các lượt đặt lại Codex đã lưu cho các lần chặn hàng tuần và cho các khoản tín dụng sắp hết hạn có cửa sổ Chat đầy đủ nhất là một tuần. Một lần chặn chỉ được nhận biết qua thời gian chờ 429 ngắn cần cả hai cửa sổ Codex. Chưa đặt (hỏi và không bao giờ dùng khi chưa hỏi; «Có») dùng mà không hỏi; «Không» - không bao giờ dùng.",
	},
	"claudeResets.autoRedeem5h": {
		label: "Tự động dùng các lượt đặt lại Claude đã lưu (5 giờ)",
		description:
			"Dùng các lượt đặt lại Claude Cedar hoặc Juniper cho các lần chặn chỉ ở cửa sổ 5 giờ và cho các khoản cấp sắp hết hạn có hạn mức được bao phủ đầy đủ nhất là 5 giờ. Chưa đặt (hỏi và không bao giờ dùng khi chưa hỏi; «Có») dùng mà không hỏi; «Không» - không bao giờ dùng.",
	},
	"claudeResets.autoRedeemWeekly": {
		label: "Tự động dùng các lượt đặt lại Claude đã lưu (tuần)",
		description:
			"Dùng các lượt đặt lại Claude Cedar cho các lần chặn hàng tuần hoặc các lần chặn của từng mô hình riêng lẻ và cho các khoản cấp sắp hết hạn có hạn mức được bao phủ đầy đủ nhất là một tuần. Chưa đặt (hỏi và không bao giờ dùng khi chưa hỏi; «Có») dùng mà không hỏi; «Không» - không bao giờ dùng.",
	},
	"claudeResets.autoRedeemFable": {
		label: "Tự động dùng các lượt đặt lại Claude Fable",
		description:
			"Dùng các lượt đặt lại ban đầu của Claude Fable, vốn khôi phục hạn mức hàng tuần của Fable và cửa sổ 5 giờ. Chỉ cài đặt này quản lý chúng. Chưa đặt (hỏi và không bao giờ dùng khi chưa hỏi; «Có») dùng mà không hỏi; «Không» - không bao giờ dùng.",
	},
	"task.autoParallel": {
		label: "Song song tự động",
		description:
			"Hỏi mô hình giám khảo gốc của vai trò «judge» xem những phần nào của mỗi câu lệnh cấp cao nhất mới có thể chạy đồng thời. Cần mô hình giám khảo gốc và công cụ task; nếu không có, không có gì được đánh giá.",
	},
	"task.steps": {
		label: "Các bước tuần tự của tác vụ",
		description:
			"Tác vụ nhận `steps` có thứ tự thay vì một `task`: tác nhân con nhận bước đầu tiên, còn mỗi bước tiếp theo - sau khi bước trước hoàn tất; khi có hơn 4 bước, các tin nhắn đầu sẽ mang hai bước trở lên. Kết quả của bước cuối cùng là kết quả của tác vụ.",
	},
	"browser.webkit": {
		label: "Trình duyệt WebKit",
		description:
			'Mở tab trình duyệt trong engine WebKit không giao diện riêng của omp thay vì Chromium được quản lý khi engine đã được cài (khi chưa có trình duyệt, omp tải nó về ~/.o2/lib/abkit trước Chrome for Testing; xem Đường dẫn tới WebKit của trình duyệt). Chromium vẫn mở trình duyệt hiển thị ở nơi engine không có khung xem, và với các tab engine không khởi chạy được; app chỉ định rõ, relay, Browser CDP URL, Tern và cmux được ưu tiên; app "chromium" sẽ loại một lần mở khỏi cơ chế này. Đặt PI_BROWSER_WEBKIT=0 hoặc PI_BROWSER_WEBKIT=1 để ghi đè.',
	},
	"browser.webkitPath": {
		label: "Đường dẫn tới WebKit của trình duyệt",
		description:
			"Engine WebKit của omp: tệp thực thi host của nó hoặc thư mục engine ABKit (trong đó nó được gọi là ABHost, ABHost.exe trên Windows). Nếu chưa đặt, omp sẽ khởi chạy engine đã cài đặt ~/.o2/lib/abkit/ABHost (ABHost.exe trên Windows). Hỗ trợ ~. PI_BROWSER_WEBKIT_PATH sẽ ghi đè giá trị này.",
	},
	"find.hitThreshold": {
		label: "find.hitThreshold",
	},
	"gc.autoCompress": {
		label: "gc.autoCompress",
	},
	"gc.stripAfterDays": {
		label: "gc.stripAfterDays",
	},
	"models.noJudge": {
		label: "models.noJudge",
	},
	"models.noSpotlight": {
		label: "models.noSpotlight",
	},
	"session.maxCost": {
		label: "session.maxCost",
	},
	"session.warnCost": {
		label: "session.warnCost",
	},
	shellCommandPrefix: {
		label: "shellCommandPrefix",
	},
	"skills.manualSkills": {
		label: "skills.manualSkills",
	},
	"spotlight.experiment.scoreFree": {
		label: "spotlight.experiment.scoreFree",
	},
	"spotlight.timeoutMs": {
		label: "spotlight.timeoutMs",
	},
	systemPromptTemplates: {
		label: "systemPromptTemplates",
	},
	"task.agentPrewalkAuto": {
		label: "task.agentPrewalkAuto",
	},
	"async.printWake": {
		label: "In khi có kết quả tác vụ",
		description:
			"Ở chế độ in (-p, --mode json), tiếp tục chạy sau lệnh nhắc cuối cùng khi các tác vụ nền của lần chạy này còn hoạt động, và bắt đầu một lượt mới trong cùng phiên với kết quả của từng tác vụ; thoát khi không còn tác vụ hay kết quả nào đang chờ. Tắt: chế độ in thoát sau các lệnh nhắc của nó và hủy các tác vụ đang chạy",
	},
	"auth.unpausedProviders": {
		label: "Nhà cung cấp đã bỏ tạm dừng",
		description:
			"Bật lại các provider đã bị tạm dừng: đăng nhập, làm mới token và thông tin xác thực đã lưu hoạt động trở lại. Mỗi lần tạm dừng nêu rõ rủi ro tài khoản mà bạn chấp nhận. Cài đặt dự án không thể đặt mục này",
	},
	"bash.allowedEnvVars": {
		label: "Biến môi trường Bash được phép",
		description:
			"Tên chính xác của biến môi trường được phép làm tiền tố KEY=VALUE ở đầu khi khớp với các quy tắc cho phép của bash.patterns (không dùng wildcard). Mọi giá trị đều được chấp nhận, nên chỉ liệt kê các biến build/test vô hại; các biến thay đổi cách thực thi (PATH, LD_PRELOAD, BASH_ENV, *_RUNNER, *_WRAPPER) cho phép chạy lệnh tùy ý.",
	},
	"commit.enabled": {
		label: "Commit chọn lọc",
		description:
			"Bật prelude commit của eval và /commit: chỉ commit những dòng mà agent này và các subagent của nó đã viết",
	},
	"composer.predictionAlternatives": {
		label: "Phương án dự đoán thay thế",
		description:
			"Yêu cầu tối đa bốn dự đoán khác nhau thay vì một, khả năng cao nhất trước. Văn bản mờ hiển thị dự đoán đầu tiên khớp với bản nháp của bạn; sau khi chèn một dự đoán, nhấn ⇥ lần nữa để chọn cái khác. Cùng một yêu cầu duy nhất trả về thêm vài token đầu ra",
	},
	"disassembler.backend": {
		label: "Trình dịch ngược",
		description:
			"Backend cho các selector phân tích trong read và namespace dsm của eval; đọc tệp thực thi trần chỉ hiển thị metadata. Auto dùng IDA Pro nếu đã cài, ngược lại dùng Ghidra (tải xuống ở lần phân tích đầu tiên)",
	},
	"disassembler.idleCloseSec": {
		label: "Thời gian chờ đóng khi nhàn rỗi",
		description:
			"Lưu và đóng các cơ sở dữ liệu không còn được tham chiếu đã nhàn rỗi lâu hơn số giây này (0 = không bao giờ); các handle dsm đang được giữ vẫn mở. Namespace exec được đặt lại khi mở lại",
	},
	"disassembler.maxOpen": {
		label: "Số cơ sở dữ liệu mở tối đa",
		description:
			"Số cơ sở dữ liệu (các daemon omp.ida.* / omp.ghidra.* trong omp ps) mở cùng lúc tối đa cho mỗi dự án; mở thêm một cái sẽ đẩy ra một cái đang nhàn rỗi không được tham chiếu. Đóng các handle dsm đang giữ khi xong",
	},
	"display.advisorCollapsedLines": {
		label: "Số dòng thu gọn của cố vấn",
		description:
			"Số dòng ghi chú tối đa mà thẻ advisor đã thu gọn hiển thị dưới tiêu đề (0 giữ bản xem trước đầy đủ; mở rộng bằng công tắc đầu ra công cụ)",
	},
	"display.shellVisualization": {
		label: "Hiển thị trực quan shell",
		description: "Hiển thị lệnh bash dưới dạng trực quan hóa thực thi tương tác thay vì lệnh shell thuần",
	},
	encourageEdits: {
		label: "Khuyến khích chỉnh sửa",
		description: "Bắt buộc dùng công cụ edit để sửa tệp và cấm sửa bằng sed/perl/python",
	},
	"extensionHandlers.modeControl": {
		label: "Điều khiển chế độ tiện ích mở rộng",
		description:
			"Cho phép extension vào và thoát các chế độ plan, vibe, goal và loop qua ctx.sessionModes.set(); việc đọc trạng thái chế độ vẫn khả dụng",
	},
	"extensionRenderers.assistantText": {
		label: "Bộ hiển thị phản hồi tiện ích",
		description:
			"Cho phép extension thay đổi cách vẽ câu trả lời của assistant, vẽ lại câu trả lời tại chỗ và nhận click trên các liên kết của chính nó; phiên, bản xuất và ngữ cảnh model giữ nguyên câu trả lời như đã viết",
	},
	"extensionRenderers.transcriptPresenters": {
		label: "Bộ trình bày nhật ký tiện ích",
		description:
			"Cho phép extension vẽ các khối transcript như lời gọi công cụ ở dạng đầy đủ, một hàng gọn hoặc ẩn đi; phiên, bản xuất và ngữ cảnh model không thay đổi",
	},
	"find.verifyModel": {
		label: "Mô hình xác minh tìm kiếm",
		description:
			"Bộ chọn model (ví dụ openrouter/liquid/d1-ultra) được thử trước cho việc xác minh đoạn văn của find, trước role judge; xếp hạng theo tên tệp và bản phác vẫn do role judge đảm nhận. Không đặt: role judge cũng xác minh",
	},
	"ghidra.installDir": {
		label: "Thư mục cài đặt Ghidra",
		description:
			"Thư mục cài đặt Ghidra 12+ (chứa Ghidra/application.properties); để trống sẽ dùng $GHIDRA_INSTALL_DIR, Homebrew, nếu không thì bản tải xuống được quản lý trong ~/.omp/ghidra",
	},
	"ghidra.python": {
		label: "Python của Ghidra",
		description:
			"Trình thông dịch Python có thể import pyghidra; để trống sẽ dùng venv được quản lý dựng từ các wheel đi kèm bản cài",
	},
	"live.apiKey": {
		label: "Khóa API endpoint live",
		description: "Khóa Bearer chỉ gửi tới endpoint live: một giá trị literal, tên biến môi trường hoặc !command",
	},
	"live.endpoint": {
		label: "Endpoint live",
		description:
			"URL cơ sở của server tương thích OpenAI Realtime WebRTC (ví dụ http://127.0.0.1:8080/v1) dùng cho giọng nói trực tiếp thay vì Codex; để trống sẽ dùng Codex",
	},
	"mnemopi.embeddingInputType": {
		label: "Loại đầu vào embedding Mnemopi",
		description:
			"Gửi input_type (query cho recall, passage cho ký ức đã lưu) trong các yêu cầu embedding API; các embedder bất đối xứng NVIDIA NIM yêu cầu điều này",
	},
	"mnemopi.embeddingQueryPrefix": {
		label: "Tiền tố truy vấn embedding Mnemopi",
		description:
			"Văn bản thêm vào trước các truy vấn recall trước khi embed, dành cho các embedder được tinh chỉnh theo chỉ dẫn (Qwen3-Embedding, E5); ký ức đã lưu được embed nguyên vẹn",
	},
	"mnemopi.recallRelevance": {
		label: "Độ liên quan recall Mnemopi",
		description:
			"Hỏi role model judge xem mỗi ký ức được recall tự động có liên quan đến tác vụ không trước khi chèn vào",
	},
	"out.enabled": {
		label: "Out",
		description:
			"Cho phép agent trả lời giữa tác vụ bằng cách ghi vào out://, hiển thị như một phản hồi mà không kết thúc lượt. Không đặt: bật trong TUI tương tác, tắt trong print, RPC và ACP",
	},
	"ovnfs.path": {
		label: "Tệp nhị phân ovnfs",
		description:
			"Tệp thực thi ovnfs; nếu không đặt sẽ tìm `ovnfs` trong PATH. Khi tìm thấy, các checkout của ovnfs (chế độ xem copy-on-write của một thư mục, sẵn sàng trong khoảng một giây ở mọi kích thước) phục vụ mọi bản sao riêng biệt: system prompt bảo agent mở checkout thay vì git worktree hay bản sao, và các subagent cô lập (khi được phép, với `isolation.backend` ở auto) chạy trong checkout thay vì bản clone gốc",
	},
	"providers.openaiResponsesWebsockets": {
		label: "WebSockets cho OpenAI Responses",
		description:
			"Chọn tham gia cho các model Responses tiêu chuẩn được catalog hỗ trợ; false ở model hoặc trong yêu cầu sẽ tắt tính năng này",
	},
	"providers.webKeyless": {
		label: "Dịch vụ web không cần khóa",
		description:
			"Cho phép tìm kiếm web và đọc URL dùng dịch vụ bên thứ ba không cần thông tin xác thực của bạn: Parallel, Exa, Firecrawl, Keenable và Perplexity không cần khóa, trình đọc Jina, và các engine cào dữ liệu (Startpage, DuckDuckGo, Ecosia, Google, Mojeek, Hacker News). Tắt - chỉ các dịch vụ bạn đã cấu hình mới chạy.",
	},
	"retry.rateLimitWalksChain": {
		label: "Duyệt chuỗi khi bị giới hạn tốc độ",
		description:
			"Khi bị giới hạn tốc độ, không giữ việc duyệt retry.fallbackChains cho một lượt mà phần suy nghĩ được ký bởi model đang lỗi. Tắt (mặc định): lượt đó tiếp tục thử lại model bị giới hạn cho đến khi hết retry.maxRetries trước khi chạm tới chuỗi.",
	},
	"session.worktreeScope": {
		label: "Phạm vi worktree khi khôi phục",
		description:
			"Chọn xem thư mục hiện tại của bộ chọn resume có bao gồm các phiên từ worktree khác của repository hay không",
	},
	"spotlight.experiment.enabled": {
		label: "Thử nghiệm Spotlight",
		description:
			"Định hình đầu ra công cụ và xếp hạng kết quả find bằng Stencil Spotlight, đồng thời ghi từng kết quả đã định hình vào phiên",
	},
	"task.workerThreads": {
		label: "Luồng worker của tác nhân con",
		description:
			"Số luồng worker tối đa cho subagent. Tối đa 8 subagent đồng thời chạy trên luồng chính; đến 9 thì một worker tham gia, và thêm một worker mỗi khi số lượng tăng gấp đôi (18, 36, 72). Worker dừng sau một phút khi không còn subagent nào sống trong đó; 0 giữ mọi subagent trên luồng chính",
	},
	"todo.midRunNudges": {
		label: "Nhắc nhở todo giữa lượt chạy",
		description: "Tần suất một lượt dài được nhắc cập nhật danh sách todo trong khi nó tiếp tục thay đổi mọi thứ",
	},
	"tools.restrictedFolders": {
		label: "Thư mục bị hạn chế",
		description:
			'Các thư mục mà mọi thao tác đọc, ghi, sửa, tìm kiếm hoặc lệnh đều cần phê duyệt rõ ràng, bất kể chế độ phê duyệt hay quyền đã ghi nhớ. Thư mục và mọi thứ bên trong đều bị hạn chế; lệnh được khớp theo thư mục mà chúng chạy trong đó. Một danh sách JSON các đường dẫn, ví dụ ["~/secrets"].',
	},
	"tools.commandNotices": {
		label: "Thông báo gắn lệnh công cụ",
		description:
			"Hiển thị thông báo khi các công cụ MCP hoặc extension được gắn hoặc gỡ dưới dạng lệnh; model vẫn biết về thay đổi này ở câu lệnh nhắc tiếp theo.",
	},
	"tui.colorfulMarkdown": {
		label: "Markdown nhiều màu",
		description:
			"Tô màu tiêu đề theo cấp, chữ đậm và nghiêng, code inline và tiêu đề bảng từ bảng màu ANSI của theme. Tắt - dùng một màu tiêu đề và đậm/nghiêng đơn giản.",
	},
	"tui.completeScrollback": {
		label: "Toàn bộ lịch sử cuộn",
		description:
			"Đưa các hàng transcript bị đẩy khỏi màn hình bởi HUD hoặc hộp thoại đang lớn dần thẳng vào scrollback; khi nó thu nhỏ lại, các hàng trống nằm giữa transcript và ô nhập cho đến khi đầu ra mới lấp đầy",
	},
	"tui.maxFps": {
		label: "Số khung hình/giây tối đa",
		description:
			"Giới hạn trên tần suất TUI vẽ lại, kể cả văn bản streaming. Phản hồi phím giữ 30 fps, nên khung bạn đang gõ vẫn phản hồi nhanh",
	},
	"tui.motion": {
		label: "Chuyển động",
		description:
			"Một công tắc cho spinner, hiệu ứng shimmer và nhấp nháy/mờ dần trang trí. Văn bản streaming không bị ảnh hưởng (xem Max Frames Per Second). Khoảng thời gian spinner bạn đặt vẫn được ưu tiên",
	},
	"tui.renderEmbeds": {
		label: "Hiển thị ảnh và trang nhúng",
		description:
			"Mời agent hiển thị hình ảnh bằng <img> và trang web bằng <iframe>, tải chúng (kể cả địa chỉ từ xa) để vẽ trực tiếp trên các terminal hiển thị đồ họa",
	},
	"tui.spinnerInterval": {
		label: "Khoảng thời gian spinner (ms)",
		description:
			"Số mili giây giữa các khung hình của mọi spinner, kể cả tiêu đề terminal; 0 hiển thị glyph tĩnh. Không đặt - theo thiết lập Motion",
	},
	"update.auto": {
		label: "Tự động cập nhật",
		description: "Cài đặt bản cập nhật omp trong nền khi khởi động; lần khởi chạy tiếp theo sẽ chạy phiên bản mới",
	},
	"gc.strip": {
		label: "gc.strip",
	},
	"launch.persist": {
		label: "launch.persist",
	},
	"models.offline": {
		label: "models.offline",
	},
	"spotlight.experiment.holdout": {
		label: "spotlight.experiment.holdout",
	},
	"spotlight.experiment.tools": {
		label: "spotlight.experiment.tools",
	},
	"spotlight.model": {
		label: "spotlight.model",
	},
	"spotlight.thinking": {
		label: "spotlight.thinking",
	},
	"spotlight.url": {
		label: "spotlight.url",
	},
	"mcp.builtinTransforms": {
		label: "Thay thế MCP tích hợp",
		description:
			"Bỏ qua các máy chủ MCP đã được công cụ sẵn có của omp thay thế (node_repl của Codex khi eval chạy JavaScript)",
	},
	"mcp.evalNamespaces": {
		label: "Không gian tên MCP trong eval",
		description:
			"Hiển thị mỗi máy chủ MCP thành một đối tượng toàn cục của eval (github.create_issue(...)) thay vì công cụ cấp cao nhất hay lệnh công cụ",
	},
	"providers.cacheWarmingStrategy": {
		label: "Chiến lược làm nóng bộ nhớ đệm",
		description:
			"Cách kéo dài một lần gọi công cụ dài khi việc gia hạn không còn đáng: nén lịch sử trước khi bộ nhớ đệm hết hạn, hoặc để nó hết hạn",
	},
	"providers.cacheWarmingCompactPercent": {
		label: "Tỷ lệ cửa sổ để nén khi gia hạn",
		description:
			"Tỷ lệ cửa sổ ngữ cảnh mà sau đó một lần gọi công cụ dài có thể được gia hạn bằng cách nén; áp dụng giá trị nhỏ hơn giữa tỷ lệ này và giới hạn token",
	},
	"providers.cacheWarmingCompactTokens": {
		label: "Số token để nén khi gia hạn",
		description:
			"Số token câu lệnh mà sau đó một lần gọi công cụ dài có thể được gia hạn bằng cách nén; áp dụng giá trị nhỏ hơn giữa số này và tỷ lệ cửa sổ",
	},
	"task.crossInstance": {
		label: "Tin nhắn tác nhân giữa các phiên bản",
		description:
			"Cho phép các phiên bản omp khác trong cùng thư mục đọc đầu ra của tác nhân và gửi tin nhắn có thể đánh thức chúng",
	},
};
