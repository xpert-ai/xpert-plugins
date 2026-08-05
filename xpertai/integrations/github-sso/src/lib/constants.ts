export const GITHUB_SSO_ARTIFACT_NAMESPACE = 'github_sso'

export const GITHUB_SSO_PLUGIN_RUNTIME_METADATA = {
  level: 'system',
  artifactNamespace: GITHUB_SSO_ARTIFACT_NAMESPACE
} as const

export const GITHUB_SSO_PROVIDER = 'github-sso'
export const GITHUB_SSO_CALLBACK_PATH = '/api/github-identity/callback'
export const GITHUB_SSO_LOGIN_START_PATH = '/api/github-identity/login/start'
export const GITHUB_SSO_PROVIDER_ICON_PATH = '/assets/images/destinations/GitHub-Mark-64px.png'
export const GITHUB_AUTH_LOGIN_PATH = '/auth/login'
export const GITHUB_AUTH_REGISTER_PATH = '/auth/register'
export const GITHUB_SIGN_IN_SUCCESS_PATH = '/sign-in/success'

export const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
export const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
export const GITHUB_API_URL = 'https://api.github.com'

export const GITHUB_SSO_STATE_TTL_SECONDS = 10 * 60
export const GITHUB_SSO_PKCE_COOKIE_PREFIX = 'xpert_github_sso_pkce_'
