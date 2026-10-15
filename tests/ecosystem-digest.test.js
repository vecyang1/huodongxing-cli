import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ECOSYSTEM_DOMAINS,
  classifyEventDomains,
  extractTechSignals,
  buildEcosystemDigestMarkdown,
  generateEcosystemDigest,
  evaluateOnlineAttendance,
} from '../src/ecosystem-digest.js';
import { parseEventTimeRange } from '../src/parsers.js';

test('ECOSYSTEM_DOMAINS covers all 5 core tracks', () => {
  const ids = ECOSYSTEM_DOMAINS.map((d) => d.id);
  assert.ok(ids.includes('crossborder'));
  assert.ok(ids.includes('ai'));
  assert.ok(ids.includes('drama'));
  assert.ok(ids.includes('infrastructure'));
  assert.ok(ids.includes('apps'));
});

test('classifyEventDomains accurately routes event titles', () => {
  const dramaEvent = {
    title: 'GICC 2026丨AI×Short Drama——AI短剧出海线上分论坛',
    organizer: '扬帆出海',
  };
  const domains1 = classifyEventDomains(dramaEvent);
  assert.ok(domains1.includes('drama'));
  assert.ok(domains1.includes('ai'));
  assert.ok(domains1.includes('crossborder'));

  const infraEvent = {
    title: '云原生基础设施与架构演进实战',
    organizer: '开源架构汇',
  };
  const domains2 = classifyEventDomains(infraEvent);
  assert.ok(domains2.includes('infrastructure'));
});

test('extractTechSignals extracts key stacks and terms', () => {
  const signals = extractTechSignals('第二届中国 GEO&AI 营销智能体峰会，聚焦Agent与大模型出海');
  assert.ok(signals.includes('GEO'));
  assert.ok(signals.includes('AI'));
  assert.ok(signals.includes('智能体'));
  assert.ok(signals.includes('Agent'));
  assert.ok(signals.includes('大模型'));
  assert.ok(signals.includes('出海'));
});

test('generateEcosystemDigest produces structured report with mock client', async () => {
  const mockClient = {
    async recommendEvents() {
      return {
        items: [
          {
            id: 'mock1',
            title: '2026 AI短剧产业生态创新大会',
            time: '10/23 周五 14:00',
            organizer: '短剧观察社',
            city: '深圳',
            url: 'https://www.huodongxing.com/event/mock1',
          },
        ],
      };
    },
    async searchEvents() {
      return {
        items: [
          {
            id: 'mock2',
            title: '亚马逊跨境卖家黑五流量峰会',
            time: '10/25 周日 09:30',
            organizer: '出海精英俱乐部',
            city: '深圳',
            url: 'https://www.huodongxing.com/event/mock2',
          },
        ],
      };
    },
  };

  const digest = await generateEcosystemDigest(mockClient, {
    cities: 'sz,Guangzhou,foshan,shanghai',
    limit: 10,
  });

  assert.equal(digest.stats.totalUniqueEvents, 2);
  assert.deepEqual(digest.metadata.cities, ['深圳', '广州', '佛山', '上海']);
  assert.ok(digest.stats.byCityCounts);
  assert.ok(digest.markdown.includes('国内前沿生态每周雷达'));
  assert.ok(digest.markdown.includes('2026 AI短剧产业生态创新大会'));
  assert.ok(digest.markdown.includes('亚马逊跨境卖家黑五流量峰会'));
});

test('evaluateOnlineAttendance identifies online, hybrid, and offline formats', () => {
  const onlineEv = {
    title: 'GICC 2026丨AI×Short Drama——AI短剧出海线上分论坛',
    eventType: 'online',
    location: '线上活动',
  };
  const res1 = evaluateOnlineAttendance(onlineEv);
  assert.equal(res1.canAttendOnline, true);
  assert.equal(res1.attendanceMode, 'online');

  const hybridEv = {
    title: '大湾区跨境卖家峰会（支持双线同步直播）',
    eventType: 'offline',
    location: '深圳南山',
  };
  const res2 = evaluateOnlineAttendance(hybridEv);
  assert.equal(res2.canAttendOnline, true);
  assert.equal(res2.attendanceMode, 'hybrid');

  const meetingEv = {
    title: '出海战略腾讯会议交流会',
    eventType: 'offline',
    location: '全国',
  };
  const res3 = evaluateOnlineAttendance(meetingEv);
  assert.equal(res3.canAttendOnline, true);

  const offlineEv = {
    title: '佛山顺德线下选品对接私享会',
    eventType: 'offline',
    location: '广东佛山',
  };
  const res4 = evaluateOnlineAttendance(offlineEv);
  assert.equal(res4.canAttendOnline, false);
  assert.equal(res4.attendanceMode, 'offline');
});

test('generateEcosystemDigest populates onlineEvents and supports onlineOnly mode', async () => {
  const mockClient = {
    async recommendEvents() {
      return {
        items: [
          {
            id: 'mock-online',
            title: 'AI智能体远程公开课（腾讯会议直播）',
            time: '10/24 周六 14:00',
            eventType: 'online',
            location: '线上活动',
            organizer: 'AI研习社',
            url: 'https://www.huodongxing.com/event/mock-online',
          },
          {
            id: 'mock-offline',
            title: '广州国际饰品展线下洽谈',
            time: '10/26 周一 09:00',
            eventType: 'offline',
            location: '广州琶洲',
            organizer: '展会主办',
            url: 'https://www.huodongxing.com/event/mock-offline',
          },
        ],
      };
    },
    async searchEvents() {
      return { items: [] };
    },
  };

  const digestAll = await generateEcosystemDigest(mockClient, {
    cities: '深圳,广州',
  });
  assert.equal(digestAll.stats.totalUniqueEvents, 2);
  assert.equal(digestAll.stats.onlineAttendanceCount, 1);
  assert.equal(digestAll.stats.offlineAttendanceCount, 1);
  assert.ok(digestAll.markdown.includes('线上参会与远程接入精选'));
  assert.ok(digestAll.markdown.includes('AI智能体远程公开课'));

  const digestOnline = await generateEcosystemDigest(mockClient, {
    cities: '深圳,广州',
    onlineOnly: true,
  });
  assert.equal(digestOnline.allEvents.length, 1);
  assert.equal(digestOnline.allEvents[0].id, 'mock-online');
});

test('generateEcosystemDigest defaults to 4 core cities (深圳, 广州, 佛山, 上海)', async () => {
  const mockClient = {
    async recommendEvents() {
      return { items: [] };
    },
    async searchEvents() {
      return { items: [] };
    },
  };
  const digest = await generateEcosystemDigest(mockClient);
  assert.deepEqual(digest.metadata.cities, ['深圳', '广州', '佛山', '上海']);
  assert.equal(digest.stats.totalUniqueEvents, 0);
  assert.ok(digest.stats.byCityCounts['深圳'] === 0);
  assert.ok(digest.stats.byCityCounts['上海'] === 0);
});

test('parseEventTimeRange accurately deduces years via weekday reconciliation and filters past events', () => {
  const refDate = new Date(2026, 9, 15); // 2026-10-15

  // 1. Past event from 2023: 02/17 周五 (in 2026/2027, 02/17 was/is Wednesday; in 2023 it was Friday)
  const pastCcbec = parseEventTimeRange('02/17 周五 15:00', { referenceDate: refDate });
  assert.equal(pastCcbec.isExpired, true);
  assert.ok(pastCcbec.end < pastCcbec.referenceOrdinal);

  // 2. Past event with explicit past year in title: 2023招商政策线上峰会
  const past2023 = parseEventTimeRange('12/21 周三 11:30', {
    referenceDate: refDate,
    title: '【跨境电商】2023年跨境平台招商政策解读线上峰会',
  });
  assert.equal(past2023.isExpired, true);

  // 3. Past event from 2022 with title: 2022年海外动荡
  const past2022 = parseEventTimeRange('12/14 周三 14:00', {
    referenceDate: refDate,
    title: '【跨境出海】2022年海外动荡，跨境卖家应如何应对？',
  });
  assert.equal(past2022.isExpired, true);

  // 4. Past date range from 2023: 05/11 周四 ~ 05/23 周二
  const pastRange = parseEventTimeRange('05/11 周四 ~ 05/23 周二', { referenceDate: refDate });
  assert.equal(pastRange.isExpired, true);

  // 5. Valid upcoming events in 2026
  const upcoming1 = parseEventTimeRange('09/23 周三 ~ 10/22 周四', { referenceDate: refDate });
  assert.equal(upcoming1.isExpired, false);

  const upcoming2 = parseEventTimeRange('10/22（周四）13:30–18:00', { referenceDate: refDate });
  assert.equal(upcoming2.isExpired, false);

  const upcomingToday = parseEventTimeRange('今天 09:00', { referenceDate: refDate });
  assert.equal(upcomingToday.isExpired, false);

  const upcomingTomorrow = parseEventTimeRange('明天 14:00', { referenceDate: refDate });
  assert.equal(upcomingTomorrow.isExpired, false);
});

test('generateEcosystemDigest strictly filters out expired events across recommend and search channels', async () => {
  const refDate = new Date(2026, 9, 15);
  const mockClient = {
    async recommendEvents() {
      return {
        items: [
          {
            id: 'past-1',
            title: '【跨境电商】2023年跨境平台招商政策解读线上峰会',
            time: '12/21 周三 11:30',
            eventType: 'online',
            location: '线上活动',
            organizer: '雨果跨境',
            url: 'https://www.huodongxing.com/event/past-1',
          },
          {
            id: 'upcoming-1',
            title: '【佛山站】黑五流量新坐标——2026亚马逊卖家年度增长峰会',
            time: '10/22 周四 13:30',
            eventType: 'offline',
            location: '佛山南海',
            organizer: '亚马逊卖家沙龙',
            url: 'https://www.huodongxing.com/event/upcoming-1',
          },
        ],
      };
    },
    async searchEvents() {
      return {
        items: [
          {
            id: 'past-2',
            title: 'CCBEC跨境云讲坛——跨境电商加油站',
            time: '02/17 周五 15:00',
            eventType: 'online',
            location: '线上活动',
            organizer: 'CCBEC组委会',
            url: 'https://www.huodongxing.com/event/past-2',
          },
          {
            id: 'upcoming-2',
            title: 'AI智能体与漫剧出海线上研讨会',
            time: '10/28 周三 14:00',
            eventType: 'online',
            location: '线上活动',
            organizer: 'AI开放平台',
            url: 'https://www.huodongxing.com/event/upcoming-2',
          },
        ],
      };
    },
  };

  const digest = await generateEcosystemDigest(mockClient, {
    referenceDate: refDate,
    upcomingOnly: true,
  });

  // Both past-1 and past-2 must be eliminated!
  const eventIds = digest.allEvents.map((e) => e.id);
  assert.ok(!eventIds.includes('past-1'), 'past-1 (2023峰会) must be filtered out');
  assert.ok(!eventIds.includes('past-2'), 'past-2 (2023 CCBEC) must be filtered out');
  assert.ok(eventIds.includes('upcoming-1'), 'upcoming-1 must be present');
  assert.ok(eventIds.includes('upcoming-2'), 'upcoming-2 must be present');
  assert.equal(digest.stats.totalUniqueEvents, 2);
});

