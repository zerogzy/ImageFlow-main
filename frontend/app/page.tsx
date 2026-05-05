"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Masonry from "react-masonry-css";
import Header from "./components/Header";
import ImageCard from "./components/ImageCard";
import ImageModal from "./components/ImageModal";
import ToastContainer, { showToast } from "./components/ToastContainer";
import ApiKeyModal from "./components/ApiKeyModal";
import { ImageFile, ImageListResponse } from "./types";
import { api } from "./utils/request";
import {
  getApiKey,
  getApiRole,
  setApiKey,
  validateApiKey,
  removeApiKey,
  isAuthenticated,
  isAdmin as isAdminRole,
} from "./utils/auth";
import {
  ImageIcon,
  ChevronDownIcon,
  TagIcon,
  Cross1Icon,
  CheckIcon,
  MixerHorizontalIcon,
} from "./components/ui/icons";

export default function Home() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
  const [filterFormat, setFilterFormat] = useState("webp");
  const [filterOrientation, setFilterOrientation] = useState("all");
  const [filterTag, setFilterTag] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [activeDropdown, setActiveDropdown] = useState<"format" | "orientation" | "tag" | null>(null);
  const [editingTagImage, setEditingTagImage] = useState<ImageFile | null>(null);
  const [tagEditValue, setTagEditValue] = useState("");

  const isAdmin = userRole === "admin";

  useEffect(() => {
    const savedKey = getApiKey();
    const savedRole = getApiRole();
    if (savedKey && savedRole) {
      validateApiKey(savedKey).then((result) => {
        if (result.valid && result.role) {
          setUserRole(result.role);
          if (result.role === "admin" || result.role === "guest") {
            fetchTags();
          }
        } else {
          removeApiKey();
          setShowKeyModal(true);
        }
      });
    } else {
      setShowKeyModal(true);
    }
  }, []);

  useEffect(() => {
    if (userRole) {
      fetchImages();
    }
  }, [filterFormat, filterOrientation, filterTag, page, userRole]);

  const fetchTags = async () => {
    try {
      const response = await api.get<{ tags: string[] }>("/api/tags");
      if (response.tags) {
        setAvailableTags(response.tags);
      }
    } catch {}
  };

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

  const handleKeyAuth = useCallback(async (key: string) => {
    try {
      const result = await validateApiKey(key);
      if (result.valid && result.role) {
        setApiKey(key, result.role);
        setUserRole(result.role);
        setShowKeyModal(false);
        const roleLabel = result.role === "admin" ? "管理员" : "访客";
        showToast(`${roleLabel}验证成功`, "success");
        fetchTags();
        return true;
      }
      showToast("密钥无效", "error");
      return false;
    } catch {
      showToast("验证失败", "error");
      return false;
    }
  }, []);

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
    if (isAdmin) {
      await handleDelete(id);
    }
  }, [isAdmin, handleDelete]);

  const handleCardClick = useCallback((image: ImageFile) => {
    setSelectedImage(image);
  }, []);

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
  }, []);

  const handleFilterChange = useCallback((format: string, orientation: string, tag: string) => {
    setFilterFormat(format || "webp");
    setFilterOrientation(orientation || "all");
    setFilterTag(tag || "");
    setPage(1);
  }, []);

  const openTagEditor = (image: ImageFile) => {
    setEditingTagImage(image);
    setTagEditValue((image.tags || []).join(", "));
  };

  const saveTagEdit = () => {
    if (editingTagImage) {
      handleUpdateTags(editingTagImage.id, tagEditValue);
      setEditingTagImage(null);
      setTagEditValue("");
    }
  };

  const filteredTags = tagSearchQuery.trim() === ""
    ? availableTags
    : availableTags.filter((t) => t.toLowerCase().includes(tagSearchQuery.toLowerCase()));

  const formatOptions = [
    { value: "webp", label: "图片" },
    { value: "gif", label: "GIF" },
  ];

  const orientationOptions = [
    { value: "all", label: "全部方向" },
    { value: "landscape", label: "横向" },
    { value: "portrait", label: "纵向" },
  ];

  const masonryBreakpoints = {
    default: 4,
    1280: 4,
    1024: 3,
    768: 2,
    640: 1,
  };

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    if (activeDropdown) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [activeDropdown]);

  if (!userRole) {
    return (
      <>
        <ApiKeyModal
          isOpen={showKeyModal}
          onClose={() => {}}
          onSuccess={handleKeyAuth}
        />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <Header
        onApiKeyClick={() => setShowKeyModal(true)}
        userRole={userRole}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              图片广场
            </h1>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <MixerHorizontalIcon className="h-4 w-4" />
              </div>

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setActiveDropdown(activeDropdown === "format" ? null : "format")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors shadow-sm"
                >
                  <span>{formatOptions.find((o) => o.value === filterFormat)?.label}</span>
                  <ChevronDownIcon className={`h-3 w-3 transition-transform ${activeDropdown === "format" ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {activeDropdown === "format" && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-1.5 w-32 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
                    >
                      {formatOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            handleFilterChange(opt.value, filterOrientation, filterTag);
                            setActiveDropdown(null);
                          }}
                          className={`w-full px-3.5 py-2.5 text-sm text-left transition-colors ${
                            filterFormat === opt.value
                              ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-medium"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setActiveDropdown(activeDropdown === "orientation" ? null : "orientation")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors shadow-sm"
                >
                  <span>{orientationOptions.find((o) => o.value === filterOrientation)?.label}</span>
                  <ChevronDownIcon className={`h-3 w-3 transition-transform ${activeDropdown === "orientation" ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {activeDropdown === "orientation" && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-1.5 w-36 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
                    >
                      {orientationOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            handleFilterChange(filterFormat, opt.value, filterTag);
                            setActiveDropdown(null);
                          }}
                          className={`w-full px-3.5 py-2.5 text-sm text-left transition-colors ${
                            filterOrientation === opt.value
                              ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-medium"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {availableTags.length > 0 && (
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveDropdown(activeDropdown === "tag" ? null : "tag")}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors shadow-sm"
                  >
                    <TagIcon className="h-3.5 w-3.5" />
                    <span>{filterTag || "标签"}</span>
                    <ChevronDownIcon className={`h-3 w-3 transition-transform ${activeDropdown === "tag" ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {activeDropdown === "tag" && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-1.5 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
                      >
                        <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                          <input
                            type="text"
                            value={tagSearchQuery}
                            onChange={(e) => setTagSearchQuery(e.target.value)}
                            placeholder="搜索标签..."
                            className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-gray-700/50 border-0 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-800 dark:text-gray-200 placeholder-gray-400"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          <button
                            onClick={() => {
                              handleFilterChange(filterFormat, filterOrientation, "");
                              setActiveDropdown(null);
                              setTagSearchQuery("");
                            }}
                            className={`w-full px-3.5 py-2 text-sm text-left transition-colors ${
                              filterTag === ""
                                ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-medium"
                                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            }`}
                          >
                            全部标签
                          </button>
                          {filteredTags.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => {
                                handleFilterChange(filterFormat, filterOrientation, tag);
                                setActiveDropdown(null);
                                setTagSearchQuery("");
                              }}
                              className={`w-full px-3.5 py-2 text-sm text-left transition-colors ${
                                filterTag === tag
                                  ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-medium"
                                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                          {filteredTags.length === 0 && (
                            <div className="px-3.5 py-3 text-sm text-gray-400 text-center">无匹配标签</div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {filterTag && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                >
                  {filterTag}
                  <button
                    onClick={() => handleFilterChange(filterFormat, filterOrientation, "")}
                    className="hover:text-indigo-900 dark:hover:text-indigo-100"
                  >
                    <Cross1Icon className="h-3 w-3" />
                  </button>
                </motion.span>
              )}
            </div>
          </div>

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

          {!loading && images.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                <ImageIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-lg mb-1">暂无图片</p>
            </motion.div>
          )}

          {images.length > 0 && (
            <>
              {filterOrientation === "all" ? (
                <Masonry
                  breakpointCols={masonryBreakpoints}
                  className="my-masonry-grid"
                  columnClassName="my-masonry-grid_column"
                >
                  {images.map((image, index) => (
                    <motion.div
                      key={image.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.05 }}
                      className="relative group mb-4"
                    >
                      <ImageCard
                        image={image}
                        onClick={() => handleCardClick(image)}
                        onDelete={isAdmin ? handleCardDelete : undefined}
                      />
                      {isAdmin && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          whileHover={{ scale: 1.1 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openTagEditor(image);
                          }}
                          className="absolute top-3 left-3 z-10 p-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/30 opacity-0 group-hover:opacity-100"
                          title="修改标签"
                        >
                          <TagIcon className="h-3.5 w-3.5" />
                        </motion.button>
                      )}
                    </motion.div>
                  ))}
                </Masonry>
              ) : (
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
                        onDelete={isAdmin ? handleCardDelete : undefined}
                      />
                      {isAdmin && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          whileHover={{ scale: 1.1 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openTagEditor(image);
                          }}
                          className="absolute top-3 left-3 z-10 p-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/30 opacity-0 group-hover:opacity-100"
                          title="修改标签"
                        >
                          <TagIcon className="h-3.5 w-3.5" />
                        </motion.button>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex justify-center items-center gap-2 mt-10"
                >
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    上一页
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, i, arr) => (
                      <span key={p} className="flex items-center">
                        {i > 0 && arr[i - 1] !== p - 1 && (
                          <span className="px-1 text-gray-400">...</span>
                        )}
                        <button
                          onClick={() => setPage(p)}
                          className={`w-9 h-9 text-sm font-medium rounded-xl transition-all duration-200 ${
                            page === p
                              ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25"
                              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                          }`}
                        >
                          {p}
                        </button>
                      </span>
                    ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
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
        onDelete={isAdmin ? handleDelete : undefined}
      />

      <ApiKeyModal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onSuccess={handleKeyAuth}
      />

      <AnimatePresence>
        {editingTagImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setEditingTagImage(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">修改标签</h3>
                <button
                  onClick={() => setEditingTagImage(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
                >
                  <Cross1Icon className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {editingTagImage.filename}
              </p>
              <input
                type="text"
                value={tagEditValue}
                onChange={(e) => setTagEditValue(e.target.value)}
                placeholder="输入标签，逗号分隔"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTagEdit();
                }}
              />
              {availableTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {availableTags
                    .filter((t) => !tagEditValue.includes(t))
                    .slice(0, 8)
                    .map((tag) => (
                      <button
                        key={tag}
                        onClick={() => {
                          const current = tagEditValue.trim();
                          setTagEditValue(current ? `${current}, ${tag}` : tag);
                        }}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        + {tag}
                      </button>
                    ))}
                </div>
              )}
              <div className="flex justify-end gap-3 mt-5">
                <button
                  onClick={() => setEditingTagImage(null)}
                  className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={saveTagEdit}
                  className="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
                >
                  <CheckIcon className="h-4 w-4" />
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ToastContainer />
    </>
  );
}
