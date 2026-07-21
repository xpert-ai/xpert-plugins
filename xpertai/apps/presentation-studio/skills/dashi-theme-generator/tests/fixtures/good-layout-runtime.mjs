import React from 'react';

function GoodPage() {
  return React.createElement('div',{style:{position:'relative',width:'100%',height:'100%',overflow:'hidden',padding:96,background:'#f4f4f2'}},
    React.createElement('div',{style:{fontSize:24,letterSpacing:'.12em',color:'#ee7a2f'}},'PROJECT UPDATE'),
    React.createElement('h2',{style:{maxWidth:980,margin:'80px 0 28px',fontSize:88,lineHeight:1.08}},'清晰的信息层级'),
    React.createElement('p',{style:{maxWidth:920,fontSize:32,lineHeight:1.5}},'标题、正文和装饰元素都保持在安全画布内，并且彼此没有异常覆盖。'),
  );
}

export const runtimePages=[{
  key:'theme99_page001',
  sourceTheme:'theme99',
  moduleOrigin:'owned',
  moduleFamily:'general',
  defaultProps:{},
  Component:GoodPage,
}];
