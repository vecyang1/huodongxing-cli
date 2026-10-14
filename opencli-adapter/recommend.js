import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'recommend',
  access: 'read',
  description: '按城市群/区域（默认广佛深：佛山·广州·深圳）与兴趣标签智能推荐近期活动',
  example:
    'opencli huodongxing recommend -f json\nopencli huodongxing recommend --region gba --limit 15\nopencli huodongxing recommend --cities foshan,guangzhou,shenzhen',
  domain: 'www.huodongxing.com',
  strategy: Strategy.PUBLIC,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'region', type: 'string', default: 'gba', help: '区域预设或城市群（默认 gba / 广佛深）' },
    { name: 'cities', type: 'string', default: '', help: '逗号分隔的城市列表（如 佛山,广州,深圳 或 foshan,guangzhou,shenzhen）' },
    { name: 'keywords', type: 'string', default: '', help: '优先加权的兴趣关键词列表' },
    { name: 'limit', type: 'int', default: 20, help: '返回推荐条数上限（默认 20）' },
  ],
  columns: ['rank', 'id', 'matchedCity', 'title', 'time', 'recommendScore', 'matchedTags', 'organizer', 'url'],
  func: async (page, args) => {
    const resolved = parsers.resolveRegionOrCities({
      region: args.region,
      cities: args.cities,
    });
    const rawItemsByCity = {};
    for (const cityName of resolved.cities) {
      const url = parsers.buildEventsUrl({ city: cityName, orderby: 'o' });
      const relativePath = url.replace(/^https?:\/\/[^/]+/i, '');
      const html = await fetchPageHtml(page, relativePath);
      rawItemsByCity[cityName] = parsers.parseEventsHtml(html, {
        limit: 30,
        upcomingOnly: true,
      });
    }
    const scored = parsers.scoreAndRankRegionalEvents(rawItemsByCity, {
      cities: resolved.cities,
      keywords: args.keywords || undefined,
      upcomingOnly: true,
      limit: Number(args.limit || 20),
    });
    return scored.items;
  },
});
