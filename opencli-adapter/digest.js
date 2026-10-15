import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  fetchPageHtml,
  parsers,
  resolveRuntimeConfig,
  classifyEventDomains,
  extractTechSignals,
} from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'digest',
  access: 'read',
  description: '多领域活动生态情报简报（跨境出海、AI、短剧漫剧、硬核科技、软件产品）',
  example:
    'opencli huodongxing digest -f json\nopencli huodongxing digest --cities foshan,guangzhou,shenzhen --limit 20',
  domain: 'www.huodongxing.com',
  strategy: Strategy.PUBLIC,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'region', type: 'string', default: '', help: '区域预设（默认 gba / 广佛深）' },
    { name: 'cities', type: 'string', default: '', help: '逗号分隔城市列表（例如 foshan,guangzhou,shenzhen）' },
    { name: 'includePast', type: 'boolean', default: false, help: '包含近期往期活动' },
    { name: 'limit', type: 'int', default: 20, help: '返回条数上限（默认 20）' },
  ],
  columns: ['rank', 'id', 'matchedCity', 'title', 'time', 'domains', 'techSignals', 'organizer', 'url'],
  func: async (page, args) => {
    const eff = resolveRuntimeConfig().effective;
    const resolved = parsers.resolveRegionOrCities(
      {
        region: args.region || (!args.cities ? eff.defaultRegion : ''),
        cities: args.cities,
      },
      eff.defaultCities,
    );
    const upcomingOnly = !args.includePast;
    const rawItemsByCity = {};
    for (const cityName of resolved.cities) {
      const url = parsers.buildEventsUrl({ city: cityName, orderby: 'o', upcomingOnly });
      const relativePath = url.replace(/^https?:\/\/[^/]+/i, '');
      const html = await fetchPageHtml(page, relativePath);
      rawItemsByCity[cityName] = parsers.parseEventsHtml(html, {
        limit: 30,
        upcomingOnly,
      });
    }
    const scored = parsers.scoreAndRankRegionalEvents(rawItemsByCity, {
      cities: resolved.cities,
      keywords: eff.defaultKeywords,
      upcomingOnly,
      limit: Number(args.limit || 20),
    });
    return scored.items.map((item, idx) => {
      const domains = classifyEventDomains(item).map((d) => d.label).join(' / ') || '综合行业';
      const techSignals = extractTechSignals(item).join(', ');
      return {
        rank: idx + 1,
        id: item.id,
        matchedCity: item.matchedCity || item.city,
        title: item.title,
        time: item.time,
        domains,
        techSignals,
        organizer: item.organizer,
        url: item.url,
      };
    });
  },
});
