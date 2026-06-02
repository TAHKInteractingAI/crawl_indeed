# Indeed Job Crawler Chrome Extension

Một Chrome Extension giúp tự động thu thập dữ liệu việc làm từ trang [Indeed.com](https://www.indeed.com/) (bao gồm tất cả các phiên bản quốc tế) và xuất kết quả ra file CSV.

## 🧹 Tính năng

### Thu thập dữ liệu
* ✅ Tự động crawl nhiều trang kết quả tìm kiếm việc làm.
* ✅ Crawl đầy đủ thông tin: **Tên công ty**, **Tiêu đề công việc**, **Mức lương**, **Địa điểm**, **Phương thức ứng tuyển**, **Liên kết**, **Trang số**.
* ✅ Hiển thị dữ liệu trực tiếp trên giao diện trang web Indeed dưới dạng bảng.
* ✅ Giới hạn số trang crawl tùy chỉnh (do người dùng nhập).
* ✅ Hỗ trợ tiếp tục crawl tự động sau khi reload trang.
* ✅ **Lọc nâng cao**: Tùy chỉnh việc loại bỏ các job bằng từ khóa (loại bỏ theo tiêu đề) hoặc chỉ giữ lại các job thuộc khu vực/địa điểm mong muốn.

### Giao diện điều khiển
Extension cung cấp 4 nút điều khiển:

| Nút | Chức năng | Trạng thái |
|-----|-----------|------------|
| 🟢 **Bắt Đầu Thu Thập** | Bắt đầu quá trình crawl | Tắt khi đang crawl |
| 🔴 **Dừng Thu Thập** | Dừng quá trình crawl giữa chừng | Chỉ bật khi đang crawl |
| ⚪ **Xóa Dữ Liệu** | Xóa toàn bộ dữ liệu đã thu thập | Luôn bật |
| 🔵 **Tải CSV** | Tải file CSV về máy | Chỉ bật khi **không** đang crawl và có dữ liệu |

### Lọc dữ liệu thông minh
Extension cung cấp 2 bộ lọc chạy trực tiếp trên giao diện (hỗ trợ chọn nhiều giá trị cách nhau bằng dấu phẩy):
* ✅ **Loại bỏ jobs chứa từ khóa:** Nhập các từ khóa muốn bỏ qua (vd: `intern, senior, manager`). Extension sẽ tự động phân loại và skip những công việc có tiêu đề chứa từ khóa này.
* ✅ **Chỉ giữ jobs ở khu vực:** Nhập các khu vực muốn giữ lại (vd: `Remote, Houston, TX, New York`). Extension sẽ chỉ lưu các công việc có địa điểm khớp với yêu cầu của bạn.
Lưu ý: Bạn có thể lọc trước và trong khi đang crawl, hoặc sử dụng các nút Lọc để lọc ra các job đã được thu thập ở bảng.

### Hoạt động trên mọi trang Indeed
* ✅ Extension hoạt động trên **tất cả các trang** của Indeed (`*.indeed.com/*`), không chỉ riêng trang kết quả tìm kiếm.
* ✅ Hỗ trợ tất cả các phiên bản quốc tế: `fr.indeed.com`, `de.indeed.com`, `jp.indeed.com`, `vn.indeed.com`, v.v.

### Xử lý lỗi "Page Not Found" (404) thông minh
Khi quá trình crawl gặp trang 404 (ví dụ: liên kết việc làm đã hết hạn), extension sẽ tự động xử lý:

1. **Phát hiện trang 404** bằng cách kiểm tra tiêu đề trang và nội dung ở **hơn 25 ngôn ngữ** (Tiếng Anh, Tiếng Pháp, Tiếng Đức, Tiếng Tây Ban Nha, Tiếng Nhật, Tiếng Việt, v.v.).
2. **Kiểm tra công việc đang xử lý** (pending job):
   * Nếu **đã có** trong danh sách → bỏ qua, không thêm trùng lặp.
   * Nếu **chưa có** trong danh sách → tự động thêm vào với mức lương và phương thức ứng tuyển = "N/A".
3. **Tự động quay lại** trang kết quả tìm kiếm trước đó.
4. **Tiếp tục crawl** từ job card tiếp theo (bỏ qua card gây lỗi 404).

#### Các ngôn ngữ hỗ trợ phát hiện 404:
> Tiếng Anh, Tiếng Pháp, Tiếng Đức, Tiếng Tây Ban Nha, Tiếng Bồ Đào Nha, Tiếng Ý, Tiếng Hà Lan, Tiếng Nhật, Tiếng Hàn, Tiếng Trung (Giản thể & Phồn thể), Tiếng Ả Rập, Tiếng Hindi, Tiếng Ba Lan, Tiếng Thụy Điển, Tiếng Na Uy, Tiếng Đan Mạch, Tiếng Phần Lan, Tiếng Séc, Tiếng Hungary, Tiếng Romania, Tiếng Thổ Nhĩ Kỳ, Tiếng Indonesia, Tiếng Thái, Tiếng Việt, Tiếng Nga, Tiếng Ukraina.

### Xuất file CSV
* ✅ Tự động xuất file CSV khi crawl hoàn tất.
* ✅ Nút **"Tải CSV"** cho phép tải lại file CSV bất cứ lúc nào (khi không đang crawl).
* ✅ Tên file tự động: `[số-job]_jobs_[tên-trang].csv`.

---

## 🔧 Cài đặt

1. **Tải mã nguồn**
   * Clone hoặc tải ZIP source code về máy.
2. **Tải extension vào Chrome:**
   * Truy cập `chrome://extensions/` trên trình duyệt.
   * Bật **Chế độ dành cho nhà phát triển** (Developer Mode).
   * Bấm **Tải tiện ích đã giải nén** (Load unpacked).
   * Chọn thư mục chứa các file:
     ```
     ├── manifest.json
     ├── background.js
     ├── content.js
     ├── styles.css
     └── icon.png
     ```

---

## 🚀 Hướng dẫn sử dụng

1. Truy cập [Indeed](https://www.indeed.com/) (hoặc bất kỳ phiên bản quốc tế nào, ví dụ: `vn.indeed.com`).
2. Tìm kiếm từ khóa công việc mong muốn.
3. Giao diện **"Indeed Crawler"** sẽ hiển thị ở **góc dưới bên phải** trang.
4. Chỉnh **số trang tối đa** nếu muốn (mặc định: 5 trang).
5. Nhập các từ khóa loại trừ hoặc khu vực mong muốn vào 2 bộ lọc (nếu có).
6. Bấm nút **"Bắt Đầu Thu Thập"** để bắt đầu quá trình crawl.
7. Extension sẽ tự động:
   * Cuộn đến và click từng job card → lấy thông tin chi tiết (bao gồm mức lương).
   * Tự động bỏ qua các việc làm không phù hợp theo bộ lọc trước đó.
   * Nếu gặp trang 404 → tự động phục hồi và tiếp tục.
   * Chuyển sang trang tiếp theo khi hoàn tất trang hiện tại.
   * Dừng khi hết trang hoặc đạt giới hạn số trang.
8. Bạn có thể dùng nút **"Dừng Thu Thập"** bất cứ lúc nào để dừng giữa chừng.
9. Khi hoàn tất, trình duyệt sẽ hiển thị cửa sổ **lưu file CSV**.
10. Bấm nút **"Tải CSV"** để tải lại file CSV bất cứ lúc nào (lưu ý: chỉ hoạt động khi không đang crawl).
11. Bấm nút **"Lọc"** hoặc **"Lọc Khu Vực"** bất cứ lúc nào để áp dụng bộ lọc trên danh sách đã thu thập.
12. Bấm nút **"Xóa Dữ Liệu"** để reset toàn bộ và bắt đầu lại từ đầu.

---

## 📂 Dữ liệu thu thập

Mỗi dòng trong file CSV sẽ bao gồm:

| CompanyName | Job Title | Link | Salary | Location | Apply Method | Page |
|-------------|-----------|------|--------|----------|--------------|------|
| Tên công ty | Tiêu đề công việc | Liên kết đến trang tuyển dụng | Mức lương | Địa điểm làm việc | Phương thức ứng tuyển (Apply Now / Apply on Company Site) | Số trang |

---

## ⚠️ Lưu ý

* Extension hoạt động trên **mọi trang** của Indeed (`*.indeed.com/*`), bao gồm trang chủ, kết quả tìm kiếm, chi tiết việc làm, v.v.
* Khi chuyển sang mỗi trang mới, trình duyệt sẽ reload lại — nhưng extension sẽ **tự động tiếp tục crawl** nếu trước đó chưa hoàn thành.
* Không cần nhấn lại nút "Bắt Đầu Thu Thập" sau mỗi trang.
* Nếu một liên kết việc làm dẫn đến trang 404, extension sẽ **tự động quay lại và tiếp tục** từ job card tiếp theo mà không bị gián đoạn.
* Nút **"Tải CSV"** chỉ hoạt động khi quá trình crawl **không đang chạy** và đã có dữ liệu.
* Dữ liệu được lưu trong `chrome.storage.local`, nên vẫn được giữ lại ngay cả khi trang bị reload.

---

## 📃 Cấu trúc file

```
.
├── manifest.json        # Cấu hình extension (Manifest V3)
├── background.js        # Xử lý tải file CSV qua chrome.downloads API
├── content.js           # Logic chính: crawl, giao diện, xử lý 404, quản lý trạng thái
├── styles.css           # Giao diện CSS cho bảng điều khiển crawler
└── icon.png             # Biểu tượng extension
```

### Chi tiết các file:

| File | Mô tả |
|------|--------|
| `manifest.json` | Cấu hình extension với Manifest V3, khai báo quyền, URL match pattern (`*.indeed.com/*`), và các file content script. |
| `background.js` | Service worker xử lý message từ content script để tải file CSV thông qua `chrome.downloads.download()`. |
| `content.js` | File chính chứa toàn bộ logic: tạo giao diện panel, crawl dữ liệu, phát hiện trang 404 đa ngôn ngữ, quản lý trạng thái nút, phục hồi sau lỗi, và xuất CSV. |
| `styles.css` | Định dạng giao diện bảng điều khiển: panel cố định, bảng dữ liệu, các nút điều khiển có màu sắc phân biệt, và trạng thái disabled. |
| `icon.png` | Biểu tượng hiển thị trên thanh công cụ Chrome. |

---

## 📃 Giấy phép

Dự án này dùng cho mục đích học tập và cá nhân. Không nên sử dụng để crawl dữ liệu với mục đích thương mại nếu không được sự cho phép từ Indeed.
