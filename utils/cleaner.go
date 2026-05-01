package utils

import (
	"context"
	"time"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"go.uber.org/zap"
)

// ImageCleaner is responsible for cleaning up expired images
type ImageCleaner struct {
	interval time.Duration
	ctx      context.Context
	cancel   context.CancelFunc
}

// NewImageCleaner creates a new image cleaner
func NewImageCleaner(cfg *config.Config) *ImageCleaner {
	ctx, cancel := context.WithCancel(context.Background())

	return &ImageCleaner{
		interval: time.Duration(cfg.CleanupInterval) * time.Minute,
		ctx:      ctx,
		cancel:   cancel,
	}
}

// Start begins the periodic cleanup task
func (ic *ImageCleaner) Start() {
	logger.Info("Starting image cleaner",
		zap.Duration("interval", ic.interval))

	// Run cleanup immediately
	go ic.cleanExpiredImages()

	// Set up ticker for periodic cleanup
	ticker := time.NewTicker(ic.interval)
	go func() {
		for {
			select {
			case <-ticker.C:
				ic.cleanExpiredImages()
			case <-ic.ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}

// Stop terminates the cleanup task
func (ic *ImageCleaner) Stop() {
	ic.cancel()
	logger.Info("Image cleaner stopped")
}

// cleanExpiredImages removes all expired images
func (ic *ImageCleaner) cleanExpiredImages() {
	ctx := context.Background()
	expiredImages, err := MetadataManager.ListExpiredImages(ctx)
	if err != nil {
		logger.Error("Failed to list expired images", zap.Error(err))
		return
	}

	if len(expiredImages) == 0 {
		logger.Debug("No expired images found")
		return
	}

	logger.Info("Found expired images to clean up",
		zap.Int("count", len(expiredImages)))

	for _, metadata := range expiredImages {
		logger.Debug("Processing expired image",
			zap.String("id", metadata.ID),
			zap.Time("expiry_time", metadata.ExpiryTime))

		// Delete original image
		if metadata.Paths.Original != "" {
			if err := Storage.Delete(ctx, metadata.Paths.Original); err != nil {
				logger.Error("Failed to delete original image",
					zap.String("path", metadata.Paths.Original),
					zap.Error(err))
			} else {
				logger.Debug("Deleted original image",
					zap.String("path", metadata.Paths.Original))
			}
		}

		// Delete WebP format
		if metadata.Paths.WebP != "" {
			if err := Storage.Delete(ctx, metadata.Paths.WebP); err != nil {
				logger.Error("Failed to delete WebP image",
					zap.String("path", metadata.Paths.WebP),
					zap.Error(err))
			} else {
				logger.Debug("Deleted WebP image",
					zap.String("path", metadata.Paths.WebP))
			}
		}

		// Delete AVIF format
		if metadata.Paths.AVIF != "" {
			if err := Storage.Delete(ctx, metadata.Paths.AVIF); err != nil {
				logger.Error("Failed to delete AVIF image",
					zap.String("path", metadata.Paths.AVIF),
					zap.Error(err))
			} else {
				logger.Debug("Deleted AVIF image",
					zap.String("path", metadata.Paths.AVIF))
			}
		}

		// Delete metadata
		if err := MetadataManager.DeleteMetadata(ctx, metadata.ID); err != nil {
			logger.Error("Failed to delete metadata",
				zap.String("id", metadata.ID),
				zap.Error(err))
		} else {
			logger.Debug("Deleted metadata",
				zap.String("id", metadata.ID))
		}
	}

	// Clear page cache after deleting all expired images
	if err := ClearPageCache(ctx); err != nil {
		logger.Warn("Failed to clear page cache",
			zap.Error(err))
	} else {
		logger.Debug("Page cache cleared after cleanup")
	}

	logger.Info("Completed cleanup of expired images",
		zap.Int("total_cleaned", len(expiredImages)))
}

// Global cleaner instance
var Cleaner *ImageCleaner

// InitCleaner initializes and starts the image cleaner
func InitCleaner(cfg *config.Config) {
	Cleaner = NewImageCleaner(cfg)
	Cleaner.Start()
}

// TriggerCleanup manually triggers the cleanup process
func TriggerCleanup() {
	if Cleaner != nil {
		logger.Info("Manually triggering cleanup process")
		go Cleaner.cleanExpiredImages()
	} else {
		logger.Warn("Cannot trigger cleanup: cleaner not initialized")
	}
}
