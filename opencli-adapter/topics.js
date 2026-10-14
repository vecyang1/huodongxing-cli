import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'topics',
  access: 'read',
  description: '查询活动行精选活动专题合集与浏览统计',
  example: 'opencli huodongxing topics -f json',
  domain: 'www.huodongxing.com',
  strategy: Strategy.PUBLIC,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'limit', type: 'int', default: 20, help: '返回条数上限（默认 20）' },
  ],
  columns: ['rank', 'id', 'title', 'views', 'eventCount', 'summary', 'url'],
  func: async (page, args) => {
    const html = await fetchPageHtml(page, '/topic');
    return parsers.parseTopicsHtml(html, Number(args.limit || 20));
  },
});
