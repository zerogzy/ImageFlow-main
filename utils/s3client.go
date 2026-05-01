package utils

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/Yuri-NagaSaki/ImageFlow/config"
	"github.com/Yuri-NagaSaki/ImageFlow/utils/logger"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.uber.org/zap"
)

var (
	S3Client *s3.Client
	s3Bucket string
)

func InitS3Client(cfg *config.Config) error {
	logger.Info("Initializing S3 client",
		zap.String("endpoint", cfg.S3Endpoint),
		zap.String("region", cfg.S3Region))

	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL: cfg.S3Endpoint,
		}, nil
	})

	awsCfg, err := awsconfig.LoadDefaultConfig(context.TODO(),
		awsconfig.WithRegion(cfg.S3Region),
		awsconfig.WithEndpointResolverWithOptions(customResolver),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.S3AccessKey,
			cfg.S3SecretKey,
			"",
		)),
	)
	if err != nil {
		logger.Error("Failed to load AWS SDK config", zap.Error(err))
		return fmt.Errorf("unable to load SDK config: %v", err)
	}

	S3Client = s3.NewFromConfig(awsCfg)
	s3Bucket = cfg.S3Bucket
	logger.Info("S3 client initialized successfully",
		zap.String("bucket", s3Bucket))
	return nil
}

func UploadToS3(ctx context.Context, key string, data []byte) error {
	logger.Debug("Uploading to S3",
		zap.String("key", key),
		zap.Int("size", len(data)))

	_, err := S3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s3Bucket),
		Key:    aws.String(key),
		Body:   bytes.NewReader(data),
	})

	if err != nil {
		logger.Error("Failed to upload to S3",
			zap.String("key", key),
			zap.Error(err))
	}
	return err
}

func GetFromS3(ctx context.Context, key string) ([]byte, error) {
	logger.Debug("Getting from S3",
		zap.String("key", key))

	result, err := S3Client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s3Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		logger.Error("Failed to get from S3",
			zap.String("key", key),
			zap.Error(err))
		return nil, err
	}
	defer result.Body.Close()

	data, err := io.ReadAll(result.Body)
	if err != nil {
		logger.Error("Failed to read S3 object body",
			zap.String("key", key),
			zap.Error(err))
		return nil, err
	}

	logger.Debug("Successfully retrieved from S3",
		zap.String("key", key),
		zap.Int("size", len(data)))
	return data, nil
}
