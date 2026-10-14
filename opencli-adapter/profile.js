import { cli, Strategy } from '@jackwener/opencli/registry';
import { fetchPageHtml, parsers } from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'profile',
  access: 'read',
  description: '查询当前登录账号的基本资料配置（脱敏返回，不含敏感隐私）',
  example: 'opencli huodongxing profile -f json',
  domain: 'www.huodongxing.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [],
  columns: ['account', 'nick', 'realName', 'gender', 'brief', 'phoneActivated', 'emailActivated'],
  func: async (page) => {
    const html = await fetchPageHtml(page, '/account/profile');
    const profile = parsers.parseProfileHtml(html);
    return [
      {
        account: profile.account,
        nick: profile.nick,
        realName: profile.realName,
        gender: profile.gender,
        brief: profile.brief,
        phoneActivated: profile.phoneActivated,
        emailActivated: profile.emailActivated,
      },
    ];
  },
});
