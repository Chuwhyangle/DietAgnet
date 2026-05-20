export const DIET_LOG_CHANNELS = {
  exportFile: 'diet-log:export-file',
} as const

export interface DietLogExportRequest {
  defaultFileName: string
  mimeType: string
  content: string
  filters: Array<{
    name: string
    extensions: string[]
  }>
}

export interface DietLogExportResponse {
  status: 'saved' | 'cancelled' | 'failed'
  filePath?: string
  error?: string
}

export interface DietLogBridge {
  exportFile(request: DietLogExportRequest): Promise<DietLogExportResponse>
}
