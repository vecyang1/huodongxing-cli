import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'ranklist',
  access: 'read',
  description: '查询活动行热门活动热度榜单（按热度值排序）',
  example: 'opencli huodongxing ranklist -f json\nopencli huodongxing ranklist --limit 10',
  domain: 'www.huodongxing.com',
  strategy: Strategy.PUBLIC,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'limit', type: 'int', default: 20, help: '返回条数上限（默认 20）' },
  ],
  columns: ['rank', 'id', 'title', 'heatScore', 'location', 'time', 'url'],
  func: async (page, args) => {
    const html = await fetchPageHtml(page, '/ranklist');
    return parsers.parseRanklistHtml(html, Number(args.limit || 20));
  },
});
