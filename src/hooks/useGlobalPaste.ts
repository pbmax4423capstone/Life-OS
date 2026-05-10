import { useEffect, useCallback, useState } from 'react'
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
  const [state, setState] = useState<PasteState>({
    isProcessing: false,
    result: null,
    error: null,
    previewUrl: null,
  })

  const processImageFile = useCallback(async (file: File) => {
    if (!user) return
    setState({ isProcessing: true, result: null, error: null, previewUrl: null })

    try {
      // 1. Create local preview URL
      const previewUrl = URL.createObjectURL(file)

      // 2. Convert to base64
      const base64 = await fileToBase64(file)

      // 3. Upload to Supabase Storage for audit trail
      const path = `images/recognitions/${user.id}/${Date.now()}_${file.name || 'pasted.jpg'}`
      await supabase.storage.from('life-os-documents').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })

      // 4. Send to Claude Vision
      const result = await recognizeImage(base64, file.type as string)

      // 5. Log to image_recognitions table
      await supabase.from('image_recognitions').insert({
        owner_id: user.id,
        storage_path: path,
        detected_type: result.detectedType,
        confidence: result.confidence,
        ai_raw_output: result.fields,
        target_table: result.targetTable,
        status: 'recognized',
      })

      setState({ isProcessing: false, result, error: null, previewUrl })
      onResult(result, previewUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Recognition failed'
      setState({ isProcessing: false, result: null, error: msg, previewUrl: null })
    }
  }, [user, onResult])

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
    return () => window.removeEventListener('paste', handler)
  }, [processImageFile])

  return { ...state, processImageFile }
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
