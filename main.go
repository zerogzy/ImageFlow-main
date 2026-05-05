package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/handlers"
	"github.com/Yuri-NagaSaki/ImageFlow/utils"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"github.com/joho/godotenv"
	"go.uber.org/zap"
)

// corsMiddleware adds CORS headers to all responses
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
		origin := r.Header.Get("Origin")

		if origin != "" && allowedOrigins != "" {
			allowedList := strings.Split(allowedOrigins, ",")
			for _, allowedOrigin := range allowedList {
				if strings.TrimSpace(allowedOrigin) == origin {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Access-Control-Allow-Credentials", "true")
					break
				}
			}
		} else if allowedOrigins == "" || allowedOrigins == "*" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	if err := logger.InitBasicLogger(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize basic logger: %v\n", err)
		os.Exit(1)
	}

	// Load environment variables
	if err := godotenv.Load(); err != nil {
		logger.Warn("Failed to load .env file", zap.Error(err))
	}

	// Initialize configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("Failed to load config", zap.Error(err))
	}

	// Initialize logger with config
	if err := logger.InitLogger(cfg); err != nil {
		logger.Fatal("Failed to initialize logger", zap.Error(err))
	}
	defer logger.Log.Sync()

	// Initialize libvips for image processing
	utils.InitVips(cfg)
	logger.Info("Initialized libvips",
		zap.Int("worker_threads", cfg.WorkerThreads))

	// Initialize S3 client only when using S3 storage
	if cfg.StorageType == config.StorageTypeS3 {
		if err := utils.InitS3Client(cfg); err != nil {
			logger.Fatal("Failed to initialize S3 client", zap.Error(err))
		}
	}

	// Initialize storage provider
	if err := utils.InitStorage(cfg); err != nil {
		logger.Fatal("Failed to initialize storage", zap.Error(err))
	}

	// Initialize metadata store
	if err := utils.InitMetadataStore(cfg); err != nil {
		logger.Fatal("Failed to initialize metadata store", zap.Error(err))
	}

	// Ensure image directories exist
	ensureDirectories(cfg)

	// Initialize and start image cleaner
	utils.InitCleaner(cfg)
	logger.Info("Image cleaner started")

	// Create routes
	http.HandleFunc("/api/validate-api-key", handlers.ValidateAPIKey(cfg))
	http.HandleFunc("/api/upload", handlers.RequireAPIKey(cfg, handlers.UploadHandler(cfg)))
	http.HandleFunc("/api/config", handlers.RequireAPIKey(cfg, handlers.ConfigHandler(cfg)))
	http.HandleFunc("/api/images", handlers.RequireRole(cfg, "guest", handlers.ListImagesHandler(cfg)))
	http.HandleFunc("/api/update-tags", handlers.RequireAPIKey(cfg, handlers.UpdateTagsHandler(cfg)))
	http.HandleFunc("/api/delete-image", handlers.RequireAPIKey(cfg, handlers.DeleteImageHandler(cfg)))
	http.HandleFunc("/api/tags", handlers.RequireRole(cfg, "", handlers.TagsHandler(cfg)))
	http.HandleFunc("/api/debug/tags", handlers.RequireRole(cfg, "", handlers.DebugTagsHandler(cfg)))

	// Add cleanup trigger endpoint
	http.HandleFunc("/api/trigger-cleanup", handlers.RequireAPIKey(cfg, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		utils.TriggerCleanup()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "success",
			"message": "Cleanup process triggered",
		})
	}))

	// Use appropriate random image handler based on storage type
	if cfg.StorageType == config.StorageTypeS3 {
		http.HandleFunc("/api/random", handlers.RandomImageHandler(utils.S3Client, cfg))
	} else {
		http.HandleFunc("/api/random", handlers.LocalRandomImageHandler(cfg))
		// Serve local images
		if !filepath.IsAbs(cfg.ImageBasePath) {
			cfg.ImageBasePath = filepath.Join(".", cfg.ImageBasePath)
		}
		http.Handle("/images/", http.StripPrefix("/images/", http.FileServer(http.Dir(cfg.ImageBasePath))))
	}

	// Create HTTP server
	server := &http.Server{
		Addr:    cfg.ServerAddr,
		Handler: corsMiddleware(http.DefaultServeMux),
	}

	// Set up graceful shutdown
	done := make(chan bool)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Start server in a goroutine
	go func() {
		logger.Info("Starting server",
			zap.String("address", cfg.ServerAddr),
			zap.String("storage_type", string(cfg.StorageType)),
			zap.Bool("cors_enabled", true))

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server error", zap.Error(err))
		}
	}()

	// Wait for shutdown signal
	<-quit
	logger.Info("Server is shutting down...")

	// Give ongoing operations time to finish
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Shut down the worker pool
	workerPool := utils.GetWorkerPool()
	if workerPool != nil {
		logger.Info("Shutting down worker pool...")
		workerPool.Shutdown()
	}

	// Stop the cleaner
	if utils.Cleaner != nil {
		logger.Info("Stopping image cleaner...")
		utils.Cleaner.Stop()
	}

	// Attempt to shut down the server gracefully
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", zap.Error(err))
	}

	close(done)
	logger.Info("Server shutdown completed")
}

// ensureDirectories creates necessary directory structure for images
func ensureDirectories(cfg *config.Config) {
	dirs := []string{
		filepath.Join(cfg.ImageBasePath, "original", "landscape"),
		filepath.Join(cfg.ImageBasePath, "original", "portrait"),
		filepath.Join(cfg.ImageBasePath, "landscape", "webp"),
		filepath.Join(cfg.ImageBasePath, "landscape", "avif"),
		filepath.Join(cfg.ImageBasePath, "portrait", "webp"),
		filepath.Join(cfg.ImageBasePath, "portrait", "avif"),
		filepath.Join(cfg.ImageBasePath, "gif"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			logger.Error("Failed to create directory",
				zap.String("dir", dir),
				zap.Error(err))
		} else {
			logger.Info("Created directory",
				zap.String("dir", dir))
		}
	}
}
