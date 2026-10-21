import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import { githubConnectionSchema, type GitHubConnection } from '../../../src/github-connection'
import { data, type Host } from './bridge'

const responseSchema = z.object({ meta: z.object({ connection: githubConnectionSchema }) })
type ConnectionState = GitHubConnection | { status: 'loading' }

export function useGitHubConnection(host: Host | null) {
  const [state, setState] = useState<{ host: Host | null; connection: ConnectionState }>({ host, connection: { status: 'loading' } })
  const generation = useRef(0)
  const currentHost = useRef(host)
  currentHost.current = host
  const refresh = useCallback(async () => {
    if (!host || currentHost.current !== host) return
    const request = ++generation.current
    setState({ host, connection: { status: 'loading' } })
    let connection: GitHubConnection
    try {
      connection = responseSchema.parse(await data({ parameters: { githubConnection: true } })).meta.connection
    } catch {
      connection = { status: 'unavailable' }
    }
    if (generation.current === request) setState({ host, connection })
  }, [host])
  useEffect(() => {
    void refresh()
    return () => { generation.current++ }
  }, [refresh])
  // A newly selected host must never briefly display the previous workspace's account.
  const connection: ConnectionState = state.host === host ? state.connection : { status: 'loading' }
  return { connection, refresh }
}
