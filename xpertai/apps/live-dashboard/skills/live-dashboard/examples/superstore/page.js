// No rows or backend endpoints belong here. All panels use governed query results.
(async () => {
  const live = window.xpertLiveArtifact;
  const {enhanceSelect:enhanceDashboardSelect,charts:TrendWorkspaceCharts}=window.TrendWorkspace;
  const status = document.getElementById('status');
  const selects = [...document.querySelectorAll('select[data-dashboard-control]')];
  const datasets = new Map();
  const chartIds = ['chart-primary', 'chart-secondary', ...(config.key === 'overview' ? ['chart-profit'] : [])];
  const charts = chartIds.map(id => window.echarts.init(document.getElementById(id), null, {renderer:'svg'}));
  const controls = {year:'',region:'',category:''};
  const integer = new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
  const decimal = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fields = config.measures;
  let failure = false;
  function number(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw Error('查询结果缺少必要指标。');
    const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw Error('数值超出安全展示范围。');return n;
  }
  function precise(value) {
    // Keep decimal strings exact until two-place display rounding; Number is only for ratios/plots.
    const raw=String(value);if(!/^-?\d+(\.\d+)?$/.test(raw))throw Error('金额格式不符合数据契约。');
    const negative=raw.startsWith('-');const [whole,tail='']=raw.replace('-','').split('.');
    let cents=BigInt(whole)*100n+BigInt((tail+'00').slice(0,2));if(Number(tail[2]??0)>=5)cents+=1n;
    return (negative&&cents?'-':'')+(cents/100n).toLocaleString('en-US')+'.'+String(cents%100n).padStart(2,'0');
  }
  function ratio(a,b){return b?decimal.format(a/b*100)+'%':'—';}
  function clear(message,isError=false){
    document.querySelectorAll('output').forEach(el=>el.textContent='—');
    document.getElementById('details-rows').replaceChildren();charts.forEach(chart=>{ chart.clear(); chart.getDom().removeAttribute('aria-label'); });
    status.textContent=message;status.classList.toggle('error',isError);
    document.getElementById('freshness').textContent='尚无当前查询结果';
  }
  function fail(message){failure=true;datasets.clear();clear(message,true);}
  function table(rows,dimension){
    const max=Math.max(1,...rows.map(row=>number(row.Sales)));
    document.getElementById('details-rows').replaceChildren(...rows.map(row=>{
      const tr=document.createElement('tr');
      const values=config.key==='customers'
        ?[row[dimension],precise(row.Sales),integer.format(number(row.Orders)),integer.format(number(row.Customers)),integer.format(number(row.ReturnedOrders)),ratio(number(row.ReturnedOrders),number(row.Orders)),precise(row.ReturnedSales)]
        :[row[dimension],precise(row.Sales),precise(row.Profit),ratio(number(row.Profit),number(row.Sales)),integer.format(number(row.Orders)),integer.format(number(row.Customers))];
      if(config.key==='overview')values.splice(4);
      for(const [index,value]of values.entries()){
        const td=document.createElement('td');td.textContent=String(value);
        if(config.key!=='customers'&&(index===2||index===3)&&number(row.Profit)<0)td.className='negative';
        if(index===1){const bar=document.createElement('span');bar.className='table-bar';bar.style.width=(Math.max(0,number(row.Sales))/max*100)+'%';bar.setAttribute('aria-hidden','true');td.append(bar);}
        tr.append(td);
      }return tr;
    }));
  }
  function render(){
    if(failure||config.bindings.some(id=>!datasets.has(id)))return;
    const summary=datasets.get('summary').rows;
    if(!summary.length||number(summary[0].Orders)===0){clear('当前筛选下没有订单，请调整年份、区域或品类。');return;}
    if(summary.length!==1)throw Error('总计必须由一个后端聚合行提供。');
    const s=summary[0];const sales=number(s.Sales),profit=config.key==='customers'?0:number(s.Profit),orders=number(s.Orders),customers=number(s.Customers),returned=config.key==='customers'?number(s.ReturnedOrders):0;
    const values=config.key==='customers'
      ?[integer.format(customers),integer.format(orders),orders?decimal.format(sales/orders):'—',integer.format(returned),ratio(returned,orders)]
      :[precise(s.Sales),precise(s.Profit),ratio(profit,sales),integer.format(orders),integer.format(customers)];
    values.forEach((value,i)=>{document.getElementById('metric-'+i).textContent=value;});
    const chartsUI = TrendWorkspaceCharts;
    const ranked = (rows, field) => [...rows].sort((a,b) => number(b[field]) - number(a[field]));
    if(config.key==='overview'){
      const trend=[...datasets.get('trend').rows].sort((a,b)=>a.OrderMonth.localeCompare(b.OrderMonth));
      chartsUI.line(charts[0],trend,{dimension:'OrderMonth',measure:'Sales',label:'销售额（USD）'});
      chartsUI.line(charts[2],trend,{dimension:'OrderMonth',measure:'Profit',label:'利润（USD）',color:'teal'});
      chartsUI.horizontal(charts[1],ranked(datasets.get('regions').rows,'Sales'),{dimension:'Region',measure:'Sales',label:'销售额（USD）'});
      table(ranked(datasets.get('categories').rows,'Sales'),'Category');
    }else if(config.key==='profitability'){
      const rows=ranked(datasets.get('subcategories').rows,'Profit');
      chartsUI.horizontal(charts[0],rows,{dimension:'SubCategory',measure:'Profit',label:'利润（USD）',color:'teal'});
      chartsUI.scatter(charts[1],rows,{dimension:'SubCategory',x:'Sales',y:'Profit',xLabel:'销售额（USD）',yLabel:'利润（USD）'});
      table([...rows].reverse(),'SubCategory');
    }else{
      chartsUI.horizontal(charts[0],ranked(datasets.get('segments').rows,'Sales'),{dimension:'Segment',measure:'Sales',label:'销售额（USD）'});
      chartsUI.horizontal(charts[1],ranked(datasets.get('regions').rows,'ReturnedOrders'),{dimension:'Region',measure:'ReturnedOrders',label:'退货订单数',decimals:0});
      table(datasets.get('segments').rows,'Segment');
    }
    status.textContent='所有指标与图表已按当前筛选更新。';status.classList.remove('error');
    const times=config.bindings.map(id=>datasets.get(id).freshness?.sourceFetchedAt).filter(Boolean).sort();
    document.getElementById('freshness').textContent=times.length?'查询时间：'+new Date(times[0]).toLocaleString('zh-CN'):'查询已完成（来源未提供时间）';
  }
  async function queryAll(){
    failure=false;datasets.clear();clear('正在查询当前筛选…');selects.forEach(el=>el.disabled=true);
    try{const results=await Promise.allSettled(config.bindings.map(id=>live.query(id,{...controls})));if(results.some(r=>r.status==='rejected'))throw Error('查询失败');}
    catch{fail('查询未完成，请检查数据权限或刷新重试。');}
    finally{selects.forEach(el=>el.disabled=false);}
  }
  try{
    const context=await live.ready();document.body.classList.toggle('dark',context.theme==='dark');
    if(config.bindings.length!==context.bindingIds.length||config.bindings.some(id=>!context.bindingIds.includes(id)))throw Error('看板缺少必要的数据绑定，请重新按完整配方制作。');
    Object.assign(controls,context.defaults);
    for(const id of config.bindings)live.subscribe(id,dataset=>{
      try{
        if(!dataset.completeness||dataset.completeness.truncated)throw Error('查询结果不完整，请缩小范围后重试。');
        for(const row of dataset.rows){for(const field of fields){if(row[field]===null||row[field]===undefined){if(field==='Sales'||field==='Profit'||field==='Quantity'||field==='ReturnedSales'){if(Number(row.Orders)===0)continue;}throw Error('必要指标为空，无法展示完整结果。');}number(row[field]);}}
        failure=false;datasets.set(id,dataset);render();
      }catch(error){fail(error.message||'查询结果不可用。');}
    });
    for(const select of selects){
      const key=select.dataset.dashboardControl;
      for(const [value,label]of config.options[key])select.add(new Option(label,JSON.stringify(value)));
      select.value=JSON.stringify(controls[key]);
      enhanceDashboardSelect(select);
      select.addEventListener('change',()=>{controls[key]=JSON.parse(select.value);void queryAll();});
    }
    const observer=new ResizeObserver(()=>charts.forEach(chart=>chart.resize()));observer.observe(document.querySelector('.analysis'));
    await queryAll();
  }catch(error){fail(error.message||'看板初始化失败，请刷新重试。');}
})();
