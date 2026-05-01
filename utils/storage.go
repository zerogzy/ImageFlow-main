package utils

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"go.uber.org/zap"
)

// S3Object represents an object in S3 storage
type S3Object struct {
	Key  string
	Size int64
}

// StorageProvider defines the interface for storage operations
type StorageProvider interface {
	Store(ctx context.Context, key string, data []byte) error
	Get(ctx context.Context, key string) ([]byte, error)
	Delete(ctx context.Context, key string) error
}

// LocalStorage implements StorageProvider for local filesystem
type LocalStorage struct {
	BasePath string
}

func NewLocalStorage(basePath string) (*LocalStorage, error) {
	dirs := []string{
		filepath.Join(basePath, "original", "landscape"),
		filepath.Join(basePath, "original", "portrait"),
		filepath.Join(basePath, "landscape", "webp"),
		filepath.Join(basePath, "landscape", "avif"),
		filepath.Join(basePath, "portrait", "webp"),
		filepath.Join(basePath, "portrait", "avif"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create directory %s: %v", dir, err)
		}
	}

	return &LocalStorage{BasePath: basePath}, nil
}

func (ls *LocalStorage) Store(ctx context.Context, key string, data []byte) error {
	fullPath := filepath.Join(ls.BasePath, key)
	dir := filepath.Dir(fullPath)

	if err := os.MkdirAll(dir, 0755); err != nil {
		logger.Error("Failed to create directory",
			zap.String("dir", dir),
			zap.Error(err))
		return fmt.Errorf("failed to create directory %s: %v", dir, err)
	}

	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		logger.Error("Failed to write file",
			zap.String("path", fullPath),
			zap.Error(err))
		return fmt.Errorf("failed to write file %s: %v", fullPath, err)
	}

	logger.Info("File stored locally",
		zap.String("key", key),
		zap.String("path", fullPath))
	return nil
}

func (ls *LocalStorage) Get(ctx context.Context, key string) ([]byte, error) {
	return os.ReadFile(filepath.Join(ls.BasePath, key))
}

func (ls *LocalStorage) Delete(ctx context.Context, key string) error {
	return os.Remove(filepath.Join(ls.BasePath, key))
}

// S3Storage implements StorageProvider for S3-compatible storage
type S3Storage struct {
	client       *s3.Client
	bucket       string
	customDomain string
	endpoint     string
}

func NewS3Storage(cfg *config.Config) (*S3Storage, error) {
	if err := InitS3Client(cfg); err != nil {
		return nil, err
	}
	return &S3Storage{
		client:       S3Client,
		bucket:       cfg.S3Bucket,
		customDomain: cfg.CustomDomain,
		endpoint:     cfg.S3Endpoint,
	}, nil
}

func (s *S3Storage) Store(ctx context.Context, key string, data []byte) error {
	logger.Info("Storing to S3",
		zap.String("bucket", s.bucket),
		zap.String("key", key),
		zap.Int("size", len(data)))

	contentType := "application/octet-stream"
	ext := strings.ToLower(filepath.Ext(key))
	switch ext {
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".webp":
		contentType = "image/webp"
	case ".avif":
		contentType = "image/avif"
	}

	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:       aws.String(s.bucket),
		Key:          aws.String(key),
		Body:         bytes.NewReader(data),
		ContentType:  aws.String(contentType),
		ACL:          types.ObjectCannedACLPublicRead,
		CacheControl: aws.String("public, max-age=31536000"), // Cache for one year
	})
	if err != nil {
		logger.Error("Failed to store object in S3",
			zap.String("bucket", s.bucket),
			zap.String("key", key),
			zap.Error(err))
		return fmt.Errorf("failed to store object in S3: %v", err)
	}

	var url string
	if s.customDomain != "" {
		url = fmt.Sprintf("%s/%s", strings.TrimSuffix(s.customDomain, "/"), key)
	} else {
		url = fmt.Sprintf("%s/%s/%s", strings.TrimSuffix(s.endpoint, "/"), s.bucket, key)
	}
	logger.Info("Successfully stored object in S3",
		zap.String("key", key),
		zap.String("url", url))
	return nil
}

func (s *S3Storage) Get(ctx context.Context, key string) ([]byte, error) {
	logger.Debug("Getting object from S3",
		zap.String("bucket", s.bucket),
		zap.String("key", key))

	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		logger.Error("Failed to get object from S3",
			zap.String("bucket", s.bucket),
			zap.String("key", key),
			zap.Error(err))
		return nil, fmt.Errorf("failed to get object from S3: %v", err)
	}
	defer result.Body.Close()

	data, err := io.ReadAll(result.Body)
	if err != nil {
		logger.Error("Failed to read object body from S3",
			zap.String("bucket", s.bucket),
			zap.String("key", key),
			zap.Error(err))
		return nil, fmt.Errorf("failed to read object from S3: %v", err)
	}

	logger.Debug("Successfully retrieved object from S3",
		zap.String("key", key),
		zap.Int("size", len(data)))
	return data, nil
}

func (s *S3Storage) Delete(ctx context.Context, key string) error {
	logger.Info("Deleting object from S3",
		zap.String("bucket", s.bucket),
		zap.String("key", key))

	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		logger.Error("Failed to delete object from S3",
			zap.String("bucket", s.bucket),
			zap.String("key", key),
			zap.Error(err))
		return fmt.Errorf("failed to delete object from S3: %v", err)
	}

	logger.Info("Successfully deleted object from S3",
		zap.String("key", key))
	return nil
}

// ListObjects lists objects in S3 with the given prefix
func (s *S3Storage) ListObjects(ctx context.Context, prefix string) ([]S3Object, error) {
	logger.Debug("Listing objects in S3",
		zap.String("bucket", s.bucket),
		zap.String("prefix", prefix))

	var objects []S3Object

	paginator := s3.NewListObjectsV2Paginator(s.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String(prefix),
	})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			logger.Error("Failed to list objects from S3",
				zap.String("bucket", s.bucket),
				zap.String("prefix", prefix),
				zap.Error(err))
			return nil, fmt.Errorf("failed to list objects from S3: %v", err)
		}

		for _, obj := range page.Contents {
			objects = append(objects, S3Object{
				Key:  *obj.Key,
				Size: *obj.Size,
			})
		}
	}

	logger.Debug("Successfully listed objects from S3",
		zap.String("prefix", prefix),
		zap.Int("count", len(objects)))
	return objects, nil
}

// StorageConfig represents the storage configuration
type StorageConfig struct {
	Type      string // "local" or "s3"
	LocalPath string // base path for local storage
}

// NewStorageProvider creates a new storage provider based on configuration
func NewStorageProvider(cfg *config.Config) (StorageProvider, error) {
	switch cfg.StorageType {
	case config.StorageTypeLocal:
		return NewLocalStorage(cfg.ImageBasePath)
	case config.StorageTypeS3:
		return NewS3Storage(cfg)
	default:
		return nil, fmt.Errorf("unsupported storage type: %s", cfg.StorageType)
	}
}

// Global storage instance
var Storage StorageProvider

// InitStorage initializes the global storage provider
func InitStorage(cfg *config.Config) error {
	var err error
	Storage, err = NewStorageProvider(cfg)
	return err
}
