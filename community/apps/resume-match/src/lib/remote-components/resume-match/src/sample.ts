export interface AnalysisFormValues {
  candidateName: string
  candidateTitle: string
  candidateYears: string
  candidateCity: string
  candidatePhone: string
  candidateEmail: string
  jobTitle: string
  company: string
  jobCity: string
  salary: string
  jobText: string
  resumeText: string
}

export const EMPTY_FORM: AnalysisFormValues = {
  candidateName: '',
  candidateTitle: '',
  candidateYears: '',
  candidateCity: '',
  candidatePhone: '',
  candidateEmail: '',
  jobTitle: '',
  company: '',
  jobCity: '',
  salary: '',
  jobText: '',
  resumeText: ''
}

export const SAMPLE_FORM: AnalysisFormValues = {
  candidateName: '林晓雯',
  candidateTitle: '高级后端工程师',
  candidateYears: '6',
  candidateCity: '杭州',
  candidatePhone: '138****5621',
  candidateEmail: 'lin.xiaowen@example.cn',
  jobTitle: '高级后端工程师',
  company: '云帆科技',
  jobCity: '杭州',
  salary: '25-40K·14薪',
  jobText: `岗位职责
1. 负责云原生招聘平台核心服务的设计、开发与稳定性治理。
2. 使用 Python 与 FastAPI 构建高并发业务接口，持续优化接口性能。
3. 负责 PostgreSQL、Redis、消息队列等基础组件的选型与容量规划。
4. 参与服务拆分、领域建模和关键链路的可观测性建设。
5. 与产品、算法和前端团队协作，推动业务需求高质量交付。

任职要求
1. 本科及以上学历，计算机相关专业，6 年以上后端开发经验。
2. 精通 Python，熟悉 FastAPI、Node.js 等主流服务端技术。
3. 熟悉 PostgreSQL、Redis，具备复杂 SQL 与缓存设计经验。
4. 熟悉云服务与容器化部署，有 AWS、Kubernetes 实践经验。
5. 有消息队列、分布式系统和高可用架构经验者优先。
6. 具备良好的系统设计能力和跨团队沟通能力。`,
  resumeText: `林晓雯，女，1994 年生，现居杭州，求职状态：在职，考虑机会。
手机：138****5621    邮箱：lin.xiaowen@example.cn

教育背景
2012.09-2016.06  浙江工业大学  计算机科学与技术  本科

工作经历
2021.03-至今  云帆科技  高级后端工程师
负责招聘业务中台的服务端架构与核心接口，服务日均请求量约 800 万。
主导候选人搜索服务重构，将平均响应时间从 420ms 降至 180ms。
使用 Python、FastAPI、PostgreSQL 建设岗位与简历匹配服务，支撑 12 个业务方。
引入 Redis 多级缓存与 Kafka 异步处理，峰值期间接口可用性保持在 99.98%。
推动服务容器化并迁移至 AWS EKS，建立灰度发布与链路追踪机制。
带领 3 人小组完成服务拆分，制定接口规范和代码评审流程。

2018.07-2021.02  星澜网络  后端工程师
参与电商订单系统开发，负责库存、优惠券和履约接口。
使用 Node.js 与 PostgreSQL 重构订单查询链路，降低数据库慢查询数量。
建设 Redis 缓存与消息队列消费服务，支持大促期间的流量削峰。

2016.07-2018.06  明川信息  初级后端工程师
参与企业协同办公系统的接口开发与运维。
编写 Python 数据处理脚本，负责日志分析与异常告警。

项目经历
招聘搜索与匹配平台（2022.05-2024.12）
担任后端负责人，完成岗位画像、简历解析结果存储、检索与排序接口。
设计分页与游标查询方案，支撑千万级候选人数据的稳定检索。
建立压测基线，核心接口 P95 延迟稳定在 220ms 以内。

技能
Python、FastAPI、Node.js、PostgreSQL、Redis、Kafka、AWS、Docker、Kubernetes、系统设计。
英语可作为工作语言。`
}
