/**
 * Content safety filter.
 *
 * Used to block posts (and any operator-configured ad/banner HTML) that promote
 * adult, gambling, drug, or gray/black-market financial content, while explicitly
 * allowing ordinary net-disk resource sharing and normal link/content sharing.
 *
 * The pattern list is intentionally targeted at unambiguous banned terms to avoid
 * false positives on legitimate tech / news / crypto-discussion channels.
 */

// Each entry is matched case-insensitively against the normalized text.
// Lookbehinds (`(?<!...)`) keep English matches precise (e.g. `casino` but not `debate`).
const BLOCKED_PATTERNS: RegExp[] = [
  // Adult / porn
  /色情/,
  /裸聊/,
  /约炮/,
  /性爱/,
  /成人视频/,
  /成人网站/,
  /AV女优/,
  /卖淫/,
  // Gambling / lottery / betting
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
  /(?<![a-z])casino/i,
  /(?<![a-z])gambling/i,
  /(?<![a-z])porn/i,
  /(?<![a-z])bet365/i,
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
]

/** Lowest-index banned pattern that matches, or null when the text is allowed. */
export function findBlockedReason(raw: string | null | undefined): RegExp | null {
  if (!raw) {
    return null
  }

  const text = raw.toLowerCase()
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return pattern
    }
  }

  return null
}

/** True when the text promotes adult / gambling / drug / gray-black financial content. */
export function isBlockedContent(raw: string | null | undefined): boolean {
  return findBlockedReason(raw) !== null
}
