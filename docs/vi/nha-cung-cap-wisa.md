---
canonical: https://askwisa.com/wisa-studio/nha-cung-cap-wisa
title: Kết nối cổng WISA trong WISA STUDIO
description: Cổng WISA là gì, lấy API key ở đâu, cách dán khóa trong WISA STUDIO để danh sách mô hình tự xuất hiện, và cách xử lý lỗi 401, 429.
---

# Kết nối cổng WISA

## Cổng WISA là gì

Cổng WISA là endpoint tương thích OpenAI do WISA vận hành tại `https://api.askwisa.com/v1`. WISA STUDIO tạo sẵn nhà cung cấp tên `wisa` trỏ tới endpoint này ngay từ lần khởi động đầu, nên bạn chỉ cần dán khóa — không phải điền base URL, giao thức hay danh sách mô hình.

Một khóa dùng được cho **mọi mô hình mà cổng phục vụ**. Danh sách mô hình không nằm trong mã nguồn ứng dụng: sau khi lưu khóa, WISA STUDIO gọi `/v1/models` của cổng và hiển thị đúng những gì tài khoản của bạn được dùng. Cổng thêm mô hình mới thì lần làm mới danh sách sau sẽ thấy, không cần cập nhật ứng dụng.

Nhà cung cấp `wisa` chỉ là một mục trong `models.yml`. Bạn có thể dùng song song Anthropic, OpenAI, DeepSeek, OpenRouter, Ollama… hoặc thêm endpoint riêng — xem mục "Dùng nhà cung cấp khác" bên dưới.

## Lấy API key

1. Mở [askwisa.com](https://askwisa.com/?utm_source=github&utm_medium=readme) và tạo tài khoản (hoặc đăng nhập).
2. Vào phần API key trong trang tài khoản, tạo khóa mới.
3. Sao chép khóa. Khóa chỉ hiện đầy đủ một lần — lưu lại ở nơi an toàn.

Khóa là thông tin đăng nhập của bạn: đừng dán vào issue, ảnh chụp màn hình hay commit. Nếu lộ, thu hồi và tạo khóa mới.

## Kết nối trong ứng dụng

1. Bấm **Nhà cung cấp & Đăng nhập** ở thanh bên, hoặc mở Command palette (⌘K / Ctrl+K) rồi chọn **Nhà cung cấp & Đăng nhập**.
2. Tìm **WISA** trong danh sách. Lần chạy đầu tiên, màn hình chào mừng cũng đưa thẻ **Cổng WISA** lên đầu với nút **Kết nối cổng WISA**.
3. Chọn **Dùng API key**, dán khóa vào ô **Khóa API**, bấm **Lưu khóa**.
4. Danh sách mô hình tự xuất hiện sau khi lưu. Nếu chưa thấy, bấm **Làm mới**; quá trình khám phá mô hình có thể vẫn đang chạy.
5. Mở một tab phiên mới và chọn mô hình trong danh sách. Xong — không cần khởi động lại ứng dụng.

Khóa được lưu trong `~/.wisa-studio/agent/models.yml` trên máy bạn và dùng trực tiếp, không qua đăng nhập trình duyệt.

## Dùng nhà cung cấp khác

Cổng WISA là tiện nhất nhưng không bắt buộc. Trong cùng trang **Nhà cung cấp**, bạn có thể:

- Đăng nhập OAuth (ví dụ Anthropic, OpenAI, GitHub Copilot) bằng nút **Đăng nhập**.
- Dán API key cho nhà cung cấp dùng khóa (DeepSeek, OpenRouter, Groq…).
- Thêm **Nhà cung cấp tùy chỉnh** cho endpoint tương thích OpenAI/Anthropic bất kỳ, kể cả máy chủ cục bộ như Ollama hay LM Studio.

Nhiều nhà cung cấp cùng lúc là bình thường: mỗi phiên chọn một mô hình, và bạn có thể đổi mô hình giữa các phiên. Nếu một nhà cung cấp lỗi, cấu hình dự phòng của agent vẫn hoạt động như với `omp` CLI.

## Cấu hình nằm ở đâu

`~/.wisa-studio/agent/models.yml` (trên Windows: `%USERPROFILE%\.wisa-studio\agent\models.yml`). Mục của cổng WISA trông như sau:

```yaml
providers:
  wisa:
    baseUrl: https://api.askwisa.com/v1
    api: openai-completions
    auth: apiKey
    apiKey: <khóa của bạn>
    discovery:
      type: openai-models-list
    models: []
```

Sửa tay là **tùy chọn**, không bắt buộc: giao diện ghi đúng tệp này và agent tự nạp lại khi tệp thay đổi. Chỉ nên sửa tay khi bạn cần thứ giao diện không hiển thị, ví dụ ghim `contextWindow`/`maxTokens` cho một mô hình, thêm `headers` riêng, hoặc đổi `baseUrl` sang một proxy nội bộ. Giữ nguyên id `wisa` nếu muốn giao diện tiếp tục nhận ra mục này; đổi id sẽ biến nó thành nhà cung cấp tùy chỉnh khác.

Lưu ý: `apiKey` nằm dạng văn bản trong tệp. Đặt quyền đọc hạn chế cho `~/.wisa-studio` nếu máy có nhiều người dùng.

## Xử lý sự cố

**401 — "Máy chủ đã từ chối thông tin đăng nhập của bạn".** Khóa sai, đã bị thu hồi, hoặc dán kèm khoảng trắng/xuống dòng. Mở lại mục WISA, dán khóa mới rồi **Lưu khóa**. Nếu bạn vừa sửa `models.yml` bằng tay, kiểm tra khóa không bị cắt mất ký tự.

**403 — không có quyền với mô hình đó.** Khóa hợp lệ nhưng tài khoản không được cấp mô hình đang chọn. Chọn mô hình khác trong danh sách, hoặc kiểm tra quyền của tài khoản trên trang WISA.

**429 — "Quá nhiều yêu cầu hoặc hạn mức của bạn đã hết".** Hai nguyên nhân khác nhau: gọi quá nhanh (chờ vài giây rồi thử lại, hoặc giảm số phiên chạy song song) hay hết hạn mức trong kỳ (xem **Mức dùng & hạn mức** trong Command palette, hoặc nâng hạn mức trên trang WISA). Agent có cơ chế thử lại với backoff cho lỗi tạm thời, nhưng hết hạn mức thì phải chờ hoặc đổi mô hình/nhà cung cấp.

**Không thấy mô hình nào sau khi lưu khóa.** Bấm **Làm mới** trong trang nhà cung cấp. Nếu vẫn trống, kiểm tra kết nối mạng tới `api.askwisa.com` (proxy công ty, DNS, tường lửa) và xem nhật ký trong `~/.wisa-studio/logs/`.

**Danh sách mô hình cũ sau khi cổng cập nhật.** Mở **Nhà cung cấp** và bấm **Làm mới**; danh sách được lấy lại từ cổng, không cần cài lại ứng dụng.

**Đã xóa `~/.wisa-studio/agent` và mất khóa.** Nhà cung cấp `wisa` được tạo lại tự động ở lần khởi động sau, nhưng khóa thì không — dán lại khóa như hướng dẫn ở trên.

Cài đặt và các sự cố khác: xem [Hướng dẫn cài đặt](./cai-dat.md) và [Câu hỏi thường gặp](./faq.md).
