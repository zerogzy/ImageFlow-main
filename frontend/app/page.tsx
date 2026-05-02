"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Header from "./components/Header";
import ImageCard from "./components/ImageCard";
import ImageModal from "./components/ImageModal";
import ImageFilters from "./components/ImageFilters";
import ToastContainer, { showToast } from "./components/ToastContainer";
import ApiKeyModal from "./components/ApiKeyModal";
import { ImageFile, ImageListResponse } from "./types";
import { api } from "./utils/request";
import { getApiKey, setApiKey, validateApiKey, removeApiKey } from "./utils/auth";
import { UploadIcon, PlusIcon, ImageIcon } from "./components/ui/icons";

export default function Home() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
  const [filterFormat, setFilterFormat] = useState("webp");
  const [filterOrientation, setFilterOrientation] = useState("all");
  const [filterTag, setFilterTag] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [pendingAdminAction, setPendingAdminAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    const savedKey = getApiKey();
    if (savedKey) {
      validateApiKey(savedKey).then((valid) => {
        if (valid) {
          setAdminKey(savedKey);
        } else {
          removeApiKey();
        }
      });
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [filterFormat, filterOrientation, filterTag, page]);

  const fetchImages = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: "12",
        format: filterFormat,
      };
      if (filterOrientation !== "all") params.orientation = filterOrientation;
      if (filterTag) params.tag = filterTag;

      const data = await api.get<ImageListResponse>("/api/images", params);
      setImages(data.images || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error("获取图片失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminAuth = useCallback(async (key: string) => {
    try {
      const response = await fetch("/api/validate-api-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
      });
      const data = await response.json();
      if (data.valid && data.role === "admin") {
        setApiKey(key);
        setAdminKey(key);
        setShowAdminModal(false);
        showToast("管理员验证成功", "success");
        if (pendingAdminAction) {
          pendingAdminAction();
          setPendingAdminAction(null);
        }
        return true;
      }
      showToast("管理员密钥无效", "error");
      return false;
    } catch {
      showToast("验证失败", "error");
      return false;
    }
  }, [pendingAdminAction]);

  const requireAdmin = useCallback((action: () => void) => {
    if (adminKey) {
      action();
    } else {
      setPendingAdminAction(() => action);
      setShowAdminModal(true);
    }
  }, [adminKey]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.post("/api/delete-image", { id });
      setImages((prev) => prev.filter((img) => img.id !== id));
      showToast("图片已删除", "success");
    } catch (error: any) {
      showToast(`删除失败：${error.message || "未知错误"}`, "error");
    }
  }, []);

  const handleCardDelete = useCallback(async (id: string) => {
    if (adminKey) {
      await handleDelete(id);
    } else {
      return new Promise<void>((resolve) => {
        setPendingAdminAction(() => async () => {
          await handleDelete(id);
          resolve();
        });
        setShowAdminModal(true);
      });
    }
  }, [adminKey, handleDelete]);

  const handleCardClick = useCallback(async (image: ImageFile) => {
    if (adminKey) {
      setSelectedImage(image);
    } else {
      setPendingAdminAction(() => () => setSelectedImage(image));
      setShowAdminModal(true);
    }
  }, [adminKey]);

  const handleUpdateTags = useCallback(async (id: string, tags: string) => {
    try {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      await api.post("/api/update-tags", { id, tags: tagList });
      setImages((prev) =>
        prev.map((img) =>
          img.id === id ? { ...img, tags: tagList } : img
        )
      );
      showToast("标签已更新", "success");
    } catch (error: any) {
      showToast(`修改标签失败：${error.message || "未知错误"}`, "error");
    }
  }, [adminKey]);

  const handleFilterChange = useCallback((format: string, orientation: string, tag: string) => {
    setFilterFormat(format || "webp");
    setFilterOrientation(orientation || "all");
    setFilterTag(tag || "");
    setPage(1);
  }, []);

  return (
    <>
      <Header
        onApiKeyClick={() => setShowAdminModal(true)}
        isKeyVerified={!!adminKey}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* 页面标题区域 */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25 mb-4"
            >
              <ImageIcon className="h-8 w-8 text-white" />
            </motion.div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
              图片广场
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              浏览、管理和分享您的图片资源
            </p>
          </div>

          {/* 操作栏 */}
          <div className="flex items-center justify-between mb-8">
            <ImageFilters onFilterChange={handleFilterChange} enabled={!!adminKey} />

            <motion.a
              href="/upload"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 transition-all duration-300"
            >
              <UploadIcon className="h-4 w-4" />
              上传图片
            </motion.a>
          </div>

          {/* 加载状态 - 骨架屏 */}
          {loading && images.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  <div className="aspect-[4/3] bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4" />
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2" />
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* 空状态 */}
          {!loading && images.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                <ImageIcon className="h-10 w-10 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">暂无图片</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mb-6">
                上传您的第一张图片，开始构建您的图库
              </p>
              <a
                href="/upload"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 transition-all duration-300"
              >
                <PlusIcon className="h-5 w-5" />
                上传第一张图片
              </a>
            </motion.div>
          )}

          {/* 图片网格 */}
          {images.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {images.map((image, index) => (
                  <motion.div
                    key={image.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                    className="relative group"
                  >
                    <ImageCard
                      image={image}
                      onClick={() => handleCardClick(image)}
                      onDelete={handleCardDelete}
                    />
                    {adminKey && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        whileHover={{ scale: 1.1 }}
                        className="absolute top-3 left-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newTags = prompt(
                              "修改标签（逗号分隔）：",
                              (image.tags || []).join(",")
                            );
                            if (newTags !== null) {
                              handleUpdateTags(image.id, newTags);
                            }
                          }}
                          className="p-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/30"
                          title="修改标签"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex justify-center items-center gap-4 mt-12"
                >
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-5 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    上一页
                  </button>
                  <span className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-xl">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-5 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    下一页
                  </button>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </div>

      <ImageModal
        image={selectedImage}
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        onDelete={adminKey ? handleDelete : undefined}
      />

      <ApiKeyModal
        isOpen={showAdminModal}
        onClose={() => {
          setShowAdminModal(false);
          setPendingAdminAction(null);
        }}
        onSuccess={handleAdminAuth}
      />

      <ToastContainer />
    </>
  );
}
