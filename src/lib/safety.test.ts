import { describe, expect, it } from 'vitest'
import { findBlockedReason, isBlockedContent } from './safety'

describe('content safety filter', () => {
  it('blocks adult content', () => {
    expect(isBlockedContent('免费裸聊 加微信')).toBe(true)
  })

  it('blocks gambling', () => {
    expect(isBlockedContent('正规博彩平台 注册送彩金')).toBe(true)
  })

  it('blocks drugs', () => {
    expect(isBlockedContent('出售冰毒 价格优惠')).toBe(true)
  })

  it('blocks gray/black-market finance', () => {
    expect(isBlockedContent('杀猪盘 日赚500')).toBe(true)
    expect(isBlockedContent('714高炮 秒下款')).toBe(true)
  })

  it('allows net-disk resource sharing', () => {
    expect(isBlockedContent('百度网盘 资源分享 自取')).toBe(false)
    expect(isBlockedContent('夸克网盘 课程资料下载')).toBe(false)
  })

  it('allows ordinary tech/news content', () => {
    expect(isBlockedContent('今天发布了新版本，修复了一些已知问题')).toBe(false)
    expect(isBlockedContent('Blockchain weekly digest about USDT stablecoin')).toBe(false)
  })

  it('blocks expanded gambling / scam slang', () => {
    expect(isBlockedContent('澳门 百家乐 真人视讯 注册送彩金')).toBe(true)
    expect(isBlockedContent('导师带单 稳赚不赔 加微信')).toBe(true)
    expect(isBlockedContent('重庆时时彩 计划群 倍投 上分下分')).toBe(true)
    expect(isBlockedContent('正规博彩平台 注册送彩金')).toBe(true)
  })

  it('allows normal finance / crypto / life discussion', () => {
    expect(isBlockedContent('A股今日大盘收评：沪指微涨')).toBe(false)
    expect(isBlockedContent('房贷利率下调，月供减少')).toBe(false)
    expect(isBlockedContent('USDT 稳定币 weekly digest about crypto')).toBe(false)
    expect(isBlockedContent('今天发布了新版本，修复了一些已知问题')).toBe(false)
  })

  it('honors the BLOCK_KEYWORDS env for operator extensions', () => {
    expect(isBlockedContent('这是一段正常内容 测试屏蔽词', { BLOCK_KEYWORDS: '测试屏蔽词' })).toBe(true)
    expect(isBlockedContent('这是一段正常内容 测试屏蔽词')).toBe(false)
    expect(isBlockedContent('another 测试屏蔽词 here', { BLOCK_KEYWORDS: 'foo, 测试屏蔽词, bar' })).toBe(true)
  })

  it('findBlockedReason returns the matching pattern or null', () => {
    expect(findBlockedReason('赌博推广')).not.toBeNull()
    expect(findBlockedReason('正常的内容分享')).toBeNull()
  })
})
