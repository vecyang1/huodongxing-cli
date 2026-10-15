window.__hdxTelemetry = {
  errors: [],
  appReady: false,
};
window.addEventListener('error', (event) => {
  window.__hdxTelemetry.errors.push(String(event?.message || event?.error || 'unknown error'));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__hdxTelemetry.errors.push(String(event?.reason?.message || event?.reason || 'unhandled rejection'));
});
const _origConsoleError = console.error.bind(console);
console.error = (...args) => {
  window.__hdxTelemetry.errors.push(args.map((a) => String(a)).join(' '));
  _origConsoleError(...args);
};

const REGION_CITIES_MAP = {
  gba: '佛山,广州,深圳',
  'gba-full': '佛山,广州,深圳,东莞,珠海,香港',
  yrd: '上海,杭州,苏州',
  jjj: '北京,天津',
  sw: '成都,重庆',
};

const state = {
  activeRoute: 'recommend',
  recommendData: null,
  selectedCity: 'ALL',
  localRecSearch: '',
  watchlistAll: [],
  watchlistCounts: { total: 0, active: 0, saved: 0, attending: 0, archived: 0 },
  wlStatusFilter: 'active',
  wlSearchQuery: '',
  exploreTab: 'ranklist',
  exploreData: { ranklist: null, topics: null, organizers: null },
  configState: null,
  upstreamFix: null,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showBanner(el, message, type = 'success') {
  if (!el) return;
  if (!message) {
    el.className = 'status-banner';
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.className = `status-banner visible ${type}`;
}

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || `请求失败 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// --- Navigation & Route Management ---
function setRoute(routeName, updateHash = true) {
  const validRoutes = ['recommend', 'watchlist', 'explore', 'diagnose'];
  const target = validRoutes.includes(routeName) ? routeName : 'recommend';
  state.activeRoute = target;

  if (updateHash && window.location.hash !== `#${target}`) {
    window.history.replaceState(null, '', `#${target}`);
  }

  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === target);
  });

  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `view-${target}`);
  });

  if (target === 'explore' && !state.exploreData[state.exploreTab]) {
    loadExploreData(state.exploreTab, false);
  }
}

// --- Watchlist SSOT Operations ---
function isEventInWatchlist(eventId) {
  return state.watchlistAll.some((item) => String(item.id) === String(eventId) && item.status !== 'archived');
}

async function fetchWatchlist() {
  const allData = await apiRequest('/api/watchlist?status=all');
  state.watchlistAll = allData.items || [];
  state.watchlistCounts = allData.counts || { total: 0, active: 0, saved: 0, attending: 0, archived: 0 };

  const activeCount = state.watchlistCounts.active ?? 0;
  const pill = document.getElementById('watchlist-count-pill');
  const badge = document.getElementById('nav-watchlist-badge');
  if (pill) pill.textContent = `关注清单: ${activeCount}`;
  if (badge) badge.textContent = String(activeCount);

  const countActiveEl = document.getElementById('wl-count-active');
  const countAttendingEl = document.getElementById('wl-count-attending');
  const countArchivedEl = document.getElementById('wl-count-archived');
  const countTotalEl = document.getElementById('wl-count-total');
  if (countActiveEl) countActiveEl.textContent = String(state.watchlistCounts.active || 0);
  if (countAttendingEl) countAttendingEl.textContent = String(state.watchlistCounts.attending || 0);
  if (countArchivedEl) countArchivedEl.textContent = String(state.watchlistCounts.archived || 0);
  if (countTotalEl) countTotalEl.textContent = String(state.watchlistCounts.total || 0);

  renderWatchlistCards();
  renderRecommendCards();
}

function renderWatchlistCards() {
  const container = document.getElementById('watchlist-cards-grid');
  if (!container) return;

  const q = state.wlSearchQuery.trim().toLowerCase();
  const filtered = state.watchlistAll.filter((item) => {
    if (state.wlStatusFilter === 'active' && item.status === 'archived') return false;
    if (state.wlStatusFilter === 'attending' && item.status !== 'attending') return false;
    if (state.wlStatusFilter === 'archived' && item.status !== 'archived') return false;
    if (q) {
      const hay = `${item.id} ${item.title} ${item.city || ''} ${item.organizer || ''} ${item.note || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state" data-testid="watchlist-empty-state">当前筛选条件下暂无关注活动记录。可在“区域精选推荐”一键加入或在上方表单录入。</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((item) => {
      const cityClass = `city-pill-${escapeHtml(item.matchedCity || item.city || '深圳')}`;
      const statusLabel =
        item.status === 'attending'
          ? '<span class="pill pill-success">已确认参加</span>'
          : item.status === 'archived'
            ? '<span class="pill pill-danger">已归档</span>'
            : '<span class="pill pill-primary">待参加 / 关注中</span>';

      return `
        <article class="event-card" data-testid="watchlist-card-${escapeHtml(item.id)}" data-event-id="${escapeHtml(item.id)}">
          <div>
            <div class="card-top">
              <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
                <span class="pill ${cityClass}">${escapeHtml(item.matchedCity || item.city || '深圳')}</span>
                ${statusLabel}
              </div>
              <span class="pill" style="font-family:var(--font-mono);">ID: ${escapeHtml(item.id)}</span>
            </div>
            <h3 class="card-title" style="margin-top:0.6rem;">${escapeHtml(item.title)}</h3>
            <div class="card-meta" style="margin-top:0.5rem;">
              <div><strong>时间：</strong>${escapeHtml(item.time || '待定')}</div>
              <div><strong>地点：</strong>${escapeHtml(item.location || item.city || '--')}</div>
              <div><strong>主办：</strong>${escapeHtml(item.organizer || '--')}</div>
            </div>
            <div style="margin-top:0.75rem; display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
              <label style="font-size:0.78rem; font-weight:600;">优先级:</label>
              <select class="select-control wl-priority-select" data-id="${escapeHtml(item.id)}" data-testid="wl-priority-${escapeHtml(item.id)}" style="padding:0.25rem 0.5rem; font-size:0.8rem;">
                <option value="high" ${item.priority === 'high' ? 'selected' : ''}>高优 (High)</option>
                <option value="medium" ${item.priority === 'medium' ? 'selected' : ''}>中优 (Medium)</option>
                <option value="low" ${item.priority === 'low' ? 'selected' : ''}>低优 (Low)</option>
              </select>
            </div>
            <div style="margin-top:0.55rem; display:flex; gap:0.4rem;">
              <input
                type="text"
                class="input-control wl-note-input"
                data-id="${escapeHtml(item.id)}"
                data-testid="wl-note-input-${escapeHtml(item.id)}"
                value="${escapeHtml(item.note || '')}"
                placeholder="添加参会备注..."
                style="flex:1; padding:0.35rem 0.6rem; font-size:0.82rem;"
              />
              <button type="button" class="btn btn-secondary btn-sm wl-save-note-btn" data-id="${escapeHtml(item.id)}" data-testid="wl-save-note-${escapeHtml(item.id)}">
                保存备注
              </button>
            </div>
          </div>
          <div class="card-actions">
            <button type="button" class="btn btn-secondary btn-sm js-inspect-event" data-id="${escapeHtml(item.id)}" data-testid="wl-inspect-${escapeHtml(item.id)}">
              查看票种详情
            </button>
            <a href="/api/event/${encodeURIComponent(item.id)}/ics" class="btn btn-secondary btn-sm" download="hdx-event-${escapeHtml(item.id)}.ics" data-testid="wl-ics-${escapeHtml(item.id)}">
              下载 .ics
            </a>
            ${
              item.status !== 'attending' && item.status !== 'archived'
                ? `<button type="button" class="btn btn-primary btn-sm wl-status-btn" data-id="${escapeHtml(item.id)}" data-status="attending" data-testid="wl-attend-${escapeHtml(item.id)}">标记参加</button>`
                : ''
            }
            ${
              item.status !== 'archived'
                ? `<button type="button" class="btn btn-danger btn-sm wl-status-btn" data-id="${escapeHtml(item.id)}" data-status="archived" data-testid="wl-archive-${escapeHtml(item.id)}">归档</button>`
                : `<button type="button" class="btn btn-primary btn-sm wl-status-btn" data-id="${escapeHtml(item.id)}" data-status="saved" data-testid="wl-restore-${escapeHtml(item.id)}">恢复关注</button>
                   <button type="button" class="btn btn-danger btn-sm wl-delete-btn" data-id="${escapeHtml(item.id)}" data-testid="wl-delete-${escapeHtml(item.id)}">彻底删除</button>`
            }
          </div>
        </article>
      `;
    })
    .join('');
}

// --- Regional Recommendations (#recommend) ---
async function loadRecommendations(forceRefresh = false) {
  const regionSelect = document.getElementById('rec-region-select');
  const citiesInput = document.getElementById('rec-cities-input');
  const keywordsInput = document.getElementById('rec-keywords-input');
  const applyBtn = document.getElementById('btn-apply-recommend');

  const regionVal = regionSelect?.value || '';
  const citiesVal = citiesInput?.value?.trim() || '';
  const keywordsVal = keywordsInput?.value?.trim() || '';

  const params = new URLSearchParams();
  if (regionVal && regionVal !== 'custom' && !citiesVal) {
    params.set('region', regionVal);
  } else if (citiesVal) {
    params.set('cities', citiesVal);
  } else {
    params.set('region', 'gba');
  }
  if (keywordsVal) params.set('keywords', keywordsVal);
  params.set('limit', '24');
  if (forceRefresh) params.set('refresh', '1');

  const icsLink = document.getElementById('btn-export-recommend-ics');
  if (icsLink) {
    icsLink.href = `/api/recommend/ics?${params.toString()}`;
  }

  if (applyBtn) applyBtn.disabled = true;
  try {
    const data = await apiRequest(`/api/recommend?${params.toString()}`);
    state.recommendData = data;

    // Update header subtitle & stats
    const subtitle = document.getElementById('header-region-subtitle');
    if (subtitle && data.region) {
      subtitle.textContent = `${data.region.regionLabel} · 引擎: ${data.engine || 'auto'}`;
    }

    const stats = data.stats || {};
    const byCityCounts = stats.byCityCounts || {};
    const statRec = document.getElementById('stat-rec-count');
    const statFs = document.getElementById('stat-city-foshan');
    const statGz = document.getElementById('stat-city-guangzhou');
    const statSz = document.getElementById('stat-city-shenzhen');
    const statFiltered = document.getElementById('stat-filtered-out');

    if (statRec) statRec.textContent = String(stats.recommendedCount ?? (data.items || []).length);
    if (statFs) statFs.textContent = String(byCityCounts['佛山'] ?? 0);
    if (statGz) statGz.textContent = String(byCityCounts['广州'] ?? 0);
    if (statSz) statSz.textContent = String(byCityCounts['深圳'] ?? 0);
    if (statFiltered) {
      statFiltered.textContent = String((stats.pastFilteredOut || 0) + (stats.duplicatesRemoved || 0));
    }

    renderCityFilterPills(data.region?.cities || ['佛山', '广州', '深圳'], byCityCounts);
    renderRecommendCards();
  } catch (err) {
    showBanner(document.getElementById('global-feedback-banner'), err.message, 'error');
  } finally {
    if (applyBtn) applyBtn.disabled = false;
  }
}

function renderCityFilterPills(cities, byCityCounts = {}) {
  const container = document.getElementById('city-filter-pills');
  if (!container) return;

  if (state.selectedCity !== 'ALL' && !cities.includes(state.selectedCity)) {
    state.selectedCity = 'ALL';
  }

  const totalCount = (state.recommendData?.items || []).length;
  const pillsHtml = [
    `<button type="button" class="city-tab-btn ${state.selectedCity === 'ALL' ? 'active' : ''}" data-city="ALL" data-testid="city-tab-ALL">全部区域城市 (${totalCount})</button>`,
    ...cities.map((c) => {
      const cnt = (state.recommendData?.byCity?.[c] || []).length || byCityCounts[c] || 0;
      const isActive = state.selectedCity === c ? 'active' : '';
      return `<button type="button" class="city-tab-btn ${isActive}" data-city="${escapeHtml(c)}" data-testid="city-tab-${escapeHtml(c)}">${escapeHtml(c)} (${cnt})</button>`;
    }),
  ].join('');
  container.innerHTML = pillsHtml;
}

function renderRecommendCards() {
  const container = document.getElementById('recommend-cards-grid');
  if (!container) return;

  const data = state.recommendData;
  if (!data) {
    container.innerHTML = `<div class="empty-state">正在加载区域推荐活动...</div>`;
    return;
  }

  const sourceItems =
    state.selectedCity === 'ALL'
      ? data.items || []
      : data.byCity?.[state.selectedCity] || (data.items || []).filter((i) => i.matchedCity === state.selectedCity);

  const q = state.localRecSearch.trim().toLowerCase();
  const filtered = sourceItems.filter((item) => {
    if (!q) return true;
    const hay = `${item.id} ${item.title} ${item.organizer || ''} ${item.location || ''} ${item.matchedCity || ''} ${(item.matchedTags || []).join(' ')}`.toLowerCase();
    return hay.includes(q);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state" data-testid="recommend-empty-state">未找到匹配当前筛选条件的近期活动。</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((item, idx) => {
      const city = item.matchedCity || item.city || '深圳';
      const cityClass = `city-pill-${escapeHtml(city)}`;
      const saved = isEventInWatchlist(item.id);
      const tagsHtml = (item.matchedTags || [])
        .map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`)
        .join('');
      const daysLabel =
        item.daysFromNow === 0
          ? '今天举行'
          : item.daysFromNow != null
            ? `${item.daysFromNow} 天后`
            : '近期举行';

      return `
        <article class="event-card" data-testid="rec-card-${escapeHtml(item.id)}" data-event-id="${escapeHtml(item.id)}">
          <div>
            <div class="card-top">
              <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
                <span class="pill ${cityClass}">#${idx + 1} · ${escapeHtml(city)}</span>
                <span class="pill pill-primary">推荐指数 ${escapeHtml(item.recommendScore ?? 80)}</span>
                <span class="pill">${escapeHtml(daysLabel)}</span>
              </div>
            </div>
            <h3 class="card-title" style="margin-top:0.6rem;">${escapeHtml(item.title)}</h3>
            <div class="card-meta" style="margin-top:0.5rem;">
              <div><strong>时间：</strong>${escapeHtml(item.time || '--')}</div>
              <div><strong>地点：</strong>${escapeHtml(item.location || city)}</div>
              <div><strong>主办：</strong>${escapeHtml(item.organizer || '活动行认证主办方')}</div>
            </div>
            ${tagsHtml ? `<div class="tag-row" style="margin-top:0.6rem;">${tagsHtml}</div>` : ''}
          </div>
          <div class="card-actions">
            <button
              type="button"
              class="btn btn-secondary btn-sm js-inspect-event"
              data-id="${escapeHtml(item.id)}"
              data-testid="inspect-btn-${escapeHtml(item.id)}"
            >
              查看票种与报名表
            </button>
            <button
              type="button"
              class="btn ${saved ? 'btn-secondary' : 'btn-primary'} btn-sm js-save-watchlist"
              data-id="${escapeHtml(item.id)}"
              data-testid="save-btn-${escapeHtml(item.id)}"
            >
              ${saved ? '已在关注清单' : '加入关注清单'}
            </button>
            <a
              href="/api/event/${encodeURIComponent(item.id)}/ics"
              class="btn btn-secondary btn-sm"
              download="hdx-event-${escapeHtml(item.id)}.ics"
              data-testid="ics-btn-${escapeHtml(item.id)}"
            >
              下载 .ics
            </a>
            <a
              href="${escapeHtml(item.url || `https://www.huodongxing.com/event/${item.id}`)}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-secondary btn-sm"
              data-testid="ext-link-${escapeHtml(item.id)}"
            >
              原页面 ↗
            </a>
          </div>
        </article>
      `;
    })
    .join('');
}

// --- Explore View (#explore) ---
async function loadExploreData(subTab, forceRefresh = false) {
  state.exploreTab = subTab;
  document.querySelectorAll('#explore-subtabs .city-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.explore === subTab);
  });

  const container = document.getElementById('explore-cards-grid');
  if (!container) return;

  try {
    const endpoint =
      subTab === 'topics'
        ? '/api/topics?limit=12'
        : subTab === 'organizers'
          ? '/api/organizers?limit=12'
          : '/api/ranklist?limit=12';
    const data = await apiRequest(`${endpoint}${forceRefresh ? '&refresh=1' : ''}`);
    state.exploreData[subTab] = data.items || [];
    renderExploreCards();
  } catch (err) {
    container.innerHTML = `<div class="empty-state">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

function renderExploreCards() {
  const container = document.getElementById('explore-cards-grid');
  if (!container) return;
  const subTab = state.exploreTab;
  const items = state.exploreData[subTab] || [];

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">暂无数据。</div>`;
    return;
  }

  if (subTab === 'ranklist') {
    container.innerHTML = items
      .map((item) => {
        const saved = isEventInWatchlist(item.id);
        return `
          <article class="event-card" data-testid="explore-rank-card-${escapeHtml(item.id)}">
            <div>
              <div class="card-top">
                <span class="pill pill-primary">TOP #${escapeHtml(item.rank)}</span>
                <span class="pill">热度 ${escapeHtml(item.heatScore || '--')}</span>
              </div>
              <h3 class="card-title" style="margin-top:0.6rem;">${escapeHtml(item.title)}</h3>
              <div class="card-meta" style="margin-top:0.5rem;">
                <div><strong>时间：</strong>${escapeHtml(item.time || '--')}</div>
                <div><strong>地点：</strong>${escapeHtml(item.location || '--')}</div>
              </div>
            </div>
            <div class="card-actions">
              <button type="button" class="btn btn-secondary btn-sm js-inspect-event" data-id="${escapeHtml(item.id)}">
                查看票种详情
              </button>
              <button type="button" class="btn ${saved ? 'btn-secondary' : 'btn-primary'} btn-sm js-save-rank-item" data-id="${escapeHtml(item.id)}">
                ${saved ? '已在关注清单' : '加入关注清单'}
              </button>
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">原页面 ↗</a>
            </div>
          </article>
        `;
      })
      .join('');
    return;
  }

  if (subTab === 'topics') {
    container.innerHTML = items
      .map(
        (item) => `
          <article class="event-card" data-testid="explore-topic-card-${escapeHtml(item.id)}">
            <div>
              <div class="card-top">
                <span class="pill pill-primary">精选专题 #${escapeHtml(item.rank)}</span>
                <span class="pill">浏览 ${escapeHtml(item.views || 0)} · 活动 ${escapeHtml(item.eventCount || 0)}</span>
              </div>
              <h3 class="card-title" style="margin-top:0.6rem;">${escapeHtml(item.title)}</h3>
              <p style="font-size:0.84rem; color:var(--color-on-surface-variant); margin-top:0.45rem;">${escapeHtml(item.summary || '')}</p>
            </div>
            <div class="card-actions">
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">打开专题页面 ↗</a>
            </div>
          </article>
        `
      )
      .join('');
    return;
  }

  container.innerHTML = items
    .map(
      (item, idx) => `
        <article class="event-card" data-testid="explore-org-card-${idx}">
          <div>
            <div class="card-top">
              <span class="pill pill-primary">主办方 #${escapeHtml(item.rank || idx + 1)}</span>
              <span class="pill">活动 ${escapeHtml(item.eventsCount || 0)} · 粉丝 ${escapeHtml(item.followers || 0)}</span>
            </div>
            <h3 class="card-title" style="margin-top:0.6rem;">${escapeHtml(item.name)}</h3>
            <p style="font-size:0.84rem; color:var(--color-on-surface-variant); margin-top:0.45rem;">${escapeHtml(item.bio || '')}</p>
          </div>
          <div class="card-actions">
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">查看主办方主页 ↗</a>
          </div>
        </article>
      `
    )
    .join('');
}

// --- Event Detail Modal ---
async function openEventDetailModal(eventId) {
  const modal = document.getElementById('event-detail-modal');
  const titleEl = document.getElementById('modal-event-title');
  const idEl = document.getElementById('modal-event-id');
  const bodyEl = document.getElementById('modal-event-body');
  if (!modal || !titleEl || !idEl || !bodyEl) return;

  modal.classList.add('open');
  idEl.textContent = `ID: ${eventId}`;
  titleEl.textContent = '正在实时解析活动详情与内联票种 JSON...';
  bodyEl.innerHTML = `<div class="empty-state">正在请求 /api/event/${escapeHtml(eventId)} ...</div>`;

  try {
    const detail = await apiRequest(`/api/event/${encodeURIComponent(eventId)}`);
    titleEl.textContent = detail.title || `活动 ${eventId}`;

    const tickets = detail.tickets || [];
    const formItems = detail.formItems || [];

    const ticketsHtml =
      tickets.length > 0
        ? `<table class="data-table" style="margin-top:0.4rem;">
            <thead><tr><th>序号</th><th>票种名称</th><th>价格</th><th>审核</th><th>状态</th></tr></thead>
            <tbody>
              ${tickets
                .map(
                  (t) => `<tr>
                    <td>#${escapeHtml(t.sn)}</td>
                    <td><strong>${escapeHtml(t.title)}</strong></td>
                    <td>${escapeHtml(t.priceStr)}</td>
                    <td>${t.needApply ? '需审核' : '免审即刻出票'}</td>
                    <td>${escapeHtml(t.statusStr || (t.enabled ? '可报名' : '已停售'))}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>`
        : `<p style="font-size:0.84rem; color:var(--color-secondary);">该活动页面未内嵌公开票种数组。</p>`;

    const formHtml =
      formItems.length > 0
        ? `<div class="tag-row" style="margin-top:0.4rem;">
            ${formItems
              .map(
                (f) =>
                  `<span class="tag-chip">${escapeHtml(f.title || f.key)} (${f.required ? '必填' : '选填'})</span>`
              )
              .join('')}
          </div>`
        : `<p style="font-size:0.84rem; color:var(--color-secondary);">标准默认报名表（姓名/手机）。</p>`;

    bodyEl.innerHTML = `
      <div class="card-meta" style="margin-bottom:1rem;">
        <div><strong>开始时间：</strong>${escapeHtml(detail.startTime || '--')}</div>
        <div><strong>结束时间：</strong>${escapeHtml(detail.endTime || '--')}</div>
        <div><strong>详细地址：</strong>${escapeHtml(detail.province || '')} ${escapeHtml(detail.city || '')} ${escapeHtml(detail.address || '--')}</div>
        <div><strong>防伪令牌：</strong>${detail.registrationToken?.present ? '<span class="pill pill-success">__RequestVerificationToken 已就绪</span>' : '<span class="pill">无内联令牌</span>'}</div>
      </div>
      <div style="margin-bottom:1rem;">
        <h3 style="font-size:0.95rem;">内联票种契约 (eventTicketsJson · 共 ${tickets.length} 档)</h3>
        ${ticketsHtml}
      </div>
      <div style="margin-bottom:1rem;">
        <h3 style="font-size:0.95rem;">报名表单字段契约 (formItemsJson · 共 ${formItems.length} 项)</h3>
        ${formHtml}
      </div>
      <div class="card-actions">
        <a href="/api/event/${encodeURIComponent(eventId)}/ics" class="btn btn-primary btn-sm" download="hdx-event-${escapeHtml(eventId)}.ics" data-testid="modal-download-ics">
          下载该活动日历 (.ics)
        </a>
        <a href="${escapeHtml(detail.url || `https://www.huodongxing.com/event/${eventId}`)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
          打开活动行原始页 ↗
        </a>
      </div>
    `;
  } catch (err) {
    titleEl.textContent = `加载活动 ${eventId} 失败`;
    bodyEl.innerHTML = `<div class="status-banner visible error">${escapeHtml(err.message)}</div>`;
  }
}

// --- Diagnostic & Config Center (#diagnose — 能读 / 能试 / 能调) ---
async function loadDiagnoseConfig() {
  const data = await apiRequest('/api/diagnose/config');
  state.configState = data.configState;
  state.upstreamFix = data.upstreamOpencliFix;

  const eff = state.configState.effective || {};
  const sources = state.configState.sources || {};

  // Update header telemetry pills
  const engPill = document.getElementById('engine-status-pill');
  const pacerPill = document.getElementById('pacer-status-pill');
  if (engPill) engPill.textContent = `引擎: ${eff.engine || 'auto'}`;
  if (pacerPill) pacerPill.textContent = `频控间隔: ${eff.minIntervalMs ?? 900}ms`;

  // Populate 能读 table
  const tbody = document.getElementById('config-sources-tbody');
  if (tbody) {
    const keys = [
      'defaultRegion',
      'defaultCities',
      'defaultKeywords',
      'minIntervalMs',
      'engine',
      'session',
      'baseUrl',
    ];
    tbody.innerHTML = keys
      .map((k) => {
        const val = Array.isArray(eff[k]) ? eff[k].join(', ') : String(eff[k] ?? '');
        const src = sources[k] || 'default';
        const pillClass = src.startsWith('config_file') ? 'pill-primary' : '';
        return `
          <tr data-testid="cfg-row-${escapeHtml(k)}">
            <td><code>${escapeHtml(k)}</code></td>
            <td data-testid="cfg-val-${escapeHtml(k)}">${escapeHtml(val)}</td>
            <td><span class="pill ${pillClass}" data-testid="cfg-src-${escapeHtml(k)}">${escapeHtml(src)}</span></td>
          </tr>
        `;
      })
      .join('');
  }

  // Upstream owner fix badge
  const upBadge = document.getElementById('upstream-fix-badge');
  if (upBadge && state.upstreamFix) {
    const ok = state.upstreamFix.fixed;
    upBadge.innerHTML = `<span class="pill ${ok ? 'pill-success' : 'pill-danger'}" data-testid="upstream-status-pill">
      上游 OpenCLI events.js 状态: ${escapeHtml(state.upstreamFix.status)} (${escapeHtml(state.upstreamFix.path)})
    </span>`;
  }

  // Security rules box
  const secBox = document.getElementById('security-rules-box');
  if (secBox && state.configState.securityRules) {
    secBox.textContent = JSON.stringify(state.configState.securityRules, null, 2);
  }

  // Sync 能调 form inputs with authoritative effective config
  const regInput = document.getElementById('cfg-default-region');
  const citiesInput = document.getElementById('cfg-default-cities');
  const kwInput = document.getElementById('cfg-default-keywords');
  const intervalInput = document.getElementById('cfg-min-interval');

  if (regInput && eff.defaultRegion) regInput.value = eff.defaultRegion;
  if (citiesInput && eff.defaultCities) {
    citiesInput.value = Array.isArray(eff.defaultCities) ? eff.defaultCities.join(',') : eff.defaultCities;
  }
  if (kwInput && eff.defaultKeywords) {
    kwInput.value = Array.isArray(eff.defaultKeywords) ? eff.defaultKeywords.join(',') : eff.defaultKeywords;
  }
  if (intervalInput && eff.minIntervalMs !== undefined) {
    intervalInput.value = String(eff.minIntervalMs);
  }

  // Also sync recommendation filter defaults if not yet edited
  const recCitiesInput = document.getElementById('rec-cities-input');
  if (recCitiesInput && eff.defaultCities) {
    recCitiesInput.value = Array.isArray(eff.defaultCities) ? eff.defaultCities.join(',') : eff.defaultCities;
  }
}

async function runSampleTest(sampleStr, methodStr = 'GET') {
  const errBanner = document.getElementById('sample-error-banner');
  const resultBox = document.getElementById('sample-result-box');
  showBanner(errBanner, '');

  try {
    const data = await apiRequest('/api/diagnose/sample', {
      method: 'POST',
      body: JSON.stringify({ sample: sampleStr, method: methodStr }),
    });
    if (resultBox) {
      resultBox.textContent = JSON.stringify(data.result, null, 2);
    }
  } catch (err) {
    showBanner(errBanner, err.message, 'error');
  }
}

// --- Real-Time SSE Subscription ---
function connectSseStream() {
  const ssePill = document.getElementById('sse-status-pill');
  try {
    const es = new EventSource('/api/stream');
    es.addEventListener('connected', () => {
      if (ssePill) {
        ssePill.textContent = '实时同步已连接';
        ssePill.className = 'pill pill-success';
      }
    });
    es.addEventListener('watchlist_updated', () => {
      fetchWatchlist().catch(() => {});
    });
    es.addEventListener('config_updated', () => {
      loadDiagnoseConfig().catch(() => {});
    });
    es.onerror = () => {
      if (ssePill) {
        ssePill.textContent = '实时流重连中';
        ssePill.className = 'pill';
      }
    };
  } catch {
    // ignore if EventSource is unavailable
  }
}

// --- Event Listeners Wiring ---
function bindEvents() {
  // 1. Top Nav Tabs
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      setRoute(btn.dataset.route, true);
    });
  });

  window.addEventListener('hashchange', () => {
    const hashRoute = window.location.hash.replace(/^#/, '');
    if (hashRoute) setRoute(hashRoute, false);
  });

  // 2. Recommendation Filter Form
  const recRegionSelect = document.getElementById('rec-region-select');
  const recCitiesInput = document.getElementById('rec-cities-input');
  if (recRegionSelect && recCitiesInput) {
    recRegionSelect.addEventListener('change', () => {
      const presetCities = REGION_CITIES_MAP[recRegionSelect.value];
      if (presetCities) {
        recCitiesInput.value = presetCities;
      }
    });
  }

  const recForm = document.getElementById('recommend-filter-form');
  if (recForm) {
    recForm.addEventListener('submit', (e) => {
      e.preventDefault();
      loadRecommendations(false);
    });
  }

  const forceRefreshBtn = document.getElementById('btn-force-refresh-recommend');
  if (forceRefreshBtn) {
    forceRefreshBtn.addEventListener('click', () => {
      loadRecommendations(true);
    });
  }

  // City Filter Pills (Delegated)
  const cityPillsContainer = document.getElementById('city-filter-pills');
  if (cityPillsContainer) {
    cityPillsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.city-tab-btn');
      if (!btn) return;
      state.selectedCity = btn.dataset.city || 'ALL';
      cityPillsContainer.querySelectorAll('.city-tab-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.city === state.selectedCity);
      });
      renderRecommendCards();
    });
  }

  const localSearch = document.getElementById('rec-local-search');
  if (localSearch) {
    localSearch.addEventListener('input', () => {
      state.localRecSearch = localSearch.value || '';
      renderRecommendCards();
    });
  }

  // Recommend Cards Delegated Actions (Inspect Modal & Save Watchlist)
  const recGrid = document.getElementById('recommend-cards-grid');
  if (recGrid) {
    recGrid.addEventListener('click', async (e) => {
      const inspectBtn = e.target.closest('.js-inspect-event');
      if (inspectBtn) {
        openEventDetailModal(inspectBtn.dataset.id);
        return;
      }

      const saveBtn = e.target.closest('.js-save-watchlist');
      if (saveBtn) {
        const eventId = saveBtn.dataset.id;
        const item = (state.recommendData?.items || []).find((i) => String(i.id) === String(eventId));
        if (!item) return;
        saveBtn.disabled = true;
        try {
          await apiRequest('/api/watchlist', {
            method: 'POST',
            body: JSON.stringify({
              id: item.id,
              title: item.title,
              time: item.time,
              matchedCity: item.matchedCity,
              city: item.city,
              location: item.location,
              organizer: item.organizer,
              eventType: item.eventType,
              url: item.url,
              recommendScore: item.recommendScore,
              matchedTags: item.matchedTags,
              priority: 'high',
              status: 'saved',
            }),
          });
          await fetchWatchlist();
          showBanner(
            document.getElementById('global-feedback-banner'),
            `已将「${item.title}」持久化保存至关注清单`,
            'success'
          );
        } catch (err) {
          showBanner(document.getElementById('global-feedback-banner'), err.message, 'error');
        } finally {
          saveBtn.disabled = false;
        }
      }
    });
  }

  // 3. Watchlist Form & Actions
  const wlAddForm = document.getElementById('watchlist-add-form');
  if (wlAddForm) {
    wlAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBanner = document.getElementById('watchlist-form-error');
      showBanner(errBanner, '');

      const idVal = document.getElementById('wl-input-id')?.value || '';
      const titleVal = document.getElementById('wl-input-title')?.value || '';
      const cityVal = document.getElementById('wl-input-city')?.value || '佛山';
      const timeVal = document.getElementById('wl-input-time')?.value || '';
      const priorityVal = document.getElementById('wl-input-priority')?.value || 'high';
      const noteVal = document.getElementById('wl-input-note')?.value || '';

      try {
        await apiRequest('/api/watchlist', {
          method: 'POST',
          body: JSON.stringify({
            id: idVal,
            title: titleVal,
            city: cityVal,
            matchedCity: cityVal,
            time: timeVal || '近期活动',
            priority: priorityVal,
            note: noteVal,
            status: 'saved',
          }),
        });
        document.getElementById('wl-input-id').value = '';
        document.getElementById('wl-input-title').value = '';
        document.getElementById('wl-input-time').value = '';
        document.getElementById('wl-input-note').value = '';
        await fetchWatchlist();
        showBanner(
          document.getElementById('global-feedback-banner'),
          `已成功录入活动「${titleVal.trim()}」并持久化写入服务端清单`,
          'success'
        );
      } catch (err) {
        showBanner(errBanner, err.message, 'error');
      }
    });
  }

  const wlStatusTabs = document.getElementById('watchlist-status-tabs');
  if (wlStatusTabs) {
    wlStatusTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.city-tab-btn');
      if (!btn) return;
      state.wlStatusFilter = btn.dataset.wlStatus || 'active';
      wlStatusTabs.querySelectorAll('.city-tab-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.wlStatus === state.wlStatusFilter);
      });
      renderWatchlistCards();
    });
  }

  const wlSearch = document.getElementById('wl-search-input');
  if (wlSearch) {
    wlSearch.addEventListener('input', () => {
      state.wlSearchQuery = wlSearch.value || '';
      renderWatchlistCards();
    });
  }

  const wlGrid = document.getElementById('watchlist-cards-grid');
  if (wlGrid) {
    wlGrid.addEventListener('change', async (e) => {
      const prioSelect = e.target.closest('.wl-priority-select');
      if (prioSelect) {
        const id = prioSelect.dataset.id;
        await apiRequest(`/api/watchlist/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ priority: prioSelect.value }),
        });
        await fetchWatchlist();
      }
    });

    wlGrid.addEventListener('click', async (e) => {
      const inspectBtn = e.target.closest('.js-inspect-event');
      if (inspectBtn) {
        openEventDetailModal(inspectBtn.dataset.id);
        return;
      }

      const saveNoteBtn = e.target.closest('.wl-save-note-btn');
      if (saveNoteBtn) {
        const id = saveNoteBtn.dataset.id;
        const noteInput = wlGrid.querySelector(`.wl-note-input[data-id="${id}"]`);
        const note = noteInput ? noteInput.value : '';
        await apiRequest(`/api/watchlist/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ note }),
        });
        await fetchWatchlist();
        showBanner(document.getElementById('global-feedback-banner'), '参会备注已保存并同步', 'success');
        return;
      }

      const statusBtn = e.target.closest('.wl-status-btn');
      if (statusBtn) {
        const id = statusBtn.dataset.id;
        const status = statusBtn.dataset.status;
        await apiRequest(`/api/watchlist/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
        await fetchWatchlist();
        return;
      }

      const deleteBtn = e.target.closest('.wl-delete-btn');
      if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        await apiRequest(`/api/watchlist/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        await fetchWatchlist();
      }
    });
  }

  // 4. Explore Subtabs & Actions
  const exploreSubtabs = document.getElementById('explore-subtabs');
  if (exploreSubtabs) {
    exploreSubtabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.city-tab-btn');
      if (!btn) return;
      loadExploreData(btn.dataset.explore, false);
    });
  }

  const refreshExploreBtn = document.getElementById('btn-refresh-explore');
  if (refreshExploreBtn) {
    refreshExploreBtn.addEventListener('click', () => {
      loadExploreData(state.exploreTab, true);
    });
  }

  const exploreGrid = document.getElementById('explore-cards-grid');
  if (exploreGrid) {
    exploreGrid.addEventListener('click', async (e) => {
      const inspectBtn = e.target.closest('.js-inspect-event');
      if (inspectBtn) {
        openEventDetailModal(inspectBtn.dataset.id);
        return;
      }
      const saveRankBtn = e.target.closest('.js-save-rank-item');
      if (saveRankBtn) {
        const id = saveRankBtn.dataset.id;
        const item = (state.exploreData.ranklist || []).find((i) => String(i.id) === String(id));
        if (!item) return;
        await apiRequest('/api/watchlist', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            title: item.title,
            time: item.time,
            location: item.location,
            city: item.location,
            url: item.url,
            priority: 'medium',
            status: 'saved',
          }),
        });
        await fetchWatchlist();
        renderExploreCards();
      }
    });
  }

  // 5. Diagnose & Config Actions (能读 / 能试 / 能调)
  const reloadCfgBtn = document.getElementById('btn-reload-config');
  if (reloadCfgBtn) {
    reloadCfgBtn.addEventListener('click', () => {
      loadDiagnoseConfig();
    });
  }

  const sampleForm = document.getElementById('sample-test-form');
  if (sampleForm) {
    sampleForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const s = (document.getElementById('sample-input')?.value || '').trim();
      const m = document.getElementById('sample-method')?.value || 'GET';
      if (!s) {
        showBanner(document.getElementById('sample-error-banner'), '请输入要测试的样本链接、活动 ID 或城市/区域名称', 'error');
        return;
      }
      runSampleTest(s, m);
    });
  }

  document.querySelectorAll('.sample-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.sample || '';
      const m = btn.dataset.method || 'GET';
      const sInput = document.getElementById('sample-input');
      const mSelect = document.getElementById('sample-method');
      if (sInput) sInput.value = s;
      if (mSelect) mSelect.value = m;
      runSampleTest(s, m);
    });
  });

  const cfgForm = document.getElementById('config-edit-form');
  if (cfgForm) {
    cfgForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const banner = document.getElementById('config-form-banner');
      showBanner(banner, '');

      const defaultRegion = document.getElementById('cfg-default-region')?.value || 'gba';
      const defaultCities = document.getElementById('cfg-default-cities')?.value || '';
      const defaultKeywords = document.getElementById('cfg-default-keywords')?.value || '';
      const minIntervalMs = Number(document.getElementById('cfg-min-interval')?.value || 0);

      try {
        await apiRequest('/api/diagnose/config', {
          method: 'POST',
          body: JSON.stringify({
            updates: {
              defaultRegion,
              defaultCities,
              defaultKeywords,
              minIntervalMs,
            },
          }),
        });
        await loadDiagnoseConfig();
        await loadRecommendations(false);
        showBanner(banner, '配置已持久化写入 config.json 并完成服务端重读对账', 'success');
      } catch (err) {
        showBanner(banner, err.message, 'error');
      }
    });
  }

  const resetCfgBtn = document.getElementById('btn-reset-config');
  if (resetCfgBtn) {
    resetCfgBtn.addEventListener('click', async () => {
      const banner = document.getElementById('config-form-banner');
      showBanner(banner, '');
      try {
        await apiRequest('/api/diagnose/config', {
          method: 'POST',
          body: JSON.stringify({ reset: true }),
        });
        await loadDiagnoseConfig();
        await loadRecommendations(false);
        showBanner(banner, '已恢复出厂默认配置并清除本地覆盖文件', 'success');
      } catch (err) {
        showBanner(banner, err.message, 'error');
      }
    });
  }

  const reconcileBtn = document.getElementById('btn-run-reconcile');
  if (reconcileBtn) {
    reconcileBtn.addEventListener('click', async () => {
      const box = document.getElementById('reconcile-result-box');
      if (box) box.textContent = '正在执行契约对账...';
      try {
        const res = await apiRequest('/api/diagnose/reconcile', {
          method: 'POST',
          body: JSON.stringify({ offline: true }),
        });
        if (box) box.textContent = JSON.stringify(res.report, null, 2);
      } catch (err) {
        if (box) box.textContent = `对账出错: ${err.message}`;
      }
    });
  }

  // 6. Modal Close Actions
  const modal = document.getElementById('event-detail-modal');
  const closeModalBtn = document.getElementById('btn-close-modal');
  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener('click', () => {
      modal.classList.remove('open');
    });
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }
}

// --- Bootstrap ---
async function initApp() {
  bindEvents();
  connectSseStream();

  const initialHash = window.location.hash.replace(/^#/, '');
  if (initialHash) {
    setRoute(initialHash, false);
  }

  await loadDiagnoseConfig();
  await fetchWatchlist();
  await loadRecommendations(false);
  await runSampleTest('foshan,guangzhou,shenzhen', 'GET');
  window.__hdxTelemetry.appReady = true;
}

initApp().catch((err) => {
  showBanner(document.getElementById('global-feedback-banner'), err.message, 'error');
});
