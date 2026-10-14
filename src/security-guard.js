/**
 * Huodongxing Pre-Socket Security Guard & WAF Token-Bucket Pacer
 * Blocks destructive account/event/ticket/billing mutations before socket creation
 * and paces outgoing requests so OpenResty WAF (verify.huodongxing.com/gt3) is not triggered.
 */

export class SecurityRouteDeniedError extends Error {
  /**
   * @param {string} action - HTTP Method or CLI action
   * @param {string} route - URI path or command target
   * @param {string} category - Category classification
   * @param {string} reason - Justification for denial
   */
  constructor(action, route, category, reason) {
    super(`[SECURITY REJECTION] Action '${action}' on '${route}' is blocked by Security Route Denylist (${category}): ${reason}`);
    this.name = 'SecurityRouteDeniedError';
    this.action = action;
    this.method = action;
    this.route = route;
    this.category = category;
    this.reason = reason;
    this.statusCode = 403;
  }
}

export const SECURITY_ROUTE_DENYLIST = [
  {
    id: 'SEC_ACCOUNT_DELETE',
    category: 'DESTRUCTIVE_ACCOUNT',
    pattern: /^\/(account|user)\/(delete|destroy|close|cancelaccount|deactivate)(\/.*)?$/i,
    methods: ['POST', 'DELETE', 'PUT', 'PATCH'],
    reason: 'Account deletion or deactivation permanently destroys user tickets and organizer history.',
  },
  {
    id: 'SEC_CREDENTIAL_MUTATION',
    category: 'SECURITY_CREDENTIAL_MUTATION',
    pattern: /^\/(account|user)\/(changepwd|pwd|password|unbind|bindphone|bindemail)(\/.*)?$/i,
    methods: ['POST', 'DELETE', 'PUT', 'PATCH'],
    reason: 'Password and authentication binding mutations are blocked for unattended agents.',
  },
  {
    id: 'SEC_EVENT_DESTRUCTIVE',
    category: 'DESTRUCTIVE_ORGANIZER_EVENT',
    pattern: /^\/myevent\/(delete|cancel|cancelcheck|destroy)(\/.*)?$/i,
    methods: ['POST', 'DELETE', 'PUT', 'PATCH'],
    reason: 'Cancelling or deleting published organizer events is forbidden at runtime.',
  },
  {
    id: 'SEC_TICKET_REFUND_OR_CANCEL',
    category: 'DESTRUCTIVE_ATTENDEE_TICKET',
    pattern: /^\/(user|order|ticket)\/(refund|refundticket|cancelticket|abort)(\/.*)?$/i,
    methods: ['POST', 'DELETE', 'PUT', 'PATCH'],
    reason: 'Refunding or cancelling existing attendee tickets is blocked by default safety gate.',
  },
  {
    id: 'SEC_BILLING_OR_WITHDRAW',
    category: 'BILLING_FINANCIAL_MUTATION',
    pattern: /^\/(finance|pay|payment|wallet|withdraw|price\/buy|vip\/buy)(\/.*)?$/i,
    methods: ['POST', 'DELETE', 'PUT', 'PATCH'],
    reason: 'Financial withdrawals, VIP purchases, and payment mutations are strictly forbidden.',
  },
];

/**
 * Evaluates an outgoing HTTP request against the security denylist before socket creation.
 * @param {string} method
 * @param {string} path
 * @returns {{ allowed: true, method: string, route: string }}
 * @throws {SecurityRouteDeniedError}
 */
export function assertSafeRoute(method, path) {
  const normMethod = String(method || 'GET').toUpperCase();
  const cleanPath = String(path || '/').split('?')[0].replace(/^https?:\/\/[^/]+/i, '') || '/';

  for (const rule of SECURITY_ROUTE_DENYLIST) {
    if (rule.methods.includes(normMethod) && rule.pattern.test(cleanPath)) {
      throw new SecurityRouteDeniedError(normMethod, cleanPath, rule.category, rule.reason);
    }
  }

  return { allowed: true, method: normMethod, route: cleanPath };
}

/**
 * Evaluates a route without throwing (used by diagnostic reconciler).
 * @param {string} method
 * @param {string} path
 */
export function inspectRouteSafety(method, path) {
  const normMethod = String(method || 'GET').toUpperCase();
  const cleanPath = String(path || '/').split('?')[0].replace(/^https?:\/\/[^/]+/i, '') || '/';

  for (const rule of SECURITY_ROUTE_DENYLIST) {
    if (rule.methods.includes(normMethod) && rule.pattern.test(cleanPath)) {
      return {
        allowed: false,
        method: normMethod,
        route: cleanPath,
        ruleId: rule.id,
        category: rule.category,
        reason: rule.reason,
      };
    }
  }

  return {
    allowed: true,
    method: normMethod,
    route: cleanPath,
    ruleId: null,
    category: 'SAFE_OPERATION',
    reason: 'Passed all pre-socket security denylist checks.',
  };
}

/**
 * Checks if a CLI command name or flags represent a forbidden destructive or financial action.
 * @param {string} command
 * @param {Object} [flags={}]
 * @throws {SecurityRouteDeniedError}
 */
export function assertSafeCliAction(command, flags = {}) {
  const cmd = String(command || '').toLowerCase().trim();
  const forbiddenCommands = new Set([
    'delete-account',
    'account-delete',
    'delete-event',
    'event-delete',
    'cancel-event',
    'refund-ticket',
    'ticket-refund',
    'withdraw',
    'change-password',
    'buy-vip',
  ]);

  if (forbiddenCommands.has(cmd)) {
    throw new SecurityRouteDeniedError(
      'CLI_COMMAND',
      cmd,
      'DESTRUCTIVE_OR_BILLING',
      'Destructive account/event/ticket and billing commands are blocked by Security Guard.',
    );
  }

  if (flags.deleteAccount || flags.deleteEvent || flags.refundTicket || flags.withdraw) {
    throw new SecurityRouteDeniedError(
      'CLI_FLAG',
      cmd,
      'DESTRUCTIVE_OR_BILLING',
      'Destructive or financial flags are forbidden at runtime.',
    );
  }
}

/**
 * Sequential Token-Bucket Request Pacer to stay safely below Huodongxing OpenResty WAF
 * threshold (8 requests / 20s window).
 */
export class RequestPacer {
  /**
   * @param {number} [minIntervalMs=900]
   */
  constructor(minIntervalMs = 900) {
    const parsed = Number(minIntervalMs);
    this.minIntervalMs = Number.isFinite(parsed) && parsed >= 0 ? parsed : 900;
    this.lastRequestAt = 0;
    this._queue = Promise.resolve();
  }

  /**
   * Schedules an async function to run after respecting minIntervalMs spacing.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  schedule(fn) {
    const run = async () => {
      const now = Date.now();
      const elapsed = now - this.lastRequestAt;
      if (this.lastRequestAt > 0 && elapsed < this.minIntervalMs) {
        const waitMs = this.minIntervalMs - elapsed;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.lastRequestAt = Date.now();
      return fn();
    };
    const next = this._queue.then(run, run);
    this._queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
