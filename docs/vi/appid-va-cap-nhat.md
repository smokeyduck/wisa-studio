# appId và định danh WISA STUDIO

## Định danh hiện tại (đã kiểm tra trong mã nguồn)

`electron-builder.yml`, `electron-builder.x64.yml`, `electron-builder.win.yml`:

```yaml
appId: org.wisa.studio
productName: WISA STUDIO
protocols/schemes: [wisa-studio]
```

Linux (`electron-builder.yml`): `desktop` có `StartupWMClass: wisa-studio`; artifact `wisa-studio-${version}.${ext}` và `wisa-studio_${version}_${arch}.${ext}`.

Runtime (`src/main/deep-link.ts`): `PROTOCOL = "wisa-studio"`, `LINUX_DESKTOP_FILE = "wisa-studio.desktop"`, `LINUX_DEV_DESKTOP_FILE = "wisa-studio-dev.desktop"`.

Runtime (`src/main/dev-profile.ts`): AppUserModelID `org.wisa.studio` (đóng gói) và `org.wisa.studio.dev` (phát triển); `app.setName("WISA STUDIO")`.

Windows: GUID gỡ cài đặt NSIS = `UUID.v5(appId)` (`node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js:157`), nên đổi appId đổi luôn GUID; bản mới là mục chương trình riêng.

## Thư mục dữ liệu (theo `applyAppProfile()` trong `src/main/dev-profile.ts`)

Thư mục dữ liệu được đặt theo tên, không suy ra từ appId:

- userData đóng gói: `<appData>/wisa-studio` (`app.getPath("appData")`: macOS `~/Library/Application Support`, Windows `%APPDATA%`, Linux `~/.config`).
- userData phát triển: `<appData>/wisa-studio-dev`.
- Agent đóng gói: `~/.wisa-studio/agent`; phát triển: `~/.wisa-studio-dev/agent`.
- Log runtime: `<userData>/logs/gui-runtime.jsonl` (`src/main/runtime-log.ts:6`); log agent: `~/.wisa-studio/logs` (dev `~/.wisa-studio-dev/logs`) (`src/main/log-watcher.ts:50`).
- Thư mục tạm của agent: `~/.wisa-studio/tmp` (dev `~/.wisa-studio-dev/tmp`), có `tmp/runtime` (`src/main/dev-profile.ts:34`).
- XDG của tiến trình agent: `<root>/xdg/{config,data,state,cache}`, `XDG_RUNTIME_DIR` = `<root>/tmp/runtime`, `TMPDIR` = `<root>/tmp` (`src/main/dev-profile.ts:64-73`). `HOME` không đổi: agent vẫn dùng HOME, Git/SSH và khoá API của người dùng (`dev-profile.ts:46-47`).

## Cập nhật và cùng tồn tại

electron-updater không kiểm tra appId. Bản WISA cũ đọc cùng feed `smokeyduck/wisa-studio`, nên có thể tự cài bản mới tại chỗ. Khi đó ứng dụng mở trên thư mục dữ liệu mới; key đã lưu và quyền đã cấp theo định danh cũ không đi theo.

Bản WISA cũ dùng `productName: WISA STUDIO`, nên cài bản mới sẽ thay tệp ứng dụng cũ ở cùng đường dẫn `WISA STUDIO.app` (macOS) hoặc thư mục cài (Windows). Để chạy cả hai, phải đổi đường dẫn cài đặt thủ công.

Không có di chuyển dữ liệu tự động. Không sao chép, di chuyển hay xoá `~/.omp` hoặc thư mục `omp` cũ. API key phải nhập lại trong bản mới.

## Không đổi theo định danh này

- sidecar `resources/omp*`, `extraResources` tới `omp`, `resolveBundledOmp`; `omp.exe` trong gói Windows;
- `window.omp`, biến môi trường `OMP_*` / `PI_*`, provider/model id, `@oh-my-pi/*`.

## Trạng thái

- Chưa phát hành (not released).
- Ứng dụng đang chạy chưa được khởi động lại (live app not restarted).
- Triển khai web console: đang chờ (pending).
- Bản build mới: đã stage, SHA `7ae61603af890f22814d9d6853a5f4b6052bc50dba21849def40c9660dfb8c41`.
- Smoke cuối trên SHA `7ae61603af890f22814d9d6853a5f4b6052bc50dba21849def40c9660dfb8c41`: PASS. `READY protocolVersion=1`; `get_settings` trả `compaction.enabled=false`, `display.showTokenUsage=false` (`.claude` đặt `true` bị bỏ qua, mặc định schema); `set_setting` round-trip PASS; không ghi vào `~/.omp/agent`; 10 lệnh, `get_available_models` 271 ms, post-discovery tối đa 5 ms.
- `check-schema-locale` ru/vi: chưa chạy lại trong đợt này.
- Chưa phát hành (not released).
