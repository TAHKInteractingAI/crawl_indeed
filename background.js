// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "saveToCSV" && message.url) {
    const filename = message.filename || "indeed_jobs.csv"; // dùng tên gửi từ content.js nếu có
    chrome.downloads.download({
      url: message.url,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Lỗi khi tải file:", chrome.runtime.lastError);
      } else {
        console.log("Đã tải file với ID:", downloadId);
      }
    });
  }
});
