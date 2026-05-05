'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { KeyIcon, Cross1Icon } from './ui/icons'

interface ApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (apiKey: string) => Promise<boolean>
}

export default function ApiKeyModal({ isOpen, onClose, onSuccess }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.trim()) {
      setError('请输入密钥')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const success = await onSuccess(apiKey.trim())
      if (!success) {
        setError('密钥无效，请检查后重试')
      } else {
        setApiKey('')
      }
    } catch {
      setError('验证失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-sm mx-4"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/20">
              <KeyIcon className="h-5 w-5 text-indigo-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">验证密钥</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            <Cross1Icon className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          请输入您的访问密钥以继续使用。管理员密钥拥有完整权限，访客密钥仅可浏览图片。
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              setError('')
            }}
            placeholder="输入密钥"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
            autoFocus
          />

          {error && (
            <p className="mt-2 text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !apiKey.trim()}
            className="w-full mt-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-indigo-500/25 text-sm"
          >
            {isLoading ? '验证中...' : '验证'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}
