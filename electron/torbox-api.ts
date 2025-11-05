import { z } from 'zod'

const TORBOX_BASE_URL = 'https://api.torbox.app/v1/api'

const JobStatusSchema = z.object({
  id: z.string(),
  status: z.enum(['queued', 'downloading', 'completed', 'failed', 'cancelled']),
  progress: z.number().optional(),
  size: z.number().optional(),
  downloaded: z.number().optional(),
  speed: z.number().optional(),
  filename: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const TransferSchema = z.object({
  id: z.string(),
  url: z.string(),
  filename: z.string().optional(),
  status: z.enum(['queued', 'downloading', 'completed', 'failed', 'cancelled']),
  size: z.number().optional(),
  progress: z.number().optional(),
  createdAt: z.string(),
})

const FileLinkSchema = z.object({
  url: z.string(),
  filename: z.string(),
  size: z.number(),
})

type JobStatus = z.infer<typeof JobStatusSchema>
type Transfer = z.infer<typeof TransferSchema>
type FileLink = z.infer<typeof FileLinkSchema>

class TorboxAPIError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'TorboxAPIError'
  }
}

async function makeRequest<T>(
  endpoint: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const response = await fetch(`${TORBOX_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new TorboxAPIError(
        errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status
      )
    }

    return await response.json()
  } catch (error) {
    if (error instanceof TorboxAPIError) {
      throw error
    }
    throw new TorboxAPIError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function testConnection(apiKey: string): Promise<boolean> {
  try {
    await makeRequest('/transfers', apiKey)
    return true
  } catch (error) {
    return false
  }
}

export async function addUrl(url: string, apiKey: string): Promise<{ jobId: string }> {
  const response = await makeRequest<{ jobId: string }>('/transfers', apiKey, {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
  return response
}

export async function getStatus(jobId: string, apiKey: string): Promise<JobStatus> {
  const response = await makeRequest<JobStatus>(`/transfers/${jobId}`, apiKey)
  return JobStatusSchema.parse(response)
}

export async function getFileLinks(jobId: string, apiKey: string): Promise<FileLink[]> {
  const response = await makeRequest<{ files: FileLink[] }>(`/transfers/${jobId}/files`, apiKey)
  return z.array(FileLinkSchema).parse(response.files)
}

export async function cancelTransfer(jobId: string, apiKey: string): Promise<boolean> {
  try {
    await makeRequest(`/transfers/${jobId}/cancel`, apiKey, {
      method: 'POST',
    })
    return true
  } catch (error) {
    return false
  }
}

export async function listTransfers(apiKey: string): Promise<Transfer[]> {
  const response = await makeRequest<{ transfers: Transfer[] }>('/transfers', apiKey)
  return z.array(TransferSchema).parse(response.transfers)
}