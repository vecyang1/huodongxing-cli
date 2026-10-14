import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'console-events',
  access: 'read',
  description: '查询主办方后台已发布/草稿/结束活动列表（/console/eventadmin + /console/userpubevents）',
  example: 'opencli huodongxing console-events -f json',
  domain: 'www.huodongxing.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'status', type: 'str', default: 'all', help: '状态过滤：all / published / reviewing / ended / draft / offline / cancelled' },
    { name: 'keyword', type: 'str', default: '', help: '按活动关键词搜索' },
    { name: 'page', type: 'int', default: 1, help: '页码（默认 1）' },
    { name: 'limit', type: 'int', default: 10, help: '每页条数（默认 10）' },
  ],
  columns: ['rank', 'id', 'title', 'url'],
  func: async (page, args) => {
    const html = await fetchPageHtml(page, '/console/eventadmin');
    const statusMap = {
      all: -3,
      published: 1,
      reviewing: 5,
      ended: 4,
      draft: 0,
      offline: 11,
      cancelled: 3,
    };
    const statusKey = String(args.status || 'all').toLowerCase();
    const statusCode = statusMap[statusKey] ?? -3;
    const form = new URLSearchParams({
      page: String(args.page || 1),
      size: String(args.limit || 10),
      status: String(statusCode),
      keywords: String(args.keyword || ''),
      order: '0',
    });

    let ajaxHtml = '';
    try {
      ajaxHtml = await fetchPageHtml(page, '/console/userpubevents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: form.toString(),
      });
    } catch {
      ajaxHtml = '';
    }

    const res = parsers.parseConsoleEventsHtml(html, ajaxHtml);
    return res.events || [];
  },
});
