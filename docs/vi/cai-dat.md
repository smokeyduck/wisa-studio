---
canonical: https://askwisa.com/wisa-studio/cai-dat
title: Cài đặt WISA STUDIO trên macOS, Windows và Linux
description: Tải và cài WISA STUDIO trên macOS (arm64/Intel), Windows và Linux; xử lý Gatekeeper, SmartScreen, FUSE; biết dữ liệu nằm ở đâu, cách cập nhật và đặt lại.
---

# Cài đặt WISA STUDIO

WISA STUDIO là ứng dụng desktop đóng gói sẵn agent omp bên trong. Bạn **không** cần cài Node, Bun hay `omp` CLI trước khi cài — chỉ cần tải đúng gói cho hệ điều hành của mình.

Bản phát hành chính thức: [github.com/smokeyduck/wisa-studio/releases](https://github.com/smokeyduck/wisa-studio/releases). Tài liệu này viết cho bản `0.9.46`; tên tệp luôn theo mẫu `wisa-studio-<phiên bản>-<hậu tố>`.

## macOS

| Máy | Tệp cần tải |
|---|---|
| Apple Silicon (M1 trở lên) | `wisa-studio-0.9.46-arm64.dmg` |
| Intel | `wisa-studio-0.9.46.dmg` |

Không chắc máy mình dùng chip gì? Mở Terminal và chạy:

```bash
uname -m
```

- `arm64` → tải bản **arm64** (Apple Silicon).
- `x86_64` → tải bản **Intel**.

Cũng xem được ở menu Apple (góc trên trái) → **About This Mac**: dòng "Chip" ghi Apple M… là Apple Silicon, ghi Intel Core là Intel. Cài sai kiến trúc thì ứng dụng mở ra rồi thoát ngay, hoặc macOS báo "không mở được ứng dụng này".

Cách cài:

1. Mở tệp `.dmg` vừa tải.
2. Kéo **WISA STUDIO** vào thư mục **Applications**.
3. Mở ứng dụng từ Applications (đừng chạy trực tiếp từ tệp DMG).

### Lần mở đầu tiên trên macOS

Bản macOS được ký ad-hoc, **chưa notarize**, nên Gatekeeper sẽ chặn ở lần chạy đầu. Cách xử lý:

- Nhấp chuột phải (hoặc giữ Control rồi nhấp) vào **WISA STUDIO** → **Open** → xác nhận **Open** trong hộp thoại; hoặc
- Mở **System Settings → Privacy & Security**, kéo xuống phần Security, bấm **Open Anyway** cho WISA STUDIO.

Chỉ làm việc này khi bạn tải tệp từ trang Releases ở trên. Nếu macOS báo "ứng dụng bị hỏng" thay vì chặn thông thường, gần như chắc chắn tệp tải về bị lỗi giữa đường — tải lại.

Ứng dụng có thể xin quyền truy cập thư mục (để mở dự án), micro (cho chế độ thoại) và ghi màn hình (cho tính năng ghi phiên). Từ chối vẫn dùng được các phần còn lại; bật lại sau trong **System Settings → Privacy & Security**.

## Windows

| Gói | Dùng khi |
|---|---|
| `wisa-studio-0.9.46-setup.exe` | Cài bình thường, có lối tắt Start Menu và tự cập nhật |
| `wisa-studio-0.9.46-portable.exe` | Chạy ngay không cần cài, ví dụ trên máy dùng chung hoặc USB |

Yêu cầu: Windows 10/11 x64. Bản cài cho phép chọn thư mục cài đặt; gỡ cài đặt **không** xoá dữ liệu người dùng.

Gói Windows chưa được ký số, nên lần chạy đầu SmartScreen sẽ hiện "Windows protected your PC". Chọn **More info → Run anyway**. Chỉ làm vậy với tệp tải từ trang Releases chính thức.

## Linux (x64)

Hai định dạng: AppImage (chạy độc lập) và deb (Debian/Ubuntu và các bản dẫn xuất).

### AppImage

```bash
chmod +x wisa-studio-0.9.46.AppImage
./wisa-studio-0.9.46.AppImage
```

Nếu thiếu FUSE 2, AppImage báo lỗi kiểu `dlopen(): error loading libfuse.so.2` hoặc "Cannot mount AppImage". Cài thư viện:

```bash
# Debian / Ubuntu
sudo apt install libfuse2
# Fedora
sudo dnf install fuse-libs
```

Không muốn (hoặc không được phép) cài FUSE? Giải nén rồi chạy:

```bash
./wisa-studio-0.9.46.AppImage --appimage-extract
./squashfs-root/AppRun
```

### Debian / Ubuntu

```bash
sudo apt install ./wisa-studio_0.9.46_amd64.deb
```

`apt` tự kéo các phụ thuộc cần thiết. Sau khi cài, ứng dụng xuất hiện trong menu ứng dụng với tên **WISA STUDIO**.

Trên Linux, ứng dụng cần một phiên đồ hoạ X11 hoặc Wayland. Chạy qua SSH không có `DISPLAY` sẽ không mở được cửa sổ.

## Dữ liệu được lưu ở đâu

Toàn bộ cấu hình agent nằm trong `~/.omp`, dùng chung với `omp` CLI nếu bạn cài cả hai:

| Đường dẫn | Nội dung |
|---|---|
| `~/.omp/agent/models.yml` | Nhà cung cấp, mô hình, API key (kể cả khóa WISA) |
| `~/.omp/agent/sessions/` | Lịch sử phiên dạng `.jsonl` |
| `~/.omp/agent/` | MCP, skill, bộ nhớ, cấu hình agent |
| `~/.omp/gui/themes/` | Theme tuỳ chỉnh của GUI |
| `~/.omp/logs/` | Nhật ký ứng dụng và agent |
| `~/.omp/work/` | Không gian làm việc mặc định |

Trạng thái riêng của giao diện (bố cục cửa sổ, chỉ mục hội thoại, lịch tác vụ định kỳ) nằm trong thư mục dữ liệu ứng dụng của Electron:

- macOS: `~/Library/Application Support/omp`
- Windows: `%APPDATA%\omp`
- Linux: `~/.config/omp`

Có thể đổi cả hai bằng biến môi trường khi chạy từ mã nguồn (`PI_CODING_AGENT_DIR`, `--user-data-dir`), nhưng bản cài đặt thông thường không cần.

## Cập nhật

Mở **Cài đặt** → **Hệ thống & nâng cao** → **Cập nhật**, rồi bấm **Kiểm tra cập nhật**. Một bản cập nhật WISA STUDIO làm mới cả giao diện và OMP Core đi kèm, nên hai phần luôn khớp phiên bản.

- **Windows (bản cài) và Linux AppImage:** tải và cài ngay trong ứng dụng, sau đó khởi động lại.
- **Windows portable và gói deb:** tải bản mới từ trang Releases rồi thay thế thủ công.
- **macOS:** vì bản ký ad-hoc không qua notarize, ứng dụng tải tệp `.dmg` vào thư mục Downloads và mở Finder thay vì tự cài. Thoát WISA STUDIO, mở DMG mới, kéo vào Applications và chọn **Replace**.

Cũng có thể tải tay từ trang Releases bất cứ lúc nào; cấu hình trong `~/.omp` được giữ nguyên qua các lần cập nhật.

## Đặt lại

Ứng dụng không có nút "khôi phục cài đặt gốc". Muốn đặt lại, thoát hẳn WISA STUDIO rồi xoá đúng phần cần xoá — **sao lưu trước**, vì xoá là mất:

| Muốn xoá | Xoá gì |
|---|---|
| Chỉ lịch sử trò chuyện | `~/.omp/agent/sessions/` |
| Toàn bộ cấu hình agent, key, MCP, bộ nhớ | `~/.omp/` |
| Bố cục cửa sổ, chỉ mục hội thoại, tác vụ định kỳ | thư mục dữ liệu Electron ở bảng trên |

Xoá `~/.omp/` sẽ mất API key đã lưu, kể cả khóa WISA — bạn phải dán lại. Nhà cung cấp `wisa` được tạo lại tự động ở lần khởi động sau, nhưng key thì không.

## Sự cố thường gặp

**macOS: nhấp đúp không mở, không có thông báo.** Đây là Gatekeeper. Làm theo mục "Lần mở đầu tiên trên macOS" ở trên. Nếu vẫn không được, kiểm tra kiến trúc (`uname -m`) xem có tải nhầm bản Intel/arm64 không.

**macOS: "WISA STUDIO is damaged and can't be opened".** Tệp tải về bị hỏng, hoặc bị đánh dấu cách ly. Tải lại từ Releases. Trường hợp chắc chắn tệp nguyên vẹn, có thể gỡ cờ cách ly:

```bash
xattr -dr com.apple.quarantine "/Applications/WISA STUDIO.app"
```

**Windows: SmartScreen chặn.** **More info → Run anyway**. Nếu máy có chính sách nhóm chặn ứng dụng chưa ký, cần quản trị viên cho phép.

**Linux: AppImage không chạy.** Kiểm tra đã `chmod +x` chưa, và đã có `libfuse.so.2` chưa. Cách chắc chắn nhất là dùng `--appimage-extract` như mô tả ở trên.

**Ứng dụng mở nhưng báo không có mô hình.** Chưa kết nối nhà cung cấp nào. Xem [Kết nối cổng WISA](./nha-cung-cap-wisa.md) hoặc thêm nhà cung cấp khác trong **Nhà cung cấp & Đăng nhập** ở thanh bên.

**Agent không khởi động, log có "Built-in omp not found".** Gói cài bị thiếu tệp sidecar — thường do tải dở hoặc dùng bản đóng gói lại từ nguồn khác. Cài lại bằng tệp chính thức; cài `omp` CLI riêng trên máy **không** sửa được lỗi này.

Câu hỏi khác: xem [Câu hỏi thường gặp](./faq.md).
