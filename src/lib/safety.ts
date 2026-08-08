/**
 * Content safety filter.
 *
 * Used to block posts (and any operator-configured ad/banner HTML) that promote
 * adult, gambling, drug, or gray/black-market financial content, while explicitly
 * allowing ordinary net-disk resource sharing and normal link/content sharing.
 *
 * The built-in pattern list is intentionally targeted at unambiguous banned terms
 * to avoid false positives on legitimate tech / news / crypto-discussion channels.
 * Operators can extend it at runtime via the `BLOCK_KEYWORDS` environment variable
 * (comma / space separated) without touching code.
 */

// Each entry is matched case-insensitively against the normalized text.
// Lookbehinds (`(?<!...)`) keep English matches precise (e.g. `casino` but not `debate`).
const BUILTIN_PATTERNS: RegExp[] = [
  // Adult / porn
  /色情/,
  /裸聊/,
  /约炮/,
  /性爱/,
  /成人视频/,
  /成人网站/,
  /AV女优/i,
  /卖淫/,

  // Gambling / lottery / betting (Chinese slang + unambiguous casino games)
  /赌博/,
  /博彩/,
  /赌场/,
  /赌球/,
  /私彩/,
  /外围盘/,
  /地下六合彩/,
  /开元棋牌/,
  /炸金花/,
  /牛牛棋牌/,
  /网投平台/,
  /彩票(?:预测|内幕|计划|带单)/,

  // Gambling slang & specific illegal-lottery game names (high precision)
  /菠菜/,
  /葡京/,
  /百家乐/,
  /龙虎斗/,
  /骰宝/,
  /轮盘赌/,
  /老虎机/,
  /抢庄牛牛/,
  /真人视讯/,
  /体育投注/,
  /足球投注/,
  /滚球投注/,
  /时时彩/,
  /快三/,
  /北京赛车/,
  /极速赛车/,
  /重庆时时彩/,
  /一分快三/,
  /分分彩/,

  // Online casino / electronic gaming platforms (from leaked ads)
  /PG电子/i,
  /PA真人/i,
  /电子游戏/,
  /电子爆/,
  /电子钱包.*?(?:存取|存款|出款)/,
  /真人娱乐/,
  /真人百家/,
  /体育(?:H5|PC端|APP|全站).*?(?:入口|下载)/i,
  /小程序.*?免实名.*?免绑卡/,
  /小飞机.*?飞投/,
  /飞投.*?入口/,
  /匿名首选/,

  // Deposit / bonus bait patterns (high-precision gambling red flags)
  /(?:首存|充值|注册|开户).{0,6}(?:送|加赠|奖励|彩金|返利|领)/,
  /首存最高领/,
  /存款彩金/,
  /每日存款彩金/,
  /签到彩金/,
  /日存彩金/,
  /周流水彩金/,
  /每笔存款.*?加赠/,
  /彩金.*?每日送/,
  /彩金.*?不停/,
  /加赠\d+%/,
  /豪礼大放送/,
  /全网独家.{0,4}一家/,
  /全网独此一家/,

  // Luxury / sex bait used in gambling ads (from 182体育 / U99 ad copy)
  /高端嫩模/,
  /劳力士手表/,
  /奔驰E300/i,
  /美女主播.*?在线互动/,
  /官方直播火热/,

  // Domain / brand blacklists (exact-match anchors to avoid false positives)
  /1820036\.com/i,
  /182体育/,
  /U99\.COM/i,
  /u99top/i,
  /mk\.bet/i,

  // Telegram gambling channel handles
  /@(?:u99top|vvip11|U99GBH|u99com99)/i,

  // Registration-channel bait (CNY, USDT, "exclusive" channels)
  /(?:C\s*N\s*Y|USDT).{0,6}专属注册通道/i,
  /U存U取/i,
  /存U取/i,

  // Safety-theater phrases unique to illegal gambling operators
  /不限IP/i,
  /免实名/,
  /免绑卡/,
  /免手机号码/,
  /线上万担保/,
  /拒绝野鸡台/,
  /千万域名/,
  /豪客之/,
  /体育足球单首单包赔/,
  /易换支付钱包/,
  /资金池储备/,
  /大额出款无忧/,
  /大额出款额外奖励/,
  /世界杯.*?指定平台/,
  /开云集团旗下.*?娱乐平台/,

  // English casino/betting domains (with word boundaries)
  /(?<![a-z])casino/i,
  /(?<![a-z])gambling/i,
  /(?<![a-z])porn/i,
  /(?<![a-z])bet365/i,
  /(?<![a-z])1xbet/i,
  /(?<![a-z])stake\.com/i,
  /(?<![a-z])888casino/i,

  // Drugs
  /毒品/,
  /冰毒/,
  /海洛因/,
  /大麻/,
  /摇头丸/,
  /罂粟/,
  /代孕/,
  /迷药/,
  /催情/,

  // Gray / black-market finance (loan sharks, pig-butchering, unauthorized forex, etc.)
  /套路贷/,
  /714高炮/,
  /网贷口子/,
  /黑户下款/,
  /杀猪盘/,
  /资金盘/,
  /刷单返利/,
  /日赚\d+/,
  /代开发票/,
  /洗钱/,
  /地下钱庄/,
  /银行卡收购/,
  /手机卡收购/,
  /私募.*?基金/,
  /(?:境外.*?)?(?:博彩|赌博).*(?:返利|获利|带单)/,

  // VIP / paid-resource upgrade ads (common in resource-sharing channel spam)
  /(?:想要|需要|立即|即刻|赶紧|请).{0,4}(?:购买|加入|开通|升级).*?VIP/i,
  /VIP.{0,6}(?:解锁|激活|开通|会员|特权)/i,
  /(?:进阶|高级|付费|深度).{0,2}(?:资源|内容|教程|服务).{0,4}(?:解锁|购买|获取|订阅)/,
  /(?:官方|正版).{0,2}(?:购买|商城|店铺|商店|渠道)/,
  /解锁.*?(?:无限|全部|专属|独家).{0,4}(?:资源|内容|权限|功能)/,
  /购买.*?(?:进阶|升级|高级|完整版|Pro|PRO)/,
  /点我.{0,3}(?:进入|前往|跳转).{0,3}(?:官方|商城|购买|店铺)/,
  /👉.*?(?:购买|商城|下单|抢购|优惠)/,
  /(?:限时|特惠|优惠|活动).{0,4}(?:加入|开通|升级).{0,2}VIP/i,

  // Investment / recruitment scams (pig-butchering & pyramid schemes)
  /带单老师/,
  /导师带单/,
  /投资导师/,
  /内幕.*?带单/,
  /充值.*?返利/,
  /拉人头/,
  /发展下线/,
  /团队长/,
  /稳赚不赔/,
  /保本.*?收益/,
  /老师.*?喊单/,
  /外汇.*?带单/,
  /日结.*?兼职/,
  /宝妈.*?兼职/,
  /打字.*?兼职/,
  /高佣.*?推广/,
]

/** Escape a literal string for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Cache for operator-provided BLOCK_KEYWORDS so repeated calls don't re-parse. */
let extraPatternsCache: { key: string, patterns: RegExp[] } | null = null

/**
 * Resolve operator-configured extra block keywords from the `BLOCK_KEYWORDS`
 * environment variable. Comma / space / full-width-comma separated. Cached per
 * raw value so the parse only happens once per unique configuration.
 */
function resolveExtraPatterns(env?: Record<string, string | undefined>): RegExp[] {
  const raw = env?.BLOCK_KEYWORDS
  if (!raw) {
    return []
  }

  if (extraPatternsCache && extraPatternsCache.key === raw) {
    return extraPatternsCache.patterns
  }

  const patterns = raw
    .split(/[,，\s]+/)
    .map(keyword => keyword.trim())
    .filter(Boolean)
    .map(keyword => new RegExp(escapeRegExp(keyword), 'i'))

  extraPatternsCache = { key: raw, patterns }
  return patterns
}

/**
 * Strip HTML tags and decode the most common entities so the filter sees the same
 * text a reader does — this also defeats naive obfuscation like `博<b>彩</b>`.
 */
export function stripHtml(raw: string | null | undefined): string {
  if (!raw) {
    return ''
  }

  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0?39;/g, '\'')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Lowest-index banned pattern that matches, or null when the text is allowed. */
export function findBlockedReason(raw: string | null | undefined, env?: Record<string, string | undefined>): RegExp | null {
  if (!raw) {
    return null
  }

  const text = stripHtml(raw).toLowerCase()
  const patterns = BUILTIN_PATTERNS.concat(resolveExtraPatterns(env))

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return pattern
    }
  }

  return null
}

/** True when the text promotes adult / gambling / drug / gray-black financial content. */
export function isBlockedContent(raw: string | null | undefined, env?: Record<string, string | undefined>): boolean {
  return findBlockedReason(raw, env) !== null
}
