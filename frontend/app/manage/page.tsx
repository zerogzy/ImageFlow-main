"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import { motion } from "framer-motion";
import Masonry from "react-masonry-css";
import { getApiKey, getApiRole, validateApiKey, setApiKey, removeApiKey } from "../utils/auth";
import { api } from "../utils/request";
import ApiKeyModal from "../components/ApiKeyModal";
import ImageFilters from "../components/ImageFilters";
import ImageCard from "../components/ImageCard";
import ImageModal from "../components/ImageModal";
import { useTheme } from "../hooks/useTheme";
import {
  ImageFile,
  ImageListResponse,
  StatusMessage,
  ImageFilterState,
} from "../types";
import Header from "../components/Header";
import ToastContainer from "../components/ToastContainer";
import { ImageIcon, Spinner } from "../components/ui/icons";

export default function Manage() {
  useTheme();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [images, setImages] = useState<ImageFile[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalImages, setTotalImages] = useState(0);
  const [filters, setFilters] = useState<ImageFilterState>({
    format: "webp",
    orientation: "all",
    tag: "",
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastImageElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isLoading || isFetchingMore) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMoreImages();
        }
      });
      if (node) observer.current.observe(node);
    },
    [isLoading, isFetchingMore, hasMore]
  );

  const isAdmin = userRole === "admin";

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    const apiKey = getApiKey();
    const savedRole = getApiRole();
    if (!apiKey || !savedRole) {
      setShowApiKeyModal(true);
      return;
    }

    try {
      const result = await validateApiKey(apiKey);
      if (!result.valid || !result.role) {
        removeApiKey();
        setShowApiKeyModal(true);
        setStatus({
          type: "error",
          message: "密钥无效，请重新验证",
        });
        return;
      }

      setUserRole(result.role);
      if (result.role !== "admin") {
        setStatus({
          type: "error",
          message: "管理页面仅限管理员访问",
        });
        return;
      }

      fetchImages();
    } catch (error) {
      console.error("密钥验证失败:", error);
      setShowApiKeyModal(true);
      setStatus({
        type: "error",
        message: "密钥验证失败，请重试",
      });
    }
  };

  const fetchImages = async () => {
    try {
      setIsLoading(true);
      setImages([]);
      setPage(1);
      const data = await api.get<ImageListResponse>("/api/images", {
        page: "1",
        limit: "24",
        format: filters.format,
        orientation: filters.orientation,
        tag: filters.tag,
      });

      setImages(data.images);
      setHasMore(data.page < data.totalPages);

      if (data.total) {
        setTotalImages(data.total);
      }
      setStatus(null);
    } catch (error) {
      console.error("加载图片列表失败:", error);
      setStatus({
        type: "error",
        message: "加载图片列表失败",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreImages = async () => {
    if (!hasMore || isFetchingMore) return;

    try {
      setIsFetchingMore(true);
      const nextPage = page + 1;

      const data = await api.get<ImageListResponse>("/api/images", {
        page: nextPage.toString(),
        limit: "24",
        format: filters.format,
        orientation: filters.orientation,
        tag: filters.tag,
      });

      setImages((prevImages) => [...prevImages, ...data.images]);
      setPage(nextPage);
      setHasMore(data.page < data.totalPages);
    } catch (error) {
      console.error("加载更多图片失败:", error);
      setStatus({
        type: "error",
        message: "加载更多图片失败",
      });
    } finally {
      setIsFetchingMore(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    try {
      const image = images.find((img) => img.id === id);
      if (!image) return;

      const response = await api.post<{ success: boolean; message: string }>(
        "/api/delete-image",
        { id: image.id }
      );

      if (response.success) {
        await fetchImages();
        setStatus({
          type: "success",
          message: response.message,
        });
      } else {
        setStatus({
          type: "error",
          message: response.message,
        });
      }
    } catch (error) {
      console.error("删除失败:", error);
      setStatus({
        type: "error",
        message: "删除失败",
      });
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchImages();
  }, [filters]);

  const handleFilterChange = (
    format: string,
    orientation: string,
    tag: string
  ) => {
    setFilters({ format, orientation, tag });
  };

  const handleKeyAuth = async (apiKey: string) => {
    try {
      const result = await validateApiKey(apiKey);
      if (result.valid && result.role) {
        setApiKey(apiKey, result.role);
        setUserRole(result.role);
        setShowApiKeyModal(false);
        if (result.role === "admin") {
          fetchImages();
          return true;
        } else {
          setStatus({
            type: "error",
            message: "管理页面仅限管理员访问",
          });
          return false;
        }
      }
      setStatus({
        type: "error",
        message: "密钥无效",
      });
      return false;
    } catch {
      setStatus({
        type: "error",
        message: "验证失败",
      });
      return false;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 pt-20 pb-8">
      <Header
        onApiKeyClick={() => setShowApiKeyModal(true)}
        userRole={userRole}
        title="图片管理"
      />

      <ToastContainer />

      {!isAdmin && userRole && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
            <ImageIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">权限不足</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">管理页面仅限管理员访问</p>
        </div>
      )}

      {isAdmin && (
        <>
          {status && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mb-8 p-4 rounded-xl ${
                status.type === "success"
                  ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
              }`}
            >
              {status.message}
            </motion.div>
          )}

          <ImageFilters onFilterChange={handleFilterChange} enabled={isAdmin} />

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Spinner className="h-12 w-12 text-indigo-500" />
            </div>
          ) : (
            <>
              {images.length > 0 ? (
                <>
                  <div className="space-y-8">
                    <div
                      className={
                        filters.orientation === "all"
                          ? ""
                          : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                      }
                    >
                      {filters.orientation === "all" ? (
                        <Masonry
                          breakpointCols={{
                            default: 4,
                            1280: 4,
                            1024: 3,
                            768: 2,
                            640: 1,
                          }}
                          className="my-masonry-grid"
                          columnClassName="my-masonry-grid_column"
                        >
                          {images.map((image, index) => (
                            <motion.div
                              key={image.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{
                                duration: 0.3,
                                delay: (index % 24) * 0.05,
                              }}
                              ref={index === images.length - 5 ? lastImageElementRef : null}
                            >
                              <ImageCard
                                image={image}
                                onClick={() => {
                                  setSelectedImage(image);
                                  setIsModalOpen(true);
                                }}
                                onDelete={handleDelete}
                              />
                            </motion.div>
                          ))}
                        </Masonry>
                      ) : (
                        images.map((image, index) => (
                          <motion.div
                            key={image.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: (index % 24) * 0.05 }}
                            ref={index === images.length - 5 ? lastImageElementRef : null}
                          >
                            <ImageCard
                              image={image}
                              onClick={() => {
                                setSelectedImage(image);
                                setIsModalOpen(true);
                              }}
                              onDelete={handleDelete}
                            />
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                  {isFetchingMore && (
                    <div className="flex justify-center items-center py-8">
                      <Spinner className="h-8 w-8 text-indigo-500" />
                      <span className="ml-2 text-indigo-500">加载更多图片...</span>
                    </div>
                  )}
                  {!isLoading && !isFetchingMore && images.length > 0 && !hasMore && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      已加载全部图片 ({totalImages}张)
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-xl shadow-md p-8 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                  <ImageIcon className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" />
                  <p className="text-lg font-medium">暂无图片</p>
                  <p className="mt-2 text-sm">请上传图片或调整筛选条件</p>
                </div>
              )}
            </>
          )}

          <ImageModal
            image={selectedImage}
            isOpen={isModalOpen}
            onClose={() => {
              setSelectedImage(null);
              setIsModalOpen(false);
            }}
            onDelete={handleDelete}
          />
        </>
      )}

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSuccess={handleKeyAuth}
      />
    </div>
  );
}
