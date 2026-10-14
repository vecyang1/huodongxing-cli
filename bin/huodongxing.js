#!/usr/bin/env node
import fs from 'node:fs';
import {
  VERSION,
  PACKAGE_NAME,
  LICENSE,
  DESCRIPTION,
  HuodongxingClient,
  assertSafeCliAction,
  resolveRuntimeConfig,
  updateOperatorConfig,
  classifySample,
  runDiagnosticReconcile,
  formatOutput,
} from '../src/index.js';

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=');
      if (eqIdx !== -1) {
        const key = token.slice(2, eqIdx);
        const val = token.slice(eqIdx + 1);
        flags[key] = val;
      } else {
        const key = token.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else if (token.startsWith('-') && token.length === 2) {
      const short = token[1];
      const map = {
        f: 'format',
        e: 'engine',
        k: 'keyword',
        c: 'city',
        p: 'page',
        l: 'limit',
        o: 'output',
        h: 'help',
        v: 'version',
      };
      const key = map[short] || short;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }

  return { positional, flags };
}

function printHelp() {
  const helpText = `${PACKAGE_NAME} v${VERSION} (${LICENSE})
${DESCRIPTION}

Usage:
  huodongxing <command> [arguments] [options]
  hdx <command> [arguments] [options]

Commands (Public Discovery):
  events                  Search & filter public events (supports --keyword, --city, --tag, --orderby, --date, --date-to, --page, --limit)
  detail <eventId>        Inspect event detail, inline ticket tiers, and registration form schema
  organizers              List featured event organizers (--tag, --limit)
  ranklist                List popularity & heat index ranklist (--limit)
  topics                  List curated special topics (--limit)

Commands (Authenticated User Center):
  status                  Check active session, authentication state, and engine readiness
  timeline                Fetch personal activity timeline (/user/index, supports --page, --limit)
  tickets                 Fetch personal registered tickets (/user/regevents, supports --status valid|ended|pending|incomplete, --limit)
  ticket-detail <tid>     Inspect electronic ticket voucher details (/user/tikcets?tids=<tid>)
  favorites               Fetch saved/favorited events (/user/userfollows)
  following               Fetch followed organizers (/user/userfollows)
  profile                 Inspect account profile settings (/account/profile)
  profile-set             Update reversible profile fields (--brief, --nick, --real-name, --dry-run / --execute)
  register <eventId>      Validate & preview event registration payload (--ticket-sn, --fields-json, --dry-run)
  export-ics              Export personal tickets to RFC 5545 iCalendar (.ics) (--output <file>)

Commands (Organizer Console):
  console-home            Inspect organizer console summary & Hawk MAC API token presence (/console/home)
  console-events          Fetch organizer published events (/console/eventadmin + /console/userpubevents, --status, --keyword)

Commands (Diagnostic & Observability — 能读 / 能试 / 能调):
  diagnose                Run full E2E diagnostic reconciler (--offline to skip network probes)
  diagnose --sample <in>  Test sample URL/ID against Security Guard, route matcher, and parser selector (能试)
  diagnose --read-config  Inspect effective runtime configuration, source priority, and security rules (能读)
  diagnose --set-config   Persist operator config override (--key <k> --value <v> or --reset-config) (能调)

Global Options:
  -f, --format <fmt>      Output format: json (default), table, md, csv
  -e, --engine <eng>      Execution engine: auto (default), direct, opencli
  --session <name>        OpenCLI browser session name (default: work)
  --cookie <str>          Explicit Cookie header for Direct HTTP mode (or env HDX_COOKIE)
  -h, --help              Show this help message
  -v, --version           Show version number
`;
  process.stdout.write(helpText);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = (positional[0] || '').toLowerCase();

  if (flags.version || command === 'version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  if (flags.help || !command || command === 'help') {
    printHelp();
    return;
  }

  // Enforce pre-socket CLI action security guard
  assertSafeCliAction(command, flags);

  const format = flags.format || 'json';
  const client = new HuodongxingClient({
    engine: flags.engine,
    session: flags.session,
    cookie: flags.cookie,
    baseUrl: flags['base-url'],
    minIntervalMs: flags['min-interval-ms'] ? Number(flags['min-interval-ms']) : undefined,
  });

  let result;
  let preferredColumns = null;

  switch (command) {
    case 'status': {
      result = await client.status();
      break;
    }

    case 'events':
    case 'search': {
      result = await client.searchEvents({
        keyword: flags.keyword || positional[1] || '',
        city: flags.city || '',
        tag: flags.tag || '',
        orderby: flags.orderby || 'o',
        date: flags.date || '',
        dateTo: flags['date-to'] || flags.dateTo || '',
        page: Number(flags.page || 1),
        limit: Number(flags.limit || 20),
      });
      preferredColumns = ['rank', 'id', 'title', 'time', 'city', 'organizer', 'url'];
      break;
    }

    case 'detail':
    case 'event': {
      const eventId = positional[1] || flags.id || flags['event-id'];
      if (!eventId) {
        throw new Error('Usage: huodongxing detail <eventId>');
      }
      result = await client.getEventDetail(eventId);
      break;
    }

    case 'timeline': {
      result = await client.getTimeline({
        page: Number(flags.page || 1),
        limit: Number(flags.limit || 20),
      });
      preferredColumns = ['rank', 'id', 'title', 'actionLabel', 'time', 'location', 'url'];
      break;
    }

    case 'tickets': {
      result = await client.getTickets({
        status: flags.status || 'all',
        limit: Number(flags.limit || 50),
      });
      preferredColumns = ['ticketNo', 'eventId', 'eventTitle', 'eventTime', 'price', 'statusLabel'];
      break;
    }

    case 'ticket-detail': {
      const tid = positional[1] || flags.tid || flags.id;
      if (!tid) {
        throw new Error('Usage: huodongxing ticket-detail <tid>');
      }
      result = await client.getTicketDetail(tid);
      break;
    }

    case 'favorites': {
      result = await client.getFavorites({
        limit: Number(flags.limit || 50),
      });
      preferredColumns = ['rank', 'id', 'title', 'organizer', 'time', 'status', 'url'];
      break;
    }

    case 'following': {
      result = await client.getFollowing({
        limit: Number(flags.limit || 50),
      });
      preferredColumns = ['rank', 'kind', 'name', 'bio', 'url'];
      break;
    }

    case 'profile': {
      result = await client.getProfile();
      break;
    }

    case 'profile-set': {
      const execute = Boolean(flags.execute) && !flags['dry-run'];
      const changes = {};
      if (flags.brief !== undefined) changes.brief = String(flags.brief);
      if (flags.nick !== undefined) changes.nick = String(flags.nick);
      if (flags['real-name'] !== undefined) changes.realName = String(flags['real-name']);
      if (Object.keys(changes).length === 0) {
        throw new Error('Provide at least one field to update: --brief <text>, --nick <name>, or --real-name <name>');
      }
      result = await client.updateProfile(changes, { dryRun: !execute });
      break;
    }

    case 'organizers': {
      result = await client.getOrganizers({
        tag: flags.tag || '',
        limit: Number(flags.limit || 20),
      });
      preferredColumns = ['rank', 'name', 'eventsCount', 'followers', 'bio', 'url'];
      break;
    }

    case 'ranklist': {
      result = await client.getRanklist({
        limit: Number(flags.limit || 20),
      });
      preferredColumns = ['rank', 'id', 'title', 'heatScore', 'location', 'time', 'url'];
      break;
    }

    case 'topics': {
      result = await client.getTopics({
        limit: Number(flags.limit || 20),
      });
      preferredColumns = ['rank', 'id', 'title', 'views', 'eventCount', 'summary', 'url'];
      break;
    }

    case 'console-home': {
      result = await client.getConsoleHome();
      break;
    }

    case 'console-events': {
      result = await client.getConsoleEvents({
        status: flags.status || 'all',
        keyword: flags.keyword || '',
        page: Number(flags.page || 1),
        limit: Number(flags.limit || 10),
      });
      preferredColumns = ['rank', 'id', 'title', 'url'];
      break;
    }

    case 'register': {
      const eventId = positional[1] || flags.id || flags['event-id'];
      if (!eventId) {
        throw new Error('Usage: huodongxing register <eventId> [--ticket-sn 1] [--fields-json \'{"姓名":"..."}\']');
      }
      const fields = flags['fields-json'] ? JSON.parse(String(flags['fields-json'])) : {};
      result = await client.registerEvent(
        eventId,
        {
          ticketSn: flags['ticket-sn'] ? Number(flags['ticket-sn']) : undefined,
          fields,
        },
        { dryRun: true }
      );
      break;
    }

    case 'export-ics': {
      const icsRes = await client.exportTicketsIcs({
        status: flags.status || 'all',
        limit: Number(flags.limit || 50),
      });
      if (flags.output) {
        fs.writeFileSync(String(flags.output), icsRes.ics, 'utf8');
        result = {
          ok: true,
          engine: icsRes.engine,
          count: icsRes.count,
          outputFile: String(flags.output),
        };
      } else if (format === 'ics' || flags.raw) {
        process.stdout.write(icsRes.ics);
        return;
      } else {
        result = icsRes;
      }
      break;
    }

    case 'diagnose': {
      if (flags['read-config']) {
        result = resolveRuntimeConfig({
          engine: flags.engine,
          session: flags.session,
          cookie: flags.cookie,
        });
      } else if (flags['reset-config']) {
        result = updateOperatorConfig({}, { reset: true });
      } else if (flags['set-config']) {
        const key = flags.key || positional[1];
        const rawVal = flags.value ?? positional[2];
        if (!key || rawVal === undefined) {
          throw new Error('Usage: huodongxing diagnose --set-config --key <key> --value <value>');
        }
        const val = /^\d+$/.test(String(rawVal)) ? Number(rawVal) : String(rawVal);
        result = updateOperatorConfig({ [key]: val });
      } else if (flags.sample || positional[1]) {
        const sample = flags.sample || positional[1];
        result = classifySample(sample, {
          method: flags.method || 'GET',
        });
      } else {
        result = await runDiagnosticReconcile(client, {
          offline: Boolean(flags.offline),
        });
      }
      break;
    }

    default:
      throw new Error(`Unknown command '${command}'. Run 'huodongxing --help' for usage.`);
  }

  process.stdout.write(`${formatOutput(result, format, preferredColumns)}\n`);
}

main().catch((err) => {
  const errPayload = {
    ok: false,
    error: err.message,
    code: err.code || err.name || 'CLI_ERROR',
    ...(err.category ? { category: err.category, route: err.route } : {}),
  };
  process.stderr.write(`${JSON.stringify(errPayload, null, 2)}\n`);
  process.exitCode = 1;
});
