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
import { UploadIcon, PlusIcon } from "./components/ui/icons";

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
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">图片广场</h1>
            <p className="text-gray-500 dark:text-gray-400">
              {adminKey ? "管理员模式 — 可删除和修改标签" : "浏览图片，输入管理员密钥可管理"}
            </p>
          </div>

          <div className="flex items-center justify-between mb-6">
            <ImageFilters onFilterChange={handleFilterChange} />

            {!adminKey && (
              <button
                onClick={() => setShowAdminModal(true)}
                className="ml-auto px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              >
                管理员登录
              </button>
            )}

            {adminKey && (
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">
                  管理员
                </span>
                <a
                  href="/upload"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors"
                >
                  <UploadIcon className="h-4 w-4" />
                  上传图片
                </a>
              </div>
            )}
          </div>

          {loading && images.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-400 dark:text-gray-500 text-lg">暂无图片</p>
              {adminKey && (
                <a
                  href="/upload"
                  className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors"
                >
                  <PlusIcon className="h-5 w-5" />
                  上传第一张图片
                </a>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {images.map((image) => (
                  <div key={image.id} className="relative group">
                    <ImageCard
                      image={image}
                      onClick={() => handleCardClick(image)}
                      onDelete={handleCardDelete}
                    />
                    {adminKey && (
                      <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
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
                          className="p-1.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-xs"
                          title="修改标签"
                        >
                          🏷
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center gap-3 mt-10">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    上一页
                  </button>
                  <span className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    下一页
                  </button>
                </div>
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
