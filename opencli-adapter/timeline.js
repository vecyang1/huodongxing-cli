import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'timeline',
  access: 'read',
  description: '查询个人中心活动动态时间流（关注主办方及报名活动动态）',
  example: 'opencli huodongxing timeline -f json\nopencli huodongxing timeline --limit 10',
  domain: 'www.huodongxing.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'page', type: 'int', default: 1, help: '页码（默认 1）' },
    { name: 'limit', type: 'int', default: 20, help: '返回条数上限（默认 20）' },
  ],
  columns: ['rank', 'id', 'title', 'actionLabel', 'time', 'location', 'url'],
  func: async (page, args) => {
    const pageNum = Number(args.page || 1);
    const limit = Number(args.limit || 20);
    const path = pageNum > 1
      ? `/user/followandregevents?page=${pageNum}&pagesize=${Math.min(limit, 50)}`
      : '/user/index';
    const html = await fetchPageHtml(page, path, {
      headers: pageNum > 1 ? { 'X-Requested-With': 'XMLHttpRequest' } : {},
    });
    return parsers.parseTimelineHtml(html, limit);
  },
});
