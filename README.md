# Indeed Job Crawler Chrome Extension

Một Chrome Extension đơn giản giúp tự động thu thập dữ liệu việc làm từ trang [Indeed.com](https://www.indeed.com/) và xuất kết quả ra file CSV.

## 🧹 Tính năng

* ✅ Tự động crawl nhiều trang kết quả tìm kiếm việc làm.
* ✅ Hiển thị dữ liệu trực tiếp trên giao diện trang web Indeed.
* ✅ Crawl đầy đủ thông tin: Tên công ty, tiêu đề công việc, mức lương, địa điểm, liên kết, trang số.
* ✅ Hỗ trợ tiếp tục crawl sau khi reload trang.
* ✅ Giới hạn số trang crawl (do người dùng nhập).
* ✅ Xuất file CSV với tên: `số-job_jobs_tên-trang.csv`.
* ✅ Nút "Xóa Dữ Liệu" để reset lại từ đầu.

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
     ┌── manifest.json
     ├── background.js
     ├── content.js
     └── (tùy chọn) styles.css
     ```

---

## 🚀 Hướng dẫn sử dụng

1. Truy cập [Indeed](https://www.indeed.com/) và tìm kiếm từ khóa công việc mong muốn.
2. Giao diện "Indeed Crawler" sẽ hiển thị ở phía dưới trang.
3. Chỉnh **số trang tối đa** nếu muốn (ví dụ: 3, 5, 10...).
4. Bấm nút **"Bắt đầu thu thập"** để bắt đầu quá trình crawl.
5. Extension sẽ tự động:
   * Click từng job card → lấy thông tin chi tiết.
   * Chuyển sang trang tiếp theo.
   * Dừng khi hết trang hoặc đạt giới hạn.
6. Khi hoàn tất, trình duyệt sẽ hiển thị cửa sổ  **lưu file CSV** .
7. Bạn có thể dùng nút **"Xóa Dữ Liệu"** để reset toàn bộ.

---

## 📂 Dữ liệu thu thập

Mỗi dòng trong file CSV sẽ bao gồm:

| Company Name | Job Title | Link | Salary | Location | Page |
| ------------ | --------- | ---- | ------ | -------- | ---- |

---

## ⚠️ Lưu ý

* Extension chỉ hoạt động với giao diện trang kết quả tìm kiếm trên Indeed.
* Khi chuyển sang mỗi trang mới, trình duyệt sẽ reload lại toàn bộ — nhưng extension sẽ tự động tiếp tục crawl nếu trước đó chưa hoàn thành.
* Không cần phải nhấn lại nút "Bắt đầu" sau mỗi trang.
* Nếu bạn không thấy giao diện hiện ra, hãy đảm bảo đã mở trang Indeed đúng định dạng kết quả tìm kiếm (ví dụ: `https://www.indeed.com/jobs?q=developer&l=...`).

---

## 📃 Cấu trúc file

```
.
├── manifest.json        # Cấu hình extension
├── background.js        # Xử lý tải file CSV
├── content.js           # Logic chính cho crawl + giao diện
└── styles.css           # (tùy chọn) style CSS
```

---

## 📃 Giấy phép

Dự án này dùng cho mục đích học tập và cá nhân. Không nên sử dụng để crawl dữ liệu với mục đích thương mại nếu không được sự cho phép từ Indeed.
