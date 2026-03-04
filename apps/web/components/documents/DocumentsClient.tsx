'use client'

import { useCallback, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

type DocumentUpload = {
  id: string
  file_name: string
  file_type: string
  parse_status: 'pending' | 'processing' | 'complete' | 'failed'
  parsed_entries_count: number
  error_message: string | null
  created_at: string
}

const STATUS_LABELS: Record<DocumentUpload['parse_status'], string> = {
  pending: 'Queued',
  processing: 'Processing…',
  complete: 'Ready',
  failed: 'Failed',
}

const STATUS_COLORS: Record<DocumentUpload['parse_status'], string> = {
  pending: 'text-slate-400 bg-slate-800 border-slate-600',
  processing: 'text-sky-300 bg-sky-950 border-sky-700',
  complete: 'text-emerald-300 bg-emerald-950 border-emerald-700',
  failed: 'text-rose-300 bg-rose-950 border-rose-700',
}

const ACCEPTED_TYPES = ['.pdf', '.csv', 'application/pdf', 'text/csv']
const MAX_SIZE_MB = 10

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentsClient({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data: documents = [], isLoading } = useQuery<DocumentUpload[]>({
    queryKey: ['documents', householdId],
    queryFn: () =>
      fetch(`/api/documents?household_id=${householdId}`)
        .then((r) => r.json())
        .then((r) => r.data ?? []),
    refetchInterval: (q) => {
      // Poll while any document is processing
      const hasProcessing = (q.state.data ?? []).some(
        (d) => d.parse_status === 'pending' || d.parse_status === 'processing',
      )
      return hasProcessing ? 5000 : false
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadError(null)
      const supabase = createClient()

      // 1. Upload file to Supabase Storage
      const ext = file.name.split('.').pop() ?? 'bin'
      const storagePath = `${householdId}/${crypto.randomUUID()}.${ext}`

      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, { contentType: file.type, upsert: false })

      if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`)

      // 2. Create document_uploads record
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: householdId,
          file_name: file.name,
          file_type: file.type || ext,
          storage_path: storagePath,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to record upload')

      const documentUploadId: string = json.data.id

      // 3. Trigger parse-document edge function
      await supabase.functions.invoke('parse-document', {
        body: {
          document_parse_id: crypto.randomUUID(),
          household_id: householdId,
          document_upload_id: documentUploadId,
        },
      })

      return json.data as DocumentUpload
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', householdId] })
    },
    onError: (err: Error) => {
      setUploadError(err.message)
    },
    onSettled: () => {
      setUploading(false)
    },
  })

  const handleFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.some((t) => file.name.endsWith(t.replace('.', '.')) || file.type === t)) {
        setUploadError('Only PDF and CSV files are accepted.')
        return
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setUploadError(`File exceeds ${MAX_SIZE_MB} MB limit.`)
        return
      }
      setUploading(true)
      uploadMutation.mutate(file)
    },
    [uploadMutation],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      // reset so same file can be re-uploaded
      e.target.value = ''
    },
    [handleFile],
  )

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload document"
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? 'border-sky-400 bg-sky-950/30'
            : 'border-slate-600 bg-slate-900 hover:border-slate-500 hover:bg-slate-800/40'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-10 w-10 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <div>
          <p className="font-medium text-slate-200">
            {uploading ? 'Uploading…' : 'Drop a file here, or click to browse'}
          </p>
          <p className="mt-1 text-xs text-slate-500">PDF or CSV · max {MAX_SIZE_MB} MB</p>
        </div>
        <input ref={inputRef} type="file" accept=".pdf,.csv" className="hidden" onChange={onInputChange} />
      </div>

      {uploadError && (
        <p className="rounded border border-rose-700 bg-rose-950 px-3 py-2 text-sm text-rose-300">{uploadError}</p>
      )}

      {/* Document list */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-slate-400">Uploaded Documents</h2>

        {isLoading && <p className="text-sm text-slate-500">Loading documents…</p>}

        {!isLoading && documents.length === 0 && (
          <p className="rounded border border-slate-700 bg-slate-900 px-4 py-6 text-center text-sm text-slate-500">
            No documents uploaded yet. Upload a bank statement or CSV export to get started.
          </p>
        )}

        {documents.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} householdId={householdId} />
        ))}
      </div>
    </div>
  )
}

function DocumentRow({ doc, householdId: _householdId }: { doc: DocumentUpload; householdId: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex items-center gap-3 px-4 py-3">
        <FileIcon type={doc.file_type} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{doc.file_name}</p>
          <p className="text-xs text-slate-500">{formatDate(doc.created_at)}</p>
        </div>
        <span
          className={`rounded border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[doc.parse_status]}`}
        >
          {STATUS_LABELS[doc.parse_status]}
        </span>

        {doc.parse_status === 'complete' && doc.parsed_entries_count > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-sky-600 hover:text-sky-400"
          >
            {expanded ? 'Hide' : `Review ${doc.parsed_entries_count} entries`}
          </button>
        )}
      </div>

      {doc.parse_status === 'failed' && doc.error_message && (
        <div className="border-t border-slate-700 px-4 py-2">
          <p className="text-xs text-rose-400">{doc.error_message}</p>
        </div>
      )}

      {expanded && (
        <div className="border-t border-slate-700 px-4 py-3">
          <ParsedEntriesReview documentId={doc.id} entryCount={doc.parsed_entries_count} />
        </div>
      )}
    </div>
  )
}

/**
 * Placeholder for the parsed-entries review table.
 * In production this would load proposed journal entries from the backend
 * and allow accepting/editing/rejecting each line before batch posting.
 */
function ParsedEntriesReview({ documentId: _documentId, entryCount }: { documentId: string; entryCount: number }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        {entryCount} proposed journal {entryCount === 1 ? 'entry' : 'entries'} extracted from this document.
      </p>
      <div className="rounded border border-slate-700 bg-slate-800 px-4 py-8 text-center text-sm text-slate-500">
        Entry review table — loaded once parse worker writes proposed entries to the database.
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          disabled
        >
          Accept all &amp; post
        </button>
        <button
          type="button"
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-50"
          disabled
        >
          Reject all
        </button>
      </div>
    </div>
  )
}

function FileIcon({ type }: { type: string }) {
  const isPdf = type.includes('pdf')
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-bold ${
        isPdf ? 'bg-rose-900 text-rose-300' : 'bg-emerald-900 text-emerald-300'
      }`}
    >
      {isPdf ? 'PDF' : 'CSV'}
    </div>
  )
}
