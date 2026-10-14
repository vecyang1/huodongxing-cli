import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'detail',
  access: 'read',
  description: '查询活动行单场活动详情、内联票种 JSON 与报名表单字段结构',
  example: 'opencli huodongxing detail 2871552596500 -f json',
  domain: 'www.huodongxing.com',
  strategy: Strategy.PUBLIC,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'id', positional: true, required: true, help: '活动 ID，例如 2871552596500' },
  ],
  columns: ['id', 'title', 'time', 'location', 'organizerName', 'ticketsCount', 'url'],
  func: async (page, args) => {
    const cleanId = String(args.id || '').replace(/\D/g, '');
    if (!cleanId) throw new Error('Event ID is required');
    const html = await fetchPageHtml(page, `/event/${cleanId}`);
    const detail = parsers.parseEventDetailHtml(html, cleanId);
    return [
      {
        ...detail,
        organizerName: detail.organizer?.name || '',
        ticketsCount: Array.isArray(detail.tickets) ? detail.tickets.length : 0,
      },
    ];
  },
});
