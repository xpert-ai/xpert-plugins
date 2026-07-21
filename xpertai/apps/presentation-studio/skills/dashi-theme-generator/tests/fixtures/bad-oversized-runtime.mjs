import React from 'react';

function BadOversizedPage() {
  return React.createElement('div',{style:{position:'relative',width:'100%',height:'100%',overflow:'hidden',background:'#f4f4f2'}},
    React.createElement('div',{style:{position:'absolute',left:20,top:120,fontSize:420,fontWeight:900,lineHeight:.9,color:'#222'}},'行动清单'),
    React.createElement('h2',{style:{position:'absolute',left:100,top:220,fontSize:64,lineHeight:1.1}},'行动清单'),
    React.createElement('p',{style:{position:'absolute',left:110,top:360,fontSize:34,lineHeight:1.4}},'这是一段会被异常超大标题覆盖的正文。'),
  );
}

export const runtimePages=[{
  key:'theme99_page001',
  sourceTheme:'theme99',
  moduleOrigin:'owned',
  moduleFamily:'general',
  defaultProps:{},
  Component:BadOversizedPage,
}];
