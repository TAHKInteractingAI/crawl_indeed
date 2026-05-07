// content.js (hiển thị maxPages trong giao diện và cho phép chỉnh sửa)

let isCrawling = false;
let currentPage = 1;
let allJobs = [];
let maxPages = 1; // crawl tối đa 5 trang
let hasExported = false;

  const url = "https://script.google.com/macros/s/AKfycbwZyM19-hv2Z9Fz1z4lgnaOftjC4mDsCQrsD9IxTI3ChnjUBmoReELMOhQ8dIqsOHiY/exec";
let existingKeys = new Set();

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 1200, max = 3500) {
  return new Promise(resolve => {
    const time = min + Math.random() * (max - min);
    setTimeout(resolve, time);
  });
}

function log(...args) {
  console.log("[Indeed Crawler]", ...args);
}

async function sendToGoogleSheets(jobs) {
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get("q");

  const sheetName = (query || "Indeed Crawl")
    .replace(/[\/\\\?\*\[\]]/g, "")
    .substring(0, 100);
  
  const payload = {
    sheetName,
    jobs
  };

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "saveToSheets", url, payload }, response => {
      if (response && response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || "Unknown error"));
      }
    });
  });
}

// 1. Cải thiện hàm lấy lương ngay trên Card

function createPanel() {
  if (document.querySelector("#indeed-crawler-panel")) return;

  const panel = document.createElement("div");
  panel.id = "indeed-crawler-panel";
  panel.innerHTML = `
    <div id="indeed-crawler-controls">
      <button id="indeed-start-btn">Bắt Đầu Thu Thập</button>
      <button id="indeed-stop-btn">Tạm Dừng & Xuất File</button>
      <button id="indeed-reset-btn">Xóa Dữ Liệu</button>
      <label style="margin-left: 10px;">
        Số trang tối đa:
        <input type="number" id="max-pages-input" value="${maxPages}" min="1" style="width: 50px;"/>
      </label>
    </div>
    <div id="indeed-crawler-status">Chưa bắt đầu.</div>
    <div id="indeed-crawler-table-wrapper">
      <table id="indeed-crawler-table">
        <thead>
          <tr>
            <th>Company</th><th>Job Title</th><th>Link</th><th>Salary</th><th>Location</th><th>Page</th><th>Apply Method</th><th>Keyword</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById("indeed-start-btn").onclick = () => {
    const inputVal = parseInt(document.getElementById("max-pages-input").value);
    if (!isNaN(inputVal) && inputVal > 0) {
      maxPages = inputVal;
      chrome.storage.local.set({ maxPages });
    }
    startCrawl();
  };

  document.getElementById("indeed-stop-btn").onclick = async () => {
    if (!isCrawling && allJobs.length === 0) {
      updateStatus("Chưa có dữ liệu để xuất.");
      return;
    }
    isCrawling = false;
    chrome.storage.local.set({ isCrawling: false });
    updateStatus("Đã tạm dừng crawl và xuất file.");
    exportCSV();
    await sendToGoogleSheets(allJobs);
  };

  document.getElementById("indeed-reset-btn").onclick = () => {
    chrome.storage.local.clear();
    allJobs = [];
    currentPage = 1;
    isCrawling = false;
    hasExported = false;
    document.querySelector("#indeed-crawler-table tbody").innerHTML = "";
    updateStatus("Đã xóa dữ liệu.");
    document.getElementById("indeed-start-btn").disabled = false;
  };
}

function updateStatus(text) {
  document.getElementById("indeed-crawler-status").textContent = text;
  log(text);
}

function appendToTable(job) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${job.company || "N/A"}</td>
    <td>${job.title || "N/A"}</td>
    <td><a href="${job.link}" target="_blank">Link</a></td>
    <td>${job.salary || "N/A"}</td>
    <td>${job.location || "N/A"}</td>
    <td>${job.page}</td>
    <td>${job.apply_method || "N/A"}</td>
    <td>${job.keyword ? job.keyword : "N/A"}</td>
  `;
  document.querySelector("#indeed-crawler-table tbody").appendChild(row);
}

function waitForNewPage(previousFirstJob, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const currentFirstJob = document.querySelector("h2.jobTitle")?.innerText;
      if (currentFirstJob && currentFirstJob !== previousFirstJob) {
        clearInterval(interval);
        log("Đã chuyển trang mới:", currentFirstJob);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject("Timeout đợi chuyển trang");
      }
    }, 500);
  })
}


async function startCrawl() {
  if (isCrawling) return;
  isCrawling = true;
  chrome.storage.local.set({ isCrawling, maxPages });
  document.getElementById("indeed-start-btn").disabled = true;
  updateStatus("Bắt đầu crawl...");
  await crawlLoop();
}

async function crawlLoop() {
  log("Crawl loop bắt đầu tại trang", currentPage);
  // Actually loop unlike before
  while (isCrawling) {
    const success = await crawlPage();
    if (!success) break; // Nếu crawlPage trả về false, dừng loop
    updateStatus(`Đã crawl xong trang ${currentPage}. Đang chuẩn bị chuyển trang...`);
  }
}

async function waitForJobCards(timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const cards = document.querySelectorAll("div.job_seen_beacon");
      if (cards.length > 0) {
        clearInterval(interval);
        log("Đã tìm thấy", cards.length, "job cards");
        resolve(cards);
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject("Timeout đợi job card");
      }
    }, 500);
  });
}


async function crawlPage() {
  const urlParams = new URLSearchParams(window.location.search);
  // Query + California là keyword
  const keyword = urlParams.get("q") ? urlParams.get("q") + " California" : "California";
  try {
    updateStatus(`Đang crawl trang ${currentPage}...`);
    const jobCards = await waitForJobCards();

    for (let i = 0; i < jobCards.length; i++) {
      if (!isCrawling) return false;

      const card = jobCards[i];
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Đợi ngẫu nhiên từ 1.2 đến 3.5 giây trước khi xử lý job card tiếp theo
      await randomDelay();

      if (Math.random() < 0.2) {
        log("🤔 Stretching JUUUUST a bit...");
        await randomDelay(3000, 6000);
      }

      const titleLink = card.querySelector("h2.jobTitle a");


      const jobKey = titleLink.dataset.jk || titleLink.href.match(/jk=([^&]+)/)?.[1];
      const jobTitle = titleLink.innerText.trim();
      
      const jobCompany = (card.querySelector("[data-testid='company-name']") || card.querySelector(".companyName"))?.innerText.trim() || "N/A";
      const jobLocation = (card.querySelector("[data-testid='text-location']") || card.querySelector(".companyLocation"))?.innerText.trim() || "N/A";

      if (existingKeys.has(jobKey)) {
        log(`🔍 Job ${jobTitle} đã tồn tại, bỏ qua.`);
        continue;
      } if (allJobs.some(j => j.key === jobKey)) {
        log(`🔍 Job ${jobTitle} đã tồn tại trong session, bỏ qua.`);
        continue;
      }

      
      // XỬ LÝ LƯƠNG
      let salary = "N/A"
      let apply_method = "N/A";


      await randomDelay(2000, 5000); // Đợi thêm trước khi fetch detail để tránh bị nghi ngờ

      const detail = await fetchJobDetail(jobKey, jobTitle) || {};
      if (detail.salary) {
        salary = detail.salary;
      }

      if (detail.apply_method && detail.apply_method !== "N/A") {
      apply_method = detail.apply_method;
      }
      

      const job = {
        key: jobKey,
        title: jobTitle,
        company: jobCompany,
        location: jobLocation,
        salary: salary || "N/A",
        link: titleLink.href,
        page: currentPage,
        keyword,
        apply_method: apply_method || "N/A",
      };

      allJobs.push(job);
      appendToTable(job);
      existingKeys.add(jobKey);
      chrome.storage.local.set({ allJobs });
    }

    const nextBtn = document.querySelector('a[data-testid="pagination-page-next"], a[aria-label="Next Page"]');
    if (nextBtn && currentPage < maxPages) {
      currentPage++;
      chrome.storage.local.set({ currentPage, allJobs, isCrawling, maxPages });

      nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const prevFirstJob = document.querySelector("h2.jobTitle")?.innerText;

      nextBtn.click();

      try {
        await waitForNewPage(prevFirstJob);
        await randomDelay(1000, 2000);
        await waitForJobCards();
        await randomDelay(2000, 5000);

        return true;
      } catch (err) {
        log("Không thể chuyển trang mới:", err);
        finishCrawl("Không thể chuyển trang mới.");
        return false;
      }
    } else {
      finishCrawl("Hết trang.");
      return false;
    }
  } catch (err) {
    updateStatus("Lỗi: " + err.message);
    log("Lỗi crawl page:", err);
    finishCrawl("Lỗi xảy ra.");
    return false;
  }
}

function localizeapply_method(methodText) {
  const text = methodText.toLowerCase();
  
  if (text.includes("company site") || text.includes("site")) {
    return "Apply on Company Site";
  }
  if (text.includes("apply now") || text.includes("indeed")) {
    return "Apply Now With Indeed";
  }
  
  return methodText;
}

async function finishCrawl(reason) {
  updateStatus(reason);
  if (!hasExported) {
    exportCSV();
    hasExported = true;
  }

  try {
    updateStatus(`Crawl hoàn tất: ${reason} | Tổng công việc thu thập: ${allJobs.length} | Đang gửi dữ liệu đến Google Sheets...`);
    const res = await sendToGoogleSheets(allJobs);
    console.log("Kết quả gửi Google Sheets:", res);
    updateStatus('Đã gửi dữ liệu đến Google Sheets thành công! Bạn có thể kiểm tra lại trang tính của mình.');
  } catch (err) {
    console.error("Lỗi gửi Google Sheets:", err);
    updateStatus('Lỗi khi gửi dữ liệu đến Google Sheets. Vui lòng thử lại sau.');
  }
  isCrawling = false;
  chrome.storage.local.set({ isCrawling: false });
}

async function fetchJobDetail(jobKey, jobTitle) {
  try {
    const url = `https://www.indeed.com/viewjob?jk=${jobKey}`;
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "fetchJobHTML", url }, resolve);
    });

    if (!response || !response.success) return {salary: "N/A", apply_method: "N/A"};

    const doc = new DOMParser().parseFromString(response.html, "text/html");

    let salary = "N/A";
    const salaryElement = doc.getElementById("salaryInfoAndJobType");
    if (salaryElement) {
      // Chỉ lấy nguyên văn những gì hiện ra trên trang chi tiết, không đụng chạm vào nội dung
      salary = salaryElement.innerText.trim();
    }

    const indeedApplyBtn = doc.querySelector('#indeedApplyButton');
    // Sau đó thử lấy nút Apply on Company Site
    const companyApplyBtn = doc.querySelector('#applyButtonLinkContainer button');
    let apply_method = "N/A";

    if (indeedApplyBtn) {
      apply_method = "Apply Now With Indeed";
    }
    else if (companyApplyBtn) {
      apply_method = "Apply on Company Site";
    }

    console.log(`[Crawl] Job: ${jobTitle.substring(0,20)} | Res: ${salary}`);
    return { salary, apply_method };
  } catch (err) {
    console.error("Lỗi fetch:", err);
    return { salary: "N/A", apply_method: "N/A" };
  }
}
function exportCSV() {
  log("Bắt đầu xuất file CSV với", allJobs.length, "job");
  const headers = ["Key", "CompanyName", "Job Title", "Link", "Salary", "Location", "Page", "Apply Method"];
  const rows = allJobs.map(j =>
    [j.key, j.company, j.title, j.link, j.salary, j.location, j.page, j.apply_method].map(v => {
      const val = (typeof v === 'string' || typeof v === 'number') ? v.toString() : '';
      return `"${val.replace(/"/g, '""')}"`;
    }).join(",")
  );

  const csvContent = [headers.join(","), ...rows].join("\n");
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const jobCount = allJobs.length;
  const pageTitle = document.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 30);
  const filename = `${jobCount}_jobs_${pageTitle}.csv`;

  chrome.runtime.sendMessage({ action: "saveToCSV", url, filename });
}

chrome.storage.local.get(["allJobs", "currentPage", "isCrawling", "maxPages"], data => {
  if (Array.isArray(data.allJobs)) {
    allJobs = data.allJobs;
    data.allJobs.forEach(appendToTable);
    updateStatus(`Khôi phục ${allJobs.length} công việc đã lưu.`);
  }
  if (typeof data.currentPage === "number") {
    currentPage = data.currentPage;
  }
  if (typeof data.maxPages === "number") {
    maxPages = data.maxPages;
    const input = document.getElementById("max-pages-input");
    if (input) input.value = maxPages;
  }
  if (data.isCrawling) {
    isCrawling = true;
    waitForJobCards(15000).then(() => {
      crawlLoop();
    }).catch(err => {
      console.warn("Không thể tiếp tục vì không tìm thấy job cards:", err);
      updateStatus("Không thể tiếp tục vì không tìm thấy job cards.");
      isCrawling = false;
      chrome.storage.local.set({ isCrawling: false });
    });
  }
});

createPanel();
