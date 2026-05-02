'use client'

import React, { useState, useEffect } from 'react'
import UploadDropzone from './upload/UploadDropzone'
import ExpirySelector from './ExpirySelector'
import TagSelector from './upload/TagSelector'
import { api } from '../utils/request'
import { ExclamationTriangleIcon, ImageIcon } from '../components/ui/icons'

interface UploadSectionProps {
  onUpload: (files: File[], expiryMinutes: number, tags: string[]) => Promise<void>
  isUploading: boolean
  maxUploadCount?: number
  onFilesSelected?: (files: { id: string, file: File }[]) => void
  onTogglePreview?: () => void
  isPreviewOpen?: boolean
  fileCount?: number
  existingFiles?: { id: string, file: File }[]
  expiryMinutes: number
  setExpiryMinutes: React.Dispatch<React.SetStateAction<number>>
  onTagsChange?: (tags: string[]) => void
  isKeyVerified?: boolean
}

export default function UploadSection({
  onUpload,
  isUploading,
  maxUploadCount = 10,
  onFilesSelected,
  onTogglePreview,
  isPreviewOpen,
  fileCount = 0,
  existingFiles = [],
  expiryMinutes,
  setExpiryMinutes,
  onTagsChange,
  isKeyVerified = false
}: UploadSectionProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [fileDetails, setFileDetails] = useState<{ id: string, file: File }[]>([])
  const [wasUploading, setWasUploading] = useState(false)
  const [exceedsLimit, setExceedsLimit] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])

  const fetchTags = async () => {
    try {
      const response = await api.get<{ tags: string[] }>('/api/tags')
      if (response.tags && response.tags.length > 0) {
        setAvailableTags(response.tags)
      }
    } catch (error) {
      console.error('获取标签失败:', error)
    }
  }

  useEffect(() => {
    if (!isKeyVerified) return;
    fetchTags()
  }, [isKeyVerified])

  useEffect(() => {
    if (wasUploading && !isUploading) {
      setSelectedFiles([])
      setFileDetails([])
      setExceedsLimit(false)
    }
    setWasUploading(isUploading)
  }, [isUploading, wasUploading])

  useEffect(() => {
    if (fileCount === 0 && selectedFiles.length > 0) {
      setSelectedFiles([])
      setFileDetails([])
      setExceedsLimit(false)
    }
  }, [fileCount])

  useEffect(() => {
    if (existingFiles.length > 0) {
      const filesArray = existingFiles.map(item => item.file);
      setSelectedFiles(filesArray);
      setFileDetails(existingFiles);
    }
  }, [existingFiles]);

  const handleTagsChange = (tags: string[]) => {
    setSelectedTags(tags);
    if (onTagsChange) {
      onTagsChange(tags);
    }
  };

  const handleFilesSelected = (files: File[]) => {
    const currentFiles = [...selectedFiles];
    const currentDetails = [...fileDetails];
    const newFiles = [...currentFiles];
    const newDetails = [...currentDetails];

    for (const file of files) {
      const isDuplicate = currentFiles.some(existingFile =>
        existingFile.name === file.name &&
        existingFile.size === file.size &&
        existingFile.lastModified === file.lastModified
      );

      if (!isDuplicate) {
        newFiles.push(file);
        newDetails.push({
          id: Math.random().toString(36).substring(2, 11),
          file
        });
      }
    }

    if (newFiles.length > maxUploadCount) {
      const allowedFiles = newFiles.slice(0, maxUploadCount);
      const allowedDetails = newDetails.slice(0, maxUploadCount);

      setSelectedFiles(allowedFiles);
      setFileDetails(allowedDetails);
      setExceedsLimit(true);

      if (onFilesSelected) {
        onFilesSelected(allowedDetails);
      }
    } else {
      setSelectedFiles(newFiles);
      setFileDetails(newDetails);
      setExceedsLimit(false);

      if (onFilesSelected) {
        onFilesSelected(newDetails);
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedFiles.length === 0) return
    await onUpload(selectedFiles, expiryMinutes, selectedTags)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden mb-6">
        <UploadDropzone
          onFilesSelected={handleFilesSelected}
          maxUploadCount={maxUploadCount}
        />
      </div>

      {exceedsLimit && (
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 shadow-sm">
          <div className="flex items-start">
            <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full mr-3 flex-shrink-0">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-300 mb-1">超出上传限制</p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                一次最多只能上传 <span className="font-medium">{maxUploadCount}</span> 张图片。已自动选择前 {maxUploadCount} 张。
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 space-y-5 mb-6">
        <ExpirySelector onChange={setExpiryMinutes} />

        <div className="border-t border-gray-100 dark:border-gray-800" />

        <TagSelector
          selectedTags={selectedTags}
          availableTags={availableTags}
          onTagsChange={handleTagsChange}
          onNewTagCreated={fetchTags}
        />
      </div>

      {selectedFiles.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              已选择 <span className="font-semibold text-indigo-600 dark:text-indigo-400">{selectedFiles.length}</span> 张图片
            </div>
            {onTogglePreview && (
              <button
                type="button"
                onClick={onTogglePreview}
                className="px-3.5 py-1.5 text-sm bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg transition-colors duration-200 flex items-center font-medium border border-gray-200 dark:border-gray-700"
              >
                <ImageIcon className="h-4 w-4 mr-1.5" />
                {isPreviewOpen ? '隐藏文件列表' : '查看文件列表'}
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className={`w-full py-3 rounded-xl font-medium text-white transition-all duration-300 ${
              isUploading
                ? "bg-indigo-400 cursor-not-allowed"
                : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25"
            }`}
          >
            {isUploading ? "上传中..." : `上传 ${selectedFiles.length} 张图片`}
          </button>
        </div>
      )}
    </form>
  )
}
