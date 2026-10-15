import fs from 'node:fs';
import path from 'node:path';
import { cleanText, resolveRegionOrCities } from './parsers.js';

/**
 * Focus Domain Taxonomy for Domestic Ecosystem Intelligence
 */
export const ECOSYSTEM_DOMAINS = [
  {
    id: 'crossborder',
    name: '跨境出海与全球化电商',
    shortName: '跨境出海',
    keywords: ['跨境', '出海', '亚马逊', '外贸', 'DTC', 'TikTok'],
    regex: /跨境|出海|亚马逊|amazon|海外|外贸|dtc|独立站|tiktok|shopee|lazada|国际站|沃尔玛/i,
    description: '涵盖跨境电商、亚马逊增长峰会、DTC品牌出海、海外营销与国际供应链。',
  },
  {
    id: 'ai',
    name: '人工智能与智能体生态',
    shortName: 'AI与智能体',
    keywords: ['AI', '智能体', '大模型', 'Agent', 'AIGC', '算力'],
    regex: /AI|智能体|大模型|agent|aigc|llm|算法|生成式|算力|机器学习|模型应用|deepseek/i,
    description: '涵盖生成式AI、智能体（Agent）产业落地、企业AI转型、大模型应用与算力基础设施。',
  },
  {
    id: 'drama',
    name: '漫剧短剧与AI视频内容',
    shortName: '漫剧与短剧',
    keywords: ['短剧', '漫剧', 'AI视频', '微短剧', '短视频'],
    regex: /短剧|漫剧|微短剧|短视频|ai视频|分镜|网文|剧本|内容出海|sora|runway|即梦/i,
    description: '涵盖短剧出海、漫剧制作管线、AI剧情生成、分镜技术与数字娱乐内容生态。',
  },
  {
    id: 'infrastructure',
    name: '基础设施与云原生架构',
    shortName: '基础设施',
    keywords: ['基础设施', '架构', '云原生', '开发者', '运维', '数据库'],
    regex: /基础设施|架构|云原生|微服务|云计算|运维|服务器|数据库|开源|中台|性能优化|分布式/i,
    description: '涵盖云原生基础设施、企业技术架构、开发运维、开源工具链与高可用系统。',
  },
  {
    id: 'apps',
    name: '创新应用与SaaS创业生态',
    shortName: '创新应用与SaaS',
    keywords: ['App', 'SaaS', '应用榜', '创业', '开发者生态'],
    regex: /app|saas|应用|工具|创业|生态|产业互联网|数字营销|开发者工具|产品经理|opc/i,
    description: '涵盖前沿移动应用、企业级SaaS、出海软件工具、开发者社区与创业孵化生态。',
  },
];

/**
 * Classifies an event into ecosystem domains based on title and organizer.
 * @param {object} event
 * @returns {Array<string>} List of matched domain IDs
 */
export function classifyEventDomains(event) {
  const text = `${event.title || ''} ${event.organizer || ''} ${event.location || ''} ${(event.matchedTags || []).join(' ')}`;
  const matched = [];

  for (const domain of ECOSYSTEM_DOMAINS) {
    if (domain.regex.test(text)) {
      matched.push(domain.id);
    }
  }

  // If no domain explicitly matched, fallback to 'apps' if it mentions business/tech
  if (matched.length === 0) {
    matched.push('apps');
  }

  return matched;
}

/**
 * Extracts stack keywords, tech tags, and business models from event title and description.
 * @param {string} text
 * @returns {Array<string>}
 */
export function extractTechSignals(text) {
  const signalPatterns = [
    'AI',
    'Agent',
    '智能体',
    '大模型',
    'LLM',
    '短剧',
    '漫剧',
    'GEO',
    'FDE',
    'OPC',
    'DTC',
    '亚马逊',
    'Amazon',
    'TikTok',
    'Meta',
    'AIGC',
    '出海',
    '跨境',
    '云原生',
    '微服务',
    'SaaS',
    'OpenAI',
    'DeepSeek',
    '即梦',
    'Sora',
  ];

  const found = new Set();
  const rawText = String(text || '');

  for (const sig of signalPatterns) {
    if (sig === 'AI') {
      if (/(?:^|[^a-zA-Z0-9])AI(?:$|[^a-zA-Z0-9])/i.test(rawText)) {
        found.add('AI');
      }
    } else if (rawText.toLowerCase().includes(sig.toLowerCase())) {
      found.add(sig);
    }
  }

  return Array.from(found);
}

/**
 * Evaluates whether an event offers online or remote attendance (webinars, livestreams, conferences).
 * @param {object} event
 * @returns {{ canAttendOnline: boolean, attendanceMode: 'online' | 'hybrid' | 'offline', attendanceLabel: string }}
 */
export function evaluateOnlineAttendance(event) {
  const text = `${event.title || ''} ${event.location || ''} ${event.organizer || ''} ${(event.matchedTags || []).join(' ')}`;
  const isExplicitOnline = event.eventType === 'online' || event.eventType === '2';
  const hasOnlineKeyword = /线上|在线|直播|云端|远程|腾讯会议|飞书会议|视频号|webinar|zoom|钉钉|公开课|网课|网络研讨/i.test(text);
  const isHybrid = /双线|线上线下|同步直播|视频号直播|支持线上/i.test(text);

  if (isExplicitOnline) {
    let modeLabel = '线上研讨';
    if (/腾讯会议/i.test(text)) modeLabel = '腾讯会议';
    else if (/视频号/i.test(text)) modeLabel = '视频号直播';
    else if (/直播/i.test(text)) modeLabel = '线上直播';
    return { canAttendOnline: true, attendanceMode: 'online', attendanceLabel: modeLabel };
  }

  if (isHybrid) {
    return { canAttendOnline: true, attendanceMode: 'hybrid', attendanceLabel: '双线同步直播' };
  }

  if (hasOnlineKeyword && !/线下独享|仅限线下/i.test(text)) {
    return { canAttendOnline: true, attendanceMode: 'online', attendanceLabel: '线上/直播' };
  }

  const city = event.matchedCity || event.city || '线下活动';
  return { canAttendOnline: false, attendanceMode: 'offline', attendanceLabel: `线下 · ${city}` };
}

/**
 * Scans Huodongxing across all target ecosystem domains for specified cities.
 * @param {object} client HuodongxingClient instance
 * @param {object} options
 * @returns {Promise<object>}
 */
export function buildEcosystemDigestMarkdown({ metadata, stats, domainGroups, onlineEvents = [], topOrganizers, topSignals }) {
  const lines = [];

  const cityLabel = metadata.cities.join(' · ');
  lines.push(`# 国内前沿生态每周雷达 · ${cityLabel} (Ecosystem Weekly Radar)`);
  lines.push(``);
  const cityBreakdown = stats.byCityCounts
    ? ` (${Object.entries(stats.byCityCounts).map(([c, n]) => `${c}: ${n} 场`).join(' · ')})`
    : '';
  lines.push(`> 📅 **巡检周期**: ${metadata.scanDate} | 📍 **巡检目标地域**: ${metadata.cities.join('、')}${cityBreakdown} | 🔍 **全量扫描去重活动数**: ${stats.totalUniqueEvents}`);
  lines.push(`> 🌐 **支持线上远程参会**: ${stats.onlineAttendanceCount || 0} 场 | 🏛️ **纯线下活动**: ${stats.offlineAttendanceCount || 0} 场`);
  lines.push(`> 🎯 **覆盖生态赛道**: 跨境出海 · 人工智能与智能体 · 漫剧短剧 · 基础设施与架构 · 创新应用与SaaS`);
  lines.push(``);

  lines.push(`## 一、前沿生态核心情报提炼 (Executive Insights)`);
  lines.push(``);
  lines.push(`1. **短剧出海与漫剧AI化爆发**: 广深佛与长三角上海正在形成极高密度的“短剧出海 + AI赋能”研讨热潮（涵盖制作管线、短剧商业模式与出海投流）。`);
  lines.push(`2. **企业级AI转型与营销智能体落地**: 从通用大模型向特定垂直领域（如上海/深圳的GEO营销、外贸B2B拓客、FDE全流程变现、OPC单人企业大模型应用）加速沉淀。`);
  lines.push(`3. **旺季跨境与DTC出海供应链发力**: 亚马逊黑五流量打法、Meta出海体验中心、广交会及长三角/珠三角出海生态展会密集召开。`);
  lines.push(`4. **远程参会接入友好度**: 本期共识别出 ${stats.onlineAttendanceCount || 0} 场支持线上直播、腾讯会议或双线接入的前沿活动，海外或异地决策者可零门槛直接参与。`);
  lines.push(`5. **国内技术栈热点**: ${topSignals.slice(0, 10).map((s) => `\`${s}\``).join(' ')}。`);
  lines.push(``);

  lines.push(`## 🌐 线上参会与远程接入精选 (Online & Remote Attendance Track)`);
  lines.push(`> **海外操作员直通车**: 针对身处海外或异地场景，以下活动提供在线直播、腾讯会议或双线接入，无需亲临现场即可实时接入国内一手行业研讨与资源对接。`);
  lines.push(``);

  if (onlineEvents.length === 0) {
    lines.push(`*本周期暂未识别到支持线上直播的公开活动。*`);
    lines.push(``);
  } else {
    lines.push(`| 序号 | 活动名称 | 时间 | 线上形式 | 主办方 | 关联赛道 | 核心热词 | 直达链接 |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |`);

    onlineEvents.slice(0, 20).forEach((ev, idx) => {
      const escapedTitle = ev.title.replace(/\|/g, '&#124;').trim();
      const escapedOrg = (ev.organizer || '平台主办').replace(/\|/g, '&#124;').trim();
      const signals = (ev.signals || []).slice(0, 3).join(', ') || '-';
      const domainNames = (ev.domains || []).map((dId) => ECOSYSTEM_DOMAINS.find((d) => d.id === dId)?.shortName || dId).slice(0, 2).join(' / ');
      lines.push(`| ${idx + 1} | **${escapedTitle}** | ${ev.time} | \`${ev.attendanceLabel || '线上'}\` | ${escapedOrg} | ${domainNames} | \`${signals}\` | [查看报名](${ev.url}) |`);
    });
    lines.push(``);
  }

  lines.push(`## 二、分赛道活动全景 (Domain Deep-Dive)`);
  lines.push(``);

  for (const domain of ECOSYSTEM_DOMAINS) {
    const events = domainGroups[domain.id] || [];
    lines.push(`### 📌 ${domain.name} (${events.length} 场)`);
    lines.push(`_${domain.description}_`);
    lines.push(``);

    if (events.length === 0) {
      lines.push(`*本周期暂无新增特定活动。*`);
      lines.push(``);
      continue;
    }

    lines.push(`| 序号 | 活动名称 | 时间 | 参会形式/地点 | 主办方/生态伙伴 | 核心技术/生态热词 | 链接 |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`);

    events.slice(0, 15).forEach((ev, idx) => {
      const escapedTitle = ev.title.replace(/\|/g, '&#124;').trim();
      const escapedOrg = (ev.organizer || '平台主办').replace(/\|/g, '&#124;').trim();
      const locationBadge = ev.canAttendOnline
        ? `🌐 ${ev.attendanceLabel || '线上'}`
        : `🏛️ ${ev.matchedCity || ev.city || '线下'}`;
      const signals = (ev.signals || []).slice(0, 3).join(', ') || '-';
      lines.push(`| ${idx + 1} | **${escapedTitle}** | ${ev.time} | ${locationBadge} | ${escapedOrg} | \`${signals}\` | [查看活动](${ev.url}) |`);
    });

    lines.push(``);
  }

  lines.push(`## 三、重点主办方与生态伙伴雷达 (Organizers & Partner Radar)`);
  lines.push(``);
  lines.push(`本周活跃在生态一线、组织前沿技术沙龙与出海峰会的核心机构：`);
  lines.push(``);
  topOrganizers.slice(0, 12).forEach((org, i) => {
    lines.push(`- **${org.name}** (活跃活动数: ${org.count} 场)`);
  });
  lines.push(``);

  lines.push(`## 四、决策者海外视角建议 (Strategic Takeaways for Oversea Operator)`);
  lines.push(``);
  lines.push(`- **技术工具链观察**: 关注国内 AI 漫剧/短剧生成流水线（如 Opus、即梦、分镜工具）与出海变现闭环的快速成型，可作为海外内容营销的底层制作杠杆。`);
  lines.push(`- **智能体架构演变**: 国内正从单纯 API 调用转向“GEO + Agent”定向获客与自动化履约，可在个人独立开发（OPC）场景中对齐工具栈。`);
  lines.push(`- **生态合作链接**: 扬帆出海、DataEye、智象出海等峰会均支持线上直播或分论坛，可按需远程接入或获取会后白皮书。`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`*本报告由活动行前沿生态雷达每周巡检自动化生成。*`);

  return lines.join('\n');
}

/**
 * Main engine executing the multi-facet ecosystem sweep.
 */
export async function generateEcosystemDigest(client, options = {}) {
  const resolvedRegion = resolveRegionOrCities(options, ['深圳', '广州', '佛山', '上海']);
  const cities = resolvedRegion.cities.length > 0 ? resolvedRegion.cities : ['深圳', '广州', '佛山', '上海'];

  const scanDate = new Date().toISOString().slice(0, 10);
  const seenEventIds = new Set();
  const allEvents = [];

  // 1. First run broad regional recommendation with combined high-value keywords
  const broadKeywords = ['跨境', '出海', 'AI', '短剧', '漫剧', '智能体', '基础设施'];
  try {
    const recRes = await client.recommendEvents({
      cities,
      keywords: broadKeywords,
      limit: Math.max(Number(options.limit || 30), 20),
      upcomingOnly: options.upcomingOnly !== false,
    });
    for (const item of recRes.items || []) {
      if (item?.id && !seenEventIds.has(item.id)) {
        seenEventIds.add(item.id);
        allEvents.push(item);
      }
    }
  } catch (err) {
    // Graceful fallback if recommend fails
  }

  // 2. Targeted multi-facet search per domain keyword across target cities
  for (const domain of ECOSYSTEM_DOMAINS) {
    for (const kw of domain.keywords.slice(0, 2)) {
      for (const targetCity of cities) {
        try {
          const searchRes = await client.searchEvents({
            city: targetCity,
            keyword: kw,
            upcomingOnly: options.upcomingOnly !== false,
            limit: 8,
          });
          for (const item of searchRes.items || []) {
            if (item?.id && !seenEventIds.has(item.id)) {
              seenEventIds.add(item.id);
              allEvents.push(item);
            }
          }
        } catch (err) {
          // Continue across other keywords and cities
        }
      }
    }
  }

  // 2b. Nationwide & regional online events sweep (webinars, livestreams, remote forums)
  const onlineKeywords = ['跨境', '出海', 'AI', '短剧', '漫剧', '智能体', 'SaaS', 'OPC'];
  for (const kw of onlineKeywords) {
    try {
      const searchRes = await client.searchEvents({
        eventType: '2',
        city: '全部',
        keyword: kw,
        upcomingOnly: options.upcomingOnly !== false,
        limit: 8,
      });
      for (const item of searchRes.items || []) {
        if (item?.id && !seenEventIds.has(item.id)) {
          seenEventIds.add(item.id);
          allEvents.push(item);
        }
      }
    } catch (err) {
      // Continue across online keywords
    }
  }

  // 3. Process, classify, and extract signals for each event
  const domainGroups = {};
  for (const d of ECOSYSTEM_DOMAINS) {
    domainGroups[d.id] = [];
  }

  const organizerCounts = {};
  const signalCounts = {};
  const onlineEvents = [];

  for (const ev of allEvents) {
    const matchedDomains = classifyEventDomains(ev);
    const signals = extractTechSignals(`${ev.title} ${ev.organizer}`);
    const onlineInfo = evaluateOnlineAttendance(ev);

    ev.domains = matchedDomains;
    ev.signals = signals;
    ev.canAttendOnline = onlineInfo.canAttendOnline;
    ev.attendanceMode = onlineInfo.attendanceMode;
    ev.attendanceLabel = onlineInfo.attendanceLabel;

    if (ev.canAttendOnline) {
      onlineEvents.push(ev);
    }

    // If onlineOnly is requested, skip grouping offline events
    if (options.onlineOnly && !ev.canAttendOnline) {
      continue;
    }

    for (const dId of matchedDomains) {
      if (domainGroups[dId]) {
        domainGroups[dId].push(ev);
      }
    }

    if (ev.organizer) {
      organizerCounts[ev.organizer] = (organizerCounts[ev.organizer] || 0) + 1;
    }
    for (const s of signals) {
      signalCounts[s] = (signalCounts[s] || 0) + 1;
    }
  }

  // Sort domain groups by time / relevance
  for (const dId of Object.keys(domainGroups)) {
    domainGroups[dId].sort((a, b) => (b.recommendScore || 0) - (a.recommendScore || 0));
  }

  // Sort online events by relevance / time
  onlineEvents.sort((a, b) => (b.recommendScore || 0) - (a.recommendScore || 0));

  const topOrganizers = Object.entries(organizerCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const topSignals = Object.entries(signalCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([sig]) => sig);

  const byCityCounts = {};
  for (const c of cities) byCityCounts[c] = 0;
  for (const ev of allEvents) {
    const c = ev.matchedCity || ev.city;
    if (c && byCityCounts[c] !== undefined) {
      byCityCounts[c]++;
    }
  }

  const metadata = {
    scanDate,
    cities,
    generatedAt: new Date().toISOString(),
    onlineOnly: Boolean(options.onlineOnly),
  };

  const stats = {
    totalUniqueEvents: allEvents.length,
    onlineAttendanceCount: onlineEvents.length,
    offlineAttendanceCount: Math.max(allEvents.length - onlineEvents.length, 0),
    byDomain: Object.fromEntries(
      Object.entries(domainGroups).map(([k, v]) => [k, v.length])
    ),
    byCityCounts,
  };

  const markdown = buildEcosystemDigestMarkdown({
    metadata,
    stats,
    domainGroups,
    onlineEvents,
    topOrganizers,
    topSignals,
  });

  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output);
    const parentDir = path.dirname(outputPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, markdown, 'utf8');
  }

  return {
    metadata,
    stats,
    onlineEvents,
    topOrganizers,
    topSignals,
    domainGroups,
    allEvents: options.onlineOnly ? onlineEvents : allEvents,
    markdown,
  };
}
