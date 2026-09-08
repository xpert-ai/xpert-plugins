import path from 'node:path'

export function sandboxChildEnvironment(workRoot) {
  return {
    INIT_CWD: workRoot,
    DASHI_PPT_THEME_RUNTIME: 'prebuilt',
    DASHI_PPT_CERT_DIR: path.join(workRoot, '.https-preview'),
    HOME: path.join(workRoot, '.home')
  }
}
