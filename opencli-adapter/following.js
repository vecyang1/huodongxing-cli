import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'following',
  access: 'read',
  description: '查询个人关注的主办方及推荐主办方名录',
  example: 'opencli huodongxing following -f json',
  domain: 'www.huodongxing.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'limit', type: 'int', default: 50, help: '返回条数上限（默认 50）' },
  ],
  columns: ['rank', 'kind', 'name', 'bio', 'url'],
  func: async (page, args) => {
    const html = await fetchPageHtml(page, '/user/userfollows');
    return parsers.parseFollowingHtml(html, { limit: Number(args.limit || 50) });
  },
});
