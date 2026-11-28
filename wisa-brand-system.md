# Hệ nhận diện WISA

**Phiên bản 1.0 · 2026-11-28 · Phạm vi: quy tắc thiết kế và triển khai web/Studio.**

Đây là tài liệu chuẩn để người thiết kế, frontend và nội dung dùng chung; không phải báo cáo nghiệm thu giao diện. Phân biệt **quy tắc phải đạt** bên dưới với **hiện trạng source đã đọc**. Không suy ra trạng thái triển khai từ source, không coi việc cài skill là bằng chứng chất lượng UI.

## 1. Định vị và giọng điệu

WISA là trợ lý AI cho công việc; WISA Studio là không gian ứng dụng để làm việc cùng trợ lý. Dùng chung logo, nền tảng màu, chữ và ngôn ngữ tương tác, không tạo hai bộ nhận diện cạnh tranh. Định hướng: rõ ràng, đáng tin, tinh tế và hỗ trợ người dùng hoàn thành việc thật.

- **Rõ ràng, không phô trương:** ưu tiên nội dung và hành động tiếp theo; hiệu ứng không lấn át công việc.
- **Nhất quán, không đồng phục hóa dữ liệu:** cùng bộ token và control, nhưng lỗi, cảnh báo, nhà cung cấp và biểu đồ vẫn giữ ý nghĩa riêng.
- **Trung thực, không tuyệt đối hóa AI:** nói rõ trạng thái và giới hạn; không hứa chính xác tuyệt đối hoặc tự nhận tương đương trải nghiệm native Apple.
- Với onboarding: hướng dẫn ngắn và cụ thể. Với lỗi: giải thích việc gì chưa thành công và cách tiếp tục. Với ví/thanh toán: trung tính, không dùng hiệu ứng ăn mừng để che trạng thái giao dịch.

Ví dụ giọng điệu: dùng “Chưa gửi được tin nhắn. Kiểm tra kết nối rồi thử lại.” thay cho “Có lỗi bí ẩn!”; dùng “Chọn mô hình phù hợp với công việc” thay cho “AI hoàn hảo cho mọi nhiệm vụ”. Không đặt lịch sử sáng lập, tầm nhìn kinh doanh hay cam kết sản phẩm chưa có nguồn vào bộ quy tắc này.

## 2. Logo: bảo toàn tài sản gốc

Nguồn chuẩn: [`apps/web/client/public/wisa-logo/wisa-logo.png`](../../apps/web/client/public/wisa-logo/wisa-logo.png), PNG RGBA 512 × 512, SHA256 `8d139d650cab54d28f2930151f07b87b5e455bd71cd483652d7dfbaefed07e59`. Biểu tượng có dải uốn giao nhau, mặt pearl sáng và kim loại champagne/bronze; gradient là một phần của tài sản, không phải một màu vàng solid.

Các file hiện có trong cùng thư mục:

| Tài sản | Cách dùng |
|---|---|
| `wisa-logo.png` | Nguồn chuẩn cho biểu tượng; giữ alpha và tỷ lệ gốc. |
| `wisa-logo-32.png`, `wisa-logo-64.png`, `wisa-logo-192.png`, `wisa-logo-256.png` | Các bản raster theo kích thước tên file; chọn theo vùng hiển thị và mật độ điểm ảnh, không coi tên file là chứng nhận độ rõ. |
| `wisa-logo-badge.png` | Bản có nền tối và khung bo sẵn; dùng nguyên tài sản cho vị trí cần badge, không chồng thêm badge/viền. |

**Bắt buộc:** giữ tỷ lệ, màu và khoảng trong suốt sẵn có; dùng `contain` khi đặt trong slot. Chừa khoảng an toàn ngoài khung ảnh tối thiểu 1/8 cạnh ngắn của slot, không tính padding trong PNG thành khoảng cách giữa hai control. Tên “WISA”/“WISA Studio” bên cạnh dùng text UI thật; không tự dựng wordmark rồi coi là logo chính thức.

**Cấm:** vẽ lại bằng CSS/SVG/AI, thay màu bằng filter, đổi gradient, kéo méo, xoay, crop mất dải, thêm glow/drop-shadow hoặc chồng khung kính lên logo. Không tự tạo bản monochrome/reverse khi chưa có tài sản được chủ thương hiệu duyệt. Chưa có construction grid hoặc lockup vector được xác nhận; không bịa quy chuẩn hình học từ ảnh raster.

Độ rõ 16 px, kích thước tối thiểu cho print và khả năng tái tạo một màu **chưa được kiểm chứng**. Với vùng nhỏ phải xem đúng asset ở kích thước thực; nếu không đọc được, đổi bố cục/kích thước hoặc xin tài sản được duyệt, không sửa logo âm thầm.

## 3. Màu từ logo, không phủ vàng toàn sản phẩm

### Bảng màu tham chiếu

Phép đo do phiên triển khai ghi nhận: giải mã PNG bằng Python stdlib, chỉ lấy pixel alpha ≥ 240; weighted RGB k-means, 5 cụm, 12 vòng, tổng 62.201 pixel. Đây là **màu đại diện của cụm gradient**, không phải năm màu solid được tác giả logo chỉ định; tỷ trọng pixel cũng không phải tỷ lệ phân bổ màu UI.

| Vai trò tham chiếu | Hex | RGB | Pixel trong cụm |
|---|---|---|---:|
| Pearl | `#F6F5F3` | 246, 245, 243 | 32.359 |
| Champagne sáng | `#F1E0BD` | 241, 224, 189 | 10.170 |
| Champagne | `#CFB689` | 207, 182, 137 | 6.452 |
| Bronze trung gian | `#A88B5D` | 168, 139, 93 | 7.732 |
| Bronze sâu | `#86693E` | 134, 105, 62 | 5.488 |

### Quy tắc sử dụng

1. **Neutral chiếm phần lớn diện tích:** nền pearl và chữ charcoal ở light; nền charcoal và chữ pearl ở dark. Độ ấm rất nhẹ, không đổi cả thang xám thành nâu/beige. Trắng/đen literal vẫn cần cho QR, hình ảnh và các tài sản có yêu cầu riêng.
2. **Accent có giới hạn:** bronze sâu `#86693E` là accent light, hover `#705630`; champagne `#CFB689` là accent dark, hover `#F1E0BD`. Dùng cho hành động chính, chọn hiện tại hoặc điểm nhận diện; không tô mọi đoạn văn, icon, đường viền và card thành vàng.
3. **Hai tầng token:** giá trị nền tảng → token ngữ nghĩa → component. Component dùng `--text-primary`, `--surface-primary`, `--accent-primary`, `--ring-primary`, `--surface-submit`, `--status-*`, `--series-*`; không gắn trực tiếp hex logo vào từng trang. Tên legacy như `--wisa-ivory` không có nghĩa mọi surface phải ngả vàng.
4. **Không đổi nghĩa bằng brand:** success/error/warning/info, syntax code, màu nhà cung cấp và series dữ liệu không bị quy về bronze. Mỗi tín hiệu quan trọng có nhãn/icon/hình dạng ngoài màu; selected, disabled, destructive không bị lớp kính ghi đè.
5. **Màu logo không mặc nhiên đạt AA:** chữ thường cần ≥ 4,5:1; chữ lớn ≥ 3:1; icon chức năng, focus và dấu hiệu nhận biết control cần ≥ 3:1 với màu kề có liên quan. Không dùng champagne nhạt làm chữ trên pearl, hoặc bronze tối làm chữ trên charcoal khi chưa đo cặp cụ thể.
6. Chỉ thêm **biến thể bronze dùng cho AA** nếu màu gốc không đạt ở ngữ cảnh chức năng. Giữ cùng họ màu; ghi rõ cặp foreground/background, ratio và vai trò sử dụng trong thay đổi token. Không sửa pixel logo để đạt contrast và không thêm palette mới tùy ý. Trên kính phải kiểm màu sau compositing với nền thực, cả trạng thái mặc định/hover/focus/selected; ratio của hai màu opaque không chứng minh lớp kính đã đạt.

### Cặp token đã chốt và phép đo giới hạn

Tác vụ tích hợp đã chốt light base `#FAF9F7`, canvas `#F5F4F1`, text `#222220`; dark pane `#1C1C1B`, canvas `#171716`, text `#F2F1EE`. Đây là neutral pearl/charcoal nhẹ ấm, không phải màu cụm logo được sao chép nguyên thành nền.

Các ratio sau do tác vụ tích hợp tính theo luminance sRGB của **cặp màu base opaque**, không phải kết quả browser hay audit mọi trạng thái sau compositing:

| Foreground / background | Ratio | Phạm vi kết luận |
|---|---:|---|
| Light bronze `#86693E` / base `#FAF9F7` | 4,86:1 | Đạt AA chữ thường cho đúng cặp này; đảo hai màu cho button vẫn 4,86:1. |
| Dark champagne `#CFB689` / pane `#1C1C1B` | 8,69:1 | Đạt AA chữ thường cho đúng cặp này. |
| Light muted `#71706B` / base `#FAF9F7` | 4,72:1 | Đạt AA chữ thường cho đúng cặp này. |
| Dark tertiary `#9D9C96` / pane `#1C1C1B` | 6,20:1 | Đạt AA chữ thường cho đúng cặp này. |

Không suy rộng các ratio này sang canvas, hover, disabled, focus, mọi button hoặc nền kính. Bronze gốc đã đạt trên base light nêu trên nên không cần tạo thêm biến thể AA cho riêng cặp đó. Giá trị token thực thi nằm trong source; bảng cụm màu phía trên vẫn là hồ sơ nguồn logo, không thay theo biến thể UI. CMYK/Pantone chưa được xác lập; không suy đổi HEX thành cam kết in ấn.

## 4. Chữ, icon và bố cục

### Typography hiện có và quy tắc dùng

- `style.css` tự host **Manrope**, normal weight 400–700, các subset Vietnamese/Latin-ext/Latin, `font-display: swap`. `--theme-font-family` và Tailwind sans dùng `Manrope, system-ui, sans-serif`, có thể được theme hợp lệ thay đổi.
- Code dùng **Roboto Mono** tự host: normal 400/700 và italic 400. Fallback cấu hình: `Roboto Mono`, `ui-monospace`, `SFMono-Regular`, `Menlo`, `Cascadia Mono`, `Liberation Mono`, `Consolas`, `monospace`. Subset hiện có là Latin; phải kiểm dấu tiếng Việt và ký tự terminal theo glyph fallback, không hứa mọi glyph cùng font.
- Không tải/đóng gói SF Pro hoặc SF Mono proprietary. Tên SF trong fallback chỉ dùng bản hệ điều hành sẵn có khi được phép; `system-ui` không phải cam kết mọi OS trông như nhau. Không thêm font chỉ để giả giao diện Apple.
- Token cỡ chữ hiện có: 12, 14, 16, 18, 20 px tương ứng `--font-size-xs/sm/base/lg/xl` ở root mặc định 16 px. Quy tắc: body/markdown ưu tiên 16 px, UI label 14 px, 12 px chỉ metadata phụ không thiết yếu; heading dùng phân cấp có sẵn, không tạo một thang chữ mới cho từng màn hình.
- Body weight 400, nhấn mạnh 600–700; line-height đọc dài khoảng 1,5–1,6. Không ép chữ nhỏ/light để nhét control, không all-caps đoạn dài, không fake italic/bold khi thiếu face. Phải kiểm dấu Việt, wrapping và font-load failure ở zoom 200%.

### Icon và spacing

- Tái dùng icon/component hiện có trong từng UI, thống nhất outline, grid và stroke trong cùng nhóm; không trộn emoji, nhiều bộ icon hoặc tự vẽ biểu tượng thương hiệu thay logo. Glyph control thường 16–24 px trong hit area lớn hơn; icon-only cần accessible name và tooltip khi thích hợp.
- Nhịp thiết kế **4/8 px**: dùng bội 4 cho khoảng nội bộ, bội 8 cho nhóm/section; ưu tiên 8 px giữa control độc lập, 16–24 px giữa nhóm. Đây là quy tắc bố cục, không khẳng định mọi token cũ đã theo nhịp này: source hiện có compact 6 px và normal 12 px.
- Rail/toolbar tương tác chính: mục tiêu hit area **ít nhất 44 × 44 CSS px**, không chồng vùng bấm. Icon nhỏ không đồng nghĩa target nhỏ. Source base control-height hiện là 36 px, vì vậy không được coi base token là bằng chứng đạt target rail.
- Khi thiếu chỗ: wrap, tách nhóm hoặc đưa tác vụ phụ vào menu có tên rõ; không ép gap về 0, thu nhỏ toàn rail hoặc giấu chức năng cần thiết vào hover. Kiểm cả nhãn Việt dài, sidebar hẹp và keyboard focus ring.

## 5. Vật liệu và chuyển động

**Chrome có kính, nội dung matte.** Header, sidebar, composer, menu/dialog và control cần đọc được vật liệu ngay trạng thái nghỉ: tint nhẹ, mép sáng có hướng, cạnh tối đối diện và bóng tiết chế. Hover chỉ tăng chiếu sáng; không là điều kiện xuất hiện kính, không cần công tắc để giao diện mặc định có vật liệu.

- Pane lớn sở hữu backdrop blur. Control bên trong dùng tint/lensing/mép sáng, **không thêm backdrop blur riêng cho từng nút**. Một sidebar chỉ có một pane; hàng lịch sử và link bên trong không tạo hai lens.
- Không kính chồng kính, viền kép, glow trắng phủ panel tối hoặc hiệu ứng khúc xạ làm méo chữ. Dialog/menu lồng nhau dùng nền đặc khi cần thay vì tăng blur; bảo toàn focus rings, fill trạng thái, pointer events, radius và hình học component.
- Nội dung chat, code, dữ liệu, card và form field dùng nền matte ổn định để đọc lâu. Ảnh/illustration ưu tiên công việc và sản phẩm thật; không phủ gold filter lên mọi ảnh hoặc dùng ảnh stock/AI như bằng chứng tính năng đã có.
- Motion nhỏ, nhanh và có mục đích: source có fast 150 ms, normal 200 ms; bridge có overlay xuất hiện 180 ms. Không coi các con số này là chứng nhận mượt trên thiết bị. Không duy trì scale/transform mặc định gây containing block ngoài lúc tương tác.
- `prefers-reduced-motion`: bỏ chuyển động phóng/nhún/xuất hiện, giữ phản hồi trạng thái và thao tác native. `prefers-reduced-transparency` hoặc yêu cầu contrast cao: nền đặc, bỏ blur/gradient trang trí; khi trình duyệt không hỗ trợ blur vẫn có opaque fallback.
- High contrast và forced colors được ưu tiên hơn brand/custom theme. Không yêu cầu người dùng bật glass trở lại để dùng tính năng. Opt-out kỹ thuật `data-wisa-glass='off'`/`data-wisa-motion='off'` dùng cho vùng cần bảo vệ, không là lý do để trạng thái mặc định mất vật liệu.

Đây là vật liệu web lấy cảm hứng từ nguyên tắc thiết kế được nghiên cứu, **không phải native Liquid Glass và không cam kết tương đương Apple**.

## 6. Đối chiếu source và stress-test thực

Các nguồn đã đọc trực tiếp khi viết:

| Nguồn | Điều được xác nhận từ source |
|---|---|
| `apps/web/client/src/style.css` | Primitive/semantic tokens, light/dark, font-face, font-size và motion/geometry nền tảng. |
| `apps/web/client/tailwind.config.cjs` | Sans theo biến theme, mono fallback, màu qua `createTailwindColors`. |
| `apps/web/packages/client/src/theme/context/ThemeProvider.tsx` | Light/dark/system và high-contrast-light/dark; system theo yêu cầu contrast OS; high contrast ưu tiên hơn custom definition và legacy RGB; theme runtime có thể ghi token. |
| `apps/web/client/public/assets/wisa-glass.css` | Phân lớp matte/chrome/control, edge ở trạng thái nghỉ, hover tăng sáng, reduced transparency/contrast và opt-out. |
| `apps/web/client/plugins/glassAssets.ts` | Tạo token vật liệu OpenGlass khi build/serve; SPA và URL standalone dùng shared bridge. Không sửa riêng CSS output đã sinh. |
| `apps/web/client/public/wisa-logo/` | Logo nguồn, các raster cỡ nhỏ và badge nền tối. |

Các quy tắc là tiêu chí review cho **5 ứng dụng thực** dưới đây, không phải mockup và **chưa phải kết quả pass**:

| Ứng dụng cần kiểm | Áp dụng và tình huống stress |
|---|---|
| Chat `/c/new` | Logo giữ nguyên, sidebar/header/composer có kính khi chưa hover; tin nhắn/code matte. Thử light/dark, sidebar mở/thu, không pointer, lịch sử dài. |
| Rail và toolbar chat | Target 44 px, gap rõ giữa nút; nhãn Việt dài, focus bằng Tab, 200% zoom, màn hình hẹp không chen chúc hay che popover. |
| Settings và menu chọn mô hình | Default/hover/focus/selected/disabled vẫn phân biệt, portal menu không chồng blur; nhãn nhà cung cấp giữ màu/ý nghĩa, keyboard và screen reader đọc đúng. |
| Billing Console `/console` | Số liệu/bảng/card matte, nhãn trạng thái không chỉ dựa màu; số dư và hành động ví không bị vật liệu hoặc responsive che khuất. |
| WISA Studio | Dùng cùng logo/tokens trong chrome; kiểm tương phản với nội dung cửa sổ thật, OS contrast/motion/transparency, resize và mật độ control của shell. Không suy từ web sang Electron/native. |

Mỗi lượt kiểm phải ghi route/window, revision, browser/OS, viewport/zoom, trạng thái theme và ảnh thật; ghi contrast theo cặp sau compositing. Trạng thái hover-only không thay thế ảnh idle. Không biến ảnh minh họa hoặc test source thành bằng chứng triển khai production. Print, Figma variables/library, fidelity ở 16 px, màu màn hình khác nhau và hiệu năng thiết bị thực chưa được xác minh trong tài liệu này.

## 7. Do / Don't nhanh

| Nên | Không nên |
|---|---|
| Dùng logo raster nguyên bản, có khoảng thở | Vẽ lại/đổi màu/crop logo hoặc thêm badge lồng badge |
| Neutral pearl/charcoal, accent có vai trò | Nhuộm mọi nền/chữ/chart thành vàng/nâu |
| Dùng semantic token theo theme và đo cặp thực | Chọn hex theo cảm giác hoặc gọi màu logo là AA sẵn |
| Target rail 44 px, gap 8 px và nhóm rõ | Nhét nhiều control sát nhau bằng cách thu chữ/target |
| Kính có sẵn ở idle, cạnh sáng định hướng | Hover mới có kính, công tắc mới bật, blur từng nút |
| Nội dung matte, focus/status được bảo toàn | Kính chồng kính, viền kép, glow trắng trên nền dark |
| Đáp ứng reduced motion/transparency/forced colors | Ép hiệu ứng thương hiệu thắng nhu cầu trợ năng |
| Screenshot thật và báo phạm vi đã kiểm | Mockup giả, claim đã pass hoặc “native Apple equivalent” |

## 8. Skill upstream và quản trị thay đổi

12 skill nằm trong `.wisa-studio/skills/`, không tùy biến nội dung upstream:

| Nguồn được ghim | Skills | Giấy phép |
|---|---|---|
| [s1gmamale1/apple-design-skills](https://github.com/s1gmamale1/apple-design-skills/tree/8a3fbea8b561405e5719d682ebd1d14c952aecd7), commit `8a3fbea8b561405e5719d682ebd1d14c952aecd7` | `apple-design`, `apple-design-foundations`, `apple-design-materials`, `apple-design-motion`, `apple-design-web`, `apple-design-interaction`, `apple-design-os`, `apple-design-backend`, `apple-design-tactics` | MIT, © 2026 s1gmamale1; bản lưu `UPSTREAM-LICENSE` trong từng skill. |
| [rampstackco/claude-skills](https://github.com/rampstackco/claude-skills/tree/9d281db6e7a5c4a0084ba89c91633a07f5f7e42b), commit `9d281db6e7a5c4a0084ba89c91633a07f5f7e42b` | `brand-identity`, `brand-style-guide`, `design-system` | MIT, © 2026 RampStack Co.; bản lưu `UPSTREAM-LICENSE` trong từng skill. |

Theo kết quả đối chiếu của tác vụ tích hợp, toàn bộ file của 12 skill đã được kiểm byte-for-byte với upstream tại hai commit này. Tác vụ viết guide đọc license và các reference cần thiết, không tự chạy lại đối chiếu đó. Các tài liệu Apple-design là nghiên cứu độc lập của tác giả upstream, không phải chứng nhận/giấy phép thương hiệu hay tài sản Apple.

Quy trình dùng: đọc skill phù hợp → kiểm logo/source hiện hành → chọn quy tắc liên quan từ reference → áp dụng vào tài sản/component hiện có → stress-test ứng dụng thật → ghi quyết định và giới hạn. Guide này dùng `brand-style-guide/references/style-guide-template.md`, `brand-identity/references/contrast-and-accessibility.md` và `design-system/references/governance-playbook.md`; không cần tạo thêm thư viện hoặc chép template thành hàng chục tài liệu.

**Ownership:** chủ thương hiệu WISA duyệt thay đổi logo/định vị/palette; người bảo trì frontend chịu trách nhiệm semantic tokens, bridge và component; người thực hiện thay đổi cung cấp bằng chứng contrast, trạng thái và trợ năng. Đây là phân vai review, không gán tên cá nhân chưa được xác nhận.

**Cập nhật gọn:** thay đổi component tái dùng pattern hiện có; thay đổi nền tảng phải nêu lý do, phạm vi ảnh hưởng, cặp màu và cách chuyển mọi caller trong cùng thay đổi. Đồng bộ guide với source; ghi version/date và kết quả kiểm thật. Khi nâng skill, ghim commit mới, giữ license và đối chiếu byte-identical; mọi quyết định riêng của WISA nằm ngoài thư mục skill. Review lại khi đổi logo, theme/font, shared material hoặc có phản hồi trợ năng; không vá palette rời rạc theo từng màn hình.

**Lịch sử:** 1.0 (2026-11-28) — quy tắc từ logo thực, inventory source và workflow upstream; không sửa code, không chạy build/test/lint và không xác nhận trạng thái deployed.
