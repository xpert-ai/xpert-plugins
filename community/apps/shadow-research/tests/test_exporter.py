import unittest,sqlite3,tempfile,json,importlib.util,hashlib
from contextlib import closing
from pathlib import Path

spec=importlib.util.spec_from_file_location('export_shadow',Path(__file__).parents[1]/'scripts/export-shadow.py')
exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)

class ExportTests(unittest.TestCase):
 def test_read_only_whitelist_and_unknown_market_metrics(self):
  cache=Path(__file__).parents[1]/'.cache';cache.mkdir(exist_ok=True)
  with tempfile.TemporaryDirectory(dir=cache) as tmp:
   p=Path(tmp)/'source.db'
   report={'cutoff':'2026-10-23T14:30:00+08:00','pool':[{
     'code':'600000','name':'样例','quote_time':'20261023142900','price':10,'amount':1e8,
     'change_pct':1,'turnover_pct':2,'volume_ratio':'','pe_ratio':12,'private_score':999,'api_key':'must-not-export'}],
     'baseline':{'private_model':'secret'},'evidence':{}}
   with closing(sqlite3.connect(p)) as db:
    db.execute('create table experiments(day text,payload text)')
    db.execute('insert into experiments values(?,?)',('2026-10-23',json.dumps(report)))
    db.commit()
   before=hashlib.sha256(p.read_bytes()).hexdigest()
   exported=exporter.export(p,'2026-10-23',20)
   self.assertEqual(exported['stocks'][0]['volume_ratio'],None)
   self.assertNotIn('private_score',json.dumps(exported));self.assertNotIn('api_key',json.dumps(exported))
   self.assertEqual(exported['stocks'][0]['quote_time'],'2026-10-23T14:29:00+08:00')
   self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),before)

if __name__=='__main__':unittest.main()
