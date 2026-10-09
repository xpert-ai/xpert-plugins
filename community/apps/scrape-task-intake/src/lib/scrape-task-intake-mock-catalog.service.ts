import { Injectable } from '@nestjs/common'

export interface ScrapeSiteTemplate {
  key: string
  name: string
  description: string
  fieldTemplates: { name: string; description: string; example?: string; required?: boolean }[]
}

const SITE_TEMPLATES: ScrapeSiteTemplate[] = [
  {
    key: 'ecommerce_product',
    name: '电商商品页',
    description: '商品详情页与列表页采集，字段模板覆盖商品主数据、价格与评价。',
    fieldTemplates: [
      { name: '商品名称', description: '商品标题或 SKU 名称', example: '无线蓝牙耳机 Pro', required: true },
      { name: '价格', description: '当前售价，保留币种', example: '299.00 CNY', required: true },
      { name: '店铺名称', description: '卖家或店铺名', example: 'XX 官方旗舰店' },
      { name: '销量', description: '月销或累计销量', example: '月销 2.3 万+' },
      { name: '评价数', description: '累计评价数量', example: '48521' },
      { name: '商品链接', description: '商品详情页 URL', example: 'https://example.com/item/10001', required: true }
    ]
  },
  {
    key: 'news_article',
    name: '新闻资讯文章',
    description: '新闻站点文章列表与正文采集。',
    fieldTemplates: [
      { name: '标题', description: '文章标题', example: 'XX 发布新政策', required: true },
      { name: '正文', description: '文章正文内容', example: '全文文本', required: true },
      { name: '发布时间', description: '发布时间，格式 YYYY-MM-DD HH:mm', example: '2026-09-16 08:30', required: true },
      { name: '来源', description: '文章来源或作者', example: 'XX 新闻社' },
      { name: '链接', description: '文章 URL', example: 'https://example.com/news/123', required: true }
    ]
  },
  {
    key: 'enterprise_directory',
    name: '企业名录',
    description: '企业信息目录类站点采集。',
    fieldTemplates: [
      { name: '公司名称', description: '企业全称', example: 'XX 科技有限公司', required: true },
      { name: '联系人', description: '联系人姓名' },
      { name: '联系电话', description: '联系电话' },
      { name: '地址', description: '注册或办公地址' },
      { name: '主营产品', description: '主营业务或产品线' }
    ]
  }
]

const FREQUENCIES = [
  { key: 'once', name: '一次性采集' },
  { key: 'daily', name: '每日更新' },
  { key: 'weekly', name: '每周更新' },
  { key: 'monthly', name: '每月更新' },
  { key: 'manual', name: '手动触发' }
]

const DELIVERY_FORMATS = [
  { key: 'csv', name: 'CSV 文件' },
  { key: 'json', name: 'JSON 文件' },
  { key: 'excel', name: 'Excel 文件' },
  { key: 'database', name: '写入数据库' }
]

const PAGES_SCOPES = [
  { key: 'list', name: '仅列表页' },
  { key: 'detail', name: '列表 + 详情页' },
  { key: 'search', name: '搜索页 + 详情页' },
  { key: 'full_site', name: '全站遍历' }
]

@Injectable()
export class ScrapeTaskIntakeMockCatalogService {
  getCatalog() {
    return {
      siteTemplates: SITE_TEMPLATES,
      crawlFrequencies: FREQUENCIES,
      deliveryFormats: DELIVERY_FORMATS,
      pagesScopes: PAGES_SCOPES,
      complianceChecklist: [
        '采集前确认目标站点 robots.txt 与用户协议(ToS)是否允许自动化访问',
        '确认目标数据是否涉及个人信息或受保护内容,评估合规边界',
        '控制请求频率,避免对目标站点造成压力',
        '需要登录态时,确认账号授权范围与使用规范',
        '交付前验证数据质量与字段完整性'
      ]
    }
  }

  getSiteTemplate(key?: string) {
    if (!key) return undefined
    return SITE_TEMPLATES.find((item) => item.key === key)
  }
}
