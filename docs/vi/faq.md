---
canonical: https://askwisa.com/wisa-studio/faq
title: Câu hỏi thường gặp về WISA STUDIO
description: WISA STUDIO là gì, có phải bản sao của omp không, có cần Node hay key WISA không, dùng được mô hình nào, dữ liệu đi đâu, giấy phép và lỗi thường gặp.
---

# Câu hỏi thường gặp

## WISA STUDIO là gì?

Ứng dụng desktop (Electron) bọc quanh agent lập trình `omp`: mở một cửa sổ có nhiều tab phiên, chia đôi màn hình, tác vụ định kỳ, quản lý MCP/skill/plugin/hook bằng giao diện thay vì dòng lệnh. Agent chạy ngay khi cài, giao diện có tiếng Việt và mặc định là tiếng Việt trong bản này. WISA (askwisa.com) phát hành, kèm cổng mô hình riêng.

## Có phải bản sao của omp không?

Không phải bản sao lõi. WISA STUDIO là **bản rebrand phần giao diện** của GUI desktop mã nguồn mở `oh-my-pi` (MIT): tên ứng dụng, biểu tượng, menu, tài liệu và trang phát hành đổi thành WISA STUDIO, còn **agent bên trong là binary `omp` biên dịch từ upstream, không sửa**. Vì vậy hành vi agent, định dạng phiên và cấu hình `~/.omp` giống bản gốc — bạn có thể mở cùng một phiên bằng GUI hoặc bằng `omp` CLI.

## Có cần cài Node, Bun hay omp CLI không?

Không. Gói cài đã đóng gói sẵn agent. Chỉ khi chạy từ mã nguồn (dành cho người phát triển) mới cần Bun và quy trình build sidecar.

## Có bắt buộc dùng key WISA không?

Không bắt buộc. Cổng WISA được tạo sẵn cho tiện, nhưng bạn có thể đăng nhập hoặc dán API key của Anthropic, OpenAI, DeepSeek, OpenRouter, GitHub Copilot, hoặc trỏ tới Ollama/LM Studio và endpoint tương thích OpenAI bất kỳ. Xem [Kết nối cổng WISA](./nha-cung-cap-wisa.md) nếu muốn dùng cổng.

## Dùng được những mô hình nào?

Đúng những mô hình mà nhà cung cấp bạn cấu hình phục vụ. Với cổng WISA, danh sách được lấy từ `/v1/models` sau khi lưu khóa, nên thêm mô hình mới ở phía cổng là thấy ở lần làm mới kế tiếp. Với nhà cung cấp khác, danh sách đến từ chính họ hoặc từ mục `models` bạn khai báo.

## Dữ liệu của tôi có bị gửi lên WISA không?

Chỉ nội dung bạn gửi tới nhà cung cấp đang cấu hình mới rời máy: mã nguồn, prompt và kết quả công cụ đi tới endpoint của mô hình đang chọn. Nếu bạn chọn cổng WISA thì đó là `api.askwisa.com`; nếu chọn Anthropic thì đi Anthropic. Ứng dụng không có analytics riêng và không gửi dữ liệu đo từ xa theo mặc định — chỉ khi bạn tự bật xuất OTLP trong cài đặt thì dấu vết mới đi tới endpoint bạn khai báo. Phiên và cấu hình nằm trong `~/.omp` trên máy bạn. Cẩn thận với công cụ có quyền truy cập mạng và với chế độ chia sẻ hội thoại — chỉ tải lên khi bạn đã xem bản xem trước.

## Có bản cho Windows và Linux không?

Có, cùng bản phát hành: Windows x64 (`-setup.exe` và `-portable.exe`), Linux x64 (`.AppImage` và `.deb`), macOS arm64 và Intel. Hướng dẫn từng nền tảng ở [trang cài đặt](./cai-dat.md).

## Có miễn phí không?

Ứng dụng theo giấy phép MIT — dùng, sửa, phân phối lại đều được, kèm phần ghi công trong `LICENSE` và `NOTICE`. Chi phí thực tế đến từ nhà cung cấp mô hình bạn chọn (ví dụ hạn mức của cổng WISA), không phải từ ứng dụng.

## Khác gì so với dùng agent trong terminal?

Cùng một agent, khác cách điều khiển. Terminal gọn và nhanh cho một việc; GUI thêm nhiều tab phiên chạy song song, chia đôi cửa sổ, khôi phục bố cục sau khi khởi động lại, xem diff và tệp trực quan, quản lý MCP/plugin/hook bằng biểu mẫu, và duyệt lại lịch sử phiên. Cả hai dùng chung `~/.omp`, nên có thể chuyển qua lại.

## Lỗi thường gặp

**macOS chặn lần mở đầu, hoặc báo "app is damaged".** Bản ký ad-hoc chưa notarize: chuột phải → **Open**, hoặc **System Settings → Privacy & Security → Open Anyway**. Tệp hỏng thì tải lại. Chi tiết ở [trang cài đặt](./cai-dat.md).

**Windows hiện SmartScreen.** Bản chưa ký số: **More info → Run anyway**, sau khi xác nhận tệp tải từ trang Releases.

**AppImage không chạy trên Linux.** Thiếu `libfuse.so.2` (cài `libfuse2`/`fuse-libs`) hoặc chưa `chmod +x`. Có thể chạy `--appimage-extract` để bỏ qua FUSE.

**401 khi gọi mô hình.** Khóa sai hoặc đã bị thu hồi — dán lại trong **Nhà cung cấp**. **429** là gọi quá nhanh hoặc hết hạn mức: chờ, giảm số phiên song song, hoặc đổi mô hình. Xem [xử lý sự cố của cổng WISA](./nha-cung-cap-wisa.md).

**Không có mô hình nào để chọn.** Chưa cấu hình nhà cung cấp, hoặc danh sách mô hình chưa tải xong — bấm **Làm mới** trong trang **Nhà cung cấp**.

**"Built-in omp not found".** Gói cài thiếu sidecar, thường do tải dở hoặc đóng gói lại từ nguồn khác. Cài lại bằng tệp chính thức; cài `omp` CLI riêng không sửa được.
