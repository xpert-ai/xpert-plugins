import manifest from './signature-modules.json';
import { definition } from './theme.js';
import { createTemplateSignaturePages } from '../generated-theme-common/template-signature-pages.jsx';

const cfg={
  displayName:definition.displayName,dialect:'halo',tokens:definition.tokens,
  heading:definition.profile.heading,body:definition.profile.body,radius:14,surface:'#0d2758',activeText:'#06183d',
  backgroundCss:definition.profile.backgroundCss,badge:'NODE / 01',
  content:{
    topic:'技术系统演进',coverTitle:'让每个技术节点形成光环',subtitle:'以深蓝画布、半透明光环和电光节点呈现产品与技术路径。',
    pillars:['系统架构','能力节点','验证路径','规模部署'],
    details:['以清晰边界组织核心模块。','让关键能力沿主轴协同。','用证据校准技术假设。','把可用能力扩展到真实场景。'],
    metrics:[{value:'99.95%',label:'服务可用性',note:'核心链路保持稳定运行'},{value:'42ms',label:'响应时延',note:'关键交互达到目标区间'},{value:'6.8×',label:'部署效率',note:'自动化能力持续放大'}],
    segments:[{label:'计算层',value:34},{label:'数据层',value:28},{label:'应用层',value:24},{label:'治理层',value:14}],
    summary:'让架构、节点和路径在同一深蓝系统中形成可验证、可扩展的技术闭环。',center:'技术中枢',
    nodes:['数据入口','模型能力','服务编排','安全治理','产品体验','监测反馈'],labels:['性能水平','系统韧性','交付成熟度'],
    ranking:[{label:'稳定性',value:96},{label:'扩展性',value:88},{label:'响应速度',value:81},{label:'治理能力',value:73}],
    options:[{title:'单点突破',body:'集中验证关键技术节点并快速形成确定性。'},{title:'系统演进',body:'同步建设架构、治理和持续交付能力。'}],
    stages:[{title:'定义接口',body:'统一系统边界与约束'},{title:'验证节点',body:'完成关键能力测试'},{title:'编排系统',body:'连接数据与服务流程'},{title:'规模部署',body:'监测运行并持续优化'}],
    rows:[['架构','边界清晰','增强弹性设计','技术'],['性能','达到目标','持续压缩时延','平台'],['安全','规则完备','强化主动治理','安全'],['交付','自动化提升','扩展多环境部署','工程']],
    statement:'真正的技术领先，是让复杂系统保持清晰。',transition:'从节点走向系统',closing:'以可验证节点连接下一阶段的技术演进。'
  }
};

export const signaturePages=createTemplateSignaturePages(cfg,manifest.modules);
