import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'tickets',
  access: 'read',
  description: '查询个人中心已报名活动电子票券列表（有效票、未完成、已取消、退票申请）',
  example: 'opencli huodongxing tickets -f json\nopencli huodongxing tickets --status valid',
  domain: 'www.huodongxing.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'status', type: 'str', default: 'all', help: '票券状态过滤：all / valid / undone / cancelled / refund' },
    { name: 'limit', type: 'int', default: 50, help: '返回条数上限（默认 50）' },
  ],
  columns: ['ticketNo', 'eventId', 'eventTitle', 'eventTime', 'price', 'statusLabel', 'detailUrl'],
  func: async (page, args) => {
    const html = await fetchPageHtml(page, '/user/regevents');
    const res = parsers.parseTicketsHtml(html, {
      status: args.status || 'all',
      limit: Number(args.limit || 50),
    });
    return res.tickets || [];
  },
});
