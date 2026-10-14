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
  formatOutput,
} from '../src/index.js';

test('package metadata & AGPL-3.0-or-later license contract', () => {
  assert.equal(PACKAGE_NAME, 'huodongxing-cli');
  assert.equal(VERSION, '1.0.0');
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

  // 5. Ranklist
  const rankHtml = `
    <div class="popularity-son-item">
      <a class="popularity-son-item-right" href="/event/9872593983600"></a>
      <div class="item-title">Community Day 2026 · 深圳</div>
      <div class="item-data"><p>10/25 14:00</p></div>
      <div class="item-dress-pp">深圳 南山</div>
      <div class="item-look">9850</div>
    </div>
  `;
  const ranks = parsers.parseRanklistHtml(rankHtml);
  assert.equal(ranks.length, 1);
  assert.equal(ranks[0].id, '9872593983600');
  assert.equal(ranks[0].heatScore, 9850);

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
