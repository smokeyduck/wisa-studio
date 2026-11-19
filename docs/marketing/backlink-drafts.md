# Bản nháp backlink — chưa đăng ở đâu cả

Mỗi nơi một góc tiếp cận khác nhau. Không copy nguyên bài giữa các nơi: cùng
một sự thật, khác người đọc, khác lý do họ bấm vào.

Quy ước chung:

- Link chính: `https://github.com/smokeyduck/wisa-studio`
- Link key: `https://askwisa.com/?utm_source=<kênh>&utm_medium=<vị trí>`
- Không nói "nhanh hơn", "tốt hơn Claude Code", không so sánh benchmark khi
  chưa có số liệu của mình. Chỉ nói cái đang có.
- Nói rõ là rebrand giao diện của oh-my-pi (MIT). Giấu điều này sẽ bị bóc ngay
  trên HN và r/LocalLLaMA, và mất uy tín vĩnh viễn.

---

## 1. Show HN

**Tiêu đề:** `Show HN: WISA Studio – a Vietnamese GUI for the oh-my-pi coding agent`

**Góc:** người đọc HN quan tâm *kỹ thuật và tính trung thực*. Bài phải trả lời
ngay: đây là fork giao diện, agent là binary upstream, không có gì bị patch.

**Thân bài (draft):**

> I use oh-my-pi (an open-source terminal coding agent) daily, but most of my
> team lives in a GUI. So I built one: WISA Studio, an Electron desktop shell
> around the real omp agent.
>
> It is a **display-layer rebrand**, not a fork of the agent. The sidecar that
> ships in the DMG/EXE/AppImage is upstream oh-my-pi compiled unmodified from a
> pinned commit (`sidecar-source.json`); I do not patch it. What I added:
>
> - A Vietnamese UI (the interface had English, Chinese, Russian and Thai).
> - A pre-seeded OpenAI-compatible provider for our own gateway, so one key
>   reaches every model — model list is discovered from `/v1/models`.
> - Parallel session tabs, each with its own agent process; split panes;
>   scheduled tasks with run history; MCP/Skills management in Settings.
>
> Things I got wrong / limits: session tabs are not an OS sandbox; macOS builds
> are ad-hoc signed (not notarized); Windows builds are unsigned. It shares
> `~/.omp` with the CLI, so a session opens in either.
>
> MIT, source: https://github.com/smokeyduck/wisa-studio
> Upstream: https://github.com/can1357/oh-my-pi

**Comment đầu tiên (tự trả lời, đăng ngay sau bài):**

> Why a GUI and not the TUI: I wanted two sessions visible at once and a
> clickable diff. The interesting engineering problem was actually the sidecar
> handshake — the GUI spawns `omp --mode rpc-ui` and needs flags the npm CLI
> does not have, so the dev path probes the binary (`stats --help`) instead of
> trusting a version string. That cost me an afternoon of restart loops.

**Trả lời khi bị hỏi "why not just use omp's TUI / why fork":**
thẳng thắn — vì nhóm không dùng terminal; và nói rõ phần nào là của upstream.

---

## 2. r/LocalLLaMA

**Tiêu đề:** `I built a desktop GUI for the oh-my-pi coding agent, with a Vietnamese UI`

**Góc:** người đọc ở đây quan tâm *model nào, chạy local được không, giá bao
nhiêu, có bị khoá vào một nhà cung cấp không*. Đừng bán sản phẩm — kể trải
nghiệm và để họ hỏi.

**Thân bài (draft):**

> Context: I run coding agents against a mix of local and hosted models. The
> terminal agent I use (oh-my-pi) is good, but switching sessions and reviewing
> diffs in a TUI got old.
>
> WISA Studio is a desktop shell for it. Two things might be relevant here:
>
> 1. **It is not locked to my gateway.** The app ships a pre-seeded
>    OpenAI-compatible provider (`baseUrl` + `/v1/models` discovery) because
>    that is what my company runs, but any provider the agent supports works —
>    including local OpenAI-compatible servers. You point it at a base URL, it
>    lists models, done.
> 2. **The agent is upstream, unpatched.** The sidecar is oh-my-pi compiled
>    from a pinned commit. So anything that works in the CLI works here.
>
> What it adds: parallel session tabs (own process each), split view,
> scheduled tasks, MCP/Skills UI, Vietnamese interface.
>
> Repo (MIT): https://github.com/smokeyduck/wisa-studio
>
> Happy to answer questions about the RPC bridge or how the sidecar is packaged
> — that was most of the work.

**Không làm:** không spam nhiều subreddit cùng lúc, không nhờ bạn bè upvote.

---

## 3. dev.to

**Tiêu đề:** `Packaging a desktop GUI around a terminal coding agent (Electron + a compiled sidecar)`

**Góc:** bài kỹ thuật thật, đăng trên dev.to, link sản phẩm ở cuối. Người đọc
dev.to đến vì *cách làm*, không vì sản phẩm.

**Dàn ý:**

1. Vấn đề: agent là binary Go/Bun-compile; GUI là Electron; làm sao để một gói
   cài chạy được mà người dùng không phải cài runtime.
2. `Bun.build --compile` để tạo sidecar; nhúng native addon; `extraResources`.
3. Giao thức: GUI spawn `omp --mode rpc-ui`, JSON-RPC qua stdin/stdout, một
   dòng một frame.
4. Cái bẫy: CLI và sidecar cùng major version nhưng khác flag → probe
   `stats --help` thay vì tin version. Kèm log lỗi thật.
5. Auto-update với electron-builder + electron-updater; vì sao `latest-mac.yml`
   phải có cả hai kiến trúc.
6. Ký và notarize: ad-hoc signing là gì, vì sao Gatekeeper vẫn chặn.
7. Kết: repo, license MIT, ghi công upstream.

**Kết bài (draft):**

> The whole thing is MIT and the GUI lives at
> https://github.com/smokeyduck/wisa-studio. The agent it wraps is
> https://github.com/can1357/oh-my-pi. If you are packaging an Electron app
> around a CLI, the probe-before-spawn trick in `src/main/dev-sidecar.ts` is the
> part I would copy first.

---

## 4. Viblo (cộng đồng dev Việt)

**Tiêu đề:** `WISA STUDIO: bọc GUI cho một coding agent terminal — và những gì phải sửa để chạy được ở Việt Nam`

**Góc:** tiếng Việt, kỹ thuật, nhấn vào *bản địa hoá* và *một API key*. Viblo
đọc giả là dev Việt, họ quan tâm: có tiếng Việt không, có phải trả tiền bằng
thẻ quốc tế không, cấu hình thế nào.

**Thân bài (draft):**

> Mình dùng một coding agent chạy trên terminal. Nó tốt, nhưng hai việc khiến
> mình phải làm thêm một lớp giao diện:
>
> 1. Nhóm mình không ai mở terminal cả ngày.
> 2. Giao diện gốc không có tiếng Việt.
>
> WISA STUDIO là lớp GUI đó. Agent bên trong **không phải bản mình viết lại** —
> nó là binary của oh-my-pi (MIT), biên dịch nguyên bản từ một commit cố định
> và đóng gói kèm app. Mình chỉ thay phần hiển thị và cách đóng gói.
>
> Phần tiếng Việt không chỉ là dịch chuỗi: có khoảng 4200 khoá giao diện, cộng
> toàn bộ nhãn/mô tả setting do agent trả về qua RPC. Cái sau mới khó — nó nằm
> trong schema của sidecar, nên mình viết một script so bảng dịch với schema
> thật và chạy nó trong CI. Khi upstream thêm setting mới, CI đỏ ngay thay vì
> lặng lẽ hiện tiếng Anh.
>
> Về chi phí: app không bắt bạn dùng cổng của mình. Nó tạo sẵn provider `wisa`
> (OpenAI-compatible) vì đó là thứ mình có, nhưng bạn trỏ sang Anthropic,
> OpenAI, DeepSeek, OpenRouter hay một server local đều được.
>
> Repo: https://github.com/smokeyduck/wisa-studio (MIT)
> Hướng dẫn cài: https://github.com/smokeyduck/wisa-studio/blob/main/docs/vi/cai-dat.md

---

## 5. Nhóm AI Việt (Facebook/Zalo/Discord)

**Góc:** cộng đồng chat, không phải blog. Ngắn, có ảnh, có câu hỏi mở. Đừng
dán link trần — dán ảnh chụp giao diện tiếng Việt trước, link ở comment.

**Bài đăng (draft):**

> Mình vừa đóng gói bản GUI tiếng Việt cho một coding agent mã nguồn mở
> (oh-my-pi). Cài xong là chạy, không cần Node/Bun, có sẵn cổng WISA nên một
> key dùng được nhiều model.
>
> [ảnh: giao diện tiếng Việt, tab phiên song song]
>
> Có bác nào đang dùng agent để code hằng ngày không? Mình tò mò mọi người
> thường để agent chạy nền việc gì — review diff, chạy test, hay viết changelog?
>
> (Miễn phí, MIT. Repo ở comment.)

**Comment đầu tiên:**

> Repo + hướng dẫn cài: https://github.com/smokeyduck/wisa-studio
> Lưu ý bản macOS chưa notarize nên lần đầu phải chuột phải → Open.
> Key WISA (không bắt buộc): https://askwisa.com/?utm_source=facebook&utm_medium=group

**Quy tắc tự đặt:** mỗi nhóm đọc nội quy trước; nhóm nào cấm quảng cáo thì chỉ
trả lời câu hỏi, không đăng bài; không đăng cùng lúc 5 nhóm.

---

## Lịch đăng đề xuất

| Thứ tự | Nơi | Vì sao thứ tự này |
|---|---|---|
| 1 | dev.to | Bài kỹ thuật, không cần cộng đồng nào duyệt; tạo chỗ để mọi nơi khác trỏ về |
| 2 | Viblo | Cùng nội dung kỹ thuật nhưng tiếng Việt; độc lập với dev.to |
| 3 | Nhóm AI Việt | Sau khi đã có bài để dẫn link, tránh bài chỉ có link tải |
| 4 | r/LocalLLaMA | Cần trả lời bình luận trong 2-3 giờ đầu |
| 5 | Show HN | Cuối cùng: nội dung đã được mài qua 4 vòng phản hồi |

Giãn cách ít nhất 2 ngày giữa các lần, trừ nhóm chat.

## Trước khi đăng bất cứ đâu

- [ ] Repo public, README hiển thị đúng ảnh (kiểm tra trên GitHub, không chỉ local)
- [ ] Release v0.9.46 có đủ asset và `latest-mac.yml` cho cả hai kiến trúc
- [ ] Trang site đã deploy và `og:image` hiện đúng khi dán link
- [ ] Đã thử tải và mở app trên ít nhất một máy macOS sạch
- [ ] `utm_source` khác nhau cho từng kênh để đo được kênh nào mang key
