CREATE SCHEMA IF NOT EXISTS margin_demo_20261120;
CREATE TABLE IF NOT EXISTS margin_demo_20261120.performance(period text, stage text, product text, plant text, actual_margin numeric, budget_margin numeric, revenue numeric, material_cost numeric, budget_cost numeric, PRIMARY KEY(period,stage,product,plant));
INSERT INTO margin_demo_20261120.performance VALUES
('2026-09','baseline','精密电机 M200','苏州一厂',22,24,1000000,780000,760000),
('2026-10','baseline','精密电机 M200','苏州一厂',19,24,1200000,972000,912000),
('2026-11','baseline','精密电机 M200','苏州一厂',17,24,1500000,1245000,1140000),
('2026-11','review','精密电机 M200','苏州一厂',21,24,1500000,1185000,1140000) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS margin_demo_20261120.purchase_facts(po text PRIMARY KEY,period text,product text,plant text,supplier text,material text,quantity numeric,actual_price numeric,budget_price numeric,excess_cost numeric);
INSERT INTO margin_demo_20261120.purchase_facts VALUES
('DEMO-PO-450001','2026-11','精密电机 M200','苏州一厂','华东精密材料（演示）','铜线组件',1000,580,500,80000),
('DEMO-PO-450002','2026-11','精密电机 M200','苏州一厂','苏南磁材（演示）','永磁体',1000,225,200,25000) ON CONFLICT DO NOTHING;