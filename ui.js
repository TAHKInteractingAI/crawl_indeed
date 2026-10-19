const CrawlerUI = (() => {
  function createPanel(callbacks = {}) {
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
          <input type="number" id="max-pages-input" value="5" min="1" style="width: 50px;"/>
        </label>
      </div>
      <div id="indeed-crawler-filter">
        <label>
          Loại bỏ jobs chứa từ khóa (cách nhau bằng dấu phẩy):
        </label>
        <div style="display: flex; gap: 6px; align-items: center;">
          <input type="text" id="filter-keywords-input" placeholder="vd: intern, senior, manager" value="" />
          <button id="indeed-filter-btn">Lọc</button>
        </div>
      </div>
      <div id="indeed-crawler-location-filter">
        <label>
          Chỉ giữ jobs ở khu vực (cách nhau bằng dấu phẩy):
        </label>
        <div style="display: flex; gap: 6px; align-items: center;">
          <input type="text" id="filter-locations-input" placeholder="vd: HCM, Hà Nội, Đà Nẵng, Remote" value="" />
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

    if (callbacks.onStart) {
      document.getElementById("indeed-start-btn").onclick = callbacks.onStart;
    }
    if (callbacks.onStop) {
      document.getElementById("indeed-stop-btn").onclick = callbacks.onStop;
    }
    if (callbacks.onReset) {
      document.getElementById("indeed-reset-btn").onclick = callbacks.onReset;
    }
    if (callbacks.onExport) {
      document.getElementById("indeed-csv-btn").onclick = callbacks.onExport;
    }
    if (callbacks.onFilterKeywords) {
      document.getElementById("indeed-filter-btn").onclick = callbacks.onFilterKeywords;
    }
    if (callbacks.onFilterLocations) {
      document.getElementById("indeed-location-filter-btn").onclick = callbacks.onFilterLocations;
    }
  }

  function updateButtonStates(isCrawling, hasJobs) {
    const startBtn = document.getElementById("indeed-start-btn");
    const stopBtn = document.getElementById("indeed-stop-btn");
    const csvBtn = document.getElementById("indeed-csv-btn");

    if (startBtn) startBtn.disabled = isCrawling;
    if (stopBtn) stopBtn.disabled = !isCrawling;
    if (csvBtn) csvBtn.disabled = isCrawling || !hasJobs;
  }

  function updateStatus(text) {
    const statusEl = document.getElementById("indeed-crawler-status");
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  function appendToTable(job) {
    const tbody = document.querySelector("#indeed-crawler-table tbody");
    if (!tbody) return;
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
    tbody.appendChild(row);
  }

  function rebuildTable(allJobs = []) {
    const tbody = document.querySelector("#indeed-crawler-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    allJobs.forEach(job => appendToTable(job));
  }

  function clearTable() {
    const tbody = document.querySelector("#indeed-crawler-table tbody");
    if (tbody) tbody.innerHTML = "";
  }

  function getFilterKeywordsInput() {
    return document.getElementById("filter-keywords-input")?.value || "";
  }

  function setFilterKeywordsInput(val) {
    const el = document.getElementById("filter-keywords-input");
    if (el) el.value = val;
  }

  function getFilterLocationsInput() {
    return document.getElementById("filter-locations-input")?.value || "";
  }

  function setFilterLocationsInput(val) {
    const el = document.getElementById("filter-locations-input");
    if (el) el.value = val;
  }

  function getMaxPagesInput() {
    const el = document.getElementById("max-pages-input");
    const val = parseInt(el?.value);
    return (!isNaN(val) && val > 0) ? val : 5;
  }

  function setMaxPagesInput(val) {
    const el = document.getElementById("max-pages-input");
    if (el) el.value = val;
  }

  return {
    createPanel,
    updateButtonStates,
    updateStatus,
    appendToTable,
    rebuildTable,
    clearTable,
    getFilterKeywordsInput,
    setFilterKeywordsInput,
    getFilterLocationsInput,
    setFilterLocationsInput,
    getMaxPagesInput,
    setMaxPagesInput
  };
})();
