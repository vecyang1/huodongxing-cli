import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HuodongxingClient,
  runDiagnosticReconcile,
  classifySample,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_FILE = path.join(__dirname, '..', 'evidence', 'smoke_test_results.json');

async function main() {
  const client = new HuodongxingClient({
    engine: 'auto',
    session: 'work',
    minIntervalMs: 1200,
  });

  const steps = [];
  const recordStep = (name, ok, details = {}) => {
    steps.push({ name, ok: Boolean(ok), ...details });
    process.stdout.write(`[${ok ? 'PASS' : 'FAIL'}] ${name}\n`);
  };

  // 1. Check status & bootstrap cookies from OpenCLI browser bridge into DirectClient
  const status = await client.status();
  recordStep('status_probe', status.ok, {
    activeEngine: status.activeEngine,
    authenticated: Boolean(status.userState?.authenticated),
  });

  if (status.browserSession?.available) {
    const browserCookies = await client.opencli.extractBrowserCookies();
    if (browserCookies) {
      client.direct.setCookie(browserCookies);
    }
  }

  // 2. Public Events Search (verifies d=ts fix in live production)
  const searchRes = await client.searchEvents({ keyword: 'AI', limit: 5 });
  recordStep('public_events_search', Array.isArray(searchRes.items) && searchRes.items.length > 0, {
    engine: searchRes.engine,
    count: searchRes.items?.length || 0,
    sampleEventId: searchRes.items?.[0]?.id || null,
  });

  // 3. Event Detail (inline JSON ativityJson + eventTicketsJson + formItemsJson)
  const targetEventId = '2871552596500';
  const detail = await client.getEventDetail(targetEventId);
  recordStep('event_detail_extraction', Boolean(detail.id === targetEventId && detail.title), {
    engine: detail.engine,
    eventId: detail.id,
    ticketsCount: detail.tickets?.length || 0,
    formItemsCount: detail.formItems?.length || 0,
    registrationTokenPresent: Boolean(detail.registrationToken?.present),
  });

  // 4. Organizers Directory
  const orgs = await client.getOrganizers({ limit: 5 });
  recordStep('organizers_directory', Array.isArray(orgs.items) && orgs.items.length > 0, {
    engine: orgs.engine,
    count: orgs.items?.length || 0,
  });

  // 5. Popularity Ranklist
  const ranklist = await client.getRanklist({ limit: 5 });
  recordStep(
    'popularity_ranklist',
    Array.isArray(ranklist.items) && ranklist.items.length > 0 && Boolean(ranklist.items[0].title),
    {
      engine: ranklist.engine,
      count: ranklist.items?.length || 0,
      topEventId: ranklist.items?.[0]?.id || null,
      topEventTitle: ranklist.items?.[0]?.title || null,
    }
  );

  // 6. Special Topics
  const topics = await client.getTopics({ limit: 5 });
  recordStep('special_topics', Array.isArray(topics.items) && topics.items.length > 0, {
    engine: topics.engine,
    count: topics.items?.length || 0,
  });

  // 7. Authenticated User Timeline
  const timeline = await client.getTimeline({ limit: 5 });
  recordStep('user_timeline', Array.isArray(timeline.items), {
    engine: timeline.engine,
    count: timeline.items?.length || 0,
  });

  // 8. Authenticated Tickets & iCal (.ics) Export
  const tickets = await client.getTickets({ status: 'all', limit: 20 });
  const icsExport = await client.exportTicketsIcs({ status: 'all', limit: 20 });
  recordStep(
    'user_tickets_and_ics_export',
    Array.isArray(tickets.items) && icsExport.ics.includes('BEGIN:VCALENDAR'),
    {
      engine: tickets.engine,
      counts: tickets.counts,
      exportedCount: icsExport.count,
      validIcsHeader: icsExport.ics.startsWith('BEGIN:VCALENDAR'),
    }
  );

  // 9. Ticket Detail (if at least one ticket exists)
  if (tickets.items && tickets.items.length > 0 && tickets.items[0].ticketNo) {
    const firstTid = tickets.items[0].ticketNo;
    const tDetail = await client.getTicketDetail(firstTid);
    recordStep('ticket_detail', Boolean(tDetail.ticketNo), {
      engine: tDetail.engine,
      hasQrCodeUrl: Boolean(tDetail.qrCodeUrl),
      hasPdfUrl: Boolean(tDetail.pdfUrl),
    });
  } else {
    recordStep('ticket_detail', true, { skipped: 'no_tickets_in_account' });
  }

  // 10. Favorites & Following
  const favorites = await client.getFavorites({ limit: 10 });
  const following = await client.getFollowing({ limit: 10 });
  recordStep(
    'user_favorites_and_following',
    Array.isArray(favorites.items) && Array.isArray(following.items),
    {
      engine: favorites.engine,
      favoritesCount: favorites.items?.length || 0,
      followingCount: following.items?.length || 0,
    }
  );

  // 11. Account Profile & Reversible Mutation E2E Verification (SSOT Unidirectional Data Flow)
  const profile = await client.getProfile();
  const originalBrief = profile.brief || '';
  const tempBrief = originalBrief ? `${originalBrief} [HDX-E2E]` : 'HDX Agentic CLI Verified';

  const dryRunUpdate = await client.updateProfile({ brief: tempBrief }, { dryRun: true });
  const liveWrite = await client.updateProfile({ brief: tempBrief }, { dryRun: false });
  const liveRevert = await client.updateProfile({ brief: originalBrief }, { dryRun: false });

  recordStep(
    'account_profile_reversible_mutation',
    Boolean(
      profile.account &&
        dryRunUpdate.dryRun === true &&
        liveWrite.verified === true &&
        liveRevert.verified === true &&
        liveRevert.after.brief === originalBrief
    ),
    {
      engine: profile.engine,
      dryRunVerified: dryRunUpdate.verified,
      writeVerified: liveWrite.verified,
      revertVerified: liveRevert.verified,
      restoredExactOriginal: liveRevert.after.brief === originalBrief,
    }
  );

  // 12. Organizer Console Home & Console Events
  const consoleHome = await client.getConsoleHome();
  const consoleEvents = await client.getConsoleEvents({ status: 'all', limit: 10 });
  recordStep(
    'organizer_console_home_and_events',
    Boolean(consoleHome.isAuthenticated && Array.isArray(consoleEvents.statusTabs)),
    {
      engine: consoleHome.engine,
      isAuthenticated: consoleHome.isAuthenticated,
      statusTabsCount: consoleEvents.statusTabs?.length || 0,
      eventsCount: consoleEvents.items?.length || 0,
    }
  );

  // 13. Registration Dry-Run Validator & Security Denylist Probe
  const regPreview = await client.registerEvent(targetEventId, {}, { dryRun: true });
  const blockedCheck = classifySample('https://www.huodongxing.com/payment/cashier', { method: 'POST' });
  recordStep(
    'registration_dry_run_and_security_guard',
    Boolean(regPreview.dryRun === true && blockedCheck.securityVerdict.allowed === false),
    {
      eventId: regPreview.eventId,
      registrationTokenPresent: regPreview.registrationTokenPresent,
      requiredFormItemsCount: regPreview.requiredFormItemsCount,
      cashierBlocked: blockedCheck.securityVerdict.allowed === false,
    }
  );

  // 14. Diagnostic Reconciler
  const diag = await runDiagnosticReconcile(client, { offline: true });
  recordStep('diagnostic_reconciler', diag.ok, {
    dtsQueryRegressionOk: diag.contracts.dtsQueryRegression.ok,
    upstreamOpencliFixStatus: diag.upstreamOpencliFix.status,
  });

  const allPassed = steps.every((s) => s.ok);
  const summary = {
    ok: allPassed,
    executedAt: new Date().toISOString(),
    totalSteps: steps.length,
    passedSteps: steps.filter((s) => s.ok).length,
    failedSteps: steps.filter((s) => !s.ok).length,
    steps,
  };

  fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  if (!allPassed) {
    process.stderr.write('Smoke test had failing steps.\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(`All ${steps.length}/${steps.length} E2E smoke test steps PASSED.\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`Smoke test fatal error: ${err.message}\n`);
  process.exitCode = 1;
});
