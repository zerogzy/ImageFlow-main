package utils

import (
	"fmt"
	"os"
	"strconv"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"github.com/h2non/bimg"
	"go.uber.org/zap"
)

// InitVips initializes libvips and sets concurrency parameters.
func InitVips(cfg *config.Config) {
	os.Setenv("VIPS_CONCURRENCY", strconv.Itoa(cfg.WorkerThreads))
	logger.Info("Initializing libvips",
		zap.Int("threads", cfg.WorkerThreads))

	bimg.Initialize()

	// Initialize worker pool
	InitWorkerPool(cfg)
	logger.Info("Initialized image processing worker pool",
		zap.Int("workers", cfg.WorkerPoolSize))
}

// ConvertToWebPWithBimg converts image data to WebP format using bimg/libvips
func ConvertToWebPWithBimg(data []byte, cfg *config.Config) ([]byte, error) {
	logger.Debug("Queuing WebP conversion task",
		zap.Int("input_size", len(data)))

	// Submit conversion task to worker pool and wait for result
	return GetWorkerPool().ProcessTask(func() ([]byte, error) {
		logger.Debug("Starting WebP conversion",
			zap.Int("input_size", len(data)),
			zap.Int("quality", cfg.ImageQuality),
			zap.Int("speed", cfg.Speed))

		// Detect image format
		imgFormat, err := DetectImageFormat(data)
		if err != nil {
			logger.Error("Failed to detect image format", zap.Error(err))
			return nil, fmt.Errorf("failed to detect image format: %v", err)
		}

		// Return original data for GIF images
		if imgFormat.Format == "gif" {
			logger.Debug("GIF detected, skipping WebP conversion")
			return data, nil
		}

		// Create bimg image object
		img := bimg.NewImage(data)

		options := bimg.Options{
			Type:    bimg.WEBP,
			Quality: cfg.ImageQuality,
			Speed:   cfg.Speed,
		}

		// Perform conversion
		result, err := img.Process(options)
		if err != nil {
			logger.Error("WebP conversion failed", zap.Error(err))
			return nil, fmt.Errorf("webp conversion failed: %v", err)
		}

		compressionRatio := float64(len(result)) * 100 / float64(len(data))
		logger.Info("WebP conversion completed",
			zap.Int("output_size", len(result)),
			zap.Float64("compression_ratio", compressionRatio))

		return result, nil
	})
}

// ConvertToAVIFWithBimg converts image data to AVIF format using bimg/libvips
func ConvertToAVIFWithBimg(data []byte, cfg *config.Config) ([]byte, error) {
	logger.Debug("Queuing AVIF conversion task",
		zap.Int("input_size", len(data)))

	// Submit conversion task to worker pool and wait for result
	return GetWorkerPool().ProcessTask(func() ([]byte, error) {
		logger.Debug("Starting AVIF conversion",
			zap.Int("input_size", len(data)),
			zap.Int("quality", cfg.ImageQuality),
			zap.Int("speed", cfg.Speed))

		// Detect image format
		imgFormat, err := DetectImageFormat(data)
		if err != nil {
			logger.Error("Failed to detect image format", zap.Error(err))
			return nil, fmt.Errorf("failed to detect image format: %v", err)
		}

		// Return original data for GIF images
		if imgFormat.Format == "gif" {
			logger.Debug("GIF detected, skipping AVIF conversion")
			return data, nil
		}

		// Create bimg image object
		img := bimg.NewImage(data)

		options := bimg.Options{
			Type:    bimg.AVIF,
			Quality: cfg.ImageQuality,
			Speed:   cfg.Speed,
		}

		// Perform conversion
		result, err := img.Process(options)
		if err != nil {
			logger.Error("AVIF conversion failed", zap.Error(err))
			return nil, fmt.Errorf("avif conversion failed: %v", err)
		}

		compressionRatio := float64(len(result)) * 100 / float64(len(data))
		logger.Info("AVIF conversion completed",
			zap.Int("output_size", len(result)),
			zap.Float64("compression_ratio", compressionRatio))

		return result, nil
	})
}
