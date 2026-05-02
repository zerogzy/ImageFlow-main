'use client'

import { useState } from 'react'
import { TagIcon, PlusIcon, Cross1Icon } from '../ui/icons'

interface TagSelectorProps {
  selectedTags: string[]
  availableTags: string[]
  onTagsChange: (tags: string[]) => void
  onNewTagCreated?: () => void
}

export default function TagSelector({ selectedTags, availableTags, onTagsChange, onNewTagCreated }: TagSelectorProps) {
  const [inputTag, setInputTag] = useState('')

  const handleTagChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tag = e.target.value
    if (tag && !selectedTags.includes(tag)) {
      onTagsChange([...selectedTags, tag])
    }
    e.target.value = ''
  }

  const handleRemoveTag = (tag: string) => {
    onTagsChange(selectedTags.filter(t => t !== tag))
  }

  const handleTagInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputTag(e.target.value)
  }

  const handleAddTag = () => {
    if (inputTag.trim() && !selectedTags.includes(inputTag.trim())) {
      onTagsChange([...selectedTags, inputTag.trim()])
      setInputTag('')
      if (onNewTagCreated) {
        onNewTagCreated()
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
          <TagIcon className="h-4 w-4" />
          <span className="font-medium">标签</span>
        </div>

        <div className="flex-1 flex items-center gap-2">
          {availableTags.length > 0 && (
            <select
              onChange={handleTagChange}
              value=""
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
            >
              <option value="">选择标签...</option>
              {availableTags
                .filter(tag => !selectedTags.includes(tag))
                .map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
            </select>
          )}

          <div className="flex flex-1">
            <input
              type="text"
              value={inputTag}
              onChange={handleTagInput}
              onKeyDown={handleKeyDown}
              placeholder="自定义标签"
              className="flex-1 px-3 py-2 rounded-l-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="px-3 py-2 rounded-r-xl bg-indigo-500 hover:bg-indigo-600 text-white transition-colors duration-200 text-sm flex items-center"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 ml-[4.5rem]">
          {selectedTags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-xs font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
              >
                <Cross1Icon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
