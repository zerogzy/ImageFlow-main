"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { api, uploadWithProgress } from "../utils/request";
import { getApiKey, getApiRole, setApiKey, validateApiKey, removeApiKey } from "../utils/auth";
import ApiKeyModal from "../components/ApiKeyModal";
import UploadSection from "../components/UploadSection";
import Header from "../components/Header";
import ToastContainer, { showToast } from "../components/ToastContainer";
import { UploadIcon, ImageIcon } from "../components/ui/icons";

interface ConfigSettings {
  maxUploadCount: number;
}

interface FileDetail {
  id: string;
  file: File;
}

export default function UploadPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [maxUploadCount, setMaxUploadCount] = useState(10);
  const [fileDetails, setFileDetails] = useState<FileDetail[]>([]);
  const [showPreviewSidebar, setShowPreviewSidebar] = useState(false);
  const [expiryMinutes, setExpiryMinutes] = useState(0);

  const isAdmin = userRole === "admin";

  useEffect(() => {
    const savedKey = getApiKey();
    const savedRole = getApiRole();
    if (savedKey && savedRole) {
      validateApiKey(savedKey).then((result) => {
        if (result.valid && result.role) {
          setUserRole(result.role);
          if (result.role === "admin") {
            fetchConfig();
          }
        } else {
          removeApiKey();
          setShowKeyModal(true);
        }
        setIsCheckingKey(false);
      });
    } else {
      setIsCheckingKey(false);
      setShowKeyModal(true);
    }
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await api.request<ConfigSettings>("/api/config");
      setMaxUploadCount(response.maxUploadCount || 10);
    } catch (error) {
      console.error("获取配置失败:", error);
    }
  };

  const handleKeyAuth = useCallback(async (apiKey: string) => {
    try {
      const result = await validateApiKey(apiKey);
      if (result.valid && result.role) {
        setApiKey(apiKey, result.role);
        setUserRole(result.role);
        setShowKeyModal(false);
        if (result.role === "admin") {
          showToast("管理员验证成功", "success");
          fetchConfig();
        } else {
          showToast("访客密钥无法访问上传功能", "error");
          return false;
        }
        return true;
      }
      showToast("密钥无效", "error");
      return false;
    } catch {
      showToast("验证失败", "error");
      return false;
    }
  }, []);

  const handleUploadError = useCallback((error: Error) => {
    if (error.message.includes("413") || error.message.includes("too large")) {
      showToast("上传失败：图片文件过大", "error");
    } else if (error.message.includes("415")) {
      showToast("上传失败：不支持的图片格式", "error");
    } else if (error.message.includes("401")) {
      showToast("上传失败：密钥无效，请重新验证", "error");
      removeApiKey();
      setUserRole(null);
      setShowKeyModal(true);
    } else if (error.message.includes("403")) {
      showToast("上传失败：权限不足，访客无法上传", "error");
    } else if (error.message.includes("timeout") || error.message.includes("abort")) {
      showToast("上传失败：请求超时，请检查网络", "error");
    } else if (error.message.includes("NetworkError") || error.message.includes("Failed to fetch")) {
      showToast("上传失败：无法连接到服务器", "error");
    } else {
      showToast(`上传失败：${error.message || "未知错误"}`, "error");
    }
  }, []);

  const handleUpload = async (files: File[], expiry: number, tags: string[]) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const response = await uploadWithProgress<{ results: { status: string; filename: string; message: string }[] }>(
        "/api/upload",
        files,
        (percent) => setUploadProgress(percent)
      );

      const results = response.results || [];
      const successCount = results.filter((r) => r.status === "success").length;
      const failCount = results.filter((r) => r.status === "error").length;

      if (failCount > 0 && successCount > 0) {
        showToast(`部分上传成功：${successCount}张成功，${failCount}张失败`, "info");
        const failures = results.filter((r) => r.status === "error");
        failures.forEach((f) => {
          showToast(`「${f.filename}」上传失败：${f.message || "未知原因"}`, "error");
        });
      } else if (failCount > 0) {
        const failures = results.filter((r) => r.status === "error");
        failures.forEach((f) => {
          showToast(`「${f.filename}」上传失败：${f.message || "未知原因"}`, "error");
        });
      } else {
        showToast(`上传成功：${successCount}张图片`, "success");
      }

      setFileDetails([]);
      setShowPreviewSidebar(false);
    } catch (error: any) {
      handleUploadError(error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFilesSelected = useCallback((files: FileDetail[]) => {
    setFileDetails(files);
  }, []);

  const togglePreviewSidebar = useCallback(() => {
    setShowPreviewSidebar((prev) => !prev);
  }, []);

  const handleTagsChange = useCallback((_tags: string[]) => {}, []);

  if (isCheckingKey) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (userRole && userRole !== "admin") {
    return (
      <>
        <Header onApiKeyClick={() => setShowKeyModal(true)} userRole={userRole} />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-24 pb-12">
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
              <UploadIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">权限不足</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">访客无法上传图片，请使用管理员密钥验证</p>
          </div>
        </div>
        <ApiKeyModal
          isOpen={showKeyModal}
          onClose={() => setShowKeyModal(false)}
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
        title="图片上传"
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25 mb-3"
            >
              <UploadIcon className="h-7 w-7 text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1.5">图片上传</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              拖拽图片到下方区域或点击选择，支持批量上传
            </p>
          </div>

          {isAdmin ? (
            <UploadSection
              onUpload={handleUpload}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              maxUploadCount={maxUploadCount}
              onFilesSelected={handleFilesSelected}
              onTogglePreview={togglePreviewSidebar}
              isPreviewOpen={showPreviewSidebar}
              fileCount={fileDetails.length}
              existingFiles={fileDetails}
              expiryMinutes={expiryMinutes}
              setExpiryMinutes={setExpiryMinutes}
              onTagsChange={handleTagsChange}
              isKeyVerified={isAdmin}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16"
            >
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                <ImageIcon className="h-10 w-10 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 mb-4">请先验证管理员密钥以访问上传功能</p>
              <button
                onClick={() => setShowKeyModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 transition-all duration-300"
              >
                输入密钥
              </button>
            </motion.div>
          )}
        </motion.div>
      </div>

      <ApiKeyModal
        isOpen={showKeyModal}
        onClose={() => {
          if (!isAdmin) return;
          setShowKeyModal(false);
        }}
        onSuccess={handleKeyAuth}
      />

      <ToastContainer />
    </>
  );
}
