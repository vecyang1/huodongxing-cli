import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  VERSION,
  PACKAGE_NAME,
  LICENSE,
  HuodongxingClient,
  DirectClient,
  SecurityRouteDeniedError,
  assertSafeRoute,
  inspectRouteSafety,
  assertSafeCliAction,
  RequestPacer,
  parsers,
  generateTicketsIcs,
  parseTicketDateRange,
  resolveRuntimeConfig,
  updateOperatorConfig,
  classifySample,
  runDiagnosticReconcile,
  listWatchlist,
  upsertWatchlistItem,
  updateWatchlistItem,
  deleteWatchlistItem,
  exportWatchlistIcs,
  createConsoleServer,
  formatOutput,
} from '../src/index.js';

test('package metadata & AGPL-3.0-or-later license contract', () => {
  assert.equal(PACKAGE_NAME, 'huodongxing-cli');
  assert.equal(VERSION, '1.1.0');
  assert.equal(LICENSE, 'AGPL-3.0-or-later');
});

test('buildEventsUrl fixes upstream d=ts HTTP 500 bug and validates dates', () => {
  const defaultUrl = parsers.buildEventsUrl({ keyword: '具身智能', city: '深圳' });
  assert.equal(defaultUrl.includes('d=ts'), false, 'Default search URL must NOT contain d=ts');
  assert.equal(defaultUrl.includes('qs=%E5%85%B7%E8%BA%AB%E6%99%BA%E8%83%BD'), true);

  const datedUrl = parsers.buildEventsUrl({
    keyword: 'AI',
    date: '2026-10-01',
    dateTo: '2026-10-31',
  });
  assert.equal(datedUrl.includes('d=ts'), true, 'Dated search URL must include d=ts');
  assert.equal(datedUrl.includes('date=2026-10-01'), true);
  assert.equal(datedUrl.includes('dateTo=2026-10-31'), true);

  assert.throws(
    () => parsers.buildEventsUrl({ date: '2026-02-30' }),
    /valid YYYY-MM-DD/
  );
  assert.throws(
    () => parsers.buildEventsUrl({ date: '2026-10-20', dateTo: '2026-10-10' }),
    /date must be <= dateTo/
  );
});

test('Security Guard blocks all 5 destructive/financial route categories before socket creation', () => {
  // 1. Account deletion
  assert.throws(
    () => assertSafeRoute('POST', '/account/destroy'),
    (err) => err instanceof SecurityRouteDeniedError && err.category === 'DESTRUCTIVE_ACCOUNT'
  );
  // 2. Credential mutation
  assert.throws(
    () => assertSafeRoute('POST', 'https://www.huodongxing.com/account/pwd'),
    (err) => err instanceof SecurityRouteDeniedError && err.category === 'SECURITY_CREDENTIAL_MUTATION'
  );
  // 3. Organizer event deletion/cancellation
  assert.throws(
    () => assertSafeRoute('POST', '/myevent/delete?id=123'),
    (err) => err instanceof SecurityRouteDeniedError && err.category === 'DESTRUCTIVE_ORGANIZER_EVENT'
  );
  // 4. Attendee ticket refund/cancel
  assert.throws(
    () => assertSafeRoute('POST', '/order/refund'),
    (err) => err instanceof SecurityRouteDeniedError && err.category === 'DESTRUCTIVE_ATTENDEE_TICKET'
  );
  // 5. Financial / billing / VIP purchase
  assert.throws(
    () => assertSafeRoute('POST', '/payment/cashier'),
    (err) => err instanceof SecurityRouteDeniedError && err.category === 'BILLING_FINANCIAL_MUTATION'
  );

  // Safe routes pass
  assert.equal(assertSafeRoute('GET', '/events').allowed, true);
  assert.equal(assertSafeRoute('GET', '/event/2871552596500').allowed, true);
  assert.equal(assertSafeRoute('POST', '/profile').allowed, true);
  assert.equal(assertSafeRoute('POST', '/console/userpubevents').allowed, true);

  // CLI command guard
  assert.throws(
    () => assertSafeCliAction('delete-account'),
    (err) => err instanceof SecurityRouteDeniedError
  );
  assert.throws(
    () => assertSafeCliAction('profile', { refundTicket: true }),
    (err) => err instanceof SecurityRouteDeniedError
  );
});

test('RequestPacer spaces sequential calls by minIntervalMs', async () => {
  const pacer = new RequestPacer(60);
  const timestamps = [];
  await Promise.all([
    pacer.schedule(async () => timestamps.push(Date.now())),
    pacer.schedule(async () => timestamps.push(Date.now())),
  ]);
  assert.equal(timestamps.length, 2);
  assert.equal(timestamps[1] - timestamps[0] >= 45, true);
});

test('SSOT HTML & Inline JSON parsers across all 12 functional areas', () => {
  // 1 & 2. Public Events Search
  const eventsHtml = `
    <div class="search-tab-content-item-mesh">
      <a class="item-title" href="/event/2871552596500"><span>ROBOTECH 2026深圳具身智能机器人博览会</span></a>
      <div class="item-dress"><p>2026/10/27 09:00</p><span class="item-dress-pp">广东 深圳</span></div>
      <div class="item-bottom-left"><span class="user-name">具身智能组委会</span></div>
      <i class="item-dress-icon"></i>
    </div>
  `;
  const events = parsers.parseEventsHtml(eventsHtml);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, '2871552596500');
  assert.equal(events[0].title, 'ROBOTECH 2026深圳具身智能机器人博览会');
  assert.equal(events[0].city, '广东 深圳');
  assert.equal(events[0].organizer, '具身智能组委会');

  // 3. Event Detail
  const detailHtml = `
    <title>WAIE 2026人工智能产业大会-活动行</title>
    <script>
      var ativityJson = {"Id":1871545635700,"Title":"WAIE 2026人工智能产业大会","Start":"/Date(1793062800000)/","End":"/Date(1793149200000)/","City":"深圳","Address":"福田会展中心","Setting":{"Province":"广东","Summary":"AI盛会"},"Organizers":[{"Id":"9001","Name":"OFweek维科网","Follows":1200,"Events":35}]};
      var eventTicketsJson = [{"SN":1,"Title":"专业观众票","Price":0,"PriceStr":"免费","Currency":"RMB","NeedApply":true,"Enabled":true}];
      var formItemsJson = [{"Key":"Name","Title":"姓名","Type":"text","Required":true},{"Key":"Company","Title":"公司","Type":"text","Required":true}];
      var regWebTokenName = "__RequestVerificationToken";
      var regWebTokenValue = "tok_demo_123";
    </script>
  `;
  const detail = parsers.parseEventDetailHtml(detailHtml, '1871545635700');
  assert.equal(detail.id, '1871545635700');
  assert.equal(detail.title, 'WAIE 2026人工智能产业大会');
  assert.equal(detail.tickets.length, 1);
  assert.equal(detail.tickets[0].title, '专业观众票');
  assert.equal(detail.formItems.length, 2);
  assert.equal(detail.registrationToken.present, true);

  // 4. Organizers Directory
  const orgsHtml = `
    <ul class="organizer-well-list">
      <li>
        <h4><a href="/org/8801">深圳科创协会</a></h4>
        <div>主办了 <em>42</em> 场活动，<em>3600</em> 人关注</div>
        <p>专注大湾区硬科技峰会</p>
        <p class="event"><a href="/event/2871552596500">ROBOTECH 2026</a></p>
      </li>
    </ul>
  `;
  const orgs = parsers.parseOrganizersHtml(orgsHtml);
  assert.equal(orgs.length, 1);
  assert.equal(orgs[0].name, '深圳科创协会');
  assert.equal(orgs[0].eventsCount, 42);
  assert.equal(orgs[0].followers, 3600);

  // 5. Ranklist (both <div> and production <p> card structures)
  const rankHtml = `
    <div class="popularity-son-item">
      <a class="popularity-son-item-right" href="/event/9872593983600?utm_source=rank&amp;utm_medium=web">
        <div class="item-title">Community Day 2026 · 深圳</div>
        <div class="item-data"><p>10/25 14:00</p></div>
        <div class="item-dress-pp">深圳 南山</div>
        <div class="item-look">9850</div>
      </a>
    </div>
    <div class="popularity-son-item flex">
      <a class="flex popularity-son-item-right" href="/event/5879898107700?utm_source=rank&amp;utm_medium=web">
        <img class="item-logo" title="AI's Next Frontier｜2026 AI Cloud 100 China 榜单发布暨线下峰会" />
        <div class="item-content">
          <p class="item-title">AI's Next Frontier｜2026 AI Cloud 100 China 榜单发布暨线下峰会</p>
          <p class="item-data flex"><span class="item-data-icon icon"></span>2026.10.16 - 2026.10.16</p>
          <div class="item-dress flex">
            <span class="item-dress-icon icon"></span>
            <p class="item-dress-pp">上海静安江场三路258号</p>
          </div>
        </div>
      </a>
    </div>
  `;
  const ranks = parsers.parseRanklistHtml(rankHtml);
  assert.equal(ranks.length, 2);
  assert.equal(ranks[0].id, '9872593983600');
  assert.equal(ranks[0].title, 'Community Day 2026 · 深圳');
  assert.equal(ranks[0].heatScore, 9850);
  assert.equal(ranks[1].id, '5879898107700');
  assert.equal(ranks[1].title, "AI's Next Frontier｜2026 AI Cloud 100 China 榜单发布暨线下峰会");
  assert.equal(ranks[1].time, '2026.10.16 - 2026.10.16');
  assert.equal(ranks[1].location, '上海静安江场三路258号');
  assert.ok(!ranks[1].url.includes('&amp;'));

  // 6. Special Topics
  const topicHtml = `
    <ul class="topic-list">
      <li>
        <a href="/topic/1024"></a>
        <h3>2026 AI Agent 开发者巡礼</h3>
        <div data="{&quot;Id&quot;:1024,&quot;Summary&quot;:&quot;精选AI智能体活动&quot;,&quot;ViewCount&quot;:5400,&quot;EventNumber&quot;:12}"></div>
      </li>
    </ul>
  `;
  const topics = parsers.parseTopicsHtml(topicHtml);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].id, '1024');
  assert.equal(topics[0].views, 5400);

  // 7. User Timeline
  const timelineHtml = `
    <ul class="user-event-timeline">
      <li><div>Wednesday, October 14, 2026</div></li>
      <li>
        <a class="media" href="/event/1873445732700">
          <span class="user-event-label-signup"></span>
          <h3>深圳年度短剧出海盛事</h3>
          <i class="icon-time"></i> 2026-10-28 14:00
          <i class="icon-place"></i> 广东 深圳 南山区
        </a>
      </li>
    </div><div id="timeline_loading"></div>
  `;
  const timeline = parsers.parseTimelineHtml(timelineHtml);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].id, '1873445732700');
  assert.equal(timeline[0].actionType, 'signup');

  // 8. User Tickets & Ticket Detail
  const ticketsHtml = `
    <a href="#user-ticket-success"><span>1</span></a>
    <div id="user-ticket-success">
      <li><div class="media">
        <h3><a href="/event/2871552596500">ROBOTECH 2026深圳具身智能机器人博览会</a></h3>
        <div class="time">活动时间：2026-10-27 09:00即将开始</div>
        <a href="/user/tikcets?tids=990011223344"></a>
        <textarea id="ticket_print_span_990011223344">
          &lt;img src=&quot;/qrcode/990011223344&quot; /&gt;
          报名时间：2026-10-14 10:00&lt;br/&gt;
          &lt;i class=&quot;icon-time&quot;&gt;&lt;/i&gt; 10/27 09:00 至 10/29 16:30
          &lt;i class=&quot;icon-place&quot;&gt;&lt;/i&gt; 深圳国际会展中心
          &lt;td&gt;DemoUser&lt;/td&gt;&lt;td&gt;138****0000&lt;/td&gt;&lt;td&gt;VIP观众票&lt;/td&gt;&lt;td&gt;免费&lt;/td&gt;
        </textarea>
      </div></li>
    </div>
  `;
  const parsedTickets = parsers.parseTicketsHtml(ticketsHtml);
  assert.equal(parsedTickets.counts.valid, 1);
  assert.equal(parsedTickets.tickets.length, 1);
  assert.equal(parsedTickets.tickets[0].ticketNo, '990011223344');
  assert.equal(parsedTickets.tickets[0].venue, '深圳国际会展中心');

  const ticketDetail = parsers.parseTicketDetailHtml(`
    <div>订单号：8800112233</div>
    <div>下单时间：2026-10-14 10:00</div>
    <a href="/event/2871552596500">ROBOTECH 2026</a>
    <div>电子票号 990011223344</div>
    <div>姓名：DemoUser</div>
    <div>手机：138****0000</div>
  `);
  assert.equal(ticketDetail.ticketNo, '990011223344');
  assert.equal(ticketDetail.orderNo, '8800112233');

  // 9. Favorites & Following
  const favHtml = `
    <div class="tab-pane active">
      <li><a href="/event/1871545635700"></a>
        <h3>WAIE 2026人工智能产业大会</h3>
        <div>所属主办方：OFweek</div>
        <div>活动时间：2026-10-27 09:00即将开始</div>
      </li>
    </div>
    <div id="user-favorite-org">
      <li><h3><a href="/org/8801">深圳科创协会</a></h3><p>硬科技峰会主办方</p></li>
    </div>
  `;
  const favs = parsers.parseFavoritesHtml(favHtml);
  assert.equal(favs.length, 1);
  assert.equal(favs[0].id, '1871545635700');
  const following = parsers.parseFollowingHtml(favHtml);
  assert.equal(following.length, 1);
  assert.equal(following[0].name, '深圳科创协会');

  // 10. Account Profile
  const profileHtml = `
    <form id="edit_profile_form">
      <input name="Account" value="100001" />
      <input name="Nick" value="DemoUser" />
      <input name="RealName" value="DemoUser" />
      <input name="Brief" value="AI Explorer" />
      <input type="radio" name="Gender" value="1" checked />
    </form>
  `;
  const profile = parsers.parseProfileHtml(profileHtml);
  assert.equal(profile.account, '100001');
  assert.equal(profile.nick, 'DemoUser');
  assert.equal(profile.brief, 'AI Explorer');
  assert.equal(profile.gender, '1');

  // 11 & 12. Organizer Console Home & EventAdmin
  const consoleHtml = `
    <script>
      var currentUser = {"Account":"100001","Nick":"DemoUser","RealName":"DemoUser","Brief":"AI Explorer","BalanceBean":50,"OrgCount":1};
      var mUserState = {"UserId":"100001","Name":"DemoUser","AuthType":1};
      var tabs = [
        {value: -3, label: '全部状态', total: "2"},
        {value: 1, label: '已发布', total: "2"}
      ];
    </script>
  `;
  const cHome = parsers.parseConsoleHomeHtml(consoleHtml);
  assert.equal(cHome.account, '100001');
  assert.equal(cHome.isAuthenticated, true);

  const cEvents = parsers.parseConsoleEventsHtml(
    consoleHtml,
    '<a href="/event/2871552596500">ROBOTECH 2026</a>'
  );
  assert.equal(cEvents.statusTabs.length, 2);
  assert.equal(cEvents.events.length, 1);
  assert.equal(cEvents.events[0].id, '2871552596500');
});

test('RFC 5545 iCalendar (.ics) exporter generates valid VCALENDAR & VEVENT blocks', () => {
  const range = parseTicketDateRange('2026-10-27 09:00', '10/27 09:00 至 10/29 16:30');
  assert.equal(range.start.toISOString(), '2026-10-27T01:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-10-29T08:30:00.000Z');

  const ics = generateTicketsIcs([
    {
      ticketNo: '990011223344',
      eventId: '2871552596500',
      eventTitle: 'ROBOTECH 2026深圳具身智能机器人博览会',
      eventTime: '2026-10-27 09:00',
      timeRange: '10/27 09:00 至 10/29 16:30',
      venue: '深圳国际会展中心',
      ticketTitle: '专业观众票',
      price: '免费',
      statusLabel: '有效票',
      eventUrl: 'https://www.huodongxing.com/event/2871552596500',
    },
  ]);
  assert.equal(ics.includes('BEGIN:VCALENDAR'), true);
  assert.equal(ics.includes('BEGIN:VEVENT'), true);
  assert.equal(ics.includes('UID:urn:hdx:ticket:990011223344'), true);
  assert.equal(ics.includes('SUMMARY:ROBOTECH 2026深圳具身智能机器人博览会'), true);
  assert.equal(ics.includes('LOCATION:深圳国际会展中心'), true);
});

test('Diagnostic reconciler (能读 / 能试 / 能调) and formatters', async () => {
  const tmpConfig = path.join(os.tmpdir(), `hdx-test-config-${Date.now()}.json`);
  process.env.HDX_CONFIG_PATH = tmpConfig;

  try {
    // 能调: update operator config
    const updated = updateOperatorConfig({ minIntervalMs: 1100 });
    assert.equal(updated.effective.minIntervalMs, 1100);
    assert.equal(updated.sources.minIntervalMs.startsWith('config_file'), true);

    // 能调: reset config
    const resetState = updateOperatorConfig({}, { reset: true });
    assert.equal(resetState.effective.minIntervalMs, 900);

    // 能试: sample classification
    const allowedSample = classifySample('2871552596500');
    assert.equal(allowedSample.securityVerdict.allowed, true);
    assert.equal(allowedSample.matchedRoute.id, 'ROUTE_EVENT_DETAIL');

    const blockedSample = classifySample('https://www.huodongxing.com/payment/cashier', { method: 'POST' });
    assert.equal(blockedSample.securityVerdict.allowed, false);
    assert.equal(blockedSample.securityVerdict.ruleId, 'SEC_BILLING_OR_WITHDRAW');

    // Offline reconcile
    const diag = await runDiagnosticReconcile(null, { offline: true });
    assert.equal(diag.ok, true);
    assert.equal(diag.contracts.dtsQueryRegression.ok, true);
  } finally {
    if (fs.existsSync(tmpConfig)) fs.unlinkSync(tmpConfig);
    delete process.env.HDX_CONFIG_PATH;
  }

  // Formatters
  const rows = [{ id: '1', title: 'Test Event', city: '深圳' }];
  assert.equal(formatOutput(rows, 'csv').includes('id,title,city'), true);
  assert.equal(formatOutput(rows, 'md').includes('| id | title | city |'), true);
  assert.equal(formatOutput(rows, 'table').includes('Test Event'), true);
});

test('DirectClient reversible updateProfile dryRun and post-write re-read verification', async () => {
  let currentBrief = 'Initial Bio';
  const mockFetch = async (url, init = {}) => {
    if (init.method === 'POST' && url.endsWith('/profile')) {
      const params = new URLSearchParams(init.body);
      currentBrief = params.get('Brief') || '';
      return {
        status: 302,
        headers: new Map([['location', '/account/profile']]),
        text: async () => '',
      };
    }
    return {
      status: 200,
      headers: new Map(),
      text: async () => `
        <form id="edit_profile_form">
          <input name="Account" value="100001" />
          <input name="Nick" value="DemoUser" />
          <input name="RealName" value="DemoUser" />
          <input name="Brief" value="${currentBrief}" />
        </form>
      `,
    };
  };

  const client = new DirectClient({
    cookie: 'HDXWAFID=test; AccupassWeb=test',
    minIntervalMs: 0,
    fetchImpl: mockFetch,
  });

  const preview = await client.updateProfile({ brief: 'Updated Bio' }, { dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.mutated, false);
  assert.equal(currentBrief, 'Initial Bio');

  const executed = await client.updateProfile({ brief: 'Updated Bio' }, { dryRun: false });
  assert.equal(executed.dryRun, false);
  assert.equal(executed.mutated, true);
  assert.equal(executed.verified, true);
  assert.equal(executed.after.brief, 'Updated Bio');
});

test('Region & multi-city resolution (Foshan · Guangzhou · Shenzhen), promo filtering, and regional recommendation engine', () => {
  assert.equal(parsers.normalizeCityName('foshan'), '佛山');
  assert.equal(parsers.normalizeCityName('guangzhou'), '广州');
  assert.equal(parsers.normalizeCityName('shenzhen'), '深圳');
  assert.equal(parsers.normalizeCityName('佛山市'), '佛山');

  const gbaPreset = parsers.resolveRegionOrCities({ region: 'gba' });
  assert.deepEqual(gbaPreset.cities, ['佛山', '广州', '深圳']);

  const csvCities = parsers.resolveRegionOrCities({ cities: 'foshan, guangzhou, shenzhen' });
  assert.deepEqual(csvCities.cities, ['佛山', '广州', '深圳']);

  const defaultResolved = parsers.resolveRegionOrCities({});
  assert.deepEqual(defaultResolved.cities, ['佛山', '广州', '深圳']);

  // Verify buildEventsUrl normalizes English city names
  const fsUrl = parsers.buildEventsUrl({ city: 'foshan' });
  assert.equal(fsUrl.includes('city=%E4%BD%9B%E5%B1%B1'), true);

  // Verify parseEventsHtml filters out static platform promo banners (empty .item-dress) and past events when upcomingOnly=true
  const mixedHtml = `
    <div class="search-tab-content-item-mesh">
      <a class="item-title" href="/event/9850851898587"><span>展·势 产业引力场</span></a>
      <div class="item-dress flex"></div>
      <div class="item-mesh-bottom"><p class="user-name">活动行</p></div>
    </div>
    <div class="search-tab-content-item-mesh">
      <a class="item-title" href="/event/4858461236700">五月旧活动</a>
      <div class="item-dress flex"><p>05/10 周日 20:00</p><p class="item-dress-pp">广东佛山</p></div>
      <div class="item-mesh-bottom"><p class="user-name">旧主办方</p></div>
    </div>
    <div class="search-tab-content-item-mesh">
      <a class="item-title" href="/event/2882671341711">TikTok Shop全托管产业带优质好商招商会——佛山顺德站</a>
      <div class="item-dress flex"><p>10/30 周五 13:30</p><p class="item-dress-pp">广东佛山</p><i class="item-dress-icon"></i></div>
      <div class="item-mesh-bottom"><p class="user-name">TikTok出海</p></div>
    </div>
  `;
  const refDate = new Date('2026-10-15T00:00:00Z');
  const parsedUpcoming = parsers.parseEventsHtml(mixedHtml, {
    upcomingOnly: true,
    referenceDate: refDate,
  });
  assert.equal(parsedUpcoming.length, 1);
  assert.equal(parsedUpcoming[0].id, '2882671341711');

  // Verify scoreAndRankRegionalEvents across 佛山, 广州, 深圳
  const scored = parsers.scoreAndRankRegionalEvents(
    {
      佛山: [
        {
          id: '2882671341711',
          title: 'TikTok Shop全托管产业带优质好商招商会——佛山顺德站',
          time: '10/30 周五 13:30',
          eventType: 'offline',
          city: '广东佛山',
          location: '广东佛山',
          organizer: 'TikTok官方',
          isFeatured: true,
          url: 'https://www.huodongxing.com/event/2882671341711',
        },
      ],
      广州: [
        {
          id: '6859860972400',
          title: '2026广州国际时尚饰品及首饰展',
          time: '10/31 周六 ~ 11/01 周日',
          eventType: 'offline',
          city: '广东广州',
          location: '广东广州',
          organizer: '探世展览',
          isFeatured: false,
          url: 'https://www.huodongxing.com/event/6859860972400',
        },
      ],
      深圳: [
        {
          id: '2869822649411',
          title: '第二届中国 GEO&AI 营销智能体峰会',
          time: '10/16 周五 09:00',
          eventType: 'offline',
          city: '广东深圳',
          location: '广东深圳',
          organizer: 'AI出海观察',
          isFeatured: true,
          url: 'https://www.huodongxing.com/event/2869822649411',
        },
      ],
    },
    { referenceDate: refDate }
  );

  assert.equal(scored.stats.recommendedCount, 3);
  assert.equal(scored.byCity['佛山'].length, 1);
  assert.equal(scored.byCity['广州'].length, 1);
  assert.equal(scored.byCity['深圳'].length, 1);
  assert.equal(scored.items[0].recommendScore > 50, true);
});

test('Persistent Watchlist Store CRUD, soft-delete/restore, validation & RFC 5545 .ics export', () => {
  const tmpWl = path.join(os.tmpdir(), `hdx-test-watchlist-${Date.now()}.json`);
  process.env.HDX_WATCHLIST_PATH = tmpWl;

  try {
    // 1. Validation rejects invalid ID or missing title
    assert.throws(
      () => upsertWatchlistItem({ id: 'abc', title: 'Invalid ID' }),
      (err) => err.statusCode === 400
    );
    assert.throws(
      () => upsertWatchlistItem({ id: '2882671341711', title: '   ' }),
      (err) => err.statusCode === 400
    );

    // 2. Create item
    const created = upsertWatchlistItem({
      id: 'https://www.huodongxing.com/event/2882671341711',
      title: 'TikTok Shop全托管产业带优质好商招商会——佛山顺德站',
      city: 'foshan',
      time: '10/30 周五 13:30',
      priority: 'high',
      note: '顺德跨境选品对接',
    });
    assert.equal(created.action, 'created');
    assert.equal(created.item.id, '2882671341711');
    assert.equal(created.item.matchedCity, '佛山');
    assert.equal(created.watchlist.counts.active, 1);

    // 3. Update priority, note, and status
    const updated = updateWatchlistItem('2882671341711', {
      status: 'attending',
      priority: 'medium',
      note: '已报名确认参加',
    });
    assert.equal(updated.item.status, 'attending');
    assert.equal(updated.item.priority, 'medium');
    assert.equal(updated.item.note, '已报名确认参加');

    // 4. Export .ics
    const exported = exportWatchlistIcs({ status: 'active' });
    assert.equal(exported.count, 1);
    assert.equal(exported.ics.includes('UID:urn:hdx:ticket:2882671341711'), true);
    assert.equal(exported.ics.includes('TikTok Shop全托管产业带优质好商招商会'), true);

    // 5. Soft-delete (archive) & restore
    const archived = updateWatchlistItem('2882671341711', { status: 'archived' });
    assert.equal(archived.watchlist.counts.active, 0);
    assert.equal(archived.watchlist.counts.archived, 1);

    const restored = updateWatchlistItem('2882671341711', { status: 'saved' });
    assert.equal(restored.watchlist.counts.active, 1);

    // 6. Permanent delete
    const deleted = deleteWatchlistItem('2882671341711');
    assert.equal(deleted.watchlist.counts.total, 0);
    assert.equal(listWatchlist({ status: 'all' }).count, 0);
  } finally {
    if (fs.existsSync(tmpWl)) fs.unlinkSync(tmpWl);
    delete process.env.HDX_WATCHLIST_PATH;
  }
});

test('Web Console HTTP Server (/api/*, static assets, validation, config persistence & .ics downloads)', async () => {
  const tmpCfg = path.join(os.tmpdir(), `hdx-srv-cfg-${Date.now()}.json`);
  const tmpWl = path.join(os.tmpdir(), `hdx-srv-wl-${Date.now()}.json`);
  process.env.HDX_CONFIG_PATH = tmpCfg;
  process.env.HDX_WATCHLIST_PATH = tmpWl;

  const mockClient = {
    engine: 'auto',
    configState: resolveRuntimeConfig(),
    sharedPacer: new RequestPacer(0),
    recommendEvents: async (opts) => ({
      engine: 'direct',
      region: parsers.resolveRegionOrCities(opts),
      keywords: ['AI', '出海'],
      count: 2,
      stats: {
        totalFetched: 2,
        pastFilteredOut: 0,
        duplicatesRemoved: 0,
        recommendedCount: 2,
        byCityCounts: { 佛山: 1, 广州: 1, 深圳: 0 },
      },
      byCity: {
        佛山: [
          {
            id: '2882671341711',
            title: '佛山顺德跨境出海峰会',
            time: '10/30 周五 13:30',
            matchedCity: '佛山',
            city: '广东佛山',
            location: '广东佛山',
            organizer: '出海协会',
            recommendScore: 86,
            matchedTags: ['出海', '跨境'],
            url: 'https://www.huodongxing.com/event/2882671341711',
          },
        ],
        广州: [
          {
            id: '6859860972400',
            title: '2026广州国际时尚饰品及首饰展',
            time: '10/31 周六 09:00',
            matchedCity: '广州',
            city: '广东广州',
            location: '广东广州',
            organizer: '探世展览',
            recommendScore: 78,
            matchedTags: ['饰品', '时尚'],
            url: 'https://www.huodongxing.com/event/6859860972400',
          },
        ],
        深圳: [],
      },
      items: [
        {
          rank: 1,
          id: '2882671341711',
          title: '佛山顺德跨境出海峰会',
          time: '10/30 周五 13:30',
          matchedCity: '佛山',
          city: '广东佛山',
          location: '广东佛山',
          organizer: '出海协会',
          recommendScore: 86,
          matchedTags: ['出海', '跨境'],
          url: 'https://www.huodongxing.com/event/2882671341711',
        },
        {
          rank: 2,
          id: '6859860972400',
          title: '2026广州国际时尚饰品及首饰展',
          time: '10/31 周六 09:00',
          matchedCity: '广州',
          city: '广东广州',
          location: '广东广州',
          organizer: '探世展览',
          recommendScore: 78,
          matchedTags: ['饰品', '时尚'],
          url: 'https://www.huodongxing.com/event/6859860972400',
        },
      ],
    }),
    getEventDetail: async (id) => ({
      engine: 'direct',
      id,
      title: `活动详情 ${id}`,
      startTime: '2026-10-30T05:30:00.000Z',
      endTime: '2026-10-30T09:30:00.000Z',
      province: '广东',
      city: '佛山',
      address: '顺德展览中心',
      tickets: [{ sn: 1, title: '免费观众票', price: 0, priceStr: '免费', enabled: true, statusStr: '可报名' }],
      formItems: [{ key: 'Name', title: '姓名', required: true }],
      registrationToken: { present: true },
      url: `https://www.huodongxing.com/event/${id}`,
    }),
    getRanklist: async () => ({
      engine: 'direct',
      items: [{ rank: 1, id: '2871552596500', title: 'ROBOTECH 2026', heatScore: 9900, time: '10/27', location: '深圳', url: 'https://www.huodongxing.com/event/2871552596500' }],
    }),
    getTopics: async () => ({
      engine: 'direct',
      items: [{ rank: 1, id: '1024', title: 'AI 专题', views: 5000, eventCount: 10, summary: '精选AI活动', url: 'https://www.huodongxing.com/topic/1024' }],
    }),
    getOrganizers: async () => ({
      engine: 'direct',
      items: [{ rank: 1, name: '科创协会', eventsCount: 20, followers: 1500, bio: '大湾区峰会', url: 'https://www.huodongxing.com/org/1' }],
    }),
  };

  const consoleServer = createConsoleServer({ client: mockClient, cacheTtlMs: 0 });
  const { url } = await consoleServer.listen(0, '127.0.0.1');

  try {
    // Static HTML & assets
    const indexRes = await fetch(`${url}/`);
    assert.equal(indexRes.status, 200);
    const indexHtml = await indexRes.text();
    assert.equal(indexHtml.includes('活动行 · 区域智能推荐与诊断对账中心'), true);

    // Health check
    const health = await (await fetch(`${url}/api/health`)).json();
    assert.equal(health.ok, true);

    // Recommendations & .ics download
    const rec = await (await fetch(`${url}/api/recommend?region=gba`)).json();
    assert.equal(rec.ok, true);
    assert.equal(rec.items.length, 2);

    const recIcsRes = await fetch(`${url}/api/recommend/ics?region=gba`);
    assert.equal(recIcsRes.status, 200);
    assert.equal((await recIcsRes.text()).includes('BEGIN:VCALENDAR'), true);

    // Watchlist validation error (400) & valid CRUD
    const badWl = await fetch(`${url}/api/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '', title: '' }),
    });
    assert.equal(badWl.status, 400);

    const goodWl = await (
      await fetch(`${url}/api/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: '2882671341711',
          title: '佛山顺德跨境出海峰会',
          city: '佛山',
        }),
      })
    ).json();
    assert.equal(goodWl.ok, true);
    assert.equal(goodWl.watchlist.counts.active, 1);

    // Diagnose sample validation & config update
    const badSample = await fetch(`${url}/api/diagnose/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample: '   ' }),
    });
    assert.equal(badSample.status, 400);

    const cfgUpdate = await (
      await fetch(`${url}/api/diagnose/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: { minIntervalMs: 950, defaultCities: 'foshan,guangzhou,shenzhen' } }),
      })
    ).json();
    assert.equal(cfgUpdate.ok, true);
    assert.equal(cfgUpdate.configState.effective.minIntervalMs, 950);
    assert.deepEqual(cfgUpdate.configState.effective.defaultCities, ['佛山', '广州', '深圳']);
  } finally {
    await consoleServer.close();
    if (fs.existsSync(tmpCfg)) fs.unlinkSync(tmpCfg);
    if (fs.existsSync(tmpWl)) fs.unlinkSync(tmpWl);
    delete process.env.HDX_CONFIG_PATH;
    delete process.env.HDX_WATCHLIST_PATH;
  }
});

test('Zero-Facade static audit: public/app.js and public/index.html contain zero mock timers, alerts, or placeholder stubs', () => {
  const appJs = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const indexHtml = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.equal(/setTimeout\s*\(/.test(appJs), false, 'public/app.js must not contain setTimeout stubs');
  assert.equal(/\balert\s*\(/.test(appJs), false, 'public/app.js must not contain alert() placeholders');
  assert.equal(/Coming soon|敬请期待/i.test(appJs + indexHtml), false, 'UI must not contain Coming Soon placeholders');
});


