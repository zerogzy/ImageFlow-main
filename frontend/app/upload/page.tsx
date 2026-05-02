"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { api } from "../utils/request";
import { getApiKey, setApiKey, validateApiKey, removeApiKey } from "../utils/auth";
import ApiKeyModal from "../components/ApiKeyModal";
import UploadSection from "../components/UploadSection";
import Header from "../components/Header";
import ToastContainer, { showToast } from "../components/ToastContainer";

interface ConfigSettings {
  maxUploadCount: number;
}

interface FileDetail {
  id: string;
  file: File;
}

export default function UploadPage() {
  const [isKeyVerified, setIsKeyVerified] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [maxUploadCount, setMaxUploadCount] = useState(10);
  const [fileDetails, setFileDetails] = useState<FileDetail[]>([]);
  const [showPreviewSidebar, setShowPreviewSidebar] = useState(false);
  const [expiryMinutes, setExpiryMinutes] = useState(0);

  useEffect(() => {
    const savedKey = getApiKey();
    if (savedKey) {
      setIsKeyVerified(true);
      fetchConfig();
      setIsCheckingKey(false);
    } else {
      setIsCheckingKey(false);
    }
  }, []);

  useEffect(() => {
    if (!isKeyVerified) {
      const timer = setTimeout(() => setShowKeyModal(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isKeyVerified, isCheckingKey]);

  const fetchConfig = async () => {
    try {
      const response = await api.request<ConfigSettings>("/api/config");
      setMaxUploadCount(response.maxUploadCount || 10);
    } catch (error) {
      console.error("获取配置失败:", error);
    }
  };

  const handleApiKeySubmit = useCallback(async (apiKey: string) => {
    try {
      const valid = await validateApiKey(apiKey);
      if (valid) {
        setApiKey(apiKey);
        setIsKeyVerified(true);
        setShowKeyModal(false);
        showToast("密钥验证成功", "success");
      }
      return valid;
    } catch {
      showToast("密钥验证失败", "error");
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
      setIsKeyVerified(false);
      setShowKeyModal(true);
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

    try {
      const response = await api.upload<{ results: { status: string; filename: string; message: string }[] }>(
        "/api/upload",
        files
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

  return (
    <>
      <Header
        onApiKeyClick={() => setShowKeyModal(true)}
        title="图片上传"
        isKeyVerified={isKeyVerified}
      />
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">图片上传</h1>
            <p className="text-gray-500 dark:text-gray-400">
              拖拽图片到下方区域或点击选择，支持批量上传
            </p>
          </div>

          {isKeyVerified ? (
            <UploadSection
              onUpload={handleUpload}
              isUploading={isUploading}
              maxUploadCount={maxUploadCount}
              onFilesSelected={handleFilesSelected}
              onTogglePreview={togglePreviewSidebar}
              isPreviewOpen={showPreviewSidebar}
              fileCount={fileDetails.length}
              existingFiles={fileDetails}
              expiryMinutes={expiryMinutes}
              setExpiryMinutes={setExpiryMinutes}
              onTagsChange={handleTagsChange}
              isKeyVerified={isKeyVerified}
            />
          ) : (
            <div className="text-center py-20">
              <p className="text-gray-500 dark:text-gray-400 mb-4">请先验证管理员密钥以访问上传功能</p>
              <button
                onClick={() => setShowKeyModal(true)}
                className="px-6 py-3 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors"
              >
                输入密钥
              </button>
            </div>
          )}
        </motion.div>
      </div>

      <ApiKeyModal
        isOpen={showKeyModal}
        onClose={() => {
          if (!isKeyVerified) return;
          setShowKeyModal(false);
        }}
        onSuccess={handleApiKeySubmit}
      />

      <ToastContainer />
    </>
  );
}
