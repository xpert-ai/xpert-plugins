export const MSSQL_ICON = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
  '<rect width="64" height="64" rx="8" fill="#cc2927"/>',
  '<path fill="#fff" d="M13 16l17-6v44l-17-6zm21 1h17v8H34zm0 11h17v8H34zm0 11h17v8H34z"/>',
  '</svg>'
].join('')

export function typeToMssql(
  type: string,
  length?: number
): string {
  switch (type.toLowerCase()) {
    case 'number':
    case 'int':
    case 'integer':
      return 'INT'
    case 'numeric':
    case 'float':
    case 'double':
      return 'FLOAT'
    case 'date':
      return 'DATE'
    case 'datetime':
    case 'timestamp':
      return 'DATETIME'
    case 'boolean':
    case 'bool':
      return 'BIT'
    case 'string':
    case 'text':
    default:
      return `VARCHAR(${length ?? 1000})`
  }
}
