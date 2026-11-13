/**
 * 时钟：Service 通过注入拿到“现在几点”，单测可以换成固定时间来测超时。
 * Python 类比：把 datetime.now 作为参数传进去，测试时传一个假的。
 */
export interface Clock {
  now(): Date
}

/** 依赖注入令牌（interface 运行时不存在，所以用 Symbol 当令牌） */
export const EXPEDITE_CLOCK = Symbol('EXPEDITE_CLOCK')

export const systemClock: Clock = { now: () => new Date() }
