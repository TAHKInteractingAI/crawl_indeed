// content.js (hiển thị maxPages trong giao diện và cho phép chỉnh sửa)

let isCrawling = false;
let currentPage = 1;
let allJobs = [];
let maxPages = 5; // crawl tối đa 5 trang
let hasExported = false;
let resumeFromIndex = 0; // index of the card to resume from after a 404 recovery
let filterKeywords = []; // comma-separated keywords to auto-remove jobs by title
let filterLocations = []; // comma-separated locations to keep (location-only mode)

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(...args) {
  console.log("[Indeed Crawler]", ...args);
}

// Extract the stable Indeed job key (jk parameter) from a job URL.
// This is the unique identifier for each job on Indeed, unlike the full URL
// which contains tracking params (bb, xkcb, etc.) that change every visit.
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

// Check whether a text string looks like an actual salary value.
// A valid salary must contain BOTH:
//   1. A currency indicator — either a symbol ($, €, £, ¥, ₹, ₩, ₫, ₺, ₽, ₴, ฿, RM, R$, kr, zł)
//      or a 3-letter ISO currency code (USD, EUR, GBP, etc.)
//   2. At least one digit
// Examples that PASS:  "$80,000–$105,000 a year", "€3,000/month", "$47.60 an hour",
//                      "50,000 USD", "¥500,000", "₹8,00,000 per annum"
// Examples that FAIL:  "Full-time", "Contract", "Part-time", "Temporary"
function looksLikeSalary(text) {
  if (!text) return false;

  const hasDigit = /\d/.test(text);
  if (!hasDigit) return false;

  // Common currency symbols (covers ~95% of world currencies)
  const currencySymbolPattern = /[$€£¥₹₩₫₺₽₴฿]/;
  // Multi-character currency prefixes/suffixes (e.g. RM for Malaysian Ringgit,
  // R$ for Brazilian Real, kr for Scandinavian Krone, zł for Polish Złoty)
  const multiCharCurrencyPattern = /\b(RM|R\$|kr|zł|Rp|Rs|CHF)\b/i;
  // 3-letter ISO 4217 currency codes (e.g. USD, EUR, GBP, JPY, AUD, CAD, ...)
  const isoCurrencyPattern = /\b[A-Z]{3}\b/;

  if (currencySymbolPattern.test(text)) return true;
  if (multiCharCurrencyPattern.test(text)) return true;

  // For ISO codes, also require a digit nearby to avoid false positives on
  // random 3-letter words. Since we already checked hasDigit above, just
  // verify the ISO code exists.
  if (isoCurrencyPattern.test(text)) {
    // Extra guard: the 3-letter code should look like a real currency code,
    // not a common English word. We check it's near a number.
    const isoMatch = text.match(/\b[A-Z]{3}\b/);
    if (isoMatch) {
      const code = isoMatch[0];
      // Exclude common 3-letter words that aren't currencies
      const nonCurrencyCodes = ['THE', 'AND', 'FOR', 'PER', 'DAY', 'PAY', 'JOB', 'NEW', 'OLD', 'NOT', 'BUT', 'ALL', 'ANY', 'FEW'];
      if (!nonCurrencyCodes.includes(code)) return true;
    }
  }

  return false;
}


// Check if a job is already in allJobs. Uses the jk key for accuracy;
// falls back to title+company+location if no key is available.
function isJobDuplicate(newJob) {
  const newKey = extractJobKey(newJob.link);
  return allJobs.some(existing => {
    // Primary: compare jk keys (most reliable)
    if (newKey) {
      const existingKey = extractJobKey(existing.link);
      if (existingKey && existingKey === newKey) return true;
    }
    // Fallback: compare title + company + location
    return existing.title === newJob.title
      && existing.company === newJob.company
      && existing.location === newJob.location;
  });
}

// Check if a job title matches any of the user's filter keywords.
// Returns true if the job should be REMOVED (i.e., title contains a keyword).
function shouldRemoveJob(jobTitle) {
  if (!filterKeywords.length || !jobTitle) return false;
  const lowerTitle = jobTitle.toLowerCase();
  return filterKeywords.some(kw => lowerTitle.includes(kw));
}

// Check if a job's location matches any of the user's allowed locations.
// Returns true if the job should be KEPT (i.e., location contains an allowed area).
// If no locations are specified, all jobs are kept.
function shouldKeepByLocation(jobLocation) {
  if (!filterLocations.length) return true; // no filter → keep all
  if (!jobLocation || jobLocation === "N/A") return false;
  const lowerLoc = jobLocation.toLowerCase();
  return filterLocations.some(loc => lowerLoc.includes(loc));
}

// Re-render the table from allJobs (used after filtering)
function rebuildTable() {
  const tbody = document.querySelector("#indeed-crawler-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  allJobs.forEach(job => appendToTable(job));
}

// Parse the keyword input string into a trimmed, lowercased array
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

  // Multi-language "page not found" / 404 phrases for Indeed's international sites
  const notFoundPhrases = [
    // Universal
    '404',
    // English
    'page not found', 'not found', 'the page you requested cannot be found',
    'this page could not be found', "we can't find that page",
    // French (fr.indeed.com, ca.indeed.com)
    'page introuvable', 'page non trouvée', 'cette page est introuvable',
    // German (de.indeed.com, at.indeed.com, ch.indeed.com)
    'seite nicht gefunden', 'seite wurde nicht gefunden',
    // Spanish (es.indeed.com, mx.indeed.com, ar.indeed.com)
    'página no encontrada', 'no se encontró la página', 'no se ha encontrado la página',
    // Portuguese (br.indeed.com, pt.indeed.com)
    'página não encontrada', 'página não foi encontrada',
    // Italian (it.indeed.com)
    'pagina non trovata',
    // Dutch (nl.indeed.com, be.indeed.com)
    'pagina niet gevonden',
    // Japanese (jp.indeed.com)
    'ページが見つかりません', 'ページが見つかりませんでした',
    // Korean (kr.indeed.com)
    'ページ를 찾을 수 없습니다',
    // Chinese Simplified (cn.indeed.com)
    '页面未找到', '找不到页面', '未找到页面',
    // Chinese Traditional (hk.indeed.com, tw.indeed.com)
    '頁面未找到', '找不到頁面',
    // Arabic (sa.indeed.com, ae.indeed.com)
    'الصفحة غير موجودة', 'لم يتم العثور على الصفحة',
    // Hindi (in.indeed.com)
    'पेज नहीं मिला', 'पृष्ठ नहीं मिला',
    // Polish (pl.indeed.com)
    'nie znaleziono strony', 'strona nie została znaleziona',
    // Swedish (se.indeed.com)
    'sidan hittades inte',
    // Norwegian (no.indeed.com)
    'siden ble ikke funnet',
    // Danish (dk.indeed.com)
    'siden blev ikke fundet',
    // Finnish (fi.indeed.com)
    'sivua ei löytynyt', 'sivua ei löydy',
    // Czech (cz.indeed.com)
    'stránka nenalezena', 'stránka nebyla nalezena',
    // Hungarian (hu.indeed.com)
    'az oldal nem található',
    // Romanian (ro.indeed.com)
    'pagina nu a fost găsită',
    // Turkish (tr.indeed.com)
    'sayfa bulunamadı',
    // Indonesian (id.indeed.com)
    'halaman tidak ditemukan',
    // Thai (th.indeed.com)
    'ไม่พบหน้าเว็บ', 'ไม่พบหน้า',
    // Vietnamese (vn.indeed.com)
    'không tìm thấy trang', 'trang không tồn tại',
    // Russian (ru.indeed.com)
    'страница не найдена',
    // Ukrainian (ua.indeed.com)
    'сторінку không знайдеno',
  ];

  // Check if any known 404 phrase appears in the title or body
  for (const phrase of notFoundPhrases) {
    if (combined.includes(phrase)) {
      return true;
    }
  }

  // Indeed-specific: check for error page DOM elements
  if (document.querySelector('.jobsearch-ErrorPage, .errorMessage, [data-testid="error-page"]')) {
    return true;
  }
  return false;
}

function createPanel() {
  if (document.querySelector("#indeed-crawler-panel")) return;

  const panel = document.createElement("div");
  panel.id = "indeed-crawler-panel";
  panel.innerHTML = `
    <div id="indeed-crawler-controls">
      <button id="indeed-start-btn">Bắt Đầu Thu Thập</button>
      <button id="indeed-stop-btn" disabled>Dừng Thu Thập</button>
      <button id="indeed-reset-btn">Xóa Dữ Liệu</button>
      <button id="indeed-csv-btn" disabled>Tải CSV</button>
      <label style="margin-left: 10px;">
        Số trang tối đa:
        <input type="number" id="max-pages-input" value="${maxPages}" min="1" style="width: 50px;"/>
      </label>
    </div>
    <div id="indeed-crawler-filter">
      <label>
        Loại bỏ jobs chứa từ khóa (cách nhau bằng dấu phẩy):
      </label>
      <div style="display: flex; gap: 6px; align-items: center;">
        <input type="text" id="filter-keywords-input" placeholder="vd: intern, senior, manager" value="${filterKeywords.join(', ')}" />
        <button id="indeed-filter-btn">Lọc</button>
      </div>
    </div>
    <div id="indeed-crawler-location-filter">
      <label>
        Chỉ giữ jobs ở khu vực (cách nhau bằng dấu phẩy):
      </label>
      <div style="display: flex; gap: 6px; align-items: center;">
        <input type="text" id="filter-locations-input" placeholder="vd: Remote, Houston, TX, New York" value="${filterLocations.join(', ')}" />
        <button id="indeed-location-filter-btn">Lọc Khu Vực</button>
      </div>
    </div>
    <div id="indeed-crawler-status">Chưa bắt đầu.</div>
    <div id="indeed-crawler-table-wrapper">
      <table id="indeed-crawler-table">
        <thead>
          <tr>
            <th>Company</th><th>Job Title</th><th>Link</th><th>Salary</th><th>Location</th><th>Apply Method</th><th>Page</th>
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

  document.getElementById("indeed-stop-btn").onclick = () => {
    if (isCrawling) {
      isCrawling = false;
      chrome.storage.local.set({ isCrawling: false });
      updateStatus("Đã dừng thu thập.");
      updateButtonStates();
    }
  };

  document.getElementById("indeed-reset-btn").onclick = () => {
    chrome.storage.local.clear();
    allJobs = [];
    currentPage = 1;
    isCrawling = false;
    hasExported = false;
    document.querySelector("#indeed-crawler-table tbody").innerHTML = "";
    updateStatus("Đã xóa dữ liệu.");
    updateButtonStates();
  };

  document.getElementById("indeed-csv-btn").onclick = () => {
    if (!isCrawling && allJobs.length > 0) {
      exportCSV();
    }
  };

  // Filter button: parse keywords, remove matching jobs, and re-render
  document.getElementById("indeed-filter-btn").onclick = () => {
    const input = document.getElementById("filter-keywords-input").value;
    filterKeywords = parseKeywords(input);
    chrome.storage.local.set({ filterKeywords: input });

    if (filterKeywords.length === 0) {
      updateStatus("Không có từ khóa lọc. Dữ liệu giữ nguyên.");
      return;
    }

    const before = allJobs.length;
    allJobs = allJobs.filter(job => !shouldRemoveJob(job.title));
    const removed = before - allJobs.length;
    chrome.storage.local.set({ allJobs });
    rebuildTable();
    updateStatus(`Đã loại bỏ ${removed} job(s) chứa từ khóa: ${filterKeywords.join(", ")}. Còn lại ${allJobs.length} jobs.`);
    updateButtonStates();
  };

  // Location filter button: keep only jobs in specified locations, and re-render
  document.getElementById("indeed-location-filter-btn").onclick = () => {
    const input = document.getElementById("filter-locations-input").value;
    filterLocations = parseKeywords(input);
    chrome.storage.local.set({ filterLocations: input });

    if (filterLocations.length === 0) {
      updateStatus("Không có khu vực lọc. Dữ liệu giữ nguyên.");
      return;
    }

    const before = allJobs.length;
    allJobs = allJobs.filter(job => shouldKeepByLocation(job.location));
    const removed = before - allJobs.length;
    chrome.storage.local.set({ allJobs });
    rebuildTable();
    updateStatus(`Đã loại bỏ ${removed} job(s) ngoài khu vực: ${filterLocations.join(", ")}. Còn lại ${allJobs.length} jobs.`);
    updateButtonStates();
  };
}

function updateButtonStates() {
  const startBtn = document.getElementById("indeed-start-btn");
  const stopBtn = document.getElementById("indeed-stop-btn");
  const csvBtn = document.getElementById("indeed-csv-btn");

  if (startBtn) startBtn.disabled = isCrawling;
  if (stopBtn) stopBtn.disabled = !isCrawling;
  if (csvBtn) csvBtn.disabled = isCrawling || allJobs.length === 0;
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
    <td>${job.applyMethod || "N/A"}</td>
    <td>${job.page}</td>
  `;
  document.querySelector("#indeed-crawler-table tbody").appendChild(row);
}

async function startCrawl() {
  if (isCrawling) return;
  isCrawling = true;
  hasExported = false;
  resumeFromIndex = 0;
  chrome.storage.local.set({ isCrawling, maxPages, resumeFromIndex: 0, pendingJob: null });
  updateButtonStates();
  updateStatus("Bắt đầu crawl...");
  await crawlLoop();
}

async function crawlLoop(startIndex = 0) {
  log("Crawl loop bắt đầu tại trang", currentPage, "từ card index", startIndex);
  const success = await crawlPage(startIndex);
  if (!success && isCrawling) {
    updateStatus("Chuyển trang, sẽ tiếp tục sau reload...");
  }
}

async function waitForJobCards(timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      // CẬP NHẬT SELECTOR CARD DANH SÁCH MỚI CỦA INDEED ĐỂ KHÔNG BỊ BỎ SÓT CARD
      const cards = document.querySelectorAll("div.job_seen_beacon, [class*='job_seen_beacon'], .css-1ac2vff");
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

async function crawlPage(startIndex = 0) {
  try {
    updateStatus(`Đang crawl trang ${currentPage}...`);
    const jobCards = await waitForJobCards();

    for (let i = startIndex; i < jobCards.length; i++) {
      if (!isCrawling) return false;

      const card = jobCards[i];
      card.scrollIntoView({ behavior: 'smooth' });
      await wait(1000);

      // =========================================================================
      // ĐOẠN ĐÃ ĐƯỢC SỬA HOÀN CHỈNH SELECTOR HIỆN TẠI CHỐNG LỖI N/A (MÃ NGUỒN CẬP NHẬT 2026)
      // =========================================================================
      const titleEl = card.querySelector("h2.jobTitle a, a.jcs-JobTitle, a[id^='job_'], a[data-jk]");
      const companyEl = card.querySelector('[data-testid="company-name"], [class*="companyName"], .css-1h7lukg, .css-6590bc');
      const locationEl = card.querySelector('[data-testid="text-location"], [class*="companyLocation"], .css-1restno, .css-u5v85q');
      const titleLink = card.querySelector("h2.jobTitle a, a.jcs-JobTitle, a[id^='job_']");

      const pendingJob = {
        title: titleEl?.innerText?.trim().replace(/\s*- job post\s*$/i, '') || "N/A",
        company: companyEl?.innerText?.trim() || "N/A",
        location: locationEl?.innerText?.trim() || "N/A",
        salary: "N/A",
        applyMethod: "N/A",
        link: titleLink?.href || location.href,
        page: currentPage
      };
      // =========================================================================

      // Save pending job + current index to storage BEFORE clicking the link.
      // If the click navigates to a 404, we can recover using this info.
      // Skip this card if the job was already collected (e.g. from a
      // previous 404 recovery that added the pending job to the list)
      if (isJobDuplicate(pendingJob)) {
        log(`Bỏ qua (đã thu thập): "${pendingJob.title}" tại ${pendingJob.company}`);
        updateStatus(`Bỏ qua (đã thu thập): ${pendingJob.title}`);
        continue;
      }

      // Auto-remove: skip jobs whose title matches any filter keyword
      if (shouldRemoveJob(pendingJob.title)) {
        log(`Bỏ qua (từ khóa lọc): "${pendingJob.title}"`);
        updateStatus(`Bỏ qua (từ khóa lọc): ${pendingJob.title}`);
        continue;
      }

      // Location-only: skip jobs not in specified locations
      if (!shouldKeepByLocation(pendingJob.location)) {
        log(`Bỏ qua (ngoài khu vực): "${pendingJob.title}" tại ${pendingJob.location}`);
        updateStatus(`Bỏ qua (ngoài khu vực): ${pendingJob.title} – ${pendingJob.location}`);
        continue;
      }

      chrome.storage.local.set({ pendingJob, resumeFromIndex: i + 1 });

      // Click the card to open the side detail panel (stays on the same page)
      // Then try to read salary from the panel; if it fails (e.g. expired job),
      // we just skip salary and continue
      let salary = "N/A";
      let applyMethod = "N/A";
      if (titleLink) {
        try {
          titleLink.click();
          await wait(3000);

          // =========================================================================
          // CẬP NHẬT SELECTOR TÌM CONTAINER CỦA CHI TIẾT BÊN PHẢI (SIDE PANEL) ĐỂ TRÁNH LỖI N/A
          // =========================================================================
          const panelContainers = [
            '#jobsearch-ViewjobPaneWrapper',
            '#viewJobSSRRoot',
            '.jobsearch-ViewJobLayout',
            '.jobsearch-RightPane',
            '#job_details_container',
            '[class*="ViewjobPaneWrapper"]',
            '#jobDetailsSection'
          ];
          let detailPanel = null;
          for (const sel of panelContainers) {
            detailPanel = document.querySelector(sel);
            if (detailPanel) break;
          }
          const searchRoot = detailPanel || document;

          // CẬP NHẬT SELECTOR TÌM LƯƠNG TRONG BẢNG CHI TIẾT
          const salarySpans = searchRoot.querySelectorAll('#salaryInfoAndJobType span, [data-testid="jobsearch-SalarySection"] span, .css-1cvvo1b');
          for (const span of salarySpans) {
            const text = span.innerText?.trim();
            if (text && looksLikeSalary(text)) {
              salary = text;
              break;
            }
          }

          // CẬP NHẬT SELECTOR TÌM NÚT ỨNG TUYỂN CHUẨN ĐỂ ĐỊNH VỊ PHƯƠNG THỨC ỨNG TUYỂN CHÍNH XÁC HƠN
          const applySelectors = [
            '.jobsearch-IndeedApplyButton-newDesign',
            '#indeedApplyButton',
            'button[id*="indeedApply"]',
            '[data-testid="indeed-apply-button"]',
            '.jobsearch-ApplyButton-buttonContainer a',
            '.jobsearch-ApplyButton-buttonContainer button',
            '.ia-IndeedApplyButton',
            'a.jobsearch-IndeedApplyButton-newDesign',
            'button.jobsearch-IndeedApplyButton-newDesign',
            'a[href*="apply"]'
          ];

          const candidates = [];
          for (const sel of applySelectors) {
            searchRoot.querySelectorAll(sel).forEach(el => candidates.push(el));
          }

          // 3) Classify each candidate; prefer the most specific match
          for (const el of candidates) {
            const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
            const isAnchor = el.tagName === 'A';
            const opensNewTab = el.getAttribute('target') === '_blank';
            const hasExternalRel = /noopener|noreferrer|external/.test(el.getAttribute('rel') || '');

            // ── "Apply on company site" indicators ──
            const companySitePhrases = [
              'company site', 'employer site', 'employer\'s site',
              'company website', 'employer website',
              // French
              'site de l\'entreprise', 'site de l\'employeur',
              // German
              'unternehmenswebsite', 'arbeitgeberseite',
              // Spanish
              'sitio de la empresa',
              // Portuguese
              'site da empresa',
              // Vietnamese
              'trang công ty', 'trang nhà tuyển dụng',
              // Japanese
              '企業サイト', '会社サイト',
            ];
            if (companySitePhrases.some(p => txt.includes(p))) {
              applyMethod = 'Apply on Company Site';
              break;
            }

            // ── "Apply now" / Easy Apply indicators ──
            const easyApplyPhrases = [
              'apply now', 'easily apply', 'easy apply', 'quick apply',
              // French
              'postuler maintenant', 'postuler facilement',
              // German
              'jetzt bewerben', 'schnell bewerben',
              // Spanish
              'solicitar ahora', 'postularse ahora',
              // Portuguese
              'candidatar-se agora',
              // Vietnamese
              'ứng tuyển ngay', 'ứng tuyển nhanh',
              // Japanese
              '今すぐ応募', '簡単応募',
            ];
            if (easyApplyPhrases.some(p => txt.includes(p))) {
              applyMethod = 'Apply Now';
              break;
            }

            // ── Heuristic: the word "apply" exists but no specific phrase ──
            if (txt.includes('apply') || txt.includes('postuler') || txt.includes('bewerben')
              || txt.includes('ứng tuyển') || txt.includes('応募')) {
              // Strong signal: <a target="_blank"> almost always means company site
              if (isAnchor && (opensNewTab || hasExternalRel)) {
                applyMethod = 'Apply on Company Site';
              } else if (isAnchor) {
                // Anchor without target="_blank" — check href for external domain
                const href = el.getAttribute('href') || '';
                const isExternal = href.startsWith('http') && !href.includes('indeed.com');
                applyMethod = isExternal ? 'Apply on Company Site' : 'Apply Now';
              } else {
                // <button> elements are typically Indeed's Easy Apply
                applyMethod = 'Apply Now';
              }
              break;
            }
          }

          // 4) Fallback: check the listing card itself for the "Easily apply" badge
          //    Indeed shows a small "Easily apply" / "ứng tuyển nhanh" tag on cards
          //    that support Easy Apply; its absence implies company-site apply.
          if (applyMethod === 'N/A') {
            const easyApplyBadge = card.querySelector(
              '.jobMetaDataGroup .ialbl, '           // "Easily apply" badge
              + 'span.iaLabel, '                       // Alternative badge class
              + '[data-testid="easyApply-badge"], '    // data-testid variant
              + '.indeed-apply-badge, '                // Generic badge
              + '.ialbl, '                             // Short class
              + '[class*="easyapply"]'                 // Hỗ trợ class động mới
            );
            if (easyApplyBadge) {
              applyMethod = 'Apply Now';
            } else {
              // No Easy Apply badge on the card → most likely company site
              applyMethod = 'Apply on Company Site';
            }
            log(`Apply method (từ badge fallback) cho "${pendingJob.title}": ${applyMethod}`);
          }
          log(`Apply method cho "${pendingJob.title}": ${applyMethod}`);
        } catch (e) {
          log("Không thể đọc salary/apply method từ side panel, bỏ qua:", e);
        }
      }

      const job = {
        ...pendingJob,
        salary: salary,
        applyMethod: applyMethod
      };

      allJobs.push(job);
      appendToTable(job);
      // Clear pendingJob after successful processing
      chrome.storage.local.set({ allJobs, pendingJob: null });
    }

    // Reset resumeFromIndex after finishing all cards on this page
    resumeFromIndex = 0;
    chrome.storage.local.set({ resumeFromIndex: 0 });

    if (currentPage >= maxPages) {
      updateStatus("Đã đạt giới hạn số trang.");
      if (!hasExported) {
        exportCSV();
        hasExported = true;
      }
      isCrawling = false;
      chrome.storage.local.set({ isCrawling: false });
      updateButtonStates();
      return false;
    }

    // CẬP NHẬT SELECTOR ĐỂ CHUYỂN TRANG THEO PHÂN TRANG MỚI CỦA INDEED
    const nextBtn = document.querySelector("a[aria-label='Next'], a[aria-label='Next Page'], a[data-testid='pagination-page-next'], [class*='Pagination'] a[aria-label*='Next']");

    if (nextBtn && !nextBtn.hasAttribute("aria-disabled")) {
      currentPage++;
      chrome.storage.local.set({ currentPage, allJobs, isCrawling, maxPages });
      nextBtn.scrollIntoView();
      nextBtn.click();
      return false;
    } else {
      updateStatus("Hoàn tất crawl tất cả trang.");
      if (!hasExported) {
        exportCSV();
        hasExported = true;
      }
      isCrawling = false;
      chrome.storage.local.set({ isCrawling: false });
      updateButtonStates();
      return false;
    }
  } catch (err) {
    console.error("Lỗi crawl page:", err);
    updateStatus("Lỗi crawl: " + err);
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

  // Use \r\n line endings (RFC 4180 CSV standard — works on Windows, Mac, Linux)
  const csvContent = [headers.join(","), ...rows].join("\r\n");
  // Prepend UTF-8 BOM so Excel on all OSes correctly interprets Unicode characters
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const jobCount = allJobs.length;
  // Sanitize filename: remove characters invalid on any OS
  // Windows forbids: \ / : * ? " < > |
  // Mac/Linux forbid: / and null byte
  // Also collapse multiple underscores and trim leading/trailing underscores
  const pageTitle = document.title
    .replace(/[\\/:*?"<>|\x00]/g, '_')  // Replace OS-invalid characters
    .replace(/[^\w\s-]/g, '_')           // Replace remaining non-alphanumeric
    .replace(/\s+/g, '_')                // Replace whitespace
    .replace(/_+/g, '_')                 // Collapse multiple underscores
    .replace(/^_+|_+$/g, '')             // Trim leading/trailing underscores
    .toLowerCase()
    .slice(0, 50);
  const filename = `${jobCount}_jobs_${pageTitle || 'indeed'}.csv`;

  chrome.runtime.sendMessage({ action: "saveToCSV", url, filename });
}

// --- Initialization: detect 404 first, then create panel & resume ---
function initialize() {
  // Always create the panel on Indeed pages
  createPanel();

  chrome.storage.local.get(["allJobs", "currentPage", "isCrawling", "maxPages", "pendingJob", "resumeFromIndex", "filterKeywords", "filterLocations"], data => {
    // Restore filter keywords first so they are available during crawl resume
    if (typeof data.filterKeywords === "string" && data.filterKeywords.trim()) {
      filterKeywords = parseKeywords(data.filterKeywords);
      const kwInput = document.getElementById("filter-keywords-input");
      if (kwInput) kwInput.value = data.filterKeywords;
    }

    // Restore location filter so it is available during crawl resume
    if (typeof data.filterLocations === "string" && data.filterLocations.trim()) {
      filterLocations = parseKeywords(data.filterLocations);
      const locInput = document.getElementById("filter-locations-input");
      if (locInput) locInput.value = data.filterLocations;
    }

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
    if (typeof data.resumeFromIndex === "number") {
      resumeFromIndex = data.resumeFromIndex;
    }

    // If a "Page Not Found" is detected while crawling, handle the pending job
    if (isPageNotFound()) {
      if (data.isCrawling) {
        log("Phát hiện trang 404 trong khi đang crawl...");

        // Check if there's a pending job that caused this 404
        if (data.pendingJob) {
          const pending = data.pendingJob;

          if (isJobDuplicate(pending)) {
            // Job was already collected (e.g. from a previous crawl or
            // a prior 404 recovery) — do NOT add it again
            const existingKey = extractJobKey(pending.link);
            log(`Pending job đã có trong danh sách (jk=${existingKey}), bỏ qua:`, pending.title);
            updateStatus(`Bỏ qua (đã thu thập): ${pending.title} – đang quay lại...`);
          } else {
            // Add it to the list with salary & applyMethod = "N/A" since we
            // couldn't read the side panel before the 404
            log("Thêm pending job vào danh sách:", pending.title);
            allJobs.push(pending);
            appendToTable(pending);
            updateStatus(`Đã thêm: ${pending.title} (không lấy được salary/apply method) – đang quay lại...`);
          }

          // Save updated list and clear pendingJob
          chrome.storage.local.set({ allJobs, pendingJob: null });
        } else {
          updateStatus("Trang không tìm thấy – đang quay lại...");
        }

        // Go back to the search results; resumeFromIndex is already set
        // so the crawl will skip past the card that caused the 404
        setTimeout(() => {
          history.back();
        }, 1000);
      } else {
        updateStatus("Trang không tìm thấy (404).");
        updateButtonStates();
      }
      return;
    }

    // Normal page: resume crawling if needed
    if (data.isCrawling) {
      isCrawling = true;
      updateButtonStates();

      const startIdx = resumeFromIndex || 0;
      // Clear resume index since we're about to use it
      if (startIdx > 0) {
        log("Tiếp tục crawl từ card index", startIdx, "(sau phục hồi 404)");
      }

      waitForJobCards(15000).then(() => {
        crawlLoop(startIdx);
      }).catch(err => {
        console.warn("Không thể tiếp tục vì không tìm thấy job cards:", err);
        updateStatus("Không thể tiếp tục vì không tìm thấy job cards.");
        isCrawling = false;
        chrome.storage.local.set({ isCrawling: false });
        updateButtonStates();
      });
    } else {
      updateButtonStates();
    }
  });
}

initialize();