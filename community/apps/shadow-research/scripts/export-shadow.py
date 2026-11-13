"""Read an existing shadow DB without importing or executing the stock application."""
import argparse,json,sqlite3,math,re
from contextlib import closing
from pathlib import Path
from datetime import datetime

def export(db_path,day,limit):
    with closing(sqlite3.connect(Path(db_path).resolve().as_uri()+'?mode=ro',uri=True)) as db:
        row=db.execute('SELECT payload FROM experiments WHERE day=?',(day,)).fetchone()
    if not row:raise ValueError('No shadow experiment for the requested day')
    report=json.loads(row[0]);stocks=[]
    for r in sorted(report['pool'],key=lambda r:float(r.get('amount') or 0),reverse=True):
        if not re.fullmatch(r'(000|001|002|003|600|601|603|605)\d{3}',str(r.get('code',''))):continue
        if str(r.get('name','')).upper().find('ST')>=0:continue
        stamp=str(r.get('quote_time',''))
        if re.fullmatch(r'\d{14}',stamp):stamp=datetime.strptime(stamp,'%Y%m%d%H%M%S').isoformat()+'+08:00'
        item={'code':r['code'],'name':r['name'],'quote_time':stamp}
        for key in ('price','amount','change_pct','turnover_pct','volume_ratio','pe_ratio'):
            value=r.get(key)
            if value in (None,'') and key in ('pe_ratio','turnover_pct','volume_ratio'):item[key]=None;continue
            if value is None:raise ValueError(f'Missing public metric {key} for {r["code"]}; do not invent values')
            value=float(value)
            if not math.isfinite(value):raise ValueError('Non-finite market metric')
            item[key]=value
        stocks.append(item)
        if len(stocks)>=limit:break
    codes={r['code'] for r in stocks};financials=[]
    for e in report.get('evidence',{}).values():
        if e.get('tool')!='get_financials' or e.get('code') not in codes:continue
        data=e.get('result',{});rows=data.get('reports',[])
        if not rows:continue
        f=rows[0];disclosed=f.get('disclosed_at')
        # Date-only disclosure records use the conservative next-day visibility boundary.
        if not disclosed or len(str(disclosed))!=10:continue
        from datetime import timedelta
        visibility=(datetime.fromisoformat(disclosed)+timedelta(days=1)).isoformat()+'+08:00'
        if datetime.fromisoformat(visibility)>datetime.fromisoformat(report['cutoff']):continue
        financials.append({'code':e['code'],'disclosed_at':visibility,'report_date':str(f['report_date'])[:10],
            'source':str(data.get('source') if isinstance(data.get('source'),str) else 'Exported shadow financial evidence')[:200],
            **{k:(float(f[k]) if f.get(k) not in (None,'') else None) for k in ('revenue_yoy_pct','profit_yoy_pct','roe_pct')}})
    financials=list({f['code']:f for f in financials}.values())
    if not stocks:raise ValueError('No eligible public snapshots; original files were not changed')
    return {'source':f'Existing shadow experiment {day}; bounded public snapshot export',
        'kind':'historical','cutoff':report['cutoff'],'stocks':stocks,'financials':financials}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--db',required=True);p.add_argument('--day',required=True)
    p.add_argument('--limit',type=int,default=20);p.add_argument('--output',required=True);args=p.parse_args()
    if not 1<=args.limit<=2000:p.error('--limit must be 1..2000')
    payload=export(args.db,args.day,args.limit)
    destination=Path(args.output);destination.parent.mkdir(parents=True,exist_ok=True)
    if destination.exists():raise SystemExit('Output exists; choose a new filename')
    destination.write_text(json.dumps(payload,ensure_ascii=False,allow_nan=False,indent=2),encoding='utf-8')
    print(f'Exported {len(payload["stocks"])} stocks and {len(payload["financials"])} financial records. No credentials or formal scores exported.')
