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
