import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'console-home',
  access: 'read',
  description: '查询主办方管理工作台概览及账户状态',
  example: 'opencli huodongxing console-home -f json',
  domain: 'www.huodongxing.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: ['account', 'nick', 'isAuthenticated', 'isVip', 'balanceBean', 'orgCount', 'lastLogin'],
  func: async (page) => {
    const html = await fetchPageHtml(page, '/console/home');
    const summary = parsers.parseConsoleHomeHtml(html);
    return [summary];
  },
});
