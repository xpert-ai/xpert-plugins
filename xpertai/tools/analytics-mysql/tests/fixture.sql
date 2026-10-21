-- Insert into the documented orders table; administrative test setup only.
INSERT INTO orders (order_id,ordered_at,region,status,paid_amount,refund_amount) VALUES
('ld-01','2026-07-05','east','paid',1200,200),
('ld-02','2026-07-06','west','paid',800,0),
('ld-03','2026-07-10','east','cancelled',9999,0),
('ld-04','2026-08-01','east','paid',2000,500),
('ld-05','2026-08-12','west','paid',1000,100),
('ld-06','2026-09-05','east','paid',1000,0),
('ld-07','2026-09-09','west','paid',600,100),
('ld-08','2026-06-30','east','paid',8888,0),
('ld-09','2026-10-01','west','paid',7777,0);
