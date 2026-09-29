-- ============================================================================
-- 简历初筛 v5 存量乱码回填（spec §3.7 / task-2-brief）
--
-- 修复对象：库 ocap 的两张表，且只改下面两条语句点名的两列，其余列一律不动。
--   1) plugin_resume_screen_candidate."sourceFileName" —— busboy 把 multipart
--      文件名头按 latin1 解析，UTF-8 字节被当成 latin1 字符再存一次，形成
--      「双重编码」乱码（可逆，本次命中 11 行）。
--   2) xpert.title —— 同一链路的中文名在更早版本已被不可逆替换成 U+FFFD，
--      原始字节没有留存，只能按权威源改写（权威源：插件
--      src/xpert-resume-screen-assistant.yaml:4/66 = 简历初筛助手；本行为历史
--      复测实例，(复测) 后缀是该行原始意图）。
--
-- 幂等：两条 UPDATE 都带「未修复才命中」闸门，重复执行必然 UPDATE 0。
-- 安全：判据与平台 decodeMultipartFileName 同口径
--       （platform/packages/common/src/utils/file-name.ts:3-19），已正确的行、
--       以及不可逆损坏的行都不会被改写，避免二次损坏。
-- 执行：docker exec -i platform-db-1 psql -U postgres -d ocap \
--         -v ON_ERROR_STOP=1 -f - < backfill-v5.sql
-- 前置：先 pg_dump 备份这两张表（spec §3.7）。本脚本无 DDL、无 DELETE、不碰 sourceText。
--
-- 【Postgres 侧两个必须知道的坑（本脚本的写法由此决定）】
--
-- 坑一：convert_to(text,'LATIN1') 会抛错，而 Node 端同名操作不会。
--   JS 里 Buffer.from(decoded,'utf8').toString('latin1') === value 是纯字节比较、
--   永不抛错；Postgres 的 convert_to() 遇到非 latin1 码点直接抛
--   “character with byte sequence ... has no equivalent in encoding LATIN1”。
--
-- 坑二：Postgres **不保证 WHERE 子句的求值顺序**，优化器可以把过滤条件下推进
--   子查询、或把子查询整体内联，于是「先判 ascii<=255 再解码」这种朴素写法失效：
--   已经修复好的中文行同样会被送去 convert_to(...,'LATIN1')，整条 UPDATE 报错。
--   后果很严重——首次执行成功后，任何第二次执行都会崩，脚本就不满足「幂等可重跑」。
--   解法：用 CROSS JOIN LATERAL + CASE 强制逐行短路求值（LATERAL 的子查询按行
--   相关执行，CASE 的分支求值有定义顺序），闸门 a 不通过的行直接产出 NULL 并被
--   rep IS NOT NULL 滤掉，convert_to 只在原值确为 latin1 序列的行上执行。
--
-- 【往返校验为什么写成长度比较】
--   目标判据是 JS 的 Buffer.from(decoded,'utf8').length === value.length。
--   Node 的 .length 是 UTF-16 码元数（BMP 汉字计 1），SQL 侧对应关系为：
--       octet_length(decoded)  ⇔  Buffer.from(decoded,'utf8').length
--       length(raw)            ⇔  value.length
--   即判据 c：octet_length(rep) = length(raw)。它是「raw = utf8(真实名字) 被当
--   latin1 读一遍」这一唯一故障形态的充要特征：
--     · 真中文行：octet_length(decoded)=octet_length(raw) 恒 > length(raw)，不命中
--       → 不会把正确名字再解一遍（防二次损坏）；
--     · ASCII 行：decoded = raw，被幂等闸门 d 排除，不改写；
--     · 含 U+FFFD 的不可逆串：由闸门 b 排除，交人工按权威源处理，禁止猜文件名；
--     · latin1 两层叠加：解码后字节数仍不等于原值字符数，由闸门 c 排除。
--
-- 【验证结论】在同一张表的「修复前副本」（把当前正确值重新走一遍故障链路生成）上，
--   本谓词恰好命中 11 行、跳过 3 行正确值；在当前已修复数据上命中 0 行且不抛错。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) 候选人来源文件名：latin1 双重编码 → UTF-8
-- ---------------------------------------------------------------------------
UPDATE plugin_resume_screen_candidate AS t
   SET "sourceFileName" = s.rep
  FROM (
        SELECT c.id, d.rep
          FROM plugin_resume_screen_candidate AS c
         -- 先把原值引到 v(raw)，保证下面的判定与解码按行短路执行
         CROSS JOIN LATERAL (VALUES (c."sourceFileName")) AS v(raw)
         CROSS JOIN LATERAL (
               SELECT CASE
                      -- 闸门 a：原值必须全部落在 latin1 单字节区（U+0000..U+00FF），
                      -- 否则它不是「UTF-8 被当 latin1 读」的产物；ascii()/length()
                      -- 永不抛错，因此可以安全地作为解码前置条件。
                      WHEN v.raw IS NOT NULL
                        AND NOT EXISTS (
                              SELECT 1
                                FROM generate_series(1, length(v.raw)) AS g(i)
                               WHERE ascii(substr(v.raw, g.i, 1)) > 255
                            )
                        -- 闸门 b：解码结果不得含 U+FFFD（不可逆损坏，见文件头说明）
                        AND position(chr(65533) in
                                     convert_from(convert_to(v.raw, 'LATIN1'), 'UTF8')) = 0
                      THEN convert_from(convert_to(v.raw, 'LATIN1'), 'UTF8')
                      ELSE NULL
                    END AS rep
             ) AS d
         WHERE d.rep IS NOT NULL
       ) AS s
 WHERE s.id = t.id
   -- 闸门 c：往返一致（等价于 Node 端字节长度校验，且不抛错）
   AND octet_length(s.rep) = length(t."sourceFileName")
   -- 幂等闸门 d：只有确实发生变化才更新，重复执行时第二遍不再命中
   AND s.rep <> t."sourceFileName";

-- ---------------------------------------------------------------------------
-- 2) 助手标题：U+FFFD 不可逆，按权威源改写唯一受害行
--    幂等闸门：改写后的标题不再含 U+FFFD，第二次执行 WHERE 自然匹配 0 行。
-- ---------------------------------------------------------------------------
UPDATE xpert
   SET title = '简历初筛助手(复测)'
 WHERE id = '82069b33-7aa4-47d3-9c7c-ec5c5fa5fd7a'
   AND position(chr(65533) in title::text) > 0;

COMMIT;

-- ---------------------------------------------------------------------------
-- 3) 历史行的 filePath 无法回填（上传时文件字节从未落盘），因此 hasFile=false 由
--    服务端投影派生，本脚本不写任何文件相关列，也不碰 sourceText（该列由后续
--    Task 通过 TypeORM synchronize 下线）。
-- ---------------------------------------------------------------------------

-- ============================ 验收查询（必须均为 0 行）=======================
-- 注意：U+FFFD 检测只能用 position(chr(65533) in col)；LIKE '%\ufffd%' 在
-- standard_conforming_strings 下是假阴性。

SELECT id FROM xpert
 WHERE position(chr(65533) in title::text) > 0;

SELECT id FROM plugin_resume_screen_candidate
 WHERE position(chr(65533) in "sourceFileName"::text) > 0;
