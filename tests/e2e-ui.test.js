import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { createConsoleServer } from '../src/index.js';

const execFileAsync = promisify(execFile);

test('Browser E2E (ego-browser): full user journeys, invalid inputs, reload persistence, desktop & mobile viewports, and 0 console errors', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdx-browser-e2e-'));
  const resultPath = path.join(tmpDir, 'e2e-result.json');
  const prevWlPath = process.env.HDX_WATCHLIST_PATH;
  const prevCfgPath = process.env.HDX_CONFIG_PATH;
  process.env.HDX_WATCHLIST_PATH = path.join(tmpDir, 'watchlist.json');
  process.env.HDX_CONFIG_PATH = path.join(tmpDir, 'config.json');

  const stubClient = {
    mode: 'direct',
    recommendEvents: async (opts = {}) => ({
      engine: 'direct',
      region: {
        regionId: opts.region || 'gba',
        regionLabel: '广佛深 · 粤港澳大湾区核心（佛山 · 广州 · 深圳）',
        cities: ['佛山', '广州', '深圳'],
      },
      keywords: ['AI', '出海', '跨境'],
      stats: {
        totalFetched: 3,
        upcomingCount: 3,
        pastFilteredOut: 1,
        duplicatesRemoved: 0,
        recommendedCount: 3,
        byCityCounts: { 佛山: 1, 广州: 1, 深圳: 1 },
      },
      byCity: {
        佛山: [
          {
            rank: 1,
            id: '2882671341711',
            title: '【佛山站】2026亚马逊卖家年度增长峰会',
            time: '10/22 周四 13:30',
            location: '广东佛山南海保利皇冠假日酒店',
            organizer: '大数跨境',
            city: '佛山',
            matchedCity: '佛山',
            recommendScore: 95,
            matchedTags: ['跨境', '亚马逊'],
            daysFromNow: 7,
            url: 'https://www.huodongxing.com/event/2882671341711',
          },
        ],
        广州: [
          {
            rank: 2,
            id: '2879991112223',
            title: '2026广州国际时尚饰品及首饰展',
            time: '10/31 周六 ~ 11/01 周日',
            location: '广东广州琶洲保利世贸博览馆',
            organizer: '探世展览',
            city: '广州',
            matchedCity: '广州',
            recommendScore: 91,
            matchedTags: ['饰品', '出海'],
            daysFromNow: 16,
            url: 'https://www.huodongxing.com/event/2879991112223',
          },
        ],
        深圳: [
          {
            rank: 3,
            id: '2871552596500',
            title: '第二届中国 GEO&AI 营销智能体峰会',
            time: '10/16 周五 09:00',
            location: '广东深圳南山科技园',
            organizer: 'AI出海观察',
            city: '深圳',
            matchedCity: '深圳',
            recommendScore: 89,
            matchedTags: ['AI', '出海'],
            daysFromNow: 1,
            url: 'https://www.huodongxing.com/event/2871552596500',
          },
        ],
      },
      items: [
        {
          rank: 1,
          id: '2882671341711',
          title: '【佛山站】2026亚马逊卖家年度增长峰会',
          time: '10/22 周四 13:30',
          location: '广东佛山南海保利皇冠假日酒店',
          organizer: '大数跨境',
          city: '佛山',
          matchedCity: '佛山',
          recommendScore: 95,
          matchedTags: ['跨境', '亚马逊'],
          daysFromNow: 7,
          url: 'https://www.huodongxing.com/event/2882671341711',
        },
        {
          rank: 2,
          id: '2879991112223',
          title: '2026广州国际时尚饰品及首饰展',
          time: '10/31 周六 ~ 11/01 周日',
          location: '广东广州琶洲保利世贸博览馆',
          organizer: '探世展览',
          city: '广州',
          matchedCity: '广州',
          recommendScore: 91,
          matchedTags: ['饰品', '出海'],
          daysFromNow: 16,
          url: 'https://www.huodongxing.com/event/2879991112223',
        },
        {
          rank: 3,
          id: '2871552596500',
          title: '第二届中国 GEO&AI 营销智能体峰会',
          time: '10/16 周五 09:00',
          location: '广东深圳南山科技园',
          organizer: 'AI出海观察',
          city: '深圳',
          matchedCity: '深圳',
          recommendScore: 89,
          matchedTags: ['AI', '出海'],
          daysFromNow: 1,
          url: 'https://www.huodongxing.com/event/2871552596500',
        },
      ],
    }),
    searchEvents: async () => ({ engine: 'direct', items: [] }),
    getEventDetail: async (id) => ({
      engine: 'direct',
      id: String(id),
      title: `活动详情 #${id}`,
      startTime: '2026-10-22T13:30:00+08:00',
      endTime: '2026-10-22T17:30:00+08:00',
      address: '广东佛山南海保利皇冠假日酒店',
      organizerName: '大数跨境',
      summary: '佛山跨境卖家增长实操峰会',
      tickets: [{ id: 't1', title: '早鸟免费票', price: 0, priceDisplay: '免费', statusLabel: '可报名' }],
      formItems: [{ key: 'Name', label: '姓名', type: 'text', required: true }],
      url: `https://www.huodongxing.com/event/${id}`,
    }),
    getRanklist: async () => ({
      engine: 'direct',
      items: [
        { rank: 1, id: '2882671341711', title: '佛山站亚马逊峰会', time: '10/22 13:30', location: '广东佛山', heatScore: '99.2' },
      ],
    }),
    getTopics: async () => ({
      engine: 'direct',
      items: [
        { rank: 1, slug: 'gba-ai-2026', title: '大湾区 AI 与跨境专题', summary: '广佛深核心精选', url: 'https://www.huodongxing.com/zt/gba-ai-2026' },
      ],
    }),
    getOrganizers: async () => ({
      engine: 'direct',
      items: [
        { rank: 1, orgId: 'org-1', name: '大数跨境', eventCount: 42, fansCount: 12800, description: '专注跨境卖家峰会', url: 'https://www.huodongxing.com/org/org-1' },
      ],
    }),
  };

  const consoleServer = createConsoleServer({ client: stubClient });
  const { url } = await consoleServer.listen(0, '127.0.0.1');

  const egoScript = `
    const fs = await import("node:fs");
    const task = await taskSpace("hdx-automated-e2e-suite");
    try {
      const page = task.page("p1");
      await page.cdp("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 920,
        deviceScaleFactor: 1,
        mobile: false,
      });

      await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__hdxTelemetry && window.__hdxTelemetry.appReady === true, undefined, { timeout: 15000 });

      // 1. Verify Recommend View & City Filtering (Foshan / Guangzhou / Shenzhen)
      await page.click('[data-testid="city-tab-佛山"]', { label: "Filter Foshan events" });
      const foshanCards = await page.evaluate(() => document.querySelectorAll("#recommend-cards-grid .event-card").length);
      if (foshanCards !== 1) throw new Error("Expected 1 Foshan card, got " + foshanCards);

      await page.click('[data-testid="city-tab-ALL"]', { label: "Show all regional events" });
      const allCards = await page.evaluate(() => document.querySelectorAll("#recommend-cards-grid .event-card").length);
      if (allCards !== 3) throw new Error("Expected 3 total regional cards, got " + allCards);

      // 2. Open Event Detail Modal & Close
      await page.click('[data-testid="inspect-btn-2882671341711"]', { label: "Inspect Foshan event detail" });
      await page.waitForFunction(() => document.getElementById("event-detail-modal")?.classList.contains("open"), undefined, { timeout: 5000 });
      const modalTitle = await page.evaluate(() => document.getElementById("modal-event-title")?.textContent || "");
      if (!modalTitle.includes("2882671341711")) throw new Error("Unexpected modal title: " + modalTitle);
      await page.click("#btn-close-modal", { label: "Close event modal" });

      // 3. Save Foshan card to Watchlist directly from card action
      await page.click('[data-testid="save-btn-2882671341711"]', { label: "Save Foshan event to watchlist" });
      await page.waitForFunction(() => document.getElementById("nav-watchlist-badge")?.textContent === "1", undefined, { timeout: 5000 });

      // 4. Switch to Watchlist View & Test Invalid + Valid Form Submission
      await page.click('[data-testid="nav-watchlist"]', { label: "Open Watchlist tab" });
      await page.waitForFunction(() => document.getElementById("view-watchlist")?.classList.contains("active"), undefined, { timeout: 5000 });

      // Invalid empty submit
      await page.click("#btn-watchlist-add", { label: "Submit empty watchlist form" });
      const wlFormErrVisible = await page.evaluate(() => document.getElementById("watchlist-form-error")?.classList.contains("visible"));
      if (!wlFormErrVisible) throw new Error("Expected watchlist empty form error banner to be visible");

      // Valid manual submit + Archive + Permanent Delete
      await page.evaluate(() => {
        document.getElementById("wl-input-id").value = "2999888777666";
        document.getElementById("wl-input-title").value = "佛山顺德产业带选品对接会";
        document.getElementById("wl-input-city").value = "佛山";
        document.getElementById("wl-input-note").value = "顺德家电与饰品";
      });
      await page.click("#btn-watchlist-add", { label: "Submit valid watchlist item" });
      await page.waitForFunction(() => document.getElementById("nav-watchlist-badge")?.textContent === "2", undefined, { timeout: 5000 });

      await page.click('[data-testid="wl-archive-2999888777666"]', { label: "Archive manual item" });
      await page.waitForFunction(() => document.getElementById("wl-count-archived")?.textContent === "1", undefined, { timeout: 5000 });
      await page.click('[data-testid="wl-tab-archived"]', { label: "Open archived tab" });
      await page.click('[data-testid="wl-delete-2999888777666"]', { label: "Permanently delete archived item" });
      await page.waitForFunction(() => document.getElementById("wl-count-archived")?.textContent === "0", undefined, { timeout: 5000 });
      await page.click('[data-testid="wl-tab-active"]', { label: "Return to active watchlist tab" });

      // 5. Switch to Explore View & Traverse Subtabs
      await page.click('[data-testid="nav-explore"]', { label: "Open Explore tab" });
      await page.waitForFunction(() => document.getElementById("view-explore")?.classList.contains("active"), undefined, { timeout: 5000 });
      await page.click('[data-testid="explore-tab-topics"]', { label: "Switch to Topics subtab" });
      await page.waitForFunction(() => document.getElementById("explore-cards-grid")?.textContent?.includes("大湾区 AI 与跨境专题"), undefined, { timeout: 5000 });
      await page.click('[data-testid="explore-tab-organizers"]', { label: "Switch to Organizers subtab" });
      await page.waitForFunction(() => document.getElementById("explore-cards-grid")?.textContent?.includes("大数跨境"), undefined, { timeout: 5000 });

      // 6. Switch to Diagnose View (能读 / 能试 / 能调)
      await page.click('[data-testid="nav-diagnose"]', { label: "Open Diagnose Inspector" });
      await page.waitForFunction(() => document.getElementById("view-diagnose")?.classList.contains("active"), undefined, { timeout: 5000 });

      // 能试: Empty sample validation
      await page.evaluate(() => { document.getElementById("sample-input").value = ""; });
      await page.click("#btn-run-sample", { label: "Run empty sample test" });
      const sampleErrVisible = await page.evaluate(() => document.getElementById("sample-error-banner")?.classList.contains("visible"));
      if (!sampleErrVisible) throw new Error("Expected empty sample input error banner");

      // 能试: Blocked cashier preset
      await page.click('[data-testid="preset-cashier"]', { label: "Test cashier block preset" });
      await page.waitForFunction(() => document.getElementById("sample-result-box")?.textContent?.includes("SEC_BILLING_OR_WITHDRAW"), undefined, { timeout: 5000 });

      // 能调: Invalid minIntervalMs (30ms < 100ms)
      await page.evaluate(() => { document.getElementById("cfg-min-interval").value = "30"; });
      await page.click("#btn-save-config", { label: "Save invalid config" });
      const cfgErrVisible = await page.evaluate(() => document.getElementById("config-form-banner")?.classList.contains("error"));
      if (!cfgErrVisible) throw new Error("Expected invalid minIntervalMs error banner");

      // 能调: Valid minIntervalMs (1150ms) & persist
      await page.evaluate(() => {
        document.getElementById("cfg-min-interval").value = "1150";
        document.getElementById("cfg-default-cities").value = "佛山,广州,深圳";
      });
      await page.click("#btn-save-config", { label: "Save valid operator config" });
      await page.waitForFunction(() => document.getElementById("pacer-status-pill")?.textContent?.includes("1150ms"), undefined, { timeout: 5000 });

      // 7. Hard Reload & Verify SSOT Persistence (Watchlist + Config)
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__hdxTelemetry && window.__hdxTelemetry.appReady === true, undefined, { timeout: 15000 });

      const afterReload = await page.evaluate(() => ({
        wlBadge: document.getElementById("nav-watchlist-badge")?.textContent,
        pacerText: document.getElementById("pacer-status-pill")?.textContent,
        desktopOverflow: document.documentElement.scrollWidth > window.innerWidth,
        errors: window.__hdxTelemetry.errors,
      }));
      if (afterReload.wlBadge !== "1") throw new Error("Watchlist count did not persist after reload: " + afterReload.wlBadge);
      if (!afterReload.pacerText?.includes("1150ms")) throw new Error("Config minIntervalMs did not persist after reload: " + afterReload.pacerText);
      if (afterReload.desktopOverflow) throw new Error("Horizontal overflow detected on desktop viewport");

      // 8. Mobile Viewport (390x844) Responsive Check
      await page.cdp("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await page.waitForTimeout(150);
      const mobileCheck = await page.evaluate(() => ({
        mobileOverflow: document.documentElement.scrollWidth > window.innerWidth,
        errors: window.__hdxTelemetry.errors,
      }));
      if (mobileCheck.mobileOverflow) throw new Error("Horizontal overflow detected on mobile viewport (390x844)");
      if (mobileCheck.errors.length > 0) throw new Error("Console/page errors detected: " + JSON.stringify(mobileCheck.errors));

      fs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ ok: true, afterReload, mobileCheck }), "utf8");
    } finally {
      await task.finish({ keep: [] });
    }
  `;

  try {
    await new Promise((resolve, reject) => {
      const child = execFile(
        'ego-browser',
        ['nodejs', '-e', egoScript],
        { timeout: 45000 },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`${err.message}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`));
          } else {
            resolve({ stdout, stderr });
          }
        }
      );
      child.stdin?.end();
    });
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    assert.equal(result.ok, true);
    assert.equal(result.afterReload.wlBadge, '1');
    assert.equal(result.afterReload.desktopOverflow, false);
    assert.equal(result.mobileCheck.mobileOverflow, false);
    assert.equal(result.mobileCheck.errors.length, 0);
  } finally {
    await consoleServer.close();
    if (prevWlPath === undefined) delete process.env.HDX_WATCHLIST_PATH;
    else process.env.HDX_WATCHLIST_PATH = prevWlPath;
    if (prevCfgPath === undefined) delete process.env.HDX_CONFIG_PATH;
    else process.env.HDX_CONFIG_PATH = prevCfgPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
