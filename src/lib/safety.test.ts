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

  it('findBlockedReason returns the matching pattern or null', () => {
    expect(findBlockedReason('赌博推广')).not.toBeNull()
    expect(findBlockedReason('正常的内容分享')).toBeNull()
  })
})
