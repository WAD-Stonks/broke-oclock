import type { PhotoFileRouter } from '@broke-oclock/api/photo-router'
import { genUploader } from 'uploadthing/client'

// Type-only server contract: no server/auth/database implementation enters the browser.
const { uploadFiles } = genUploader<PhotoFileRouter>({ url: '/api/uploadthing' })
type UploadOptions = Parameters<typeof uploadFiles<'photoUploader'>>[1]

export const uploadPhoto = async (
  file: File,
  options: Pick<UploadOptions, 'signal' | 'onUploadProgress'> = {},
) => {
  const [photo] = await uploadFiles('photoUploader', { ...options, files: [file] })
  if (!photo) throw new Error('No photo was uploaded')
  return {
    key: photo.key,
    url: photo.ufsUrl,
    uploadedBy: photo.serverData.uploadedBy,
  }
}
