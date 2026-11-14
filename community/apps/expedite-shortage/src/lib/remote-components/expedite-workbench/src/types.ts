/**
 * 界面用到的数据类型：直接复用服务端 DTO 的类型（import type 编译后会被擦除，不会把服务端代码打进 app.js）。
 */
import type { FindingDto, JobDto, LogDto, RequestDto } from '../../../dto'
import type { RequestStatus } from '../../../types'

export type { FindingDto, JobDto, LogDto, RequestDto, RequestStatus }

export interface RequestDetail {
  request: RequestDto
  currentJob: JobDto | null
  findings: FindingDto[]
  jobs: JobDto[]
  logs: LogDto[]
  asOfDate: string
  serverTime: string
  timeoutMs: number
}

export interface RequestList {
  items: RequestDto[]
  total: number
  page: number
  pageSize: number
}

/** 新建对话框的选项：产品下拉 + 基准日（用于日期校验） */
export interface FormOptions {
  asOfDate: string
  products: { code: string; name: string }[]
}

/** getViewData 的返回：item 里放列表、（可选的）详情和新建对话框选项 */
export interface ViewData {
  item: { list: RequestList; detail: RequestDetail | null; form: FormOptions }
}

/** 视图查询：参数只能是标量 */
export interface ViewQuery {
  page?: number
  pageSize?: number
  search?: string
  selectionId?: string
  parameters?: Record<string, string | number | boolean>
}
