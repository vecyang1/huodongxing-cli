import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'favorites',
  access: 'read',
  description: '查询个人收藏的活动列表',
  example: 'opencli huodongxing favorites -f json',
  domain: 'www.huodongxing.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'limit', type: 'int', default: 50, help: '返回条数上限（默认 50）' },
  ],
  columns: ['rank', 'id', 'title', 'organizer', 'time', 'status', 'url'],
  func: async (page, args) => {
    const html = await fetchPageHtml(page, '/user/userfollows');
    return parsers.parseFavoritesHtml(html, Number(args.limit || 50));
  },
});
