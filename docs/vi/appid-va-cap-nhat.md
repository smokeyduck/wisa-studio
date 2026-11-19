# appId: vì sao lần này vẫn là `sh.omp.gui`, và khi nào nên đổi

## Tình trạng hiện tại

Ba cấu hình đóng gói (`electron-builder.yml`, `electron-builder.x64.yml`,
`electron-builder.win.yml`) đều giữ:

```yaml
appId: sh.omp.gui
```

Đây là **quyết định có chủ ý**, không phải bỏ sót.

## appId quyết định điều gì

- **macOS:** bundle identifier của `WISA STUDIO.app`, cũng là khoá nhận diện
  của LaunchServices, của Keychain (mục "safe storage" mà Electron dùng để mã
  hoá API key đã lưu), của quyền TCC (thư mục, micro, accessibility) và của
  `~/Library/Application Support/<appId>`.
- **Windows:** `AppUserModelID` — thứ quyết định nhóm trên taskbar, toast
  notification và việc Windows coi hai bản cài là cùng một ứng dụng.
- **Auto-update:** electron-updater không so `appId`, nhưng bản cài cũ chỉ tự
  cập nhật lên bản mới nếu nó tìm thấy feed của chính nó. Đổi `appId` không
  làm hỏng feed, nhưng đổi *đường dẫn cài đặt mặc định* (suy ra từ
  `productName`) thì có.

## Vì sao chưa đổi ngay

Người dùng đã cài bản cũ đang có:

1. API key đã lưu, được mã hoá bằng Keychain/TCC gắn với `sh.omp.gui`;
2. quyền đã cấp (thư mục, micro) gắn với `sh.omp.gui`;
3. dữ liệu trong `~/Library/Application Support/sh.omp.gui`.

Đổi `appId` trong một bản cập nhật thường sẽ khiến hệ điều hành coi đó là ứng
dụng **khác**: macOS có thể tạo thư mục dữ liệu mới, xin lại toàn bộ quyền và
mất key đã lưu (vì Keychain tra theo bundle id). Người dùng thấy như mất cấu
hình, dù dữ liệu vẫn nằm đó.

Còn một rủi ro nữa: nếu bản mới dùng `appId` khác nhưng cùng `productName`,
electron-builder ghi đè đúng thư mục `.app` cũ, còn LaunchServices lại thấy
một bundle id lạ → có máy sẽ có hai mục trong Launchpad/Applications.

## Khi nào nên đổi (và đổi thế nào)

Chỉ đổi khi thật sự cần tách khỏi bản cũ — ví dụ muốn cài song song, hoặc
chuyển hẳn sang một nhà phát hành khác. Khi đó làm thành **một bản phát hành
riêng**, theo thứ tự:

1. **Chọn appId mới**, ví dụ `com.askwisa.studio`. Không dùng lại id của bất kỳ
   ứng dụng nào khác.
2. **Di trú dữ liệu trước khi đổi:** trong bản phát hành cuối cùng còn dùng
   `sh.omp.gui`, thêm bước copy `~/Library/Application Support/sh.omp.gui` →
   thư mục mới, và chép lại keychain item (`security find-generic-password -s
   "sh.omp.gui"` / `-s "<appId mới>"`). Với Windows, đọc `AppUserModelID` cũ
   trước khi đổi.
3. **Ghi chú phát hành rõ ràng:** "bản này dùng định danh ứng dụng mới; lần đầu
   mở có thể phải cấp lại quyền và dán lại API key".
4. **Giữ `productName` ổn định** để đường dẫn cài đặt không đổi, tránh hai bản
   song song ngoài ý muốn.
5. **Kiểm tra trên máy sạch và máy đã cài bản cũ**: key còn, phiên còn, update
   vẫn nhận được bản kế tiếp.

## Những gì KHÔNG đổi theo appId

Các thành phần sau giữ nguyên bất kể `appId`:

- sidecar `resources/omp*` và cách nạp (`resolveBundledOmp`);
- scheme `omp://` (`PROTOCOL` trong `src/main/deep-link.ts`, `protocols:` trong
  các file builder);
- `~/.omp`, `.omp/`, `PI_CODING_AGENT_DIR`, `models.yml`, MCP config;
- provider/model id, `@oh-my-pi/*`, biến môi trường `OMP_*`, `window.omp`.

Nghĩa là đổi `appId` **không** làm mất phiên hay cấu hình agent — chỉ ảnh hưởng
đến phần do hệ điều hành quản lý theo bundle id.
