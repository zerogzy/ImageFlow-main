"use client";

import Image from "next/image";
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ImageFile } from "../types";
import { getFullUrl } from "../utils/baseUrl";
import { LoadingSpinner } from "./LoadingSpinner";
import { getFormatLabel, getOrientationLabel } from "../utils/imageUtils";
import ContextMenu, { ContextMenuGroup } from "./ContextMenu";
import { showToast } from "./ToastContainer";
import {
  copyOriginalUrl,
  copyWebpUrl,
  copyAvifUrl,
  copyMarkdownLink,
  copyHtmlImgTag,
  copyToClipboard,
} from "../utils/copyImageUtils";
import {
  ClipboardCopyIcon,
  EyeOpenIcon,
  TrashIcon,
  FileIcon,
  CheckIcon,
  Cross1Icon,
  CopyIcon
} from './ui/icons';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  else if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

export default function ImageCard({
  image,
  onClick,
  onDelete,
}: {
  image: ImageFile;
  onClick: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isGif = image.format.toLowerCase() === "gif";

  const [contextMenu, setContextMenu] = useState({
    isOpen: false,
    x: 0,
    y: 0,
  });

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const getAspectRatioClass = (orientation: string) => {
    switch (orientation.toLowerCase()) {
      case "portrait":
        return "aspect-[3/4]";
      case "landscape":
        return "aspect-[4/3]";
      case "square":
        return "aspect-square";
      default:
        return "aspect-[4/3]";
    }
  };

  const aspectRatioClass = getAspectRatioClass(image.orientation);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  };

  const handleCopy = async (type: string) => {
    try {
      let success = false;
      switch (type) {
        case "original":
          success = await copyOriginalUrl(image);
          break;
        case "webp":
          success = await copyWebpUrl(image);
          break;
        case "avif":
          success = await copyAvifUrl(image);
          break;
        case "markdown":
          success = await copyMarkdownLink(image);
          break;
        case "html":
          success = await copyHtmlImgTag(image);
          break;
      }
      showToast(success ? "复制成功" : "复制失败", success ? "success" : "error");
    } catch (error) {
      showToast("复制失败", "error");
      console.error("复制错误:", error);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onDelete(image.id);
      showToast("图片已删除", "success");
    } catch (error) {
      showToast("删除失败", "error");
      console.error("删除失败:", error);
    }
  };

  const menuGroups: ContextMenuGroup[] = [
    {
      id: "copy",
      items: [
        {
          id: "copy-original",
          label: `复制原始链接 (${image.format.toUpperCase()})`,
          onClick: () => handleCopy("original"),
          icon: <ClipboardCopyIcon className="h-4 w-4" />,
        },
        {
          id: "copy-webp",
          label: "复制WebP链接",
          onClick: () => handleCopy("webp"),
          icon: <ClipboardCopyIcon className="h-4 w-4" />,
          disabled: !image.urls?.webp,
        },
        {
          id: "copy-avif",
          label: "复制AVIF链接",
          onClick: () => handleCopy("avif"),
          icon: <ClipboardCopyIcon className="h-4 w-4" />,
          disabled: !image.urls?.avif,
        },
      ],
    },
    {
      id: "format",
      items: [
        {
          id: "copy-markdown",
          label: "复制Markdown标签",
          onClick: () => handleCopy("markdown"),
          icon: <FileIcon className="h-4 w-4" />,
        },
        {
          id: "copy-html",
          label: "复制HTML标签",
          onClick: () => handleCopy("html"),
          icon: <FileIcon className="h-4 w-4" />,
        },
      ],
    },
    {
      id: "actions",
      items: [
        {
          id: "preview",
          label: "预览图片",
          onClick: onClick,
          icon: <EyeOpenIcon className="h-4 w-4" />,
        },
        {
          id: "delete",
          label: "删除图片",
          onClick: handleDelete,
          danger: true,
          icon: <TrashIcon className="h-4 w-4" />,
        },
      ],
    },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        whileHover={{ y: -6, transition: { duration: 0.25 } }}
        className="group relative rounded-2xl overflow-hidden cursor-pointer bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-xl dark:hover:shadow-indigo-900/20 transition-all duration-300"
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={handleContextMenu}
      >
        {/* 图片容器 */}
        <div className={`relative ${aspectRatioClass} overflow-hidden bg-gray-50 dark:bg-gray-950`}>
          {isGif ? (
            <img
              src={getFullUrl(image.url)}
              alt={image.filename}
              onLoad={handleImageLoad}
              className={`w-full h-full object-cover transition-all duration-700 ease-out ${
                isLoading ? "opacity-0 scale-105" : "opacity-100 group-hover:scale-110"
              }`}
            />
          ) : (
            <Image
              src={getFullUrl(image.urls?.webp || image.url)}
              alt={image.filename}
              fill
              loading="lazy"
              onLoad={handleImageLoad}
              className={`object-cover transition-all duration-700 ease-out ${
                isLoading ? "opacity-0 scale-105" : "opacity-100 group-hover:scale-110"
              }`}
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              quality={80}
            />
          )}

          {isLoading && <LoadingSpinner />}

          {/* 顶部信息覆盖层 */}
          <div
            className={`absolute inset-x-0 top-0 p-3 bg-gradient-to-b from-black/50 via-black/20 to-transparent transition-opacity duration-300 ${
              isLoading ? "opacity-0" : "opacity-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5 flex-wrap">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-md ${
                  isGif
                    ? "bg-emerald-500/80 text-white"
                    : "bg-blue-500/80 text-white"
                }`}>
                  {getFormatLabel(image.format)}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/80 text-white backdrop-blur-md">
                  {getOrientationLabel(image.orientation)}
                </span>
              </div>

              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: isHovered ? 1 : 0, scale: isHovered ? 1 : 0.8 }}
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(getFullUrl(image.urls?.webp || image.url));
                  setCopyStatus("copied");
                  setTimeout(() => setCopyStatus("idle"), 1500);
                }}
                className="p-1.5 rounded-full bg-white/25 backdrop-blur-md hover:bg-white/40 transition-colors"
                title="复制URL"
              >
                {copyStatus === "idle" && <CopyIcon className="h-3.5 w-3.5 text-white" />}
                {copyStatus === "copied" && <CheckIcon className="h-3.5 w-3.5 text-emerald-300" />}
                {copyStatus === "error" && <Cross1Icon className="h-3.5 w-3.5 text-red-300" />}
              </motion.button>
            </div>
          </div>

          {/* 底部悬停信息层 */}
          <motion.div
            initial={false}
            animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 10 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
          >
            <p className="text-white text-xs font-medium truncate mb-1">
              {image.filename}
            </p>
            <div className="flex items-center gap-2 text-white/70 text-[10px]">
              <span>{formatFileSize(image.size)}</span>
              {image.width && image.height && (
                <>
                  <span className="w-0.5 h-0.5 rounded-full bg-white/50" />
                  <span>{image.width}×{image.height}</span>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      <ContextMenu
        items={menuGroups}
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={closeContextMenu}
      />
    </>
  );
}
