import manifest from './signature-modules.json';
import { definition } from './theme.js';
import { createTemplateSignaturePages } from '../generated-theme-common/template-signature-pages.jsx';

const cfg={
  displayName:definition.displayName,dialect:'spooky',tokens:definition.tokens,
  heading:definition.profile.heading,body:definition.profile.body,radius:12,surface:'#6f3191',activeText:'#fffaf4',
  backgroundCss:definition.profile.backgroundCss,badge:'TRICK / TREAT',
  content:{
    topic:'节日创意活动',coverTitle:'今晚，让故事亮起南瓜灯',subtitle:'用紫橙夜色、蜘蛛网、南瓜和糖果节点组织有戏剧性的活动内容。',
    pillars:['故事开场','怪趣角色','互动任务','惊喜收尾'],
    details:['用一句有张力的标题点亮夜晚。','让南瓜、蜘蛛和坩埚成为角色。','通过任务与选择推动参与。','用分享与合影完成节日记忆。'],
    metrics:[{value:'100%',label:'氛围拉满',note:'紫橙舞台形成强烈节日记忆'},{value:'12项',label:'互动挑战',note:'任务覆盖观察、选择与创作'},{value:'6幕',label:'故事章节',note:'从开场到收尾节奏清晰'}],
    segments:[{label:'故事',value:34},{label:'互动',value:30},{label:'装扮',value:22},{label:'分享',value:14}],
    summary:'让紫橙舞台、怪趣角色和互动任务共同推动一场可参与、可分享的节日故事。',center:'怪趣派对',
    nodes:['南瓜入口','角色装扮','糖果任务','故事舞台','互动挑战','合影分享'],labels:['活动参与','故事完成','节日记忆'],
    ranking:[{label:'故事氛围',value:96},{label:'互动参与',value:90},{label:'角色创意',value:82},{label:'传播记忆',value:76}],
    options:[{title:'TRICK 路径',body:'用谜题、挑战和意外推动活动节奏。'},{title:'TREAT 路径',body:'用奖励、分享和故事完成温暖收尾。'}],
    stages:[{title:'点亮南瓜',body:'建立故事开场与规则'},{title:'寻找糖果',body:'完成第一组互动任务'},{title:'穿过蛛网',body:'协作破解关键挑战'},{title:'坩埚庆典',body:'分享成果与节日记忆'}],
    rows:[['开场','舞台就绪','说明故事与规则','主持'],['装扮','角色确认','完成创意亮相','参与者'],['互动','任务发布','推动团队挑战','活动'],['收尾','奖励准备','合影与分享','全员']],
    statement:'最好的节日故事，永远需要观众亲自走进去。',transition:'穿过下一张蛛网',closing:'带走今晚的糖果，也带走一起创造的故事。'
  }
};

export const signaturePages=createTemplateSignaturePages(cfg,manifest.modules);
