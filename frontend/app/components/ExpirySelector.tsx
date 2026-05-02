'use client'

import { useState, useEffect } from 'react'
import { ClockIcon } from './ui/icons'

interface ExpirySelectorProps {
  onChange: (minutes: number) => void
}

export default function ExpirySelector({ onChange }: ExpirySelectorProps) {
  const [selectedOption, setSelectedOption] = useState<string>('never')
  const [customValue, setCustomValue] = useState<number>(1)
  const [timeUnit, setTimeUnit] = useState<'minutes' | 'hours'>('hours')

  useEffect(() => {
    onChange(0)
  }, [onChange])

  const handleOptionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const option = e.target.value
    setSelectedOption(option)

    let minutes = 0
    switch (option) {
      case 'never':
        minutes = 0
        break
      case '1m':
        minutes = 1
        break
      case '1h':
        minutes = 60
        break
      case '24h':
        minutes = 24 * 60
        break
      case '7d':
        minutes = 7 * 24 * 60
        break
      case '30d':
        minutes = 30 * 24 * 60
        break
      case 'custom':
        minutes = timeUnit === 'minutes' ? customValue : customValue * 60
        break
    }
    onChange(minutes)
  }

  const handleCustomValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    if (!isNaN(value) && value > 0) {
      setCustomValue(value)
      if (selectedOption === 'custom') {
        const minutes = timeUnit === 'minutes' ? value : value * 60
        onChange(minutes)
      }
    }
  }

  const handleTimeUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const unit = e.target.value as 'minutes' | 'hours'
    setTimeUnit(unit)
    if (selectedOption === 'custom') {
      const minutes = unit === 'minutes' ? customValue : customValue * 60
      onChange(minutes)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
        <ClockIcon className="h-4 w-4" />
        <span className="font-medium">过期时间</span>
      </div>

      <div className="flex-1 flex items-center gap-2">
        <select
          value={selectedOption}
          onChange={handleOptionChange}
          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
        >
          <option value="never">永不过期</option>
          <option value="1m">1分钟</option>
          <option value="1h">1小时</option>
          <option value="24h">1天</option>
          <option value="7d">7天</option>
          <option value="30d">30天</option>
          <option value="custom">自定义</option>
        </select>

        {selectedOption === 'custom' && (
          <>
            <input
              type="number"
              min="1"
              value={customValue}
              onChange={handleCustomValueChange}
              className="w-20 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-center font-medium text-sm"
              aria-label="自定义时间值"
            />
            <select
              value={timeUnit}
              onChange={handleTimeUnitChange}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
            >
              <option value="minutes">分钟</option>
              <option value="hours">小时</option>
            </select>
          </>
        )}
      </div>
    </div>
  )
}
