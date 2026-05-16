import { useEffect, useCallback, useRef, useState } from 'react'
import { recognizeImage, type RecognitionResult } from '@/lib/imageRecognition'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export interface PasteState {
  isProcessing: boolean
  result: RecognitionResult | null
  error: string | null
  previewUrl: string | null
}

/**
 * useGlobalPaste
 * Listens for paste events anywhere in the app.
 * When an image is pasted, it:
 *   1. Converts to base64
 *   2. Uploads to Supabase Storage
 *   3. Sends to Claude Vision (haiku-4-5)
 *   4. Returns structured result for the confirmation modal
 */
export function useGlobalPaste(onResult: (result: RecognitionResult, previewUrl: string) => void) {
  const { user } = useAuthStore()
  const previewUrlRef = useRef<string | null>(null)
  const [state, setState] = useState<PasteState>({
    isProcessing: false,
    result: null,
    error: null,
    previewUrl: null,
  })

  const processImageFile = useCallback(async (file: File) => {
    if (!user) return
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setState({ isProcessing: true, result: null, error: null, previewUrl: null })

    let previewUrl: string | null = null
    try {
      // 1. Create local preview URL
      previewUrl = URL.createObjectURL(file)
      previewUrlRef.current = previewUrl

      // 2. Convert to base64
      const base64 = await fileToBase64(file)

      // 3. Upload to Supabase Storage for audit trail (non-blocking — skip if bucket missing)
      const path = `images/recognitions/${user.id}/${Date.now()}_${file.name || 'pasted.jpg'}`
      let storagePath = path
      try {
        const { error: uploadError } = await supabase.storage.from('life-os-documents').upload(path, file, {
          contentType: file.type,
          upsert: false,
        })
        if (uploadError) storagePath = 'pending'  // storage unavailable — continue anyway
      } catch {
        storagePath = 'pending'
      }

      // 4. Send to Claude Vision (core feature — this must succeed)
      const result = await recognizeImage(base64, file.type as string)

      // 5. Log to image_recognitions table (non-blocking)
      supabase.from('image_recognitions').insert({
        owner_id: user.id,
        storage_path: storagePath,
        detected_type: result.detectedType,
        confidence: result.confidence,
        ai_raw_output: result.fields,
        target_table: result.targetTable,
        status: 'recognized',
      }).then(() => {}).catch(() => {})

      setState({ isProcessing: false, result, error: null, previewUrl })
      onResult(result, previewUrl)
    } catch (err) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
        if (previewUrlRef.current === previewUrl) previewUrlRef.current = null
      }
      const msg = err instanceof Error ? err.message : 'Recognition failed'
      setState({ isProcessing: false, result: null, error: msg, previewUrl: null })
    }
  }, [user, onResult])

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setState(prev => ({ ...prev, previewUrl: null, result: null }))
  }, [])

  // Listen for global paste events
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) processImageFile(file)
          break
        }
      }
    }
    window.addEventListener('paste', handler)
    return () => {
      window.removeEventListener('paste', handler)
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [processImageFile])

  return { ...state, processImageFile, clearPreview }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip data URL prefix: "data:image/jpeg;base64,"
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
