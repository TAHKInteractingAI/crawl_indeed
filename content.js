let CONFIG = null;
let isCrawling = false;
let currentPage = 1;
let allJobs = [];
let maxPages = 5;
let hasExported = false;
let resumeFromIndex = 0;
let filterKeywords = [];
let filterLocations = [];

async function loadConfig() {
  if (CONFIG) return CONFIG;
  try {
    const res = await fetch(chrome.runtime.getURL("config.json"));
    CONFIG = await res.json();
  } catch (err) {
    console.error("[Indeed Crawler] Lỗi load config.json:", err);
  }
  return CONFIG;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(...args) {
  console.log("[Indeed Crawler]", ...args);
}

function extractJobKey(url) {
  if (!url) return null;
  try {
    const match = url.match(/[?&]jk=([a-f0-9]+)/i)
      || url.match(/\/viewjob\?jk=([a-f0-9]+)/i)
      || url.match(/\/rc\/clk\?jk=([a-f0-9]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function looksLikeSalary(text) {
  if (!text) return false;

  const excludePatterns = /^(toàn thời gian|bán thời gian|full-time|part-time|hợp đồng|thực tập|permanent|contract|temporary)$/i;
  if (excludePatterns.test(text.trim())) return false;

  const hasDigit = /\d/.test(text);
  if (!hasDigit) {
    return /thương lượng|thỏa thuận|cạnh tranh|negotiable/i.test(text);
  }

  const currencySymbolPattern = /[$€£¥₹₩₫₺₽₴฿]|[\d\s.,]+[đĐ]\b|\b[đĐ][\d\s.,]+/i;
  if (currencySymbolPattern.test(text)) return true;

  const multiCharCurrencyPattern = /\b(RM|R\$|kr|zł|Rp|Rs|CHF|VND|VNĐ)\b/i;
  if (multiCharCurrencyPattern.test(text)) return true;

  const salaryKeywordPattern = /\b(triệu|tr|nghìn|ngàn|k)(\s*[\/\-]\s*(tháng|năm|giờ))?|\b(một tháng|mỗi tháng|một năm|mỗi năm|a month|a year|an hour|per hour|per month)\b/i;
  if (salaryKeywordPattern.test(text)) return true;

  const isoCurrencyPattern = /\b[A-Z]{3}\b/;
  if (isoCurrencyPattern.test(text)) {
    const isoMatch = text.match(/\b[A-Z]{3}\b/);
    if (isoMatch) {
      const code = isoMatch[0];
      const nonCurrencyCodes = CONFIG?.salary?.nonCurrencyCodes || ['THE', 'AND', 'FOR', 'PER', 'DAY', 'PAY', 'JOB', 'NEW', 'OLD', 'NOT', 'BUT', 'ALL', 'ANY', 'FEW'];
      if (!nonCurrencyCodes.includes(code)) return true;
    }
  }

  return false;
}

function extractSalaryFromText(text) {
  if (!text) return null;
  const patterns = [
    /(\$[\d,]+(?:\s*[-–—toànếnđến]+\s*\$[\d,]+)?(?:\s*(?:a year|an hour|a month|a day|a week|per year|per hour|per month))?)/i,
    /((?:[$€£¥₹₩₫₺₽₴฿]|[\d\s.,]+[đĐ]\b|\b[đĐ][\d\s.,]+|\b(?:RM|R\$|kr|zł|Rp|Rs|CHF|VND|VNĐ)\b)\s*[\d.,\s]+(?:\s*[-–—toànếnđến]+\s*(?:[$€£¥₹₩₫₺₽₴฿]|[\d\s.,]+[đĐ]\b|\b[đĐ][\d\s.,]+|\b(?:RM|R\$|kr|zł|Rp|Rs|CHF|VND|VNĐ)\b)?\s*[\d.,\s]+)?(?:\s*(?:a year|an hour|a month|a day|a week|per year|per hour|per month|\/\s*(?:tháng|năm|giờ|thang|nam|gio|month|year|hr)))?)/i,
    /(\d+[\d.,]*\s*(?:triệu|tr|nghìn|ngàn|k)(?:\s*[-–—toànếnđến]+\s*\d+[\d.,]*\s*(?:triệu|tr|nghìn|ngàn|k))?(?:\s*\/\s*(?:tháng|năm|giờ))?)/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1] && looksLikeSalary(m[1].trim())) {
      return m[1].trim();
    }
  }
  return null;
}

function dismissPopups() {
  const closeSelectors = [
    'button[aria-label="Close"]',
    'button[aria-label="close"]',
    'button[aria-label="Đóng"]',
    'button[aria-label="dismiss"]',
    '[data-testid="modal-close-button"]',
    '.icl-CloseButton',
    'button[class*="CloseButton"]'
  ];
  for (const sel of closeSelectors) {
    const btn = document.querySelector(sel);
    if (btn && btn.offsetParent !== null) {
      try { btn.click(); } catch {}
    }
  }
}

function extractSalaryFromDescription(text) {
  if (!text) return null;
  const patterns = [
    /(?:lương|thu nhập|mức lương|salary|package)[:\s–—]+([^\n\r,.]{3,40}(?:triệu|tr|vnd|vnđ|usd|\$|đ|₫)[^\n\r,.]{0,20})/i,
    /(?:lương|salary)[:\s–—]+(\$?\d+[\d.,\s]*(?:k|triệu|tr|usd|vnd|vnđ)?(?:\s*[-–—toànếnđến]+\s*\$?\d+[\d.,\s]*(?:k|triệu|tr|usd|vnd|vnđ)?)?)/i,
    /(\d+[\d.,]*\s*(?:triệu|tr|vnđ|vnd|đ|₫)\s*(?:[-–—toànếnđến]+\s*\d+[\d.,]*\s*(?:triệu|tr|vnđ|vnd|đ|₫))?\s*(?:\/\s*(?:tháng|thang|năm|month|year))?)/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function isJobDuplicate(newJob) {
  const newKey = extractJobKey(newJob.link);
  return allJobs.some(existing => {
    if (newKey) {
      const existingKey = extractJobKey(existing.link);
      if (existingKey && existingKey === newKey) return true;
    }
    return existing.title === newJob.title
      && existing.company === newJob.company
      && existing.location === newJob.location;
  });
}

function shouldRemoveJob(jobTitle) {
  if (!filterKeywords.length || !jobTitle) return false;
  const lowerTitle = jobTitle.toLowerCase();
  return filterKeywords.some(kw => {
    const k = kw.trim().toLowerCase();
    if (k === "java") {
      return (/\bjava\b/i.test(lowerTitle) && !/\bjavascript\b/i.test(lowerTitle));
    }
    if (k.length <= 3) {
      const regex = new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`, 'i');
      return regex.test(lowerTitle);
    }
    return lowerTitle.includes(k);
  });
}

function shouldKeepByLocation(jobLocation) {
  if (!filterLocations.length) return true;
  if (!jobLocation || jobLocation === "N/A") return false;
  const lowerLoc = jobLocation.toLowerCase();
  const aliases = CONFIG?.locationAliases || {};

  return filterLocations.some(loc => {
    const l = loc.trim().toLowerCase();
    if (lowerLoc.includes(l)) return true;
    if (aliases[l]) {
      return aliases[l].some(alias => lowerLoc.includes(alias));
    }
    return false;
  });
}

function parseKeywords(input) {
  if (!input || !input.trim()) return [];
  return input.split(",")
    .map(kw => kw.trim().toLowerCase())
    .filter(kw => kw.length > 0);
}

function isPageNotFound() {
  const title = document.title.toLowerCase();
  const bodyText = (document.body?.innerText || '').toLowerCase().slice(0, 3000);
  const combined = title + ' ' + bodyText;
  const phrases = CONFIG?.notFoundPhrases || ['404', 'page not found', 'không tìm thấy trang'];

  for (const phrase of phrases) {
    if (combined.includes(phrase)) {
      return true;
    }
  }

  const errSelector = CONFIG?.selectors?.errorPage || '.jobsearch-ErrorPage, .errorMessage, [data-testid="error-page"]';
  if (document.querySelector(errSelector)) {
    return true;
  }
  return false;
}

function getJobCards() {
  const selectors = CONFIG?.selectors?.cards || ["div.job_seen_beacon"];
  let cards = [];
  for (const sel of selectors) {
    const found = Array.from(document.querySelectorAll(sel));
    if (found.length > 0) {
      cards = found;
      break;
    }
  }
  return cards.filter((card, index, self) =>
    self.indexOf(card) === index && !self.some(other => other !== card && other.contains(card))
  );
}

async function waitForJobCards(timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const cards = getJobCards();
      if (cards.length > 0) {
        clearInterval(interval);
        log("Đã tìm thấy", cards.length, "job cards hợp lệ (đã lọc trùng)");
        resolve(cards);
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject("Timeout đợi job card");
      }
    }, 500);
  });
}

async function startCrawl() {
  if (isCrawling) return;

  const kwVal = CrawlerUI.getFilterKeywordsInput();
  filterKeywords = parseKeywords(kwVal);
  chrome.storage.local.set({ filterKeywords: kwVal });

  const locVal = CrawlerUI.getFilterLocationsInput();
  filterLocations = parseKeywords(locVal);
  chrome.storage.local.set({ filterLocations: locVal });

  maxPages = CrawlerUI.getMaxPagesInput();
  chrome.storage.local.set({ maxPages });

  isCrawling = true;
  hasExported = false;
  resumeFromIndex = 0;
  chrome.storage.local.set({ isCrawling, maxPages, resumeFromIndex: 0, pendingJob: null });
  CrawlerUI.updateButtonStates(isCrawling, allJobs.length > 0);
  CrawlerUI.updateStatus("Bắt đầu crawl...");
  await crawlLoop();
}

async function crawlLoop(startIndex = 0) {
  log("Crawl loop bắt đầu tại trang", currentPage, "từ card index", startIndex);
  const success = await crawlPage(startIndex);
  if (!success && isCrawling) {
    CrawlerUI.updateStatus("Chuyển trang, sẽ tiếp tục sau reload...");
  }
}

async function crawlPage(startIndex = 0) {
  try {
    CrawlerUI.updateStatus(`Đang crawl trang ${currentPage}...`);
    const jobCards = await waitForJobCards();

    for (let i = startIndex; i < jobCards.length; i++) {
      if (!isCrawling) return false;

      dismissPopups();
      const card = jobCards[i];
      card.scrollIntoView({ behavior: 'smooth' });
      await wait(1000);

      const titleEl = card.querySelector(CONFIG.selectors.title);
      const companyEl = card.querySelector(CONFIG.selectors.company);
      const locationEl = card.querySelector(CONFIG.selectors.location);
      const titleLink = card.querySelector(CONFIG.selectors.titleLink);

      const pendingJob = {
        title: titleEl?.innerText?.trim().replace(/\s*- job post\s*$/i, '') || "N/A",
        company: companyEl?.innerText?.trim() || "N/A",
        location: locationEl?.innerText?.trim() || "N/A",
        salary: "N/A",
        applyMethod: "N/A",
        link: titleLink?.href || location.href,
        page: currentPage
      };

      if (isJobDuplicate(pendingJob)) {
        log(`Bỏ qua (đã thu thập): "${pendingJob.title}" tại ${pendingJob.company}`);
        CrawlerUI.updateStatus(`Bỏ qua (đã thu thập): ${pendingJob.title}`);
        continue;
      }

      if (shouldRemoveJob(pendingJob.title)) {
        log(`Bỏ qua (từ khóa lọc): "${pendingJob.title}"`);
        CrawlerUI.updateStatus(`Bỏ qua (từ khóa lọc): ${pendingJob.title}`);
        continue;
      }

      if (!shouldKeepByLocation(pendingJob.location)) {
        log(`Bỏ qua (ngoài khu vực): "${pendingJob.title}" tại ${pendingJob.location}`);
        CrawlerUI.updateStatus(`Bỏ qua (ngoài khu vực): ${pendingJob.title} – ${pendingJob.location}`);
        continue;
      }

      chrome.storage.local.set({ pendingJob, resumeFromIndex: i + 1 });

      let salary = "N/A";
      for (const sel of CONFIG.selectors.cardSalary) {
        const els = card.querySelectorAll(sel);
        for (const el of els) {
          const txt = el.innerText?.trim();
          if (txt && looksLikeSalary(txt)) {
            salary = txt;
            break;
          }
        }
        if (salary !== "N/A") break;
      }

      let applyMethod = "N/A";
      const easyApplyBadge = card.querySelector(CONFIG.selectors.easyApplyBadge);
      if (easyApplyBadge) {
        applyMethod = 'Apply Now';
      }

      const hasSplitPane = !!document.querySelector(CONFIG.selectors.sidePanelContainers.join(", "));

      if ((salary === "N/A" || applyMethod === "N/A") && hasSplitPane) {
        try {
          if (titleLink) {
            titleLink.click();
          } else {
            card.click();
          }
          await wait(1800);

          let detailPanel = null;
          for (const sel of CONFIG.selectors.sidePanelContainers) {
            detailPanel = document.querySelector(sel);
            if (detailPanel) break;
          }
          const searchRoot = detailPanel || document;

          if (salary === "N/A") {
            const salaryEls = searchRoot.querySelectorAll(CONFIG.selectors.sidePanelSalary.join(", "));
            for (const el of salaryEls) {
              const text = el.innerText?.trim();
              if (text) {
                const s = extractSalaryFromText(text) || (looksLikeSalary(text) ? text : null);
                if (s) {
                  salary = s;
                  break;
                }
              }
            }

            if (salary === "N/A" && detailPanel) {
              const panelText = detailPanel.innerText?.slice(0, 3000) || '';
              const s = extractSalaryFromText(panelText);
              if (s) salary = s;
            }

            if (salary === "N/A") {
              const jdEl = searchRoot.querySelector(CONFIG.selectors.jobDescription);
              if (jdEl) {
                const jdSalary = extractSalaryFromDescription(jdEl.innerText);
                if (jdSalary) salary = jdSalary;
              }
            }
          }

          if (applyMethod === "N/A") {
            const candidates = [];
            for (const sel of CONFIG.selectors.sidePanelApply) {
              searchRoot.querySelectorAll(sel).forEach(el => candidates.push(el));
            }

            for (const el of candidates) {
              const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
              const isAnchor = el.tagName === 'A';
              const opensNewTab = el.getAttribute('target') === '_blank';
              const hasExternalRel = /noopener|noreferrer|external/.test(el.getAttribute('rel') || '');

              if (CONFIG.phrases.companySite.some(p => txt.includes(p))) {
                applyMethod = 'Apply on Company Site';
                break;
              }

              if (CONFIG.phrases.easyApply.some(p => txt.includes(p))) {
                applyMethod = 'Apply Now';
                break;
              }

              if (txt.includes('apply') || txt.includes('ứng tuyển') || txt.includes('postuler') || txt.includes('bewerben')) {
                if (isAnchor && (opensNewTab || hasExternalRel)) {
                  applyMethod = 'Apply on Company Site';
                } else if (isAnchor) {
                  const href = el.getAttribute('href') || '';
                  const isExternal = href.startsWith('http') && !href.includes('indeed.com');
                  applyMethod = isExternal ? 'Apply on Company Site' : 'Apply Now';
                } else {
                  applyMethod = 'Apply Now';
                }
                break;
              }
            }
          }
        } catch (e) {
          log("Không thể đọc side panel:", e);
        }
      }

      if (applyMethod === 'N/A') {
        applyMethod = easyApplyBadge ? 'Apply Now' : 'Apply on Company Site';
      }
      log(`Job: "${pendingJob.title}" | Salary: ${salary} | Apply: ${applyMethod}`);

      const job = {
        ...pendingJob,
        salary: salary,
        applyMethod: applyMethod
      };

      allJobs.push(job);
      CrawlerUI.appendToTable(job);
      chrome.storage.local.set({ allJobs, pendingJob: null });
    }

    resumeFromIndex = 0;
    chrome.storage.local.set({ resumeFromIndex: 0 });

    if (currentPage >= maxPages) {
      CrawlerUI.updateStatus("Đã đạt giới hạn số trang.");
      if (!hasExported) {
        exportCSV();
        hasExported = true;
      }
      isCrawling = false;
      chrome.storage.local.set({ isCrawling: false });
      CrawlerUI.updateButtonStates(isCrawling, allJobs.length > 0);
      return false;
    }

    const nextBtn = document.querySelector(CONFIG.selectors.nextButton);
    if (nextBtn && !nextBtn.hasAttribute("aria-disabled")) {
      currentPage++;
      chrome.storage.local.set({ currentPage, allJobs, isCrawling, maxPages });
      dismissPopups();
      nextBtn.scrollIntoView();
      nextBtn.click();
      return false;
    } else {
      CrawlerUI.updateStatus("Hoàn tất crawl tất cả trang.");
      if (!hasExported) {
        exportCSV();
        hasExported = true;
      }
      isCrawling = false;
      chrome.storage.local.set({ isCrawling: false });
      CrawlerUI.updateButtonStates(isCrawling, allJobs.length > 0);
      return false;
    }
  } catch (err) {
    console.error("Lỗi crawl page:", err);
    CrawlerUI.updateStatus("Lỗi crawl: " + err);
    return false;
  }
}

function exportCSV() {
  log("Bắt đầu xuất file CSV với", allJobs.length, "job");
  const headers = ["CompanyName", "Job Title", "Link", "Salary", "Location", "Apply Method", "Page"];
  const rows = allJobs.map(j =>
    [j.company, j.title, j.link, j.salary, j.location, j.applyMethod, j.page].map(v => {
      const val = (typeof v === 'string' || typeof v === 'number') ? v.toString() : '';
      return `"${val.replace(/"/g, '""')}"`;
    }).join(",")
  );

  const csvContent = [headers.join(","), ...rows].join("\r\n");
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
  const urlParams = new URLSearchParams(window.location.search);
  const qParam = urlParams.get('q') || document.querySelector('input[name="q"]')?.value || 'jobs';
  const cleanKeyword = qParam.trim().replace(/[\\/:*?"<>|\s]+/g, '_').toLowerCase();
  const filename = `indeed_${cleanKeyword}_${allJobs.length}jobs_${dateStr}.csv`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  log("Đã tải file CSV:", filename);
}

function bindUIEvents() {
  CrawlerUI.createPanel({
    onStart: () => {
      maxPages = CrawlerUI.getMaxPagesInput();
      chrome.storage.local.set({ maxPages });
      startCrawl();
    },
    onStop: () => {
      if (isCrawling) {
        isCrawling = false;
        chrome.storage.local.set({ isCrawling: false });
        CrawlerUI.updateStatus("Đã dừng thu thập.");
        CrawlerUI.updateButtonStates(isCrawling, allJobs.length > 0);
      }
    },
    onReset: () => {
      chrome.storage.local.clear();
      allJobs = [];
      currentPage = 1;
      isCrawling = false;
      hasExported = false;
      CrawlerUI.clearTable();
      CrawlerUI.updateStatus("Đã xóa dữ liệu.");
      CrawlerUI.updateButtonStates(isCrawling, false);
    },
    onExport: () => {
      if (!isCrawling && allJobs.length > 0) {
        exportCSV();
      }
    },
    onFilterKeywords: () => {
      const input = CrawlerUI.getFilterKeywordsInput();
      filterKeywords = parseKeywords(input);
      chrome.storage.local.set({ filterKeywords: input });

      if (filterKeywords.length === 0) {
        CrawlerUI.updateStatus("Không có từ khóa lọc. Dữ liệu giữ nguyên.");
        return;
      }

      const before = allJobs.length;
      allJobs = allJobs.filter(job => !shouldRemoveJob(job.title));
      const removed = before - allJobs.length;
      chrome.storage.local.set({ allJobs });
      CrawlerUI.rebuildTable(allJobs);
      CrawlerUI.updateStatus(`Đã loại bỏ ${removed} job(s) chứa từ khóa: ${filterKeywords.join(", ")}. Còn lại ${allJobs.length} jobs.`);
      CrawlerUI.updateButtonStates(isCrawling, allJobs.length > 0);
    },
    onFilterLocations: () => {
      const input = CrawlerUI.getFilterLocationsInput();
      filterLocations = parseKeywords(input);
      chrome.storage.local.set({ filterLocations: input });

      if (filterLocations.length === 0) {
        CrawlerUI.updateStatus("Không có khu vực lọc. Dữ liệu giữ nguyên.");
        return;
      }

      const before = allJobs.length;
      allJobs = allJobs.filter(job => shouldKeepByLocation(job.location));
      const removed = before - allJobs.length;
      chrome.storage.local.set({ allJobs });
      CrawlerUI.rebuildTable(allJobs);
      CrawlerUI.updateStatus(`Đã loại bỏ ${removed} job(s) ngoài khu vực: ${filterLocations.join(", ")}. Còn lại ${allJobs.length} jobs.`);
      CrawlerUI.updateButtonStates(isCrawling, allJobs.length > 0);
    }
  });
}

async function initialize() {
  await loadConfig();
  bindUIEvents();

  chrome.storage.local.get(["allJobs", "currentPage", "isCrawling", "maxPages", "pendingJob", "resumeFromIndex", "filterKeywords", "filterLocations"], data => {
    if (typeof data.filterKeywords === "string" && data.filterKeywords.trim()) {
      filterKeywords = parseKeywords(data.filterKeywords);
      CrawlerUI.setFilterKeywordsInput(data.filterKeywords);
    }

    if (typeof data.filterLocations === "string" && data.filterLocations.trim()) {
      filterLocations = parseKeywords(data.filterLocations);
      CrawlerUI.setFilterLocationsInput(data.filterLocations);
    }

    if (Array.isArray(data.allJobs)) {
      allJobs = data.allJobs;
      CrawlerUI.rebuildTable(allJobs);
      CrawlerUI.updateStatus(`Khôi phục ${allJobs.length} công việc đã lưu.`);
    }

    if (typeof data.currentPage === "number") {
      currentPage = data.currentPage;
    }

    if (typeof data.maxPages === "number") {
      maxPages = data.maxPages;
      CrawlerUI.setMaxPagesInput(maxPages);
    }

    if (typeof data.resumeFromIndex === "number") {
      resumeFromIndex = data.resumeFromIndex;
    }

    if (location.hostname.includes('secure.indeed.com') || location.pathname.includes('/auth')) {
      CrawlerUI.updateStatus("Vui lòng đăng nhập (chọn Continue with Google). Sau khi đăng nhập xong, hệ thống sẽ tự động cào tiếp!");
      CrawlerUI.updateButtonStates(false, allJobs.length > 0);
      return;
    }

    if (isPageNotFound()) {
      if (data.isCrawling) {
        log("Phát hiện trang 404 trong khi đang crawl...");

        if (data.pendingJob) {
          const pending = data.pendingJob;

          if (isJobDuplicate(pending)) {
            const existingKey = extractJobKey(pending.link);
            log(`Pending job đã có trong danh sách (jk=${existingKey}), bỏ qua:`, pending.title);
            CrawlerUI.updateStatus(`Bỏ qua (đã thu thập): ${pending.title} – đang quay lại...`);
          } else {
            log("Thêm pending job vào danh sách:", pending.title);
            allJobs.push(pending);
            CrawlerUI.appendToTable(pending);
            CrawlerUI.updateStatus(`Đã thêm: ${pending.title} (không lấy được salary/apply method) – đang quay lại...`);
          }

          chrome.storage.local.set({ allJobs, pendingJob: null });
        } else {
          CrawlerUI.updateStatus("Trang không tìm thấy – đang quay lại...");
        }

        setTimeout(() => {
          history.back();
        }, 1000);
      } else {
        CrawlerUI.updateStatus("Trang không tìm thấy (404).");
        CrawlerUI.updateButtonStates(false, allJobs.length > 0);
      }
      return;
    }

    if (data.isCrawling) {
      if (location.pathname.includes('/viewjob')) {
        log("Đang ở trang viewjob đơn lẻ trong khi crawl, tự động quay lại trang tìm kiếm...");
        CrawlerUI.updateStatus("Đang quay lại trang tìm kiếm...");
        setTimeout(() => history.back(), 1000);
        return;
      }
      isCrawling = true;
      CrawlerUI.updateButtonStates(true, allJobs.length > 0);

      const startIdx = resumeFromIndex || 0;
      if (startIdx > 0) {
        log("Tiếp tục crawl từ card index", startIdx, "(sau phục hồi 404)");
      }

      waitForJobCards(15000).then(() => {
        crawlLoop(startIdx);
      }).catch(err => {
        console.warn("Không thể tiếp tục vì không tìm thấy job cards:", err);
        CrawlerUI.updateStatus("Không thể tiếp tục vì không tìm thấy job cards.");
        isCrawling = false;
        chrome.storage.local.set({ isCrawling: false });
        CrawlerUI.updateButtonStates(false, allJobs.length > 0);
      });
    } else {
      CrawlerUI.updateButtonStates(false, allJobs.length > 0);
    }
  });
}

initialize();
