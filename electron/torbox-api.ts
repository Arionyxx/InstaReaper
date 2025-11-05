import { z } from 'zod'

const DEFAULT_BASE_URL = process.env.TORBOX_API_BASE_URL?.trim() || 'https://api.torbox.app'
const LOG_LABEL = '[Torbox]'
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 500
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

export type TorboxJobLifecycleStatus =
  | 'queued'
  | 'pending'
  | 'processing'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface TorboxClientConfig {
  apiKey: string
  baseUrl?: string
}

export type TorboxErrorCode =
  | 'TORBOX_AUTH_MISSING'
  | 'TORBOX_UNAUTHORIZED'
  | 'TORBOX_FORBIDDEN'
  | 'TORBOX_NOT_FOUND'
  | 'TORBOX_RATE_LIMITED'
  | 'TORBOX_SERVER_ERROR'
  | 'TORBOX_BAD_REQUEST'
  | 'TORBOX_NETWORK_ERROR'
  | 'TORBOX_INVALID_RESPONSE'
  | 'TORBOX_NO_LINKS'
  | 'TORBOX_UNKNOWN_ERROR'

export interface TorboxError {
  code: TorboxErrorCode
  message: string
  status?: number
  details?: unknown
}

export type TorboxResult<T> = { ok: true; data: T } | { ok: false; error: TorboxError }

export interface TorboxJobReference {
  jobId: string
  jobHash?: string | null
}

export interface TorboxCreateJobResult extends TorboxJobReference {
  name?: string
  raw: unknown
}

export interface TorboxJobStatus extends TorboxJobReference {
  status: TorboxJobLifecycleStatus
  progress: number
  bytesTotal?: number | null
  bytesDownloaded?: number | null
  message?: string
  etaSeconds?: number | null
  raw: unknown
}

export interface TorboxFileLink {
  url: string
  filename?: string
  sizeBytes?: number | null
  expiresAt?: string | null
  raw?: unknown
}

export interface TorboxTestConnectionResult {
  user?: Record<string, unknown>
  detail?: unknown
}

interface TorboxRequestOptions<T> extends RequestInit {
  schema?: z.ZodType<T>
  retry?: {
    maxRetries?: number
    delayMs?: number
  }
}

interface LogContext {
  method: string
  endpoint: string
  status?: number
  attempt: number
  message?: string
  snippet?: string
  apiKey: string
}

class TorboxAPIError extends Error {
  constructor(public readonly error: TorboxError) {
    super(error.message)
    this.name = 'TorboxAPIError'
  }
}

type TorboxEnvelope = z.infer<typeof TorboxEnvelopeSchema>

type TorboxJob = z.infer<typeof TorboxJobSchema>

const TorboxEnvelopeSchema = z.object({
  success: z.boolean(),
  error: z.union([z.string(), z.null()]).optional(),
  detail: z.any().optional(),
  data: z.any().optional(),
})

const TorboxCreateJobSchema = z
  .object({
    job_id: z.union([z.number(), z.string()]).optional(),
    jobId: z.union([z.number(), z.string()]).optional(),
    webdl_id: z.union([z.number(), z.string()]).optional(),
    id: z.union([z.number(), z.string()]).optional(),
    hash: z.string().optional(),
    job_hash: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough()

const TorboxJobSchema = z
  .object({
    job_id: z.union([z.number(), z.string()]).optional(),
    id: z.union([z.number(), z.string()]).optional(),
    webdl_id: z.union([z.number(), z.string()]).optional(),
    hash: z.string().optional(),
    job_hash: z.string().optional(),
    status: z.string().optional(),
    state: z.string().optional(),
    progress: z.union([z.number(), z.string()]).optional(),
    percent: z.union([z.number(), z.string()]).optional(),
    downloaded: z.union([z.number(), z.string()]).optional(),
    downloaded_bytes: z.union([z.number(), z.string()]).optional(),
    total: z.union([z.number(), z.string()]).optional(),
    total_bytes: z.union([z.number(), z.string()]).optional(),
    size: z.union([z.number(), z.string()]).optional(),
    message: z.string().optional(),
    status_text: z.string().optional(),
    link: z.string().optional(),
    url: z.string().optional(),
    links: z.any().optional(),
    files: z.any().optional(),
    file_links: z.any().optional(),
    data: z.any().optional(),
    name: z.string().optional(),
  })
  .passthrough()

const TorboxJobsArraySchema = z.array(TorboxJobSchema)

const TorboxJobsContainerSchemas = [
  z.object({ jobs: TorboxJobsArraySchema }).passthrough(),
  z.object({ data: TorboxJobsArraySchema }).passthrough(),
  z
    .object({
      active: TorboxJobsArraySchema.optional(),
      queued: TorboxJobsArraySchema.optional(),
      completed: TorboxJobsArraySchema.optional(),
      downloads: TorboxJobsArraySchema.optional(),
    })
    .passthrough(),
  z.object({ web_downloads: TorboxJobsArraySchema }).passthrough(),
]

const TorboxUserSchema = z
  .object({
    auth_id: z.string().optional(),
    email: z.string().optional(),
    plan: z.any().optional(),
  })
  .passthrough()

export async function testConnection(
  config: TorboxClientConfig
): Promise<TorboxResult<TorboxTestConnectionResult>> {
  return toResult(async () => {
    const { data, detail } = await makeRequest(config, '/v1/api/user/me', {
      schema: TorboxUserSchema.optional(),
      retry: { maxRetries: 1 },
    })

    return {
      user: data ?? undefined,
      detail,
    }
  })
}

export async function addUrl(
  config: TorboxClientConfig,
  params: { url: string; name?: string }
): Promise<TorboxResult<TorboxCreateJobResult>> {
  return toResult(async () => {
    if (!params.url || !params.url.trim()) {
      throw new TorboxAPIError({
        code: 'TORBOX_BAD_REQUEST',
        message: 'A URL is required to start a Torbox job',
      })
    }

    const body = new URLSearchParams({
      link: params.url.trim(),
    })

    if (params.name?.trim()) {
      body.append('name', params.name.trim())
    }

    const { data } = await makeRequest(config, '/v1/api/webdl/asynccreatewebdownload', {
      method: 'POST',
      body,
      schema: TorboxCreateJobSchema,
    })

    const identifiers = extractIdentifiers(data)
    const resolvedJobId = identifiers.jobId ?? identifiers.jobHash

    if (!resolvedJobId) {
      throw new TorboxAPIError({
        code: 'TORBOX_INVALID_RESPONSE',
        message: 'Torbox API did not return a job identifier',
        details: data,
      })
    }

    return {
      jobId: resolvedJobId,
      jobHash: identifiers.jobHash ?? null,
      name: data.name,
      raw: data,
    }
  })
}

export async function getStatus(
  config: TorboxClientConfig,
  reference: TorboxJobReference
): Promise<TorboxResult<TorboxJobStatus>> {
  return toResult(async () => {
    const job = await resolveJob(config, reference)

    if (!job) {
      throw new TorboxAPIError({
        code: 'TORBOX_NOT_FOUND',
        message: 'Torbox job not found',
        details: reference,
      })
    }

    return normalizeJob(job)
  })
}

export async function getFileLinks(
  config: TorboxClientConfig,
  reference: TorboxJobReference
): Promise<TorboxResult<TorboxFileLink[]>> {
  return toResult(async () => {
    const job = await resolveJob(config, reference)

    if (!job) {
      throw new TorboxAPIError({
        code: 'TORBOX_NOT_FOUND',
        message: 'Torbox job not found',
        details: reference,
      })
    }

    const links = extractLinks(job)

    if (!links.length) {
      throw new TorboxAPIError({
        code: 'TORBOX_NO_LINKS',
        message: 'Torbox has not generated downloadable links yet',
        details: job,
      })
    }

    return links
  })
}

export async function cancelTransfer(
  config: TorboxClientConfig,
  reference: TorboxJobReference
): Promise<TorboxResult<{ cancelled: boolean }>> {
  return toResult(async () => {
    const job = await resolveJob(config, reference)

    if (!job) {
      throw new TorboxAPIError({
        code: 'TORBOX_NOT_FOUND',
        message: 'Torbox job not found',
        details: reference,
      })
    }

    const identifiers = extractIdentifiers(job)
    const numericJobId = identifiers.jobIdNumeric

    if (!numericJobId) {
      throw new TorboxAPIError({
        code: 'TORBOX_INVALID_RESPONSE',
        message: 'Torbox job is missing a numeric identifier required for cancellation',
        details: job,
      })
    }

    await makeRequest(config, `/v1/api/integration/job/${numericJobId}`, {
      method: 'DELETE',
      schema: z.any(),
      retry: { maxRetries: 1 },
    })

    return { cancelled: true }
  })
}

export async function listTransfers(
  config: TorboxClientConfig
): Promise<TorboxResult<TorboxJobStatus[]>> {
  return toResult(async () => {
    const jobs = await fetchJobs(config)
    return jobs.map(normalizeJob)
  })
}

async function resolveJob(
  config: TorboxClientConfig,
  reference: TorboxJobReference
): Promise<TorboxJob | null> {
  if (reference.jobHash) {
    const hash = reference.jobHash.trim()
    if (hash) {
      try {
        const { data } = await makeRequest(config, `/v1/api/integration/jobs/${encodeURIComponent(hash)}`, {
          schema: TorboxJobSchema,
          retry: { maxRetries: 1 },
        })
        return data
      } catch (error) {
        if (error instanceof TorboxAPIError && error.error.code === 'TORBOX_NOT_FOUND') {
          // Fallback to job lists
        } else if (error instanceof TorboxAPIError) {
          throw error
        } else {
          throw error
        }
      }
    }
  }

  const jobs = await fetchJobs(config)
  const match = findMatchingJob(jobs, reference)
  if (match) return match

  if (reference.jobId?.trim()) {
    try {
      const params = new URLSearchParams({ id: reference.jobId.trim() })
      const { data } = await makeRequest(config, `/v1/api/webdl/mylist?${params.toString()}`, {
        schema: z.any(),
        retry: { maxRetries: 1 },
      })
      const candidates = normalizeJobsPayload(data)
      const fromWebList = findMatchingJob(candidates, reference)
      if (fromWebList) {
        return fromWebList
      }
    } catch (error) {
      if (error instanceof TorboxAPIError && error.error.code === 'TORBOX_NOT_FOUND') {
        return null
      }
      throw error
    }
  }

  return null
}

async function fetchJobs(config: TorboxClientConfig): Promise<TorboxJob[]> {
  const { data } = await makeRequest(config, '/v1/api/integration/jobs', {
    schema: z.any(),
    retry: { maxRetries: 1 },
  })

  return normalizeJobsPayload(data)
}

function normalizeJobsPayload(payload: unknown): TorboxJob[] {
  const arrayResult = TorboxJobsArraySchema.safeParse(payload)
  if (arrayResult.success) {
    return arrayResult.data
  }

  for (const schema of TorboxJobsContainerSchemas) {
    const result = schema.safeParse(payload)
    if (result.success) {
      if ('jobs' in result.data && Array.isArray((result.data as any).jobs)) {
        return (result.data as { jobs: TorboxJob[] }).jobs
      }

      if ('data' in result.data && Array.isArray((result.data as any).data)) {
        return (result.data as { data: TorboxJob[] }).data
      }

      const merged: TorboxJob[] = []
      if ((result.data as any).active) merged.push(...((result.data as any).active as TorboxJob[]))
      if ((result.data as any).queued) merged.push(...((result.data as any).queued as TorboxJob[]))
      if ((result.data as any).completed) merged.push(...((result.data as any).completed as TorboxJob[]))
      if ((result.data as any).downloads) merged.push(...((result.data as any).downloads as TorboxJob[]))
      if (merged.length) return merged
      if ((result.data as any).web_downloads) {
        merged.push(...((result.data as any).web_downloads as TorboxJob[]))
      }
      if (merged.length) return merged
    }
  }

  const singleJob = TorboxJobSchema.safeParse(payload)
  if (singleJob.success) {
    return [singleJob.data]
  }

  return []
}

function findMatchingJob(jobs: TorboxJob[], reference: TorboxJobReference): TorboxJob | null {
  if (!jobs.length) return null
  const targetId = reference.jobId?.trim()
  const targetHash = reference.jobHash?.trim()

  return (
    jobs.find((job) => {
      const identifiers = extractIdentifiers(job)
      return (
        (targetId && identifiers.jobId === targetId) ||
        (targetId && identifiers.jobIdNumeric !== null && String(identifiers.jobIdNumeric) === targetId) ||
        (targetHash && identifiers.jobHash === targetHash)
      )
    }) ?? null
  )
}

function normalizeJob(job: TorboxJob): TorboxJobStatus {
  const identifiers = extractIdentifiers(job)

  if (!identifiers.jobId && !identifiers.jobHash) {
    throw new TorboxAPIError({
      code: 'TORBOX_INVALID_RESPONSE',
      message: 'Torbox job payload did not contain a recognizable identifier',
      details: job,
    })
  }

  const statusValue = job.status ?? job.state ?? job.message ?? 'processing'
  const progressValue = job.progress ?? job.percent ?? job.downloaded ?? 0
  const bytesDownloaded =
    toNumber(job.downloaded_bytes) ?? toNumber(job.downloaded) ?? toNumber(job.size) ?? null
  const bytesTotal = toNumber(job.total_bytes) ?? toNumber(job.total) ?? null

  return {
    jobId: identifiers.jobId ?? identifiers.jobHash ?? 'unknown',
    jobHash: identifiers.jobHash,
    status: mapStatus(statusValue),
    progress: clampProgress(progressValue),
    bytesDownloaded,
    bytesTotal,
    message: job.message ?? job.status_text,
    etaSeconds: undefined,
    raw: job,
  }
}

function extractLinks(job: TorboxJob): TorboxFileLink[] {
  const containers = [
    job.file_links,
    job.links,
    job.files,
    (job.data as any)?.links,
    (job.data as any)?.files,
  ].filter(Boolean)

  const links: TorboxFileLink[] = []

  for (const container of containers) {
    if (Array.isArray(container)) {
      for (const entry of container) {
        const fileLink = toFileLink(entry)
        if (fileLink) {
          links.push(fileLink)
        }
      }
    } else {
      const fileLink = toFileLink(container)
      if (fileLink) {
        links.push(fileLink)
      }
    }
  }

  if (!links.length && typeof job.link === 'string') {
    links.push({ url: job.link, raw: job })
  }

  if (!links.length && typeof job.url === 'string') {
    links.push({ url: job.url, raw: job })
  }

  const deduped = new Map<string, TorboxFileLink>()
  for (const link of links) {
    if (!link.url) continue
    if (!deduped.has(link.url)) {
      deduped.set(link.url, link)
    }
  }

  return [...deduped.values()]
}

function toFileLink(entry: any): TorboxFileLink | null {
  if (!entry) return null
  if (typeof entry === 'string') {
    return { url: entry }
  }
  if (typeof entry !== 'object') return null

  const url = entry.url ?? entry.link ?? entry.download_url ?? entry.href
  if (typeof url !== 'string' || !url.trim()) return null

  const filename = entry.filename ?? entry.name ?? entry.file
  const sizeCandidate = entry.size ?? entry.filesize ?? entry.length ?? entry.total

  return {
    url,
    filename: typeof filename === 'string' ? filename : undefined,
    sizeBytes: toNumber(sizeCandidate),
    expiresAt: typeof entry.expires_at === 'string' ? entry.expires_at : undefined,
    raw: entry,
  }
}

function extractIdentifiers(job: TorboxJob) {
  const jobId = firstString(job.job_id, job.id, job.webdl_id)
  const jobHash = firstString(job.job_hash, job.hash)
  const jobIdNumeric = toNumber(jobId)

  return {
    jobId: jobId ?? (jobHash ?? null),
    jobHash: jobHash ?? null,
    jobIdNumeric: jobIdNumeric ?? null,
  }
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && !Number.isNaN(value)) return String(value)
  }
  return null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function clampProgress(value: unknown): number {
  const numeric = toNumber(value)
  if (numeric === null) return 0
  if (!Number.isFinite(numeric)) return 0
  if (numeric < 0) return 0
  if (numeric > 100) return 100
  return Math.round(numeric * 100) / 100
}

function mapStatus(status?: string): TorboxJobLifecycleStatus {
  const normalized = status ? status.toLowerCase() : ''

  if (['completed', 'complete', 'finished', 'done', 'success'].includes(normalized)) {
    return 'completed'
  }
  if (['failed', 'error', 'stopped'].includes(normalized)) {
    return 'failed'
  }
  if (['cancelled', 'canceled', 'aborted'].includes(normalized)) {
    return 'cancelled'
  }
  if (['downloading', 'download', 'running', 'active'].includes(normalized)) {
    return 'downloading'
  }
  if (['processing', 'preparing', 'transcoding'].includes(normalized)) {
    return 'processing'
  }
  if (['queued', 'queue'].includes(normalized)) {
    return 'queued'
  }
  if (['pending', 'waiting'].includes(normalized)) {
    return 'pending'
  }

  return 'processing'
}

async function makeRequest<T>(
  config: TorboxClientConfig,
  endpoint: string,
  options: TorboxRequestOptions<T> = {}
): Promise<{ data: T; detail?: unknown; raw: TorboxEnvelope }> {
  const apiKey = config.apiKey?.trim()
  if (!apiKey) {
    throw new TorboxAPIError({
      code: 'TORBOX_AUTH_MISSING',
      message: 'Torbox API key is not configured. Add it in Settings > Torbox API Configuration.',
    })
  }

  const baseUrl = (config.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const targetEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${baseUrl}${targetEndpoint}`

  const { schema, retry, headers: providedHeaders, ...fetchOptions } = options

  const headers = new Headers(providedHeaders ?? {})
  headers.set('Accept', 'application/json')

  if (fetchOptions.body instanceof URLSearchParams) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded')
  }

  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${apiKey}`)
  }
  if (!headers.has('X-API-Key')) {
    headers.set('X-API-Key', apiKey)
  }

  const requestInit: RequestInit = {
    method: fetchOptions.method ?? 'GET',
    ...fetchOptions,
    headers,
  }

  const maxRetries = retry?.maxRetries ?? MAX_RETRIES
  const initialDelay = retry?.delayMs ?? INITIAL_RETRY_DELAY_MS

  let attempt = 0
  let lastError: TorboxAPIError | null = null

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, requestInit)
      const text = await response.text()
      const parsedBody = safeJsonParse(text)
      const snippet = text ? text.slice(0, 400) : undefined

      if (!response.ok) {
        const error = createErrorFromResponse({
          response,
          body: parsedBody,
          endpoint: targetEndpoint,
          method: requestInit.method ?? 'GET',
          attempt,
          apiKey,
          snippet,
        })

        logTorboxFailure({
          method: requestInit.method ?? 'GET',
          endpoint: targetEndpoint,
          status: response.status,
          attempt,
          message: error.message,
          snippet,
          apiKey,
        })

        if (attempt < maxRetries && shouldRetryError(error)) {
          await delay(expBackoff(initialDelay, attempt))
          attempt += 1
          lastError = error
          continue
        }

        throw error
      }

      const envelope = TorboxEnvelopeSchema.parse(parsedBody)
      if (!envelope.success) {
        const error = new TorboxAPIError({
          code: 'TORBOX_BAD_REQUEST',
          message: extractDetail(envelope) ?? 'Torbox returned an unsuccessful response',
          status: 200,
          details: envelope,
        })

        logTorboxFailure({
          method: requestInit.method ?? 'GET',
          endpoint: targetEndpoint,
          status: 200,
          attempt,
          message: error.message,
          snippet,
          apiKey,
        })

        throw error
      }

      const data = schema ? schema.parse(envelope.data) : ((envelope.data ?? (undefined as T)) as T)

      return {
        data,
        detail: envelope.detail,
        raw: envelope,
      }
    } catch (error) {
      if (error instanceof TorboxAPIError) {
        if (attempt < maxRetries && shouldRetryError(error)) {
          await delay(expBackoff(initialDelay, attempt))
          attempt += 1
          lastError = error
          continue
        }
        throw error
      }

      const networkError = new TorboxAPIError({
        code: 'TORBOX_NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error while contacting Torbox',
        details: { error },
      })

      logTorboxFailure({
        method: requestInit.method ?? 'GET',
        endpoint: targetEndpoint,
        attempt,
        message: networkError.message,
        apiKey,
      })

      if (attempt < maxRetries) {
        await delay(expBackoff(initialDelay, attempt))
        attempt += 1
        lastError = networkError
        continue
      }

      throw networkError
    }
  }

  if (lastError) {
    throw lastError
  }

  throw new TorboxAPIError({
    code: 'TORBOX_UNKNOWN_ERROR',
    message: 'Unknown error while communicating with Torbox',
  })
}

function createErrorFromResponse(params: {
  response: Response
  body: unknown
  endpoint: string
  method: string
  attempt: number
  apiKey: string
  snippet?: string
}): TorboxAPIError {
  const { response, body } = params
  const status = response.status
  const code = mapStatusToCode(status)
  const detail = extractDetail(body)

  const message = detail ?? defaultMessageForCode(code)

  return new TorboxAPIError({
    code,
    message,
    status,
    details: body,
  })
}

function mapStatusToCode(status: number): TorboxErrorCode {
  if (status === 401) return 'TORBOX_UNAUTHORIZED'
  if (status === 403) return 'TORBOX_FORBIDDEN'
  if (status === 404) return 'TORBOX_NOT_FOUND'
  if (status === 429) return 'TORBOX_RATE_LIMITED'
  if (status >= 500) return 'TORBOX_SERVER_ERROR'
  if (status >= 400) return 'TORBOX_BAD_REQUEST'
  return 'TORBOX_UNKNOWN_ERROR'
}

function defaultMessageForCode(code: TorboxErrorCode): string {
  switch (code) {
    case 'TORBOX_AUTH_MISSING':
      return 'Torbox API key is missing. Configure it in Settings.'
    case 'TORBOX_UNAUTHORIZED':
      return 'Torbox rejected the API key. Verify the key on your Torbox dashboard.'
    case 'TORBOX_FORBIDDEN':
      return 'Torbox denied access. Check your account permissions.'
    case 'TORBOX_NOT_FOUND':
      return 'The requested Torbox resource could not be found.'
    case 'TORBOX_RATE_LIMITED':
      return 'Torbox rate limit exceeded. Please wait and try again.'
    case 'TORBOX_SERVER_ERROR':
      return 'Torbox encountered an internal error. Please try again later.'
    case 'TORBOX_BAD_REQUEST':
      return 'Torbox rejected the request. Please try again.'
    case 'TORBOX_NETWORK_ERROR':
      return 'Network error while communicating with Torbox.'
    case 'TORBOX_INVALID_RESPONSE':
      return 'Received an unexpected response from Torbox.'
    case 'TORBOX_NO_LINKS':
      return 'Torbox has not generated download links yet. Please try again in a moment.'
    case 'TORBOX_UNKNOWN_ERROR':
    default:
      return 'Unexpected Torbox error. Please retry.'
  }
}

function shouldRetryError(error: TorboxAPIError): boolean {
  const { code, status } = error.error
  if (code === 'TORBOX_NETWORK_ERROR' || code === 'TORBOX_RATE_LIMITED' || code === 'TORBOX_SERVER_ERROR') {
    return true
  }
  if (typeof status === 'number') {
    return RETRYABLE_STATUS_CODES.has(status)
  }
  return false
}

function toResult<T>(executor: () => Promise<T>): Promise<TorboxResult<T>> {
  return executor()
    .then((data) => ({ ok: true as const, data }))
    .catch((error) => {
      if (error instanceof TorboxAPIError) {
        return { ok: false as const, error: error.error }
      }
      if (error instanceof z.ZodError) {
        return {
          ok: false as const,
          error: {
            code: 'TORBOX_INVALID_RESPONSE',
            message: 'Received an unexpected response from Torbox.',
            details: error.flatten(),
          },
        }
      }
      return {
        ok: false as const,
        error: {
          code: 'TORBOX_UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : 'Unexpected error',
          details: error,
        },
      }
    })
}

function safeJsonParse(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractDetail(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    if (typeof body === 'string') return body
    return undefined
  }

  const candidate = (body as any).detail ?? (body as any).error ?? (body as any).message
  if (Array.isArray(candidate)) {
    const first = candidate.find((item) => typeof item === 'string') ?? candidate[0]
    return typeof first === 'string' ? first : undefined
  }
  if (typeof candidate === 'string') return candidate

  if (candidate && typeof candidate === 'object') {
    if (typeof candidate.message === 'string') {
      return candidate.message
    }
    if (typeof candidate.detail === 'string') {
      return candidate.detail
    }
  }

  return undefined
}

function delay(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration))
}

function expBackoff(initialDelay: number, attempt: number): number {
  return Math.min(initialDelay * Math.pow(2, attempt), 10_000)
}

function logTorboxFailure(context: LogContext): void {
  const redactedKey = redactApiKey(context.apiKey)
  const parts = [
    LOG_LABEL,
    context.method,
    context.endpoint,
    'failed',
    `(attempt ${context.attempt + 1}${context.status ? `, status ${context.status}` : ''})`,
  ]

  const meta: Record<string, unknown> = {
    apiKey: redactedKey,
  }

  if (context.message) meta.message = context.message
  if (context.snippet) meta.responseSnippet = context.snippet
  if (context.status) meta.status = context.status

  console.debug(parts.join(' '), meta)
}

function redactApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return '***redacted***'
  }
  const start = apiKey.slice(0, 3)
  const end = apiKey.slice(-3)
  return `${start}***${end}`
}
