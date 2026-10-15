import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ECOSYSTEM_DOMAINS,
  classifyEventDomains,
  extractTechSignals,
  buildEcosystemDigestMarkdown,
  generateEcosystemDigest,
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
    cities: '深圳',
    limit: 10,
  });

  assert.equal(digest.stats.totalUniqueEvents, 2);
  assert.ok(digest.markdown.includes('深圳及国内前沿生态每周雷达'));
  assert.ok(digest.markdown.includes('2026 AI短剧产业生态创新大会'));
  assert.ok(digest.markdown.includes('亚马逊跨境卖家黑五流量峰会'));
});
