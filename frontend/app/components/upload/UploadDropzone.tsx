'use client'

import { useRef, useState } from 'react'
import { UploadIcon } from '../ui/icons'

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void
  maxUploadCount: number
}

export default function UploadDropzone({ onFilesSelected, maxUploadCount }: UploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      onFilesSelected(Array.from(files))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    onFilesSelected(Array.from(e.dataTransfer.files))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center py-16 px-8 cursor-pointer transition-all duration-300 ${
        isDragOver
          ? "bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-400 dark:border-indigo-500"
          : "bg-gray-50 dark:bg-gray-800/30 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => fileInputRef.current?.click()}
    >
      <div className={`mb-5 p-4 rounded-2xl transition-all duration-300 ${
        isDragOver
          ? "bg-indigo-100 dark:bg-indigo-800/40 scale-110"
          : "bg-indigo-50 dark:bg-indigo-900/30"
      }`}>
        <UploadIcon className={`h-8 w-8 transition-colors duration-300 ${
          isDragOver
            ? "text-indigo-600 dark:text-indigo-400"
            : "text-indigo-500"
        }`} />
      </div>
      <p className={`text-base font-medium mb-1.5 transition-colors duration-300 ${
        isDragOver
          ? "text-indigo-600 dark:text-indigo-400"
          : "text-gray-700 dark:text-gray-300"
      }`}>
        {isDragOver ? "松开即可上传" : "拖放图片到这里"}
      </p>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
        或者点击选择文件（可多选）
      </p>
      <span className="text-xs text-gray-400 dark:text-gray-500">
        最多可选择 {maxUploadCount} 张图片
      </span>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
      />
    </div>
  )
}
