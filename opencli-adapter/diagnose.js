import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  classifySample,
  resolveRuntimeConfig,
  checkUpstreamOpencliOwnerFix,
} from './_shared.js';

export const command = cli({
  site: 'huodongxing',
  name: 'diagnose',
  access: 'read',
  description: '活动行诊断与对账器（能读配置、能试路由样本与安全规则、检查上游 d=ts 修复状态）',
  example: 'opencli huodongxing diagnose -f json\nopencli huodongxing diagnose --sample 2871552596500 -f json',
  domain: 'www.huodongxing.com',
  strategy: Strategy.PUBLIC,
  browser: true,
  navigateBefore: false,
  args: [
    { name: 'sample', type: 'str', default: '', help: '待测试识别与安全判定的链接、路径或活动 ID（能试）' },
    { name: 'method', type: 'str', default: 'GET', help: '测试请求 HTTP 方法（GET/POST/DELETE）' },
  ],
  columns: ['check', 'status', 'detail'],
  func: async (_page, args) => {
    if (args.sample) {
      const verdict = classifySample(args.sample, { method: args.method || 'GET' });
      return [
        {
          check: 'sample_classification',
          status: verdict.securityVerdict?.allowed ? 'ALLOWED' : 'BLOCKED',
          detail: JSON.stringify(verdict),
        },
      ];
    }

    const configState = resolveRuntimeConfig();
    const upstreamFix = checkUpstreamOpencliOwnerFix();
    const cashierTest = classifySample('https://www.huodongxing.com/payment/cashier', { method: 'POST' });

    return [
      {
        check: 'runtime_config',
        status: 'OK',
        detail: `engine=${configState.effective.engine}, minIntervalMs=${configState.effective.minIntervalMs}`,
      },
      {
        check: 'upstream_d_ts_owner_fix',
        status: upstreamFix.fixed ? 'REPAIRED' : 'UNPATCHED',
        detail: upstreamFix.path,
      },
      {
        check: 'security_denylist_guard',
        status: cashierTest.securityVerdict.allowed === false ? 'ENFORCED' : 'FAILED',
        detail: `${configState.securityRules.length} active pre-socket rules`,
      },
    ];
  },
});
