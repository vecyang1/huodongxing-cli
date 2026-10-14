import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'organizers',
  access: 'read',
  description: '查询活动行精选主办方名录与粉丝统计',
  example: 'opencli huodongxing organizers -f json\nopencli huodongxing organizers --limit 15',
  domain: 'www.huodongxing.com',
  strategy: Strategy.PUBLIC,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'tag', type: 'str', default: '', help: '主办方分类标签（可选）' },
    { name: 'limit', type: 'int', default: 20, help: '返回条数上限（默认 20）' },
  ],
  columns: ['rank', 'name', 'eventsCount', 'followers', 'bio', 'url'],
  func: async (page, args) => {
    const tag = args.tag ? `?tag=${encodeURIComponent(args.tag)}` : '';
    const html = await fetchPageHtml(page, `/zhubanfang${tag}`);
    return parsers.parseOrganizersHtml(html, Number(args.limit || 20));
  },
});
