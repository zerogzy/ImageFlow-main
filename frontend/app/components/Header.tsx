'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { removeApiKey, getApiKey, getApiRole, validateApiKey } from '../utils/auth'
import {
  SunIcon,
  MoonIcon,
  KeyIcon,
  PersonIcon,
  GearIcon,
} from './ui/icons'

interface HeaderProps {
  onApiKeyClick: () => void
  userRole?: string | null
  title?: string
}

export default function Header({ onApiKeyClick, userRole, title }: HeaderProps) {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const savedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark)
    setIsDark(shouldBeDark)
    if (shouldBeDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleTheme = () => {
    const newIsDark = !isDark
    setIsDark(newIsDark)
    if (newIsDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  const handleLogout = () => {
    removeApiKey()
    window.location.reload()
  }

  if (!mounted) return null

  const roleLabel = userRole === 'admin' ? '管理员' : userRole === 'guest' ? '访客' : ''
  const roleColor = userRole === 'admin'
    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200/50 dark:border-gray-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="text-white font-bold text-sm">IF</span>
          </motion.div>
          <span className="font-semibold text-gray-900 dark:text-white text-sm">
            ImageFlow
          </span>
          {title && (
            <>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{title}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {userRole && (
            <span className={`px-2.5 py-1 text-xs font-medium rounded-lg ${roleColor}`}>
              {roleLabel}
            </span>
          )}

          <nav className="flex items-center gap-1">
            <a
              href="/"
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              广场
            </a>
            {userRole === 'admin' && (
              <a
                href="/upload"
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                上传
              </a>
            )}
            {userRole === 'admin' && (
              <a
                href="/manage"
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                管理
              </a>
            )}
          </nav>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="切换主题"
          >
            {isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </button>

          <button
            onClick={onApiKeyClick}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="密钥设置"
          >
            <KeyIcon className="h-4 w-4" />
          </button>

          {userRole && (
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="退出登录"
              title="退出登录"
            >
              <PersonIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
