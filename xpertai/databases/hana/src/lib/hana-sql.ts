/** HANA SELECT policy: quoted identifiers/literals are lexed before statement and function checks. */
interface Token { value: string; kind: 'word' | 'identifier' | 'literal' | 'symbol' }

const forbidden = new Set(`INSERT UPDATE DELETE UPSERT MERGE CREATE ALTER DROP TRUNCATE RENAME
  CALL DO EXEC EXECUTE INTO EXPORT IMPORT LOAD GRANT REVOKE SET COMMIT ROLLBACK
  LOCK UNLOCK NEXTVAL CURRVAL FOR`.split(/\s+/))
const functions = new Set(`ABS ACOS ASIN ATAN ATAN2 AVG CAST CEIL CEILING COALESCE CONCAT
  COS COUNT CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DAYOFMONTH DAYS_BETWEEN EXTRACT
  FLOOR GREATEST HOUR IFNULL LAST_DAY LEAST LEFT LENGTH LN LOCATE LOG LOWER LPAD LTRIM
  MAX MIN MINUTE MOD MONTH MONTHS_BETWEEN NANO100_BETWEEN NULLIF POWER REPLACE RIGHT
  ROUND RPAD RTRIM SECOND SECONDS_BETWEEN SIGN SIN SQRT STDDEV STDDEV_POP STDDEV_SAMP
  SUBSTR SUBSTRING SUM TAN TO_BIGINT TO_DATE TO_DECIMAL TO_DOUBLE TO_INTEGER TO_NVARCHAR
  TO_SECONDDATE TO_TIME TO_TIMESTAMP TO_VARCHAR TRIM UPPER VAR_POP VAR_SAMP WEEK WEEKDAY
  YEAR ADD_DAYS ADD_MONTHS ADD_SECONDS ADD_YEARS STRING_AGG ROW_NUMBER RANK DENSE_RANK
  LAG LEAD FIRST_VALUE LAST_VALUE DECIMAL SMALLDECIMAL NVARCHAR VARCHAR DOUBLE FLOAT
  AS IN EXISTS OVER PARTITION SELECT WITH FROM JOIN AND OR NOT ON USING GROUPING
  ROLLUP CUBE DISTINCT WHERE HAVING CASE WHEN THEN ELSE`.split(/\s+/))

function tokens(source: string): Token[] {
  if (!source.trim() || source.length > 32000 || source.includes('\0')) throw new Error('HANA_SQL_INVALID')
  const result: Token[] = []
  for (let i = 0; i < source.length;) {
    const c = source[i]
    if (/\s/.test(c)) { i++; continue }
    if (source.startsWith('--', i)) { while (i < source.length && source[i] !== '\n') i++; continue }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      if (end < 0 || source.slice(i + 2, end).includes('/*')) throw new Error('HANA_SQL_COMMENT_INVALID')
      i = end + 2; continue
    }
    if (c === "'" || c === '"') {
      let closed = false
      for (i++; i < source.length; i++) {
        if (source[i] !== c) continue
        if (source[i + 1] === c) { i++; continue }
        i++; closed = true; break
      }
      if (!closed) throw new Error('HANA_SQL_QUOTE_INVALID')
      result.push({ value: '', kind: c === "'" ? 'literal' : 'identifier' }); continue
    }
    const word = source.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/)?.[0]
    if (word) { result.push({ value: word.toUpperCase(), kind: 'word' }); i += word.length; continue }
    if (!/[0-9?.,()+\-*/%<>=!|:;]/.test(c)) throw new Error('HANA_SQL_TOKEN_UNSUPPORTED')
    result.push({ value: c, kind: 'symbol' }); i++
  }
  return result
}

export function validateHanaRead(sql: string, parameterCount: number): string {
  const parsed = tokens(sql)
  if (parsed.at(-1)?.value === ';') parsed.pop()
  if (!['SELECT', 'WITH'].includes(parsed[0]?.value) || parsed.some((token) =>
    token.value === ';' || (token.kind === 'word' && forbidden.has(token.value)))) {
    throw new Error('HANA_READ_ONLY_REQUIRED')
  }
  for (let i = 0; i < parsed.length - 1; i++) {
    if (parsed[i + 1].value !== '(') continue
    const token = parsed[i]
    if (token.kind === 'identifier' || (token.kind === 'word' &&
      (!functions.has(token.value) || parsed[i - 1]?.value === '.'))) {
      throw new Error('HANA_FUNCTION_UNSUPPORTED')
    }
  }
  if (parsed.filter((token) => token.value === '?').length !== parameterCount) {
    throw new Error('HANA_PARAMETER_COUNT_INVALID')
  }
  return sql.trim().replace(/;\s*$/, '')
}

export function quoteHanaIdentifier(name: string): string {
  // eslint-disable-next-line no-control-regex
  if (!name || name.length > 127 || /[\x00-\x1f]/.test(name)) throw new Error('HANA_IDENTIFIER_INVALID')
  return '"' + name.replaceAll('"', '""') + '"'
}
